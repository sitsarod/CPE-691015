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
  ArrowLeft,
  Wallet,
  CalendarX,
  AlertTriangle,
  XCircle,
  History,
} from "lucide-react";
import { Enrollment } from "@/types/enrollment";
import { CourseDTO, CoursePackageDTO } from "@/types/course";
import {
  fetchCustomerEnrollments,
  fetchAvailableCourses,
  enrollCourse,
  cancelMyEnrollment,
} from "@/services/enrollmentAPI";
import FaceConsentModal from "@/components/FaceConsentModal";
import { fetchMyFaceConsent, recordFaceConsent } from "@/services/consentAPI";
import { FaceConsentStatus, FaceConsentDecision } from "@/types/consent";
import EnrollmentHistoryModal from "./components/EnrollmentHistoryModal";
import CourseCover from "@/components/course/CourseCover";
import CourseDetail from "@/components/course/CourseDetail";
import CourseSummaryCard from "@/components/course/CourseSummaryCard";
import {
  hoursPerSession,
  formatNumber,
  dayLabel,
  sortSchedulesByDay,
} from "@/components/course/courseUtils";
import {
  describeExpiry,
  expiryTextClass,
  formatThaiDate,
} from "@/components/course/expiryUtils";

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
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // สำหรับความยินยอมเก็บข้อมูลใบหน้า (PDPA)
  const [consent, setConsent] = useState<FaceConsentStatus | null>(null);
  const [isConsentOpen, setIsConsentOpen] = useState(false);
  const [isSavingConsent, setIsSavingConsent] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem("token");
      const customerId = localStorage.getItem("user_id");

      if (!token || !customerId) {
        router.push("/login");
        return;
      }

      const [enrollmentsData, coursesData] = await Promise.all([
        fetchCustomerEnrollments(customerId, token),
        fetchAvailableCourses(token),
      ]);

      setEnrollments(enrollmentsData);
      setCourses(coursesData);

      // มาจากลิงก์แจ้งเตือน "คำขอไม่ผ่านการพิจารณา" → เปิดหน้าประวัติให้เลย
      // เพราะใบที่ถูกปฏิเสธไม่โชว์ในกริดหลัก ถ้าไม่เปิดให้ผู้ใช้จะกดมาแล้วไม่เจออะไร
      if (new URLSearchParams(window.location.search).get("history") === "1") {
        setShowHistory(true);

        // ล้าง query ทิ้งแบบเดียวกับ ?pkg= เพื่อไม่ให้เด้งซ้ำตอนกดปิดแล้วรีเฟรช
        const url = new URL(window.location.href);
        url.searchParams.delete("history");
        window.history.replaceState({}, "", url.pathname + url.search);
      }

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

  // ถอนใบสมัครที่ยังรออนุมัติ — ถามยืนยันก่อนเพราะถอนแล้วใบหายเลย ไม่มีปุ่มเรียกคืน
  const handleCancel = async (item: Enrollment) => {
    const courseName = item.package?.course?.course_name ?? "คอร์สนี้";
    if (
      !window.confirm(
        `ยกเลิกใบสมัคร "${courseName}" ใช่หรือไม่?\n\nใบสมัครจะถูกถอนออกจากคิวอนุมัติ ถ้าเปลี่ยนใจต้องสมัครใหม่และรออนุมัติอีกครั้ง`
      )
    ) {
      return;
    }

    setCancellingId(item.id);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        alert("กรุณาเข้าสู่ระบบก่อนทำรายการ");
        return;
      }

      await cancelMyEnrollment(item.id, token);
      setSuccessMessage("ยกเลิกใบสมัครเรียบร้อยแล้ว");
      loadData(); // รีเฟรชทั้งรายการของฉันและที่นั่งคงเหลือของคอร์ส
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถยกเลิกใบสมัครได้");
    } finally {
      setCancellingId(null);
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

  // ใบที่ถูกปฏิเสธไปอยู่ในหน้าประวัติอย่างเดียว ไม่ปะปนกับคอร์สที่ใช้งานอยู่
  const visibleEnrollments = enrollments.filter((e) => e.status !== "rejected");
  const hiddenRejectedCount = enrollments.length - visibleEnrollments.length;

  const displayCourses = courses;

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
    <div className="mx-auto max-w-7xl">
      {/* ---------------- ส่วนที่ 1: คอร์สของฉัน ---------------- */}
      <div className="mb-10">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-gray-900">คอร์สของฉัน</h1>

          <button
            onClick={() => setShowHistory(true)}
            title="ประวัติการเรียน"
            aria-label="ประวัติการเรียน"
            className="rounded-xl border border-gray-300 p-2.5 text-gray-600 transition-colors hover:border-[#CC0000] hover:bg-red-50 hover:text-[#CC0000]"
          >
            <History className="h-5 w-5" />
          </button>
        </div>
        {visibleEnrollments.length === 0 ? (
          <div className="text-[16px] text-gray-500">
            <p>คุณยังไม่มีข้อมูลการลงทะเบียนคอร์สเรียนในขณะนี้</p>

            {/* กันงงกรณีเคยสมัครแล้วถูกปฏิเสธ — ไม่งั้นจะเห็นหน้าว่างทั้งที่เพิ่งสมัครไป */}
            {hiddenRejectedCount > 0 && (
              <button
                onClick={() => setShowHistory(true)}
                className="mt-2 text-sm font-semibold text-[#CC0000] underline underline-offset-2"
              >
                มีใบสมัคร {hiddenRejectedCount} ใบที่ไม่ผ่านการพิจารณา · ดูประวัติ
              </button>
            )}
          </div>
        ) : (
          <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:gap-4 sm:px-0">
            {visibleEnrollments.map((item) => {
              // คำนวณครั้งเดียว ของเดิมเรียกฟังก์ชันซ้ำสองรอบใน JSX
              const schedules = sortSchedulesByDay(item.package?.schedules);
              const expiry = describeExpiry(
                item.days_left,
                item.status,
                item.grace_days_left
              );
              const inGrace =
                item.grace_days_left !== null && item.grace_days_left > 0;

              return (
              <div
                key={`enroll-${item.id}`}
                className="w-[160px] shrink-0 snap-start p-3 sm:w-[240px] sm:min-h-[300px] sm:p-4 border border-gray-400 rounded-lg flex flex-col shadow-sm hover:border-[#CC0000] transition-all bg-white relative overflow-hidden"
              >
                {item.status === 'pending' && (
                  <div className="absolute top-0 left-0 right-0 bg-yellow-100 text-yellow-700 text-xs font-bold py-1.5 text-center flex justify-center items-center">
                    <Clock className="w-3 h-3 mr-1" /> รอดำเนินการ 3-7 วัน
                  </div>
                )}
                {item.status === 'awaiting_payment' && (
                  <div className="absolute top-0 left-0 right-0 bg-orange-100 text-orange-700 text-xs font-bold py-1.5 text-center flex justify-center items-center">
                    <Wallet className="w-3 h-3 mr-1" /> รอชำระเงิน
                  </div>
                )}
                {item.status === 'expired' && (
                  <div
                    className={`absolute top-0 left-0 right-0 text-xs font-bold py-1.5 text-center flex justify-center items-center ${
                      inGrace
                        ? 'bg-red-100 text-red-700'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    <CalendarX className="w-3 h-3 mr-1" />
                    {inGrace
                      ? `หมดอายุ · ขอขยายได้อีก ${item.grace_days_left} วัน`
                      : 'หมดอายุแล้ว'}
                  </div>
                )}

                <div className={`flex justify-center items-center py-3 ${item.status === 'pending' || item.status === 'awaiting_payment' || item.status === 'expired' ? 'mt-5 sm:mt-4 opacity-50' : ''}`}>
                  {item.package?.course?.image_url ? (
                    <CourseCover
                      src={item.package.course.image_url}
                      alt={item.package.course.course_name}
                      className="aspect-[16/9] w-full rounded-lg bg-gray-50 object-cover"
                    />
                  ) : (
                    <FileEdit className="w-14 h-14 text-[#CC0000]" strokeWidth={1.2} />
                  )}
                </div>

                <p className="text-gray-900 font-bold text-[14px] sm:text-[16px] truncate">{item.package?.course?.course_name}</p>

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

                  {/* วันเวลาเรียน — แยกบรรทัดต่อวัน ไม่รวบวันที่เวลาตรงกัน
                      วางหัวข้อไว้คนละบรรทัดกับค่า เพราะการ์ดกว้าง 240px
                      ถ้าจับคู่ซ้าย-ขวาในบรรทัดเดียวจะแคบจนเวลาตกบรรทัด */}
                  <div>
                    <dt className="text-gray-500">วันเวลาเรียน</dt>
                    <dd className="mt-1">
                      {schedules.length === 0 ? (
                        <span className="text-gray-300">ยังไม่ระบุ</span>
                      ) : (
                        <div className="space-y-0.5">
                          {schedules.map((sch, idx) => (
                            <div
                              key={`sch-${item.id}-${idx}`}
                              className="flex justify-between gap-2"
                            >
                              <span className="font-semibold text-gray-900">
                                {dayLabel(sch.day_of_week)}
                              </span>
                              <span className="text-gray-500">
                                {sch.start_time}-{sch.end_time}
                              </span>
                            </div>
                          ))}
                        </div>
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

                  {/* แสดงวันหมดอายุเฉพาะใบที่เริ่มนับแล้ว — ใบที่รออนุมัติ/รอชำระเงิน
                      ยังไม่มีวันหมดอายุ (expires_at เป็น null) การแสดงจะทำให้เข้าใจผิด */}
                  {item.expires_at && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-500 shrink-0">หมดอายุ</dt>
                      <dd className={`font-semibold text-right ${expiryTextClass(expiry.tone)}`}>
                        {formatThaiDate(item.expires_at)}
                      </dd>
                    </div>
                  )}
                </dl>

                <div className="mt-auto space-y-1.5 pt-3">

                  {item.is_overdue && (
                    <p className="flex items-start gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-[11px] font-semibold leading-relaxed text-red-700">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      มีบิลค้างชำระเกินกำหนด กรุณาติดต่อโรงเรียน
                    </p>
                  )}

                  <p>
                    {item.status === 'pending' ? (
                      <span className="text-xs sm:text-sm text-yellow-600">แอดมินกำลังตรวจสอบข้อมูล</span>
                    ) : item.status === 'awaiting_payment' ? (
                      <span className="text-xs sm:text-sm text-orange-600">
                        ชำระเงินก่อนจึงจะเริ่มเรียนและมีตารางเรียน
                      </span>
                    ) : inGrace ? (
                      <span className="text-xs sm:text-sm font-semibold text-red-600">
                        เหลือ {item.remaining_sessions} ครั้งที่ยังไม่ได้ใช้ ·
                        ติดต่อแอดมินภายใน {item.grace_days_left} วันเพื่อขอขยายสิทธิ์
                      </span>
                    ) : item.status === 'expired' ? (
                      <span className="text-xs sm:text-sm text-slate-500">
                        ครบกำหนดแล้ว สมัครแพ็กเกจใหม่เพื่อเรียนต่อได้เลย
                      </span>
                    ) : (
                      <span className="text-xs sm:text-sm text-gray-500">
                        เหลือ {item.remaining_sessions} ครั้ง
                        {expiry.highlight && (
                          <span className={`ml-1 font-bold ${expiryTextClass(expiry.tone)}`}>
                            · {expiry.label}
                          </span>
                        )}
                      </span>
                    )}
                  </p>

                  {/* เฉพาะ pending — อนุมัติแล้วต้องผ่านแอดมิน (backend บังคับกติกาเดียวกัน) */}
                  {item.status === 'pending' && (
                    <button
                      onClick={() => handleCancel(item)}
                      disabled={cancellingId !== null}
                      className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md border border-gray-300 py-2 text-xs font-semibold text-gray-600 transition-colors hover:border-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      {cancellingId === item.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      ยกเลิกใบสมัคร
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      <hr className="my-8 border-gray-300" />

      {/* ---------------- ส่วนที่ 2: คอร์ส ---------------- */}
      {/*
        แยกเป็นสองมุมมอง: รายการคอร์สแบบกระชับ → กดเข้าไปดูรายละเอียดทีละคอร์ส
        เดิมกางรายละเอียดทุกคอร์สพร้อมกันในหน้าเดียว ทำให้เลื่อนยาวมากและเทียบคอร์สไม่ออก
      */}
      {openCourse ? (
        <div className="mb-10 w-full">
          <button
            onClick={() => setOpenCourseId(null)}
            className="mb-5 flex items-center gap-2 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-900"
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
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">คอร์สทั้งหมด</h2>
              <span className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                <LayoutGrid className="h-5 w-5 text-[#CC0000]" />
                เลือกคอร์สเพื่อดูรายละเอียดและแพ็กเกจ
              </span>
            </div>
          </div>

          {displayCourses.length === 0 ? (
            <p className="py-10 text-center text-gray-500">
              ไม่มีคอร์สแนะนำในขณะนี้
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
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

      {showHistory && (
        <EnrollmentHistoryModal
          enrollments={enrollments}
          onClose={() => setShowHistory(false)}
        />
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
