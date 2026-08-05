"use client";

import { useEffect, useState } from "react";
import {
  X,
  Loader2,
  User,
  Phone,
  Mail,
  Cake,
  Users2,
  Wallet,
  History,
  CalendarClock,
  ScanFace,
  AlertTriangle,
  CheckCircle2,
  Armchair,
} from "lucide-react";
import { EnrollmentReview } from "@/types/enrollment";
import { fetchEnrollmentReview } from "@/services/enrollmentAPI";
import { dayLabel, groupSchedulesByTime } from "@/components/course/courseUtils";

interface EnrollmentReviewPanelProps {
  enrollmentId: number | null;
  onClose: () => void;
  onApprove: (id: number) => Promise<void>;
  isApproving: boolean;
}

/**
 * แผงตรวจสอบข้อมูลผู้สมัครก่อนอนุมัติ (เลื่อนเข้าจากขวา)
 *
 * ตั้งใจให้ปุ่มอนุมัติอยู่ในแผงนี้เท่านั้น ไม่ใช่ในตาราง เพื่อบังคับให้แอดมินเห็นข้อมูล
 * ที่ควรตรวจ (ยอดค้างชำระ ที่นั่งคงเหลือ คอร์สอื่นที่เรียนอยู่) ก่อนตัดสินใจ
 */
