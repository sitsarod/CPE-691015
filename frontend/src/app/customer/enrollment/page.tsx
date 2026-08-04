"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation"; 
import { FileEdit, LayoutGrid, Loader2, Clock, Calendar, CheckCircle2, AlertCircle, SearchCode, ArrowRight, CheckCircle } from "lucide-react";
import { Enrollment, Course, PackageInfo } from "@/types/enrollment";
import { fetchCustomerEnrollments, fetchAvailableCourses, enrollCourse } from "@/services/enrollmentAPI";
import { fetchActiveQuestions, recommendCourses } from "@/services/quizAPI";
import { QuizQuestion, QuizOption } from "@/types/quiz";
import Button from "@/components/Button";

export default function EnrollmentPage() {
  const router = useRouter(); 
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [recommendedCourses, setRecommendedCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // สำหรับ Modal สมัครเรียน
  const [selectedPackage, setSelectedPackage] = useState<PackageInfo | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // สำหรับระบบคัดกรอง (Quiz Engine)
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<QuizOption[]>([]);
  const [quizResultCourseIds, setQuizResultCourseIds] = useState<number[]>([]);
  const [isQuizFinished, setIsQuizFinished] = useState(false);

  const loadData = async () => {
    try {
        setIsLoading(true);
        const token = localStorage.getItem("token");
        const customerId = localStorage.getItem("customer_id") || localStorage.getItem("user_id"); 

        if (!token || !customerId) {
          router.push("/login");
          return; 
        }

        const [enrollmentsData, coursesData, questionsData] = await Promise.all([
          fetchCustomerEnrollments(customerId, token),
          fetchAvailableCourses(token),
          fetchActiveQuestions()
        ]);
        
        setEnrollments(enrollmentsData);
        setRecommendedCourses(coursesData);
        setQuizQuestions(questionsData);
      } catch (err: unknown) { 
        const errorMessage = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล";
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };
    
  useEffect(() => {
    loadData();
  }, [router]);

  const handleEnroll = async () => {
    if (!selectedPackage) return;
    setIsEnrolling(true);
    try {
      const token = localStorage.getItem("token");
      const customerId = localStorage.getItem("customer_id") || localStorage.getItem("user_id");
      if (!token || !customerId) {
        alert("กรุณาเข้าสู่ระบบก่อนทำรายการ");
        return;
      }
      
      await enrollCourse({
        customer_id: parseInt(customerId),
        package_id: (selectedPackage.ID || selectedPackage.id) as number
      }, token);

      setSuccessMessage("สมัครคอร์สเรียนสำเร็จ! ระบบกำลังดำเนินการภายใน 3-7 วัน");
      setSelectedPackage(null);
      loadData(); // รีเฟรชข้อมูลคอร์สใหม่
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการสมัครเรียน");
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleStartQuiz = () => {
    setCurrentQuizIndex(0);
    setQuizAnswers([]);
    setQuizResultCourseIds([]);
    setIsQuizFinished(false);
    setIsQuizOpen(true);
  };

  const handleSelectQuizOption = async (option: QuizOption) => {
    const newAnswers = [...quizAnswers, option];

    if (currentQuizIndex < quizQuestions.length - 1) {
      setQuizAnswers(newAnswers);
      setCurrentQuizIndex(currentQuizIndex + 1);
      return;
    }

    setQuizAnswers(newAnswers);
    setIsQuizOpen(false);
    try {
      const optionIds = newAnswers.map(a => a.id);
      const res = await recommendCourses(optionIds);
      const rankedIds = res.data.map(r => r.course_id);
      setQuizResultCourseIds(res.fallback ? [] : rankedIds);
    } catch {
      setQuizResultCourseIds([]);
    } finally {
      setIsQuizFinished(true);
    }
  };

  const handleClearQuizFilter = () => {
    setIsQuizFinished(false);
    setQuizResultCourseIds([]);
  };

  const displayCourses = isQuizFinished && quizResultCourseIds.length > 0
    ? quizResultCourseIds
        .map(id => recommendedCourses.find(c => (c.ID || c.id) === id))
        .filter((c): c is Course => c != null)
    : recommendedCourses;

  if (isLoading) return <div className="w-full h-[60vh] flex flex-col items-center justify-center text-gray-500"><Loader2 className="w-10 h-10 animate-spin text-[#CC0000] mb-4" /></div>;
  if (error) return <div className="p-6 text-center text-red-600">{error}</div>;

  return (
    <div className="w-full">
      {/* ---------------- ส่วนที่ 1: คอร์สของฉัน ---------------- */}
      <div className="mb-14">
        <h1 className="text-[22px] font-bold text-gray-900 mb-8">คอร์สของฉัน</h1>
        {enrollments.length === 0 ? (
          <p className="text-gray-500 text-[16px]">คุณยังไม่มีข้อมูลการลงทะเบียนคอร์สเรียนในขณะนี้</p>
        ) : (
          <div className="flex flex-wrap gap-10">
            {enrollments.map((item, index) => (
              <div key={`enroll-${item.ID ?? index}`} className="w-[240px] h-[340px] border border-gray-400 rounded-lg p-6 flex flex-col justify-between shadow-sm hover:border-[#CC0000] transition-all bg-white relative overflow-hidden">
                {item.status === 'pending' && (
                  <div className="absolute top-0 left-0 right-0 bg-yellow-100 text-yellow-700 text-xs font-bold py-1.5 text-center flex justify-center items-center">
                    <Clock className="w-3 h-3 mr-1" /> รอดำเนินการ 3-7 วัน
                  </div>
                )}
                <div className={`flex-1 flex justify-center items-center ${item.status === 'pending' ? 'mt-4 opacity-50' : ''}`}>
                  <FileEdit className="w-32 h-32 text-[#CC0000]" strokeWidth={1.2} />
                </div>
                <div className="mt-4">
                  <p className="text-gray-900 font-bold text-[18px] truncate">{item.package?.course?.course_name}</p>
                  <p className="text-gray-800 font-semibold mt-1 text-[16px]">
                    เรียน {item.total_sessions} ครั้ง 
                    {item.status === 'pending' ? (
                       <span className="text-sm text-yellow-600 font-normal block mt-1">รอแอดมินอนุมัติ</span>
                    ) : (
                       <span className="text-sm text-gray-500 font-normal block">เหลือ {item.remaining_sessions} ครั้ง</span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <hr className="my-10 border-gray-300" />

      {/* ---------------- ส่วนที่ 2: แนะนำคอร์ส (แบ่งกลุ่มตามคอร์ส) ---------------- */}
      <div className="mb-10 w-full">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {isQuizFinished && quizResultCourseIds.length > 0 ? "คอร์สที่เหมาะกับคุณ" : "คอร์สทั้งหมด"}
            </h2>
            <span className="flex items-center gap-2 text-gray-500 text-sm mt-1">
              <LayoutGrid className="w-5 h-5 text-[#CC0000]" />
              {isQuizFinished && quizResultCourseIds.length > 0 
                ? "ผลลัพธ์จากการประเมินแบบคัดกรองของคุณ" 
                : "แสดงคอร์สเรียนทั้งหมด"}
            </span>
          </div>

          {/* ปุ่มฝั่งขวา */}
          {isQuizFinished && quizResultCourseIds.length > 0 ? (
            <button 
              onClick={handleClearQuizFilter}
              className="bg-white text-gray-700 border-2 border-gray-200 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm transition-all"
            >
              ✕ เลิกคัดกรอง (ดูคอร์สทั้งหมด)
            </button>
          ) : (
            (quizQuestions?.length || 0) > 0 && (
              <button 
                onClick={handleStartQuiz}
                className="bg-[#CC0000] text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-red-200 hover:bg-red-700 hover:scale-105 transition-all animate-bounce-slow"
              >
                <SearchCode className="w-5 h-5" /> เลือกแพ็กเกจที่เหมาะกับคุณ
              </button>
            )
          )}
        </div>

        {displayCourses.length === 0 ? (
          <p className="text-gray-500 text-center py-10">ไม่มีคอร์สแนะนำในขณะนี้</p>
        ) : (
          <div className="space-y-12">
            {displayCourses.map((course, index) => (
              <div key={`course-${course.ID ?? index}`} id={`course-${course.ID || course.id}`}>
                {/* หัวข้อคอร์ส */}
                <h3 className="text-3xl font-black text-gray-900 mb-6 border-l-4 border-[#CC0000] pl-4 uppercase tracking-tight">
                  {course.course_name}
                </h3>
                
                {/* รายการแพ็กเกจ */}
                <div className="flex flex-wrap gap-8">
                  {(course.packages ?? []).map((pkg, pkgIdx) => (
                    <div 
                      key={`pkg-${course.ID ?? index}-${pkg.ID ?? pkgIdx}`} 
                      className="w-[280px] bg-white border border-gray-100 rounded-2xl p-6 shadow-md relative overflow-hidden"
                    >
                      {/* เส้นแถบสีแดงด้านบน */}
                      <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#CC0000] to-red-400"></div>

                      <div className="mb-5 mt-2 flex justify-between items-start">
                        <div>
                          <span className="text-[10px] font-black bg-red-100 text-[#CC0000] px-3 py-1 rounded-full uppercase tracking-widest">
                            Package
                          </span>
                          <h4 className="text-2xl font-black text-gray-900 mt-3 tracking-tight">{pkg.sessions_count} ครั้ง</h4>
                          <p className="text-xs font-semibold text-gray-500 mt-1">
                            รับ {pkg.max_seats || 0} คน 
                            <span className={`ml-1 ${(pkg.max_seats || 0) - (pkg.current_enrollments || 0) <= 0 ? 'text-red-500' : 'text-green-600'}`}>
                              (เหลือ {(pkg.max_seats || 0) - (pkg.current_enrollments || 0)} ที่)
                            </span>
                          </p>
                        </div>
                        <div className="bg-red-50 p-2 rounded-full">
                          <CheckCircle2 className="w-5 h-5 text-[#CC0000]" />
                        </div>
                      </div>

                      <div className="space-y-4 mb-8">
                        <div className="flex items-center text-gray-600 text-sm font-medium">
                          <Clock className="w-4 h-4 mr-3 text-gray-400" />
                          <span>เวลาเรียนรวม {pkg.hours_count} ชั่วโมง</span>
                        </div>
                        
                        {/* ตารางเรียน */}
                        <div className="bg-gradient-to-br from-gray-50 to-red-50/30 p-4 rounded-xl border border-gray-100">
                          <div className="flex items-center text-gray-800 text-xs font-bold mb-3">
                            <Calendar className="w-3.5 h-3.5 mr-2 text-[#CC0000]" />
                            รอบเวลาเรียน:
                          </div>
                          <div className="space-y-2">
                            {pkg.schedules && pkg.schedules.length > 0 ? (
                              pkg.schedules.map((sch, schIdx) => (
                                <div key={`sch-${pkg.ID ?? pkgIdx}-${schIdx}`} className="text-xs text-gray-600 flex justify-between items-center border-b border-gray-100/50 pb-1 last:border-0 last:pb-0">
                                  <span className="font-semibold text-gray-700">{sch.day_of_week}</span>
                                  <span className="bg-white px-2 py-0.5 rounded text-gray-500 shadow-sm border border-gray-50 text-[10px]">{sch.start_time} - {sch.end_time}</span>
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-gray-400 italic">ยังไม่ระบุเวลา</p>
                            )}
                          </div>
                        </div>

                        <div className="pt-2">
                          <p className="text-sm text-gray-400 font-medium mb-1">ราคาแพ็กเกจ</p>
                          <p className="text-3xl font-black text-[#CC0000]">
                            {pkg.price.toLocaleString()} <span className="text-base font-bold text-gray-500 tracking-normal">THB</span>
                          </p>
                        </div>
                      </div>

                      <Button 
                        variant="secondary"
                        disabled={(pkg.current_enrollments || 0) >= (pkg.max_seats || 0)}
                        onClick={() => {
                          if ((pkg.current_enrollments || 0) < (pkg.max_seats || 0)) {
                            setSuccessMessage(null);
                            setSelectedPackage({ ...pkg, course_name: course.course_name });
                          }
                        }}
                        className={`!py-3.5 !rounded-xl text-[15px] gap-2 ${(pkg.current_enrollments || 0) >= (pkg.max_seats || 0) ? '!bg-gray-100 !border-gray-200 !text-gray-400 cursor-not-allowed hover:!bg-gray-100 hover:!text-gray-400' : ''}`}
                      >
                        {(pkg.current_enrollments || 0) >= (pkg.max_seats || 0) ? 'ที่นั่งเต็มแล้ว' : 'สมัครเรียนแพ็กเกจนี้'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------------- Modal ยืนยันการสมัคร ---------------- */}
      {selectedPackage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="bg-[#CC0000] p-4 text-white text-center">
              <h3 className="text-lg font-bold">ยืนยันการสมัครเรียน</h3>
            </div>
            <div className="p-6">
              <div className="space-y-4 mb-6">
                <div>
                  <span className="text-sm text-gray-500">คอร์สเรียน</span>
                  <p className="text-lg font-bold text-gray-900">{selectedPackage.course_name}</p>
                </div>
                <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <span className="text-sm text-gray-600">แพ็กเกจ</span>
                  <span className="font-bold text-gray-900">{selectedPackage.sessions_count} ครั้ง</span>
                </div>
                <div className="flex justify-between items-center bg-red-50 p-3 rounded-lg border border-red-100">
                  <span className="text-sm text-[#CC0000] font-semibold">ราคาที่ต้องชำระ</span>
                  <span className="text-xl font-black text-[#CC0000]">{selectedPackage.price.toLocaleString()} บาท</span>
                </div>
                
                <div className="bg-yellow-50 p-3 rounded-lg flex items-start border border-yellow-200 mt-4">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-700">เมื่อกดยืนยัน ระบบจะใช้เวลาในการดำเนินการ 3-7 วัน แอดมินจะทำการตรวจสอบและสร้างบิลเรียกเก็บเงินให้ท่านในลำดับถัดไป</p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setSelectedPackage(null)}
                  disabled={isEnrolling}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={handleEnroll}
                  disabled={isEnrolling}
                  className="flex-1 py-3 bg-[#CC0000] text-white font-bold rounded-xl hover:bg-red-700 transition-colors flex justify-center items-center disabled:opacity-70 shadow-md shadow-red-200"
                >
                  {isEnrolling ? <Loader2 className="w-5 h-5 animate-spin" /> : "ยืนยันการสมัคร"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Modal ระบบคัดกรอง (Quiz Engine) - Premium UI ---------------- */}
      {isQuizOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-md transition-all duration-300">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex flex-col max-h-[90vh] border border-white/20 animate-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="bg-gradient-to-br from-[#CC0000] via-red-600 to-red-700 p-8 text-white relative overflow-hidden">
              {/* Decorative Background Elements */}
              <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/4"></div>
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/10 rounded-full blur-xl translate-y-1/2 -translate-x-1/4"></div>
              <div className="absolute top-4 left-1/2 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-x-1/2"></div>
              
              {/* Progress Bar (at bottom of header) */}
              <div className="absolute bottom-0 left-0 w-full h-1.5 bg-black/20">
                <div 
                  className="h-full bg-white transition-all duration-700 ease-out relative"
                  style={{ width: `${((currentQuizIndex) / quizQuestions.length) * 100}%` }}
                >
                  <div className="absolute top-0 right-0 w-3 h-full bg-white blur-[2px] shadow-[0_0_10px_rgba(255,255,255,1)]"></div>
                </div>
              </div>

              <div className="relative z-10 flex items-center justify-between">
                <h3 className="text-2xl font-black flex items-center gap-3 drop-shadow-md tracking-tight">
                  <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm border border-white/10">
                    <SearchCode className="w-6 h-6 text-white" />
                  </div>
                  แบบประเมินคอร์สที่ใช่
                </h3>
              </div>

              <button 
                onClick={() => setIsQuizOpen(false)}
                className="absolute top-6 right-6 text-white/70 hover:text-white hover:rotate-90 transition-all duration-300 z-10 bg-black/10 hover:bg-black/20 p-2 rounded-full backdrop-blur-sm border border-white/5"
              >
                ✕
              </button>
            </div>
            
            <div className="p-10 overflow-y-auto bg-gray-50/30">
              {/* --- Quiz Questions --- */}
              <div className="max-w-xl mx-auto">
                <div className="mb-10 text-center">
                  <span className="inline-block px-5 py-1.5 rounded-full bg-red-50 border border-red-100 text-[#CC0000] font-bold text-xs tracking-widest uppercase mb-6 shadow-sm">
                    คำถามที่ {currentQuizIndex + 1} จาก {quizQuestions.length}
                  </span>
                  <h2 className="text-3xl font-black text-gray-900 leading-snug">
                    {quizQuestions[currentQuizIndex]?.text}
                  </h2>
                </div>
                <div className="space-y-4">
                  {quizQuestions[currentQuizIndex]?.options?.map((opt) => (
                    <button 
                      key={opt.id}
                      onClick={() => handleSelectQuizOption(opt)}
                      className="w-full text-left p-6 rounded-2xl border-2 border-gray-100 bg-white hover:border-[#CC0000] transition-colors font-bold text-gray-700 hover:text-[#CC0000] text-lg group flex items-center justify-between"
                    >
                      <span>{opt.text}</span>
                      <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-[#CC0000] transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Toast แจ้งเตือนสำเร็จ ---------------- */}
      {successMessage && (
        <div className="fixed bottom-6 right-6 bg-green-50 border border-green-200 text-green-700 px-6 py-4 rounded-xl shadow-lg flex items-center z-50 animate-in slide-in-from-bottom-5">
          <CheckCircle2 className="w-6 h-6 mr-3 text-green-600" />
          <span className="font-semibold">{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="ml-6 text-green-500 hover:text-green-700">
             ✕
          </button>
        </div>
      )}

    </div>
  );
}