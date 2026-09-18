"use client";

import { X, FileClock, GraduationCap, Inbox } from "lucide-react";
import type { Enrollment } from "@/types/enrollment";
import { ENROLLMENT_STATUS_LABEL } from "@/types/enrollment";
import { formatThaiDate } from "@/components/course/expiryUtils";
import CourseCover from "@/components/course/CourseCover";

// สถานะที่ถือว่า "เคยเรียนจริงและจบไปแล้ว" — ต้องเคยมี started_at ด้วย
// ใบที่ถูกปฏิเสธหรือยกเลิกก่อนเริ่มไม่นับว่าเคยเรียน
const STUDIED_STATUSES = ["completed", "expired"];

const STATUS_TONE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  awaiting_payment: "bg-orange-100 text-orange-800",
  active: "bg-green-100 text-green-800",
  completed: "bg-blue-100 text-blue-800",
  expired: "bg-slate-100 text-slate-700",
  cancelled: "bg-gray-100 text-gray-600",
  rejected: "bg-red-100 text-red-700",
};

function StatusTag({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
        STATUS_TONE[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {ENROLLMENT_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
      <Inbox className="h-8 w-8" strokeWidth={1.5} />
      <p className="text-sm">{text}</p>
    </div>
  );
}

interface Props {
  enrollments: Enrollment[];
  onClose: () => void;
}

export default function EnrollmentHistoryModal({ enrollments, onClose }: Props) {
  // ใหม่สุดขึ้นก่อน — ของเดิมเรียงตามที่ API ส่งมา ซึ่งเรียงตามวันสมัครอยู่แล้ว
  // แต่เรียงซ้ำที่นี่เพื่อไม่ให้ผูกกับลำดับของ backend
  const applications = [...enrollments].sort(
    (a, b) =>
      new Date(b.enrollment_date).getTime() - new Date(a.enrollment_date).getTime()
  );

  const studied = applications.filter(
    (e) => e.started_at !== null && STUDIED_STATUSES.includes(e.status)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">ประวัติการเรียน</h2>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-6 py-5">
          {/* ── คอร์สที่เคยเรียน ── */}
          <section>
            <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900">
              <GraduationCap className="h-4 w-4 text-[#CC0000]" />
              คอร์สที่เคยเรียน
            </h3>

            {studied.length === 0 ? (
              <EmptyRow text="ยังไม่มีคอร์สที่เรียนจบหรือหมดอายุ" />
            ) : (
              <ul className="mt-3 space-y-2">
                {studied.map((e) => {
                  // กัน underflow ของการลบเลขไม่มีเครื่องหมาย ถ้าข้อมูลเพี้ยน
                  const used =
                    e.total_sessions >= e.remaining_sessions
                      ? e.total_sessions - e.remaining_sessions
                      : 0;

                  return (
                    <li
                      key={`studied-${e.id}`}
                      className="rounded-xl border border-gray-200 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <CourseCover
                            src={e.package?.course?.image_url}
                            alt={e.package?.course?.course_name ?? "คอร์ส"}
                            width={128}
                            height={128}
                            className="h-10 w-12 shrink-0 rounded-lg object-cover"
                          />
                          <p className="truncate font-semibold text-gray-900">
                            {e.package?.course?.course_name ?? "ไม่ทราบคอร์ส"}
                          </p>
                        </div>
                        <StatusTag status={e.status} />
                      </div>

                      <dl className="mt-2 grid grid-cols-1 gap-y-1 text-xs text-gray-600 sm:grid-cols-2 sm:gap-x-4">
                        <div className="flex justify-between">
                          <dt className="text-gray-500">ช่วงที่เรียน</dt>
                          <dd className="font-medium">
                            {formatThaiDate(e.started_at)} – {formatThaiDate(e.expires_at)}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-gray-500">ใช้ไป</dt>
                          <dd className="font-medium">
                            {used} / {e.total_sessions} ครั้ง
                          </dd>
                        </div>
                      </dl>

                      {/* เหลือครั้งค้างตอนหมดอายุ = เสียสิทธิ์ไปจริง ควรเห็นชัด */}
                      {e.status === "expired" && e.remaining_sessions > 0 && (
                        <p className="mt-2 text-xs font-semibold text-amber-700">
                          หมดอายุโดยยังเหลือ {e.remaining_sessions} ครั้งที่ไม่ได้ใช้
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── ประวัติการสมัคร ── */}
          <section>
            <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900">
              <FileClock className="h-4 w-4 text-[#CC0000]" />
              ประวัติการสมัคร
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              ทุกครั้งที่เคยส่งใบสมัคร พร้อมผลการพิจารณา
            </p>

            {applications.length === 0 ? (
              <EmptyRow text="ยังไม่เคยสมัครคอร์สเรียน" />
            ) : (
              <ul className="mt-3 space-y-2">
                {applications.map((e) => (
                  <li
                    key={`apply-${e.id}`}
                    className="rounded-xl border border-gray-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <CourseCover
                        src={e.package?.course?.image_url}
                        alt={e.package?.course?.course_name ?? "คอร์ส"}
                        width={128}
                        height={128}
                        className="h-10 w-12 shrink-0 rounded-lg object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-gray-900">
                          {e.package?.course?.course_name ?? "ไม่ทราบคอร์ส"}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          สมัครเมื่อ {formatThaiDate(e.enrollment_date)} ·{" "}
                          {e.package?.sessions_count ?? 0} ครั้ง
                        </p>
                      </div>
                      <StatusTag status={e.status} />
                    </div>

                    {/* เหตุผลที่ถูกปฏิเสธต้องอยู่ในประวัติด้วย ไม่ใช่เห็นแค่ตอนแจ้งเตือน
                        เพราะนักเรียนมักกลับมาดูทีหลังว่าครั้งก่อนติดตรงไหน */}
                    {e.rejected_reason && (
                      <div className="mt-2 rounded-lg bg-red-50 p-2.5">
                        <p className="whitespace-pre-wrap text-xs text-red-700">
                          เหตุผล: {e.rejected_reason}
                        </p>
                        {e.rejected_at && (
                          <p className="mt-1 text-[11px] text-red-500">
                            เมื่อ {formatThaiDate(e.rejected_at)}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
