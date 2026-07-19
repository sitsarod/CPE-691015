"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation"; 
import { FileEdit, LayoutGrid, Loader2, Clock, Calendar, CheckCircle2, AlertCircle } from "lucide-react";
import { Enrollment, Course, PackageInfo } from "@/types/enrollment";
import { fetchCustomerEnrollments, fetchAvailableCourses, enrollCourse } from "@/services/enrollmentAPI";

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

  const loadData = async () => {
    try {
        setIsLoading(true);
        const token = localStorage.getItem("token");
        const customerId = localStorage.getItem("customer_id") || localStorage.getItem("user_id"); 

        if (!token || !customerId) {
          router.push("/login");
          return; 
        }

        const [enrollmentsData, coursesData] = await Promise.all([
          fetchCustomerEnrollments(customerId, token),
          fetchAvailableCourses(token)
        ]);
        
        setEnrollments(enrollmentsData);
        setRecommendedCourses(coursesData);
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
    } catch (err: any) {
      alert(err.message || "เกิดข้อผิดพลาดในการสมัครเรียน");
    } finally {
      setIsEnrolling(false);
    }
  };

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
          <h2 className="text-2xl font-bold text-gray-900">คอร์สทั้งหมด</h2>
          <span className="flex items-center gap-2 text-gray-500 text-sm">
            <LayoutGrid className="w-5 h-5 text-[#CC0000]" />
            เลือกแพ็กเกจที่เหมาะกับคุณ
          </span>
        </div>

        {recommendedCourses.length === 0 ? (
          <p className="text-gray-500 text-center py-10">ไม่มีคอร์สแนะนำในขณะนี้</p>
        ) : (
          <div className="space-y-12">
            {recommendedCourses.map((course, index) => (
              <div key={`course-${course.ID ?? index}`}>
                {/* หัวข้อคอร์ส */}
                <h3 className="text-3xl font-black text-gray-900 mb-6 border-l-4 border-[#CC0000] pl-4 uppercase tracking-tight">
                  {course.course_name}
                </h3>
                
                {/* รายการแพ็กเกจ */}
                <div className="flex flex-wrap gap-6">
                  {(course.packages ?? []).map((pkg, pkgIdx) => (
                    <div 
                      key={`pkg-${course.ID ?? index}-${pkg.ID ?? pkgIdx}`} 
                      className="w-[260px] bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-lg transition-all"
                    >
                      <div className="mb-4">
                        <span className="text-xs font-bold bg-red-100 text-[#CC0000] px-2 py-1 rounded-full uppercase">
                          แพ็กเกจ
                        </span>
                        <h4 className="text-lg font-bold text-gray-900 mt-2">{pkg.sessions_count} ครั้ง</h4>
                      </div>

                      <div className="space-y-3 mb-6">
                        <div className="flex items-center text-gray-600 text-sm">
                          <Clock className="w-4 h-4 mr-2" />
                          <span>{pkg.hours_count} ชั่วโมง</span>
                        </div>
                        
                        {/* ตารางเรียน */}
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <div className="flex items-center text-gray-700 text-xs font-semibold mb-2">
                            <Calendar className="w-3 h-3 mr-2" />
                            ตารางเรียน:
                          </div>
                          <div className="space-y-1">
                            {pkg.schedules && pkg.schedules.length > 0 ? (
                              pkg.schedules.map((sch, schIdx) => (
                                <div key={`sch-${pkg.ID ?? pkgIdx}-${schIdx}`} className="text-[11px] text-gray-600 flex justify-between">
                                  <span>{sch.day_of_week}</span>
                                  <span>{sch.start_time} - {sch.end_time}</span>
                                </div>
                              ))
                            ) : (
                              <p className="text-[11px] text-gray-400">ยังไม่ระบุเวลา</p>
                            )}
                          </div>
                        </div>

                        <p className="text-2xl font-black text-[#CC0000] pt-2">
                          {pkg.price.toLocaleString()} <span className="text-sm font-normal text-gray-500">บาท</span>
                        </p>
                      </div>

                      <button 
                        onClick={() => {
                          setSuccessMessage(null);
                          setSelectedPackage({ ...pkg, course_name: course.course_name });
                        }}
                        className="w-full py-2 rounded-lg bg-[#CC0000] text-white font-bold hover:bg-red-700 transition-colors"
                      >
                        สมัครเรียน
                      </button>
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