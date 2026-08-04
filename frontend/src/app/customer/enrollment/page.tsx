"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileEdit,
  LayoutGrid,
  Loader2,
  Clock,
  CheckCircle2,
  AlertCircle,
  SearchCode,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { Enrollment } from "@/types/enrollment";
import { CourseDTO, CoursePackageDTO } from "@/types/course";
import {
  fetchCustomerEnrollments,
  fetchAvailableCourses,
  enrollCourse,
} from "@/services/enrollmentAPI";
import { fetchActiveQuestions, recommendCourses } from "@/services/quizAPI";
import { QuizQuestion, QuizOption } from "@/types/quiz";
import FaceConsentModal from "@/components/FaceConsentModal";
import { fetchMyFaceConsent, recordFaceConsent } from "@/services/consentAPI";
import { FaceConsentStatus, FaceConsentDecision } from "@/types/consent";
import CourseDetail from "@/components/course/CourseDetail";
import CourseSummaryCard from "@/components/course/CourseSummaryCard";
import {
  hoursPerSession,
  formatNumber,
  dayLabel,
  groupSchedulesByTime,
} from "@/components/course/courseUtils";

/** แพ็กเกจที่ผู้ใช้เลือก พร้อมชื่อคอร์สที่ผูกอยู่ (DTO ของแพ็กเกจไม่มีชื่อคอร์สในตัว) */
interface SelectedPackage {
  pkg: CoursePackageDTO;
  courseName: string;
}

