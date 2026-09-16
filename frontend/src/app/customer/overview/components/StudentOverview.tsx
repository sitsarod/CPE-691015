"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Wallet,
  CalendarDays,
  Clock,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  ScanFace,
  MessageCircleMore,
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
import CourseCover from "@/components/course/CourseCover";
import { describeExpiry, formatThaiDate } from "@/components/course/expiryUtils";
import {
  SectionHeader,
  Chip,
  ActionLink,
  StatCell,
  NotificationRow,
  SidePanel,
  ArrowUpRight,
  type NotifTone,
} from "./parts";

/* ------------------------------- helpers -------------------------------- */

const fmtBaht = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`;

// map ชื่อวันภาษาอังกฤษจาก backend → index (0 = อาทิตย์) + label ไทย + อักษรย่อ
const DAY_META: Record<string, { index: number; label: string; short: string }> = {
  Sunday: { index: 0, label: "อาทิตย์", short: "อา." },
  Monday: { index: 1, label: "จันทร์", short: "จ." },
  Tuesday: { index: 2, label: "อังคาร", short: "อ." },
  Wednesday: { index: 3, label: "พุธ", short: "พ." },
  Thursday: { index: 4, label: "พฤหัสบดี", short: "พฤ." },
  Friday: { index: 5, label: "ศุกร์", short: "ศ." },
  Saturday: { index: 6, label: "เสาร์", short: "ส." },
};

const parseHM = (t: string): [number, number] => {
  const [h, m] = (t || "").split(":").map(Number);
  return [h || 0, m || 0];
};

// หาวันเวลาที่คาบเรียนถัดไปจะเกิดขึ้นจริงนับจากตอนนี้
const nextOccurrence = (dayName: string, startTime: string, nowMs: number): Date | null => {
  const meta = DAY_META[dayName];
  if (!meta) return null;
  const now = new Date(nowMs);
  const [h, m] = parseHM(startTime);
  const result = new Date(now);
  const diff = (meta.index - now.getDay() + 7) % 7;
  result.setDate(now.getDate() + diff);
  result.setHours(h, m, 0, 0);
  if (result.getTime() < now.getTime()) result.setDate(result.getDate() + 7);
  return result;
};

const UNPAID = new Set(["unfunded", "overdue"]);

const fmtThaiShort = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
};

// จำนวนวันจากวันนี้ (ปัดเป็นวัน) — ค่าลบ = เกินกำหนดมาแล้ว
const daysFromNow = (iso: string, nowMs: number): number => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NaN;
  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - startOfToday.getTime()) / 86400_000);
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// สรุปตารางเรียนของแพ็กเกจให้เหลือบรรทัดเดียว เช่น "จ. / พ. 17:30–19:00"
const scheduleSummary = (schs: ScheduleInfo[] | undefined): string => {
  if (!schs || schs.length === 0) return "";
  const days = schs
    .map((s) => DAY_META[s.day_of_week]?.short ?? "")
    .filter(Boolean)
    .join(" / ");
  const t = schs[0];
  const time = t?.start_time ? `${t.start_time.slice(0, 5)}–${t.end_time?.slice(0, 5) ?? ""}` : "";
  return [days, time].filter(Boolean).join(" ");
};

const QUICK_ACTIONS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "คอร์สของฉัน", href: "/customer/enrollment", icon: BookOpen },
  { label: "การเงิน", href: "/customer/payment", icon: CreditCard },
  { label: "ตารางเรียน", href: "/customer/schedule", icon: CalendarDays },
  { label: "รีวิว", href: "/customer/feedback", icon: MessageCircleMore },
];

/* ------------------------------- skeleton ------------------------------- */

function OverviewSkeleton() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="h-16 w-64 rounded bg-gray-100" />
      <div className="h-24 rounded bg-gray-100" />
      <div className="grid grid-cols-2 gap-px bg-gray-200 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-gray-100" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.55fr_1fr]">
        <div className="h-64 bg-gray-100" />
        <div className="h-64 bg-gray-100" />
      </div>
    </div>
  );
}

/* --------------------------------- alerts ------------------------------- */

type AlertItem = {
  tone: "danger" | "info" | "success";
  icon: LucideIcon;
  title: string;
  body: string;
  action?: string;
  href?: string;
};

/* ------------------------------- component ------------------------------ */

export default function StudentOverview() {
  const router = useRouter();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [billings, setBillings] = useState<BillingDTO[]>([]);
  const [consent, setConsent] = useState<FaceConsentStatus | null>(null);
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [firstName, setFirstName] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // จับ "เวลาปัจจุบัน" ครั้งเดียว เพื่อคำนวณช่วงเวลาแบบ pure ระหว่าง render
  const [nowMs] = useState(() => Date.now());

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
      if (enrRes.status === "rejected" && billRes.status === "rejected") setFailed(true);
      setLoading(false);
    };
    load();
  }, []);

  const handleConsentDecision = async (action: FaceConsentDecision) => {
    setIsSavingConsent(true);
    try {
      const updated = await recordFaceConsent(action);
      setConsent(updated);
      setIsConsentOpen(false);
      if (action === "granted") {
        // ยินยอมแล้วพาไปหน้าลงทะเบียนใบหน้าต่อเลย
        router.push("/customer/settings/face");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถบันทึกการตัดสินใจได้");
    } finally {
      setIsSavingConsent(false);
    }
  };

  if (loading) return <OverviewSkeleton />;
  if (failed) return null;

  const now = new Date(nowMs);

  /* ----------------------------- คำนวณตัวเลข (คงเดิม) ----------------------------- */
  const activeEnrollments = enrollments.filter((e) => e.status === "active");

  const billingById = new Map(billings.map((b) => [b.id, b]));
  const confirmedEnrollments = activeEnrollments.filter((e) => {
    if (e.billing_id == null) return true;
    const bill = billingById.get(e.billing_id);
    if (!bill) return true;
    return bill.billingstatus === "paid";
  });

  const remainingSessions = confirmedEnrollments.reduce(
    (s, e) => s + (e.remaining_sessions || 0),
    0
  );

  const unpaidBillings = billings.filter((b) => UNPAID.has(b.billingstatus));
  const unpaidAmount = unpaidBillings.reduce((s, b) => s + (b.billingamount || 0), 0);

  const nearestDue = unpaidBillings
    .filter((b) => b.billingdue_date)
    .map((b) => ({ due: b.billingdue_date, days: daysFromNow(b.billingdue_date, nowMs) }))
    .filter((x) => !Number.isNaN(x.days))
    .sort((a, b) => a.days - b.days)[0];
  const dueNote = nearestDue
    ? nearestDue.days < 0
      ? `เกินกำหนดแล้ว ${Math.abs(nearestDue.days)} วัน`
      : nearestDue.days === 0
        ? "ครบกำหนดวันนี้"
        : `ครบกำหนดอีก ${nearestDue.days} วัน (${fmtThaiShort(nearestDue.due)})`
    : null;
  const overdueBillings = billings.filter((b) => b.billingstatus === "overdue");
  const waitcheckBillings = billings.filter((b) => b.billingstatus === "waitcheck");
  const paidBillings = billings.filter((b) => b.billingstatus === "paid");
  const paidAmount = paidBillings.reduce((s, b) => s + (b.billingamount || 0), 0);
  const waitcheckAmount = waitcheckBillings.reduce((s, b) => s + (b.billingamount || 0), 0);

  const awaitingPayment = enrollments.filter((e) => e.status === "awaiting_payment");
  const pendingEnrollments = enrollments.filter((e) => e.status === "pending");
  const pendingLike = [...awaitingPayment, ...pendingEnrollments];

  const hasAwaitingConfirm = activeEnrollments.length > 0;
  const hasUnpaidCourse = awaitingPayment.length > 0 || pendingEnrollments.length > 0;
  const emptyLearningMsg = hasAwaitingConfirm
    ? "คอร์สของคุณกำลังรอยืนยันการชำระเงิน"
    : hasUnpaidCourse
      ? "มีคอร์สที่รอชำระเงิน ชำระเงินเพื่อเริ่มเรียน"
      : "ยังไม่มีคอร์สที่กำลังเรียน";
  const emptyScheduleMsg = hasAwaitingConfirm
    ? "รอยืนยันการชำระเงินก่อนจึงจะมีตารางเรียน"
    : hasUnpaidCourse
      ? "ชำระเงินเพื่อดูตารางเรียน"
      : "ยังไม่มีตารางเรียน";

  // คอร์สที่เรียนอยู่/จบแล้ว แต่ยังไม่ได้รีวิว
  const reviewedCourseIds = new Set(
    myReviews.map((r) => r.course_id).filter((id): id is number => id != null)
  );
  const reviewableCourses = (() => {
    const seen = new Map<number, string>();
    enrollments
      .filter(
        (e) =>
          (e.status === "active" || e.status === "completed") &&
          (e.attended_sessions || 0) >= 1
      )
      .forEach((e) => {
        const c = e.package?.course;
        if (c && !seen.has(c.id) && !reviewedCourseIds.has(c.id)) seen.set(c.id, c.course_name);
      });
    return Array.from(seen.values());
  })();

  // คาบเรียนที่จะถึง
  type Upcoming = {
    when: Date;
    courseName: string;
    start: string;
    end: string;
    dayLabel: string;
  };
  const upcoming: Upcoming[] = [];
  confirmedEnrollments.forEach((e) => {
    const courseName = e.package?.course?.course_name || "คอร์สเรียน";
    (e.package?.schedules || []).forEach((sch: ScheduleInfo) => {
      const when = nextOccurrence(sch.day_of_week, sch.start_time, nowMs);
      if (!when) return;
      upcoming.push({
        when,
        courseName,
        start: sch.start_time,
        end: sch.end_time,
        dayLabel: DAY_META[sch.day_of_week]?.short || sch.day_of_week,
      });
    });
  });
  upcoming.sort((a, b) => a.when.getTime() - b.when.getTime());
  const upcomingTop = upcoming.slice(0, 5);
  const classesThisWeek = upcoming.filter(
    (u) => u.when.getTime() - nowMs <= 7 * 86400_000
  ).length;
  const nextClass = upcomingTop[0] ?? null;

  // คอร์สใกล้หมดอายุ (ใช้ describeExpiry)
  const expiring = confirmedEnrollments
    .map((e) => ({ e, exp: describeExpiry(e.days_left, e.status, e.carried_over_sessions) }))
    .filter((x) => x.exp.tone === "warning" || x.exp.tone === "expired" || x.exp.tone === "carried")
    .sort((a, b) => (a.e.days_left ?? 9999) - (b.e.days_left ?? 9999));

  // การแจ้งเตือน (คงตรรกะเดิม)
  const alerts: AlertItem[] = [];
  if (unpaidBillings.length > 0) {
    const hasOverdue = overdueBillings.length > 0;
    alerts.push({
      tone: "danger",
      icon: hasOverdue ? AlertTriangle : Wallet,
      title: hasOverdue ? "มีบิลเกินกำหนดชำระ" : "มีบิลค้างชำระ",
      body: hasOverdue
        ? `คุณมีบิลค้างชำระ ${unpaidBillings.length} รายการ รวม ${fmtBaht(unpaidAmount)} (เกินกำหนด ${overdueBillings.length} รายการ) กรุณาชำระโดยเร็ว`
        : `คุณมีบิลค้างชำระ ${unpaidBillings.length} รายการ รวม ${fmtBaht(unpaidAmount)}${dueNote ? ` · ${dueNote}` : ""}`,
      action: "ชำระเงิน",
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
  if (alerts.length === 0 && !consent?.needs_decision) {
    alerts.push({
      tone: "success",
      icon: CheckCircle2,
      title: "ทุกอย่างเรียบร้อย",
      body: "ไม่มีบิลค้างชำระหรือรายการที่ต้องดำเนินการในขณะนี้",
    });
  }

  const hasAnyData = enrollments.length > 0 || billings.length > 0;
  const needsConsent = consent?.needs_decision;

  const todayThai = now.toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const nextClassText = nextClass
    ? isSameDay(nextClass.when, now)
      ? `คลาสถัดไปวันนี้ ${nextClass.start} น.`
      : `คลาสถัดไป ${DAY_META_LABEL(nextClass.dayLabel)} ${nextClass.start} น.`
    : null;

  /* ------------------------------- 02: บล็อกความคืบหน้า ------------------------------- */
  const progressBlocks =
    confirmedEnrollments.length === 0 ? (
      <p className="py-8 text-center text-sm text-gray-400">{emptyLearningMsg}</p>
    ) : (
      <div className="flex flex-col divide-y divide-gray-100">
        {confirmedEnrollments.map((e) => {
          const total = e.total_sessions || 0;
          const remaining = e.remaining_sessions || 0;
          const done = Math.max(0, total - remaining);
          const pct = total > 0 ? (done / total) * 100 : 0;
          const exp = describeExpiry(e.days_left, e.status, e.carried_over_sessions);
          const near = exp.highlight;
          return (
            <div key={e.id} className="flex flex-col gap-3 py-5 first:pt-0">
              <div className="flex items-center gap-4">
                <CourseCover
                  src={e.package?.course?.image_url}
                  alt={e.package?.course?.course_name ?? "คอร์ส"}
                  width={104}
                  height={104}
                  className="h-[52px] w-[52px] shrink-0 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900 sm:text-[15px]">
                    {e.package?.course?.course_name || "คอร์สเรียน"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {scheduleSummary(e.package?.schedules) || "—"}
                  </p>
                </div>
                <Chip tone={near ? "amber" : "red"}>{near ? "ใกล้หมดอายุ" : "กำลังเรียน"}</Chip>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${near ? "bg-amber-500" : "bg-gradient-to-r from-[#CC0000] to-[#ff5a5a]"}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-gray-500">
                  เรียนแล้ว {done} จาก {total} คาบ · เหลือ {remaining} คาบ
                </span>
                <span className={near ? "font-medium text-amber-600" : "text-gray-400"}>
                  {e.expires_at ? `หมดอายุ ${formatThaiDate(e.expires_at)}` : exp.label}
                </span>
              </div>
            </div>
          );
        })}
        {pendingLike.map((e) => (
          <div
            key={`p-${e.id}`}
            className="mt-4 flex items-center gap-4 border border-dashed border-gray-300 p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-gray-700">
                {e.package?.course?.course_name || "คอร์สเรียน"}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                {e.status === "awaiting_payment" ? "รอชำระเงินเพื่อเริ่มเรียน" : "คำขอสมัครอยู่ระหว่างตรวจสอบ"}
              </p>
            </div>
            <Chip tone="gray">รอตรวจสอบ</Chip>
          </div>
        ))}
      </div>
    );

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* ---------- ทักทาย ---------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-[#CC0000]">ยินดีต้อนรับกลับ</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
            คุณ{firstName || "ผู้เรียน"}
          </h1>
          <p className="mt-2 text-[13px] font-light text-gray-500">
            {todayThai}
            {nextClassText ? ` · ${nextClassText}` : ""}
          </p>
        </div>
        <div className="flex flex-none gap-3">
          <ActionLink href="/customer/schedule" variant="outline">
            ดูตารางเรียน
          </ActionLink>
          <ActionLink href="/customer/enrollment" variant="solid">
            สมัครคอร์สเพิ่ม
          </ActionLink>
        </div>
      </div>

      {/* ---------- 01 การแจ้งเตือน ---------- */}
      <section>
        <SectionHeader title="การแจ้งเตือน" />
        <div className="flex flex-col divide-y divide-gray-100">
          {needsConsent && (
            <NotificationRow
              tone="warning"
              icon={ScanFace}
              title="ยืนยันความยินยอมการเก็บข้อมูลใบหน้า"
              body="กรุณาอ่านและตัดสินใจเรื่องการเก็บข้อมูลใบหน้าสำหรับระบบเช็คชื่อ (ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล)"
              actionText="อ่านและตัดสินใจ"
              actionVariant="amber"
              onAction={() => setIsConsentOpen(true)}
            />
          )}
          {alerts.map((al, i) => {
            const tone: NotifTone = al.tone === "danger" ? "danger" : al.tone;
            const isDanger = al.tone === "danger";
            return (
              <NotificationRow
                key={i}
                tone={tone}
                icon={al.icon}
                title={al.title}
                body={al.body}
                linkText={isDanger ? "ดูบิลทั้งหมด" : al.tone === "info" ? al.action : undefined}
                linkHref={al.href}
                actionText={isDanger ? "ชำระเงิน" : undefined}
                actionHref={isDanger ? al.href : undefined}
              />
            );
          })}
        </div>
      </section>

      {/* ---------- แถบสถิติ ---------- */}
      <div className="grid grid-cols-2 gap-px border border-gray-200 bg-gray-200 lg:grid-cols-4">
        <StatCell
          label="คอร์สที่กำลังเรียน"
          value={confirmedEnrollments.length.toLocaleString("th-TH")}
          note={`จากทั้งหมด ${enrollments.length} การลงทะเบียน`}
        />
        <StatCell
          label="คาบเรียนคงเหลือ"
          value={remainingSessions.toLocaleString("th-TH")}
          note="รวมทุกคอร์สที่กำลังเรียน"
        />
        <StatCell
          label="ยอดค้างชำระ"
          value={fmtBaht(unpaidAmount)}
          note={dueNote || `${unpaidBillings.length} บิลรอชำระ`}
          accentRed={unpaidAmount > 0}
        />
        <StatCell
          label="คลาสภายใน 7 วัน"
          value={classesThisWeek.toLocaleString("th-TH")}
          note={nextClass ? `คลาสถัดไป ${nextClass.start} น.` : "ตามตารางเรียนของคุณ"}
        />
      </div>

      {!hasAnyData ? (
        <div className="border border-dashed border-gray-200 bg-white p-10 text-center">
          <p className="text-gray-600">คุณยังไม่มีคอร์สเรียนในขณะนี้</p>
          <div className="mt-4 flex justify-center">
            <ActionLink href="/customer/enrollment" variant="solid">
              เลือกคอร์สเรียน <ArrowUpRight className="h-4 w-4" />
            </ActionLink>
          </div>
        </div>
      ) : (
        <>
          {/* ---------- 02 ความคืบหน้า | 03 คาบเรียนที่จะถึง ---------- */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.55fr_1fr]">
            {/* 02 (มือถือ: อยู่หลัง 03) */}
            <section className="order-2 lg:order-1">
              <SectionHeader
                title="ความคืบหน้าการเรียน"
                right={
                  <Link href="/customer/enrollment" className="text-[13px] font-light text-gray-500 hover:text-[#CC0000]">
                    คอร์สของฉัน
                  </Link>
                }
              />
              {progressBlocks}
            </section>

            {/* 03 */}
            <section className="order-1 lg:order-2">
              <SectionHeader
                title="คาบเรียนที่จะถึง"
                right={
                  <Link href="/customer/schedule" className="text-[13px] font-light text-gray-500 hover:text-[#CC0000]">
                    ตารางเรียน
                  </Link>
                }
              />
              {upcomingTop.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">{emptyScheduleMsg}</p>
              ) : (
                <div className="flex flex-col divide-y divide-gray-100">
                  {upcomingTop.map((u, i) => {
                    const today = isSameDay(u.when, now);
                    return (
                      <div key={i} className="flex items-center gap-4 py-4 first:pt-0">
                        <div
                          className={`flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center leading-none ${
                            today
                              ? "bg-[#CC0000] text-white"
                              : "border border-gray-200 text-[#CC0000]"
                          }`}
                        >
                          <span className="text-[10px] font-light">{u.dayLabel}</span>
                          <span className="mt-0.5 text-lg font-semibold">{u.when.getDate()}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">{u.courseName}</p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {u.start} – {u.end} น.
                          </p>
                        </div>
                        {today && <Chip tone="red">วันนี้</Chip>}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* ---------- 04 สรุปการเงิน | คอลัมน์ขวา ---------- */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.55fr_1fr]">
            {/* 04 */}
            <section>
              <SectionHeader
                title="สรุปการเงิน"
                right={
                  <Link href="/customer/payment" className="text-[13px] font-light text-gray-500 hover:text-[#CC0000]">
                    ประวัติทั้งหมด
                  </Link>
                }
              />
              <div className="mb-6 grid grid-cols-3 gap-px border border-gray-200 bg-gray-200">
                <div className="flex min-w-0 flex-col gap-1.5 bg-white px-2.5 py-4 sm:px-4">
                  <span className="text-[11px] font-light uppercase tracking-wide text-[#CC0000]">ค้างชำระ</span>
                  <span className="truncate text-base font-semibold tabular-nums text-[#CC0000] sm:text-2xl">
                    {fmtBaht(unpaidAmount)}
                  </span>
                  <span className="text-[11px] font-light text-gray-400">{unpaidBillings.length} รายการ</span>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5 bg-white px-2.5 py-4 sm:px-4">
                  <span className="text-[11px] font-light uppercase tracking-wide text-gray-500">รอตรวจสอบ</span>
                  <span className="truncate text-base font-semibold tabular-nums text-gray-900 sm:text-2xl">
                    {fmtBaht(waitcheckAmount)}
                  </span>
                  <span className="text-[11px] font-light text-gray-400">{waitcheckBillings.length} รายการ</span>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5 bg-white px-2.5 py-4 sm:px-4">
                  <span className="text-[11px] font-light uppercase tracking-wide text-emerald-600">ชำระแล้ว</span>
                  <span className="truncate text-base font-semibold tabular-nums text-emerald-600 sm:text-2xl">
                    {fmtBaht(paidAmount)}
                  </span>
                  <span className="text-[11px] font-light text-gray-400">{paidBillings.length} รายการ</span>
                </div>
              </div>

              {[...unpaidBillings, ...waitcheckBillings].length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">ไม่มีรายการที่ต้องดำเนินการ</p>
              ) : (
                <div className="flex flex-col divide-y divide-gray-100">
                  {[...unpaidBillings, ...waitcheckBillings].map((b) => {
                    const isWait = b.billingstatus === "waitcheck";
                    return (
                      <div key={b.id} className="flex items-center gap-4 py-4">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {b.billingdescription || "รายการชำระเงิน"}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-400">
                            {b.transactionid ? `${b.transactionid} · ` : ""}
                            {b.billingdue_date ? `ครบกำหนด ${formatThaiDate(b.billingdue_date)}` : ""}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-sm font-semibold tabular-nums ${isWait ? "text-gray-500" : "text-gray-900"}`}
                        >
                          {fmtBaht(b.billingamount || 0)}
                        </span>
                        {isWait ? (
                          <Chip tone="gray">รอตรวจสอบ</Chip>
                        ) : (
                          <Link
                            href="/customer/payment"
                            className="flex h-9 shrink-0 items-center rounded-lg border border-gray-300 px-4 text-[13px] font-light text-gray-700 transition-colors hover:border-[#CC0000] hover:text-[#CC0000]"
                          >
                            แจ้งสลิป
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* คอลัมน์ขวา */}
            <div className="flex flex-col divide-y divide-gray-200 border-y border-gray-200">
              {expiring.length > 0 && (
                <SidePanel title="คอร์สใกล้หมดอายุ" titleTone="amber">
                  <p className="text-[13px] leading-relaxed text-gray-500">
                    {expiring[0].e.package?.course?.course_name || "คอร์สเรียน"} เหลือ{" "}
                    {expiring[0].e.remaining_sessions || 0} คาบ · {expiring[0].exp.label}
                  </p>
                  <ActionLink href="/customer/enrollment" variant="outline" className="mt-1 self-start !px-4 !py-2 !text-[13px] !border-amber-300 !text-amber-700">
                    ดูคอร์สของฉัน
                  </ActionLink>
                </SidePanel>
              )}

              {reviewableCourses.length > 0 && (
                <SidePanel title={`คุณมี ${reviewableCourses.length} คอร์สที่ยังไม่ได้รีวิว`}>
                  <p className="text-[13px] leading-relaxed text-gray-500">
                    ความเห็นของคุณช่วยให้ผู้เรียนคนอื่นตัดสินใจได้ง่ายขึ้น
                  </p>
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="truncate text-[13px] text-gray-600">{reviewableCourses[0]}</span>
                    <Link href="/customer/feedback" className="shrink-0 text-[13px] font-medium text-[#CC0000] hover:text-[#990000]">
                      เขียนรีวิว
                    </Link>
                  </div>
                </SidePanel>
              )}

              <SidePanel title="ทางลัด">
                <div className="grid grid-cols-2 gap-px bg-gray-200">
                  {QUICK_ACTIONS.map(({ label, href, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      className="flex flex-col gap-2.5 bg-white p-3 transition-colors hover:text-[#CC0000]"
                    >
                      <Icon className="h-5 w-5 text-[#CC0000]" />
                      <span className="text-[13px] font-light text-gray-600">{label}</span>
                    </Link>
                  ))}
                </div>
              </SidePanel>
            </div>
          </div>
        </>
      )}

      {/* ---------- Modal PDPA ---------- */}
      <FaceConsentModal
        open={isConsentOpen}
        isSubmitting={isSavingConsent}
        onDecision={handleConsentDecision}
        onDismiss={() => setIsConsentOpen(false)}
      />
    </div>
  );
}

// แปลงอักษรย่อวัน (จาก DAY_META.short) กลับเป็น label เต็มสำหรับบรรทัดทักทาย
function DAY_META_LABEL(short: string): string {
  const found = Object.values(DAY_META).find((d) => d.short === short);
  return found ? found.label : short;
}
