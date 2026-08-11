"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Layers,
  Wallet,
  CalendarClock,
  CalendarDays,
  GraduationCap,
  Clock,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  ArrowUpRight,
  ScanFace,
  MessageCircleMore,
  Star,
  type LucideIcon,
} from "lucide-react";
import { fetchCustomerEnrollments } from "@/services/enrollmentAPI";
import { fetchCustomerBillings } from "@/services/paymentAPI";
import { fetchMyFaceConsent, recordFaceConsent } from "@/services/consentAPI";
import { reviewAPI } from "@/services/reviewAPI";
import FaceConsentModal from "@/components/FaceConsentModal";
import type { Enrollment, ScheduleInfo } from "@/types/enrollment";
import type { BillingDTO } from "@/app/admin/payment/components/types";
import type { FaceConsentStatus, FaceConsentDecision } from "@/types/consent";
import type { Review } from "@/types/review";

/* ------------------------------- helpers -------------------------------- */

const fmtBaht = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`;

// map ชื่อวันภาษาอังกฤษจาก backend → index (0 = อาทิตย์) และ label ไทย
const DAY_META: Record<string, { index: number; label: string }> = {
  Sunday: { index: 0, label: "อาทิตย์" },
  Monday: { index: 1, label: "จันทร์" },
  Tuesday: { index: 2, label: "อังคาร" },
  Wednesday: { index: 3, label: "พุธ" },
  Thursday: { index: 4, label: "พฤหัสบดี" },
  Friday: { index: 5, label: "ศุกร์" },
  Saturday: { index: 6, label: "เสาร์" },
};

const parseHM = (t: string): [number, number] => {
  const [h, m] = (t || "").split(":").map(Number);
  return [h || 0, m || 0];
};

// หาวันเวลาที่คาบเรียนถัดไปจะเกิดขึ้นจริงนับจากตอนนี้
const nextOccurrence = (dayName: string, startTime: string): Date | null => {
  const meta = DAY_META[dayName];
  if (!meta) return null;
  const now = new Date();
  const [h, m] = parseHM(startTime);
  const result = new Date(now);
  const diff = (meta.index - now.getDay() + 7) % 7;
  result.setDate(now.getDate() + diff);
  result.setHours(h, m, 0, 0);
  // ถ้าเป็นวันนี้แต่เวลาผ่านไปแล้ว ให้เลื่อนไปสัปดาห์หน้า
  if (result.getTime() < now.getTime()) result.setDate(result.getDate() + 7);
  return result;
};

const UNPAID = new Set(["unfunded", "overdue"]);

const fmtThaiDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
};

// จำนวนวันจากวันนี้ (ปัดเป็นวัน) — ค่าลบ = เกินกำหนดมาแล้ว
const daysFromNow = (iso: string): number => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NaN;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - startOfToday.getTime()) / 86400_000);
};

const QUICK_ACTIONS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "คอร์สของฉัน", href: "/customer/enrollment", icon: BookOpen },
  { label: "ชำระเงิน", href: "/customer/payment", icon: CreditCard },
  { label: "ตารางเรียน", href: "/customer/schedule", icon: CalendarDays },
  { label: "ฟีดแบ็ก", href: "/customer/feedback", icon: MessageCircleMore },
];

/* ------------------------------- KPI card ------------------------------- */

function StatCard({
  label,
  value,
  note,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  note: string;
  accent: string;
  icon: LucideIcon;
}) {
  return (
    <div
      className="rounded-2xl border border-gray-200/80 border-l-4 bg-white p-5 shadow-sm transition hover:shadow-md"
      style={{ borderLeftColor: accent }}
    >
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <Icon className="h-4 w-4 shrink-0" style={{ color: accent }} />
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">{value}</p>
      <p className="mt-2 text-xs text-gray-400">{note}</p>
    </div>
  );
}

/* ------------------------------- skeleton ------------------------------- */

function OverviewSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-2xl border border-gray-100 bg-gray-100" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="h-64 rounded-2xl bg-gray-100 lg:col-span-2" />
        <div className="h-64 rounded-2xl bg-gray-100" />
      </div>
    </div>
  );
}

/* ------------------------------- component ------------------------------ */

export default function StudentOverview() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [billings, setBillings] = useState<BillingDTO[]>([]);
  const [consent, setConsent] = useState<FaceConsentStatus | null>(null);
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [firstName, setFirstName] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // PDPA modal
  const [isConsentOpen, setIsConsentOpen] = useState(false);
  const [isSavingConsent, setIsSavingConsent] = useState(false);

  useEffect(() => {
    setFirstName(localStorage.getItem("firstName") || "");

    const load = async () => {
      const token = localStorage.getItem("token");
      const customerId =
        localStorage.getItem("customer_id") || localStorage.getItem("user_id");
      if (!token || !customerId) {
        setLoading(false);
        setFailed(true);
        return;
      }

      // แต่ละแหล่งแยกอิสระ — เส้นใดล้มเหลว ที่เหลือยังแสดงผลได้
      const [enrRes, billRes, consentRes, reviewRes] = await Promise.allSettled([
        fetchCustomerEnrollments(customerId, token),
        fetchCustomerBillings(customerId, token),
        fetchMyFaceConsent(),
        reviewAPI.getMyReviews(),
      ]);

      if (enrRes.status === "fulfilled") setEnrollments(enrRes.value);
      if (billRes.status === "fulfilled") setBillings(billRes.value);
      if (consentRes.status === "fulfilled") setConsent(consentRes.value);
      if (reviewRes.status === "fulfilled") setMyReviews(reviewRes.value || []);
      if (enrRes.status === "rejected" && billRes.status === "rejected")
        setFailed(true);
      setLoading(false);
    };
    load();
  }, []);

  // บันทึกการตัดสินใจเรื่องความยินยอมใบหน้า แล้วอัปเดตสถานะในหน้า
  const handleConsentDecision = async (action: FaceConsentDecision) => {
    setIsSavingConsent(true);
    try {
      const updated = await recordFaceConsent(action);
      setConsent(updated);
      setIsConsentOpen(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถบันทึกการตัดสินใจได้");
    } finally {
      setIsSavingConsent(false);
    }
  };

  if (loading) return <OverviewSkeleton />;
  if (failed) return null; // ล้มเหลวทั้งคู่ — ซ่อนส่วนนี้ ไม่รบกวนหน้าข่าว

  /* ----------------------------- คำนวณตัวเลข ----------------------------- */
  const activeEnrollments = enrollments.filter((e) => e.status === "active");
  const remainingSessions = activeEnrollments.reduce(
    (s, e) => s + (e.remaining_sessions || 0),
    0
  );

  const unpaidBillings = billings.filter((b) => UNPAID.has(b.billingstatus));
  const unpaidAmount = unpaidBillings.reduce((s, b) => s + (b.billingamount || 0), 0);

  // บิลที่ครบกำหนดเร็วที่สุดในบรรดารายการที่ยังไม่จ่าย
  const nearestDue = unpaidBillings
    .filter((b) => b.billingdue_date)
    .map((b) => ({ due: b.billingdue_date, days: daysFromNow(b.billingdue_date) }))
    .filter((x) => !Number.isNaN(x.days))
    .sort((a, b) => a.days - b.days)[0];
  const dueNote = nearestDue
    ? nearestDue.days < 0
      ? `เกินกำหนดแล้ว ${Math.abs(nearestDue.days)} วัน`
      : nearestDue.days === 0
      ? "ครบกำหนดวันนี้"
      : `ครบกำหนดอีก ${nearestDue.days} วัน (${fmtThaiDate(nearestDue.due)})`
    : null;
  const overdueBillings = billings.filter((b) => b.billingstatus === "overdue");
  const waitcheckBillings = billings.filter((b) => b.billingstatus === "waitcheck");
  const paidBillings = billings.filter((b) => b.billingstatus === "paid");
  const paidAmount = paidBillings.reduce((s, b) => s + (b.billingamount || 0), 0);
  const waitcheckAmount = waitcheckBillings.reduce(
    (s, b) => s + (b.billingamount || 0),
    0
  );

  const awaitingPayment = enrollments.filter((e) => e.status === "awaiting_payment");
  const pendingEnrollments = enrollments.filter((e) => e.status === "pending");

  // ----- คอร์สที่เรียนอยู่/เรียนจบแล้ว แต่ยังไม่ได้รีวิว -----
  const reviewedCourseIds = new Set(
    myReviews.map((r) => r.course_id).filter((id): id is number => id != null)
  );
  const reviewableCourses = (() => {
    const seen = new Map<number, string>();
    enrollments
      // เชิญรีวิวเฉพาะคอร์สที่เข้าเรียนไปแล้วอย่างน้อย 1 ครั้ง
      .filter(
        (e) =>
          (e.status === "active" || e.status === "completed") &&
          (e.attended_sessions || 0) >= 1
      )
      .forEach((e) => {
        const c = e.package?.course;
        if (c && !seen.has(c.id) && !reviewedCourseIds.has(c.id)) {
          seen.set(c.id, c.course_name);
        }
      });
    return Array.from(seen.values());
  })();

  // ----- คาบเรียนที่จะถึง (จากตารางเรียนของคอร์สที่ active) -----
  type Upcoming = {
    when: Date;
    courseName: string;
    start: string;
    end: string;
    dayLabel: string;
  };
  const upcoming: Upcoming[] = [];
  activeEnrollments.forEach((e) => {
    const courseName = e.package?.course?.course_name || "คอร์สเรียน";
    (e.package?.schedules || []).forEach((sch: ScheduleInfo) => {
      const when = nextOccurrence(sch.day_of_week, sch.start_time);
      if (!when) return;
      upcoming.push({
        when,
        courseName,
        start: sch.start_time,
        end: sch.end_time,
        dayLabel: DAY_META[sch.day_of_week]?.label || sch.day_of_week,
      });
    });
  });
  upcoming.sort((a, b) => a.when.getTime() - b.when.getTime());
  const upcomingTop = upcoming.slice(0, 5);
  const classesThisWeek = upcoming.filter(
    (u) => u.when.getTime() - Date.now() <= 7 * 86400_000
  ).length;

  // ----- การแจ้งเตือน -----
  type Alert = {
    tone: "danger" | "info" | "success";
    icon: LucideIcon;
    title: string;
    body: string;
    action: string;
    href: string;
  };
  const alerts: Alert[] = [];
  if (overdueBillings.length > 0) {
    alerts.push({
      tone: "danger",
      icon: AlertTriangle,
      title: "มีบิลเกินกำหนดชำระ",
      body: `คุณมีบิลค้างชำระเกินกำหนด ${overdueBillings.length} รายการ กรุณาชำระโดยเร็ว`,
      action: "ไปหน้าชำระเงิน",
      href: "/customer/payment",
    });
  }
  if (awaitingPayment.length > 0) {
    alerts.push({
      tone: "info",
      icon: Wallet,
      title: "รอชำระเงินเพื่อเริ่มเรียน",
      body: `มีคอร์ส ${awaitingPayment.length} รายการที่รอชำระเงินก่อนจึงจะเริ่มเรียนและมีตารางเรียน`,
      action: "ชำระเงิน",
      href: "/customer/payment",
    });
  }
  if (waitcheckBillings.length > 0) {
    alerts.push({
      tone: "info",
      icon: Clock,
      title: "สลิปกำลังตรวจสอบ",
      body: `มีการแจ้งชำระเงิน ${waitcheckBillings.length} รายการที่แอดมินกำลังตรวจสอบ`,
      action: "ดูสถานะ",
      href: "/customer/payment",
    });
  }
  if (pendingEnrollments.length > 0) {
    alerts.push({
      tone: "info",
      icon: Clock,
      title: "คำขอสมัครกำลังดำเนินการ",
      body: `มีคำขอสมัครเรียน ${pendingEnrollments.length} รายการ อยู่ระหว่างการตรวจสอบ (3-7 วัน)`,
      action: "ดูคอร์สของฉัน",
      href: "/customer/enrollment",
    });
  }
  if (alerts.length === 0) {
    alerts.push({
      tone: "success",
      icon: CheckCircle2,
      title: "ทุกอย่างเรียบร้อย",
      body: "ไม่มีบิลค้างชำระหรือรายการที่ต้องดำเนินการในขณะนี้",
      action: "ดูตารางเรียน",
      href: "/customer/schedule",
    });
  }

  const hasAnyData = enrollments.length > 0 || billings.length > 0;

  const needsConsent = consent?.needs_decision;

  return (
    <div className="space-y-6">
      {/* ---------- ทักทาย + ปุ่มลัด ---------- */}
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200/80 bg-gradient-to-br from-white to-gray-50 p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">ยินดีต้อนรับกลับ</p>
          <h3 className="mt-0.5 text-xl font-bold text-gray-900">
            สวัสดี{firstName ? `, ${firstName}` : ""} 👋
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-[#CC0000]/40 hover:text-[#CC0000]"
            >
              <Icon className="h-4 w-4 text-[#CC0000]" />
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* ---------- แจ้งเตือนความยินยอมใบหน้า (PDPA) ---------- */}
      {needsConsent && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600">
              <ScanFace className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900">
                ยืนยันความยินยอมการเก็บข้อมูลใบหน้า
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-amber-700">
                กรุณาอ่านและตัดสินใจเรื่องการเก็บข้อมูลใบหน้าสำหรับระบบเช็คชื่อ (ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล)
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsConsentOpen(true)}
            className="shrink-0 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"
          >
            อ่านและยืนยัน
          </button>
        </div>
      )}

      {/* ---------- KPI cards ---------- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="คอร์สที่กำลังเรียน"
          value={activeEnrollments.length.toLocaleString("th-TH")}
          note={`ทั้งหมด ${enrollments.length} รายการลงทะเบียน`}
          accent="#2563EB"
          icon={BookOpen}
        />
        <StatCard
          label="คาบเรียนคงเหลือ"
          value={remainingSessions.toLocaleString("th-TH")}
          note="รวมทุกคอร์สที่กำลังเรียน"
          accent="#0D9488"
          icon={Layers}
        />
        <StatCard
          label="ยอดค้างชำระ"
          value={fmtBaht(unpaidAmount)}
          note={dueNote || `${unpaidBillings.length} บิลรอชำระ`}
          accent={unpaidAmount > 0 ? "#E63946" : "#0D9488"}
          icon={Wallet}
        />
        <StatCard
          label="คลาสภายใน 7 วัน"
          value={classesThisWeek.toLocaleString("th-TH")}
          note="ตามตารางเรียนของคุณ"
          accent="#7C3AED"
          icon={CalendarClock}
        />
      </div>

      {!hasAnyData ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
          <GraduationCap className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-600">คุณยังไม่มีคอร์สเรียนในขณะนี้</p>
          <Link
            href="/customer/enrollment"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#CC0000] px-6 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#CC0000]/30 transition hover:bg-[#990000]"
          >
            เลือกคอร์สเรียน
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <>
          {/* ---------- ความคืบหน้า + คาบเรียนที่จะถึง ---------- */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Course progress */}
            <div className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm lg:col-span-2">
              <h3 className="text-lg font-bold text-gray-900">ความคืบหน้าการเรียน</h3>
              {activeEnrollments.length === 0 ? (
                <p className="mt-8 text-center text-sm text-gray-400">
                  ยังไม่มีคอร์สที่กำลังเรียน
                </p>
              ) : (
                <ul className="mt-5 space-y-5">
                  {activeEnrollments.map((e) => {
                    const total = e.total_sessions || 0;
                    const remaining = e.remaining_sessions || 0;
                    const done = Math.max(0, total - remaining);
                    const pct = total > 0 ? (done / total) * 100 : 0;
                    return (
                      <li key={e.id}>
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate font-semibold text-gray-900">
                            {e.package?.course?.course_name || "คอร์สเรียน"}
                          </span>
                          <span className="shrink-0 tabular-nums text-gray-500">
                            {done}/{total} ครั้ง
                          </span>
                        </div>
                        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#CC0000] to-[#ff5a5a] transition-all"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-gray-400">
                          เหลืออีก {remaining} ครั้ง · {pct.toFixed(0)}% ของแพ็กเกจ
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Upcoming classes */}
            <div className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
              <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                <CalendarClock className="h-5 w-5 text-gray-400" />
                คาบเรียนที่จะถึง
              </h3>
              {upcomingTop.length === 0 ? (
                <p className="mt-8 text-center text-sm text-gray-400">
                  ยังไม่มีตารางเรียน
                </p>
              ) : (
                <ul className="mt-5 space-y-4">
                  {upcomingTop.map((u, i) => (
                    <li key={i} className="flex gap-3">
                      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-[#FFF0F0] text-[#CC0000]">
                        <span className="text-[10px] font-semibold leading-none">
                          {u.dayLabel.slice(0, 3)}
                        </span>
                        <span className="text-sm font-bold leading-tight">
                          {u.when.getDate()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {u.courseName}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="h-3 w-3" />
                          {u.start} - {u.end} น.
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* ---------- สถานะการเงิน + การแจ้งเตือน ---------- */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Finance summary */}
            <div className="space-y-4 lg:col-span-2">
              <h3 className="text-lg font-bold text-gray-900">สรุปการเงิน</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-red-100 bg-red-50/60 p-5">
                  <div className="flex items-center gap-2 text-red-600">
                    <Wallet className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-wide">
                      ค้างชำระ
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-black tabular-nums text-red-700">
                    {fmtBaht(unpaidAmount)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {unpaidBillings.length} รายการ
                  </p>
                  {dueNote && (
                    <p
                      className={`mt-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        nearestDue && nearestDue.days <= 0
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      <CalendarClock className="h-3 w-3" />
                      {dueNote}
                    </p>
                  )}
                </div>
                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
                  <div className="flex items-center gap-2 text-blue-600">
                    <Clock className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-wide">
                      รอตรวจสอบ
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-black tabular-nums text-blue-700">
                    {fmtBaht(waitcheckAmount)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {waitcheckBillings.length} รายการ
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
                  <div className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-wide">
                      ชำระแล้ว
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-black tabular-nums text-emerald-700">
                    {fmtBaht(paidAmount)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {paidBillings.length} รายการ
                  </p>
                </div>
              </div>
              <Link
                href="/customer/payment"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#CC0000] hover:text-[#990000]"
              >
                <CreditCard className="h-4 w-4" />
                ไปหน้าชำระเงินและประวัติการเงิน
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Alerts */}
            <div>
              <h3 className="mb-4 text-lg font-bold text-gray-900">การแจ้งเตือน</h3>
              <div className="space-y-3">
                {alerts.map((al, i) => {
                  const tone =
                    al.tone === "danger"
                      ? {
                          wrap: "border-red-200 bg-red-50/70",
                          bar: "bg-red-500",
                          icon: "text-red-500",
                          title: "text-red-800",
                          action: "text-red-600 hover:text-red-700",
                        }
                      : al.tone === "success"
                      ? {
                          wrap: "border-emerald-200 bg-emerald-50/70",
                          bar: "bg-emerald-500",
                          icon: "text-emerald-600",
                          title: "text-emerald-800",
                          action: "text-emerald-600 hover:text-emerald-700",
                        }
                      : {
                          wrap: "border-blue-200 bg-blue-50/70",
                          bar: "bg-blue-500",
                          icon: "text-blue-500",
                          title: "text-blue-800",
                          action: "text-blue-600 hover:text-blue-700",
                        };
                  return (
                    <div
                      key={i}
                      className={`relative overflow-hidden rounded-xl border p-4 pl-5 ${tone.wrap}`}
                    >
                      <span className={`absolute inset-y-0 left-0 w-1 ${tone.bar}`} />
                      <div className="flex items-start gap-2.5">
                        <al.icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.icon}`} />
                        <div className="min-w-0">
                          <p className={`text-sm font-bold ${tone.title}`}>
                            {al.title}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-gray-600">
                            {al.body}
                          </p>
                          <Link
                            href={al.href}
                            className={`mt-2 inline-block text-xs font-semibold ${tone.action}`}
                          >
                            {al.action}
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ---------- ชวนเขียนรีวิว ---------- */}
          {reviewableCourses.length > 0 && (
            <div className="flex flex-col gap-4 overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-500">
                  <Star className="h-6 w-6" fill="currentColor" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    แบ่งปันประสบการณ์ของคุณ
                  </h3>
                  <p className="mt-0.5 text-sm text-gray-600">
                    คุณมี {reviewableCourses.length} คอร์สที่ยังไม่ได้รีวิว
                    ความเห็นของคุณช่วยให้ผู้เรียนคนอื่นตัดสินใจได้ง่ายขึ้น
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {reviewableCourses.slice(0, 3).map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-amber-700 shadow-sm"
                      >
                        <BookOpen className="h-3 w-3" />
                        {name}
                      </span>
                    ))}
                    {reviewableCourses.length > 3 && (
                      <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-gray-500 shadow-sm">
                        +{reviewableCourses.length - 3} คอร์ส
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Link
                href="/customer/feedback"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#CC0000] px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-[#CC0000]/30 transition hover:bg-[#990000]"
              >
                เขียนรีวิว
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </>
      )}

      {/* ---------- Modal ขอความยินยอมเก็บข้อมูลใบหน้า (PDPA) ---------- */}
      <FaceConsentModal
        open={isConsentOpen}
        isSubmitting={isSavingConsent}
        onDecision={handleConsentDecision}
        onDismiss={() => setIsConsentOpen(false)}
      />
    </div>
  );
}