export default function EnrollmentReviewPanel({
  enrollmentId,
  onClose,
  onApprove,
  isApproving,
}: EnrollmentReviewPanelProps) {
  const [data, setData] = useState<EnrollmentReview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (enrollmentId == null) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("token") || "";
        const res = await fetchEnrollmentReview(enrollmentId, token);
        if (!cancelled) setData(res);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "ไม่สามารถดึงข้อมูลผู้สมัครได้"
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [enrollmentId]);

  if (enrollmentId == null) return null;

  const isPending = data?.enrollment.status === "pending";
  const seatsFull = data ? data.package.seats_left <= 0 : false;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={isApproving ? undefined : onClose}
      />

      <aside className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        {/* หัวแผง */}
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              ตรวจสอบข้อมูลผู้สมัคร
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              คำขอ #{enrollmentId}
              {data ? ` · รอมาแล้ว ${data.enrollment.waiting_days} วัน` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isApproving}
            aria-label="ปิด"
            className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* เนื้อหา */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#CC0000]" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : data ? (
            <div className="space-y-7">
              {/* คำเตือนที่ต้องเห็นก่อนตัดสินใจ */}
              <Warnings data={data} />

              {/* ข้อมูลส่วนตัว */}
              <Section icon={<User className="h-4 w-4" />} title="ข้อมูลผู้สมัคร">
                <div className="mb-3 flex items-baseline gap-2">
                  <span className="text-xl font-bold text-gray-900">
                    {data.customer.first_name} {data.customer.last_name}
                  </span>
                  {data.customer.nickname && (
                    <span className="text-sm text-gray-500">
                      ({data.customer.nickname})
                    </span>
                  )}
                </div>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  <Field icon={<Mail className="h-3.5 w-3.5" />} label="อีเมล" value={data.customer.email} />
                  <Field icon={<Phone className="h-3.5 w-3.5" />} label="เบอร์โทร" value={data.customer.phone} />
                  <Field
                    icon={<Cake className="h-3.5 w-3.5" />}
                    label="วันเกิด / อายุ"
                    value={
                      data.customer.birth_date
                        ? `${new Date(data.customer.birth_date).toLocaleDateString("th-TH", {
                            dateStyle: "long",
                          })}${data.customer.age != null ? ` (${data.customer.age} ปี)` : ""}`
                        : ""
                    }
                  />
                  <Field
                    icon={<Users2 className="h-3.5 w-3.5" />}
                    label="เพศ"
                    value={
                      data.customer.gender === "male"
                        ? "ชาย"
                        : data.customer.gender === "female"
                        ? "หญิง"
                        : ""
                    }
                  />
                  <Field icon={<Mail className="h-3.5 w-3.5" />} label="อีเมลผู้ปกครอง" value={data.customer.parent_email} />
                  <Field icon={<Phone className="h-3.5 w-3.5" />} label="เบอร์ผู้ปกครอง" value={data.customer.parent_phone} />
                  <Field
                    icon={<CalendarClock className="h-3.5 w-3.5" />}
                    label="เป็นสมาชิกตั้งแต่"
                    value={new Date(data.customer.member_since).toLocaleDateString("th-TH", {
                      dateStyle: "long",
                    })}
                  />
                  <Field
                    icon={<ScanFace className="h-3.5 w-3.5" />}
                    label="ความยินยอมใบหน้า"
                    value={consentLabel(data.customer.face_consent_status)}
                  />
                </dl>
              </Section>

              {/* แพ็กเกจที่สมัคร */}
              <Section icon={<Armchair className="h-4 w-4" />} title="แพ็กเกจที่สมัคร">
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-base font-bold text-[#CC0000]">
                    {data.package.course_name}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-600">
                    แพ็กเกจ {data.package.sessions_count} ครั้ง ·{" "}
                    {data.package.hours_count} ชั่วโมง ·{" "}
                    {data.package.price
                      ? `${data.package.price.toLocaleString("th-TH")} บาท`
                      : "ยังไม่ได้ตั้งราคา"}
                  </p>

                  {groupSchedulesByTime(data.package.schedules).map((g, i) => (
                    <p key={`sch-${i}`} className="mt-2 text-xs text-gray-500">
                      {g.days.map(dayLabel).join(" · ")} {g.startTime}-{g.endTime}
                    </p>
                  ))}

                  <div className="mt-4 border-t border-gray-100 pt-3">
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="text-gray-500">ที่นั่ง</span>
                      <span
                        className={`font-bold ${
                          seatsFull ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {seatsFull
                          ? "เต็มแล้ว"
                          : `อนุมัติเพิ่มได้อีก ${data.package.seats_left} ที่`}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      อนุมัติแล้ว {data.package.active_count} · รออนุมัติ{" "}
                      {data.package.pending_count} · รับสูงสุด{" "}
                      {data.package.max_seats} คน
                    </p>
                  </div>
                </div>
              </Section>

              {/* การเงิน */}
              <Section icon={<Wallet className="h-4 w-4" />} title="สถานะการเงิน">
                <div className="grid grid-cols-2 gap-3">
                  <MoneyCard
                    label="ยังไม่ชำระ"
                    count={data.finance.unpaid_count}
                    amount={data.finance.unpaid_amount}
                    tone={data.finance.unpaid_count > 0 ? "warning" : "neutral"}
                  />
                  <MoneyCard
                    label="เลยกำหนดชำระ"
                    count={data.finance.overdue_count}
                    amount={data.finance.overdue_amount}
                    tone={data.finance.overdue_count > 0 ? "danger" : "neutral"}
                  />
                  <MoneyCard
                    label="รอตรวจสลิป"
                    count={data.finance.waitcheck_count}
                    amount={data.finance.waitcheck_amount}
                    tone="neutral"
                  />
                  <MoneyCard
                    label="ชำระแล้ว"
                    count={data.finance.paid_count}
                    amount={data.finance.paid_amount}
                    tone="success"
                  />
                </div>
              </Section>

              {/* ประวัติคอร์สอื่น */}
              <Section icon={<History className="h-4 w-4" />} title="คอร์สอื่นของผู้สมัคร">
                {data.other_enrollments.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    ยังไม่เคยสมัครคอร์สอื่นในระบบ
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                    {data.other_enrollments.map((item) => (
                      <li
                        key={`other-${item.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {item.course_name || "ไม่ระบุคอร์ส"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {item.sessions_count} ครั้ง · เหลือ{" "}
                            {item.remaining_sessions} ครั้ง ·{" "}
                            {new Date(item.enrollment_date).toLocaleDateString("th-TH")}
                          </p>
                        </div>
                        <StatusPill status={item.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          ) : null}
        </div>

        {/* ปุ่มอนุมัติ */}
        <footer className="border-t border-gray-200 bg-gray-50 px-6 py-4">
          {data && !isPending ? (
            <div className="text-center text-sm text-gray-500">
              คำขอนี้ดำเนินการไปแล้ว{" "}
              <StatusPill status={data.enrollment.status} />
              {data.enrollment.status === "awaiting_payment" && (
                <p className="mt-2 text-xs text-orange-600">
                  เป็นคอร์สแรกของผู้เรียน ระบบจะเปิดตารางเรียนให้อัตโนมัติ
                  เมื่อยืนยันการชำระเงินที่หน้าตรวจสอบสลิป
                </p>
              )}
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isApproving}
                className="flex-1 rounded-xl border border-gray-300 bg-white py-3 font-bold text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={() => onApprove(enrollmentId)}
                disabled={isApproving || isLoading || !!error || seatsFull}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#CC0000] py-3 font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isApproving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
                {seatsFull ? "ที่นั่งเต็ม อนุมัติไม่ได้" : "อนุมัติและสร้างบิล"}
              </button>
            </div>
          )}
        </footer>
      </aside>
    </div>
  );
}