export default function EnrollmentPage() {
  const router = useRouter();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [courses, setCourses] = useState<CourseDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openCourseId, setOpenCourseId] = useState<number | null>(null);

  // สำหรับ Modal สมัครเรียน
  const [selected, setSelected] = useState<SelectedPackage | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // สำหรับความยินยอมเก็บข้อมูลใบหน้า (PDPA)
  const [consent, setConsent] = useState<FaceConsentStatus | null>(null);
  const [isConsentOpen, setIsConsentOpen] = useState(false);
  const [isSavingConsent, setIsSavingConsent] = useState(false);

  // สำหรับระบบคัดกรอง (Quiz Engine)
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<QuizOption[]>([]);
  const [quizResultCourseIds, setQuizResultCourseIds] = useState<number[]>([]);
  const [isQuizFinished, setIsQuizFinished] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem("token");
      const customerId = localStorage.getItem("user_id");

      if (!token || !customerId) {
        router.push("/login");
        return;
      }

      const [enrollmentsData, coursesData, questionsData] = await Promise.all([
        fetchCustomerEnrollments(customerId, token),
        fetchAvailableCourses(token),
        fetchActiveQuestions(),
      ]);

      setEnrollments(enrollmentsData);
      setCourses(coursesData);
      setQuizQuestions(questionsData);

      // ดึงสถานะความยินยอมแยกต่างหาก และกลืน error ทิ้งโดยตั้งใจ
      // เพราะบัญชีที่ไม่มีโปรไฟล์ลูกค้า (เช่นแอดมินเปิดหน้านี้) จะได้ 404
      // ซึ่งไม่ควรทำให้หน้าคอร์สทั้งหน้าพัง
      try {
        setConsent(await fetchMyFaceConsent());
      } catch {
        setConsent(null);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล"
      );
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // รองรับ deep link จากหน้า /courses/[id] → /customer/enrollment?pkg=<id>
  //
  // อ่านจาก window.location แทน useSearchParams เพื่อเลี่ยงข้อกำหนดเรื่อง Suspense boundary
  // ของ Next.js ตอน build (useSearchParams บังคับให้ต้องมี <Suspense> ครอบ)
  useEffect(() => {
    if (courses.length === 0) return;

    const pkgParam = new URLSearchParams(window.location.search).get("pkg");
    if (!pkgParam) return;

    const pkgId = Number(pkgParam);
    if (Number.isNaN(pkgId)) return;

    for (const course of courses) {
      const found = (course.packages ?? []).find((p) => p.id === pkgId);
      if (found) {
        // เปิดหน้ารายละเอียดคอร์สนั้นไว้ด้วย ผู้ใช้จะได้เห็นบริบทว่ากำลังสมัครคอร์สอะไร
        // ถ้าปิด modal ยืนยันแล้วจะไม่เจอหน้าเปล่า
        setOpenCourseId(course.id);
        setSelected({ pkg: found, courseName: course.course_name });
        break;
      }
    }

    // ล้าง query ทิ้งเพื่อไม่ให้ modal เด้งซ้ำเมื่อผู้ใช้กดปิดแล้วรีเฟรช
    window.history.replaceState({}, "", window.location.pathname);
  }, [courses]);

  // กดยืนยันสมัคร → ถ้ายังไม่เคยตอบเรื่องความยินยอมใบหน้า ให้ถามก่อนหนึ่งครั้ง
  // ตอบแล้วไม่ว่าจะยินยอมหรือไม่ ก็สมัครต่อได้เหมือนกัน — ความยินยอมไม่ใช่เงื่อนไขการสมัคร
  const handleEnroll = async () => {
    if (!selected) return;

    if (consent?.needs_decision) {
      setIsConsentOpen(true);
      return;
    }

    await doEnroll();
  };

  const doEnroll = async () => {
    if (!selected) return;
    setIsEnrolling(true);
    try {
      const token = localStorage.getItem("token");
      const customerId = localStorage.getItem("user_id");
      if (!token || !customerId) {
        alert("กรุณาเข้าสู่ระบบก่อนทำรายการ");
        return;
      }

      await enrollCourse(
        {
          customer_id: parseInt(customerId, 10),
          package_id: selected.pkg.id,
        },
        token
      );

      setSuccessMessage("สมัครคอร์สเรียนสำเร็จ! ระบบกำลังดำเนินการภายใน 3-7 วัน");
      setSelected(null);
      loadData(); // รีเฟรชข้อมูลคอร์สใหม่
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการสมัครเรียน");
    } finally {
      setIsEnrolling(false);
    }
  };

  // บันทึกการตัดสินใจ แล้วสมัครต่อให้เลย ผู้ใช้จะได้ไม่ต้องกดยืนยันซ้ำสองรอบ
  const handleConsentDecision = async (action: FaceConsentDecision) => {
    setIsSavingConsent(true);
    try {
      const updated = await recordFaceConsent(action);
      setConsent(updated);
      setIsConsentOpen(false);
      await doEnroll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถบันทึกการตัดสินใจได้");
    } finally {
      setIsSavingConsent(false);
    }
  };

  const handleStartQuiz = () => {
    setCurrentQuizIndex(0);
    setQuizAnswers([]);
    setQuizResultCourseIds([]);
    setIsQuizFinished(false);
    setOpenCourseId(null);
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
      const optionIds = newAnswers.map((a) => a.id);
      const res = await recommendCourses(optionIds);
      const rankedIds = res.data.map((r) => r.course_id);
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

  const displayCourses =
    isQuizFinished && quizResultCourseIds.length > 0
      ? quizResultCourseIds
          .map((id) => courses.find((c) => c.id === id))
          .filter((c): c is CourseDTO => c != null)
      : courses;

  const openCourse =
    openCourseId != null
      ? courses.find((c) => c.id === openCourseId) ?? null
      : null;

  if (isLoading) {
    return (
      <div className="flex h-[60vh] w-full flex-col items-center justify-center text-gray-500">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-[#CC0000]" />
      </div>
    );
  }

  if (error) return <div className="p-6 text-center text-red-600">{error}</div>;

  return (
    <div className="w-full">
      {/* ---------------- ส่วนที่ 1: คอร์สของฉัน ---------------- */}
      <div className="mb-14">
        <h1 className="mb-8 text-[22px] font-bold text-gray-900">คอร์สของฉัน</h1>
        {enrollments.length === 0 ? (
          <p className="text-[16px] text-gray-500">
            คุณยังไม่มีข้อมูลการลงทะเบียนคอร์สเรียนในขณะนี้
          </p>
        ) : (
          <div className="flex flex-wrap gap-10">
            {enrollments.map((item) => (
              <div
                key={`enroll-${item.id}`}
                className="w-[240px] min-h-[340px] border border-gray-400 rounded-lg p-6 flex flex-col shadow-sm hover:border-[#CC0000] transition-all bg-white relative overflow-hidden"
              >
                {item.status === 'pending' && (
                  <div className="absolute top-0 left-0 right-0 bg-yellow-100 text-yellow-700 text-xs font-bold py-1.5 text-center flex justify-center items-center">
                    <Clock className="w-3 h-3 mr-1" /> รอดำเนินการ 3-7 วัน
                  </div>
                )}

                <div className={`flex justify-center items-center py-4 ${item.status === 'pending' ? 'mt-4 opacity-50' : ''}`}>
                  <FileEdit className="w-20 h-20 text-[#CC0000]" strokeWidth={1.2} />
                </div>

                <p className="text-gray-900 font-bold text-[18px] truncate">{item.package?.course?.course_name}</p>

                {/* รายละเอียด: แพ็กเกจ / จำนวนชั่วโมง / วันเวลาเรียน / ราคา */}
                <dl className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500 shrink-0">แพ็กเกจ</dt>
                    <dd className="font-semibold text-gray-900 text-right">
                      {item.package?.sessions_count ?? 0} ครั้ง
                    </dd>
                  </div>

                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500 shrink-0">จำนวนชั่วโมง</dt>
                    <dd className="font-semibold text-gray-900 text-right">
                      {item.package?.hours_count ?? 0} ชั่วโมง
                    </dd>
                  </div>

                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500 shrink-0">วันเวลาเรียน</dt>
                    <dd className="text-right">
                      {groupSchedulesByTime(item.package?.schedules).length === 0 ? (
                        <span className="text-gray-300">ยังไม่ระบุ</span>
                      ) : (
                        groupSchedulesByTime(item.package?.schedules).map((group, idx) => (
                          <div key={`sch-${item.id}-${idx}`} className="leading-relaxed">
                            <span className="font-semibold text-gray-900">
                              {group.days.map(dayLabel).join(" · ")}
                            </span>
                            <span className="block text-gray-500">
                              {group.startTime}-{group.endTime}
                            </span>
                          </div>
                        ))
                      )}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500 shrink-0">ราคา</dt>
                    <dd className="font-bold text-[#CC0000] text-right">
                      {item.package?.price
                        ? `${item.package.price.toLocaleString("th-TH")} บาท`
                        : "สอบถามราคา"}
                    </dd>
                  </div>
                </dl>

                <p className="mt-auto pt-3">
                  {item.status === 'pending' ? (
                    <span className="text-sm text-yellow-600">รอแอดมินอนุมัติ</span>
                  ) : (
                    <span className="text-sm text-gray-500">เหลือ {item.remaining_sessions} ครั้ง</span>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <hr className="my-10 border-gray-300" />

      {/* ---------------- ส่วนที่ 2: คอร์ส ---------------- */}
      {/*
        แยกเป็นสองมุมมอง: รายการคอร์สแบบกระชับ → กดเข้าไปดูรายละเอียดทีละคอร์ส
        เดิมกางรายละเอียดทุกคอร์สพร้อมกันในหน้าเดียว ทำให้เลื่อนยาวมากและเทียบคอร์สไม่ออก
      */}
      {openCourse ? (
        <div className="mb-10 w-full">
          <button
            onClick={() => setOpenCourseId(null)}
            className="mb-8 flex items-center gap-2 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            กลับไปดูคอร์สทั้งหมด
          </button>

          <CourseDetail
            course={openCourse}
            ctaLabel="สมัครเรียนแพ็กเกจนี้"
            onSelectPackage={(pkg, c) => {
              setSuccessMessage(null);
              setSelected({ pkg, courseName: c.course_name });
            }}
          />
        </div>
      ) : (
        <div className="mb-10 w-full">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {isQuizFinished && quizResultCourseIds.length > 0
                  ? "คอร์สที่เหมาะกับคุณ"
                  : "คอร์สทั้งหมด"}
              </h2>
              <span className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                <LayoutGrid className="h-5 w-5 text-[#CC0000]" />
                {isQuizFinished && quizResultCourseIds.length > 0
                  ? "ผลลัพธ์จากการประเมินแบบคัดกรองของคุณ"
                  : "เลือกคอร์สเพื่อดูรายละเอียดและแพ็กเกจ"}
              </span>
            </div>

            {isQuizFinished && quizResultCourseIds.length > 0 ? (
              <button
                onClick={handleClearQuizFilter}
                className="flex items-center gap-2 rounded-xl border-2 border-gray-200 bg-white px-6 py-3 font-bold text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm"
              >
                ✕ เลิกคัดกรอง (ดูคอร์สทั้งหมด)
              </button>
            ) : (
              (quizQuestions?.length || 0) > 0 && (
                <button
                  onClick={handleStartQuiz}
                  className="flex items-center gap-2 rounded-xl bg-[#CC0000] px-6 py-3 font-bold text-white shadow-lg shadow-red-200 transition-all hover:scale-105 hover:bg-red-700"
                >
                  <SearchCode className="h-5 w-5" /> เลือกแพ็กเกจที่เหมาะกับคุณ
                </button>
              )
            )}
          </div>

          {displayCourses.length === 0 ? (
            <p className="py-10 text-center text-gray-500">
              ไม่มีคอร์สแนะนำในขณะนี้
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {displayCourses.map((course) => (
                <CourseSummaryCard
                  key={`course-${course.id}`}
                  course={course}
                  onClick={(c) => setOpenCourseId(c.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------- Modal ยืนยันการสมัคร ---------------- */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="bg-[#CC0000] p-4 text-center text-white">
              <h3 className="text-lg font-bold">ยืนยันการสมัครเรียน</h3>
            </div>
            <div className="p-6">
              <div className="mb-6 space-y-4">
                <div>
                  <span className="text-sm text-gray-500">คอร์สเรียน</span>
                  <p className="text-lg font-bold text-gray-900">
                    {selected.courseName}
                  </p>
                </div>

                <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <SummaryRow
                    label="จำนวนครั้ง"
                    value={`${selected.pkg.sessions_count} ครั้ง`}
                  />
                  <SummaryRow
                    label="เวลาเรียนรวม"
                    value={`${selected.pkg.hours_count} ชั่วโมง`}
                  />
                  {hoursPerSession(selected.pkg) > 0 && (
                    <SummaryRow
                      label="ต่อครั้ง"
                      value={`${formatNumber(
                        hoursPerSession(selected.pkg)
                      )} ชั่วโมง`}
                    />
                  )}
                </div>

                <div className="flex items-center justify-between rounded-lg border border-red-100 bg-red-50 p-3">
                  <span className="text-sm font-semibold text-[#CC0000]">
                    ราคาที่ต้องชำระ
                  </span>
                  <span className="text-xl font-black text-[#CC0000]">
                    {selected.pkg.price
                      ? `${selected.pkg.price.toLocaleString("th-TH")} บาท`
                      : "สอบถามราคา"}
                  </span>
                </div>

                <div className="mt-4 flex items-start rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                  <AlertCircle className="mr-2 mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600" />
                  <p className="text-xs text-yellow-700">
                    เมื่อกดยืนยัน ระบบจะใช้เวลาในการดำเนินการ 3-7 วัน
                    แอดมินจะทำการตรวจสอบและสร้างบิลเรียกเก็บเงินให้ท่านในลำดับถัดไป
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSelected(null)}
                  disabled={isEnrolling}
                  className="flex-1 rounded-xl bg-gray-100 py-3 font-bold text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleEnroll}
                  disabled={isEnrolling}
                  className="flex flex-1 items-center justify-center rounded-xl bg-[#CC0000] py-3 font-bold text-white shadow-md shadow-red-200 transition-colors hover:bg-red-700 disabled:opacity-70"
                >
                  {isEnrolling ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "ยืนยันการสมัคร"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Modal ขอความยินยอมเก็บข้อมูลใบหน้า (PDPA) ---------------- */}
      <FaceConsentModal
        open={isConsentOpen}
        isSubmitting={isSavingConsent}
        onDecision={handleConsentDecision}
        onDismiss={() => setIsConsentOpen(false)}
      />

      {/* ---------------- Modal ระบบคัดกรอง (Quiz Engine) ---------------- */}
      {isQuizOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md transition-all duration-300">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-white/20 bg-white shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
            <div className="relative overflow-hidden bg-gradient-to-br from-[#CC0000] via-red-600 to-red-700 p-8 text-white">
              <div className="absolute right-0 top-0 h-40 w-40 -translate-y-1/2 translate-x-1/4 rounded-full bg-white/10 blur-2xl"></div>
              <div className="absolute bottom-0 left-0 h-32 w-32 -translate-x-1/4 translate-y-1/2 rounded-full bg-black/10 blur-xl"></div>

              <div className="absolute bottom-0 left-0 h-1.5 w-full bg-black/20">
                <div
                  className="relative h-full bg-white transition-all duration-700 ease-out"
                  style={{
                    width: `${(currentQuizIndex / quizQuestions.length) * 100}%`,
                  }}
                >
                  <div className="absolute right-0 top-0 h-full w-3 bg-white shadow-[0_0_10px_rgba(255,255,255,1)] blur-[2px]"></div>
                </div>
              </div>

              <div className="relative z-10 flex items-center justify-between">
                <h3 className="flex items-center gap-3 text-2xl font-black tracking-tight drop-shadow-md">
                  <div className="rounded-xl border border-white/10 bg-white/20 p-2 backdrop-blur-sm">
                    <SearchCode className="h-6 w-6 text-white" />
                  </div>
                  แบบประเมินคอร์สที่ใช่
                </h3>
              </div>

              <button
                onClick={() => setIsQuizOpen(false)}
                className="absolute right-6 top-6 z-10 rounded-full border border-white/5 bg-black/10 p-2 text-white/70 backdrop-blur-sm transition-all duration-300 hover:rotate-90 hover:bg-black/20 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto bg-gray-50/30 p-10">
              <div className="mx-auto max-w-xl">
                <div className="mb-10 text-center">
                  <span className="mb-6 inline-block rounded-full border border-red-100 bg-red-50 px-5 py-1.5 text-xs font-bold uppercase tracking-widest text-[#CC0000] shadow-sm">
                    คำถามที่ {currentQuizIndex + 1} จาก {quizQuestions.length}
                  </span>
                  <h2 className="text-3xl font-black leading-snug text-gray-900">
                    {quizQuestions[currentQuizIndex]?.text}
                  </h2>
                </div>
                <div className="space-y-4">
                  {quizQuestions[currentQuizIndex]?.options?.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => handleSelectQuizOption(opt)}
                      className="group flex w-full items-center justify-between rounded-2xl border-2 border-gray-100 bg-white p-6 text-left text-lg font-bold text-gray-700 transition-colors hover:border-[#CC0000] hover:text-[#CC0000]"
                    >
                      <span>{opt.text}</span>
                      <ArrowRight className="h-5 w-5 text-gray-400 transition-colors group-hover:text-[#CC0000]" />
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
        <div className="fixed bottom-6 right-6 z-50 flex items-center rounded-xl border border-green-200 bg-green-50 px-6 py-4 text-green-700 shadow-lg">
          <CheckCircle2 className="mr-3 h-6 w-6 text-green-600" />
          <span className="font-semibold">{successMessage}</span>
          <button
            onClick={() => setSuccessMessage(null)}
            className="ml-6 text-green-500 hover:text-green-700"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="font-bold text-gray-900">{value}</span>
    </div>
  );
}