/** รวมเรื่องที่ควรสะดุดตาก่อนกดอนุมัติไว้บนสุด */
function Warnings({ data }: { data: EnrollmentReview }) {
  const items: { tone: "danger" | "warning"; text: string }[] = [];

  if (data.package.seats_left <= 0) {
    items.push({
      tone: "danger",
      text: `ที่นั่งเต็มแล้ว (อนุมัติแล้ว ${data.package.active_count} จาก ${data.package.max_seats} ที่) ต้องขยายจำนวนที่นั่งก่อนจึงจะอนุมัติได้`,
    });
  } else if (data.package.would_exceed_if_all_approved) {
    items.push({
      tone: "warning",
      text: `มีคำขอรออนุมัติ ${data.package.pending_count} ใบ แต่เหลือที่นั่งเพียง ${data.package.seats_left} ที่ — อนุมัติครบทุกใบไม่ได้`,
    });
  }

  if (data.finance.overdue_count > 0) {
    items.push({
      tone: "danger",
      text: `มีบิลเลยกำหนดชำระ ${data.finance.overdue_count} รายการ รวม ${data.finance.overdue_amount.toLocaleString("th-TH")} บาท`,
    });
  } else if (data.finance.unpaid_count > 0) {
    items.push({
      tone: "warning",
      text: `มีบิลที่ยังไม่ชำระ ${data.finance.unpaid_count} รายการ รวม ${data.finance.unpaid_amount.toLocaleString("th-TH")} บาท`,
    });
  }

  if (data.customer.status && data.customer.status !== "active") {
    items.push({
      tone: "warning",
      text: `สถานะลูกค้าเป็น "${data.customer.status}" ไม่ใช่ active`,
    });
  }

  if (data.package.course_status && data.package.course_status !== "active") {
    items.push({
      tone: "warning",
      text: `คอร์สนี้มีสถานะ "${data.package.course_status}" ไม่ได้เปิดสอนอยู่`,
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div
          key={`warn-${idx}`}
          className={`flex items-start gap-2.5 rounded-xl border p-3 text-sm ${
            item.tone === "danger"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="leading-relaxed">{item.text}</span>
        </div>
      ))}
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
        <span className="text-[#CC0000]">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-gray-400">
        {icon}
        {label}
      </dt>
      <dd className={`mt-0.5 text-sm ${value ? "text-gray-800" : "text-gray-300"}`}>
        {value || "ไม่ได้ระบุ"}
      </dd>
    </div>
  );
}

function MoneyCard({
  label,
  count,
  amount,
  tone,
}: {
  label: string;
  count: number;
  amount: number;
  tone: "neutral" | "warning" | "danger" | "success";
}) {
  const toneClass = {
    neutral: "border-gray-200 bg-white text-gray-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-900",
    success: "border-green-200 bg-green-50 text-green-900",
  }[tone];

  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <p className="text-xs opacity-70">{label}</p>
      <p className="mt-1 text-lg font-black leading-none">
        {amount.toLocaleString("th-TH")}
        <span className="ml-1 text-xs font-bold opacity-60">บาท</span>
      </p>
      <p className="mt-1 text-xs opacity-60">{count} รายการ</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "รออนุมัติ", className: "bg-yellow-100 text-yellow-800" },
    awaiting_payment: {
      label: "รอชำระเงิน",
      className: "bg-orange-100 text-orange-800",
    },
    active: { label: "กำลังเรียน", className: "bg-green-100 text-green-800" },
    completed: { label: "จบแล้ว", className: "bg-blue-100 text-blue-800" },
    cancelled: { label: "ยกเลิก", className: "bg-gray-100 text-gray-600" },
  };
  const item = map[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };

  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${item.className}`}
    >
      {item.label}
    </span>
  );
}

function consentLabel(status: string): string {
  switch (status) {
    case "granted":
      return "ยินยอมแล้ว";
    case "declined":
      return "ไม่ยินยอม";
    case "withdrawn":
      return "ถอนความยินยอม";
    default:
      return "ยังไม่ได้ตอบ";
  }
}
