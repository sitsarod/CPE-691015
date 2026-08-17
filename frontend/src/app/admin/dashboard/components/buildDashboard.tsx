import {
  TrendingUp,
  TrendingDown,
  BadgeCheck,
  Users,
  BookOpen,
  UserPlus,
  CreditCard,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import type { UserProfileResponseDTO, StudentListResponseDTO } from "@/services/userAPI";
import type { BillingDTO, Expense, Coach } from "@/app/admin/payment/components/types";
import type { AdminEnrollment } from "@/types/enrollment";
import type { CourseDTO } from "@/types/course";
import type { ActivityRow, AlertRow, CourseRow, DashboardData, Insights, Kpi } from "./types";

/* ----------------------------- format helpers ----------------------------- */

export const fmtBaht = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`;
export const fmtPct = (n: number, digits = 1) =>
  `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;

const THAI_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

const monthKey = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${d.getMonth()}`;
};

const timeAgo = (iso?: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "เมื่อสักครู่";
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชั่วโมงที่แล้ว`;
  if (s < 604800) return `${Math.floor(s / 86400)} วันที่แล้ว`;
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
};

const pctChange = (cur: number, prev: number) => {
  if (prev <= 0) return cur > 0 ? 100 : 0;
  return ((cur - prev) / prev) * 100;
};

// สีพื้นหลังของกล่องเลขอันดับหลักสูตรขายดี (วนซ้ำตามอันดับ 1-4)
const COURSE_TINTS: string[] = [
  "bg-blue-100 text-blue-600",
  "bg-emerald-100 text-emerald-600",
  "bg-amber-100 text-amber-600",
  "bg-violet-100 text-violet-600",
];

export interface RawDashboard {
  users: UserProfileResponseDTO[];
  students: StudentListResponseDTO[];
  courses: CourseDTO[];
  billings: BillingDTO[];
  expenses: Expense[];
  enrollments: AdminEnrollment[];
  coaches: Coach[];
}

/* ----------------------- ประมวลผลข้อมูลดิบ → สำหรับแสดงผล ----------------------- */

export function buildDashboard(raw: RawDashboard): DashboardData {
  const { users, students, courses, billings, expenses, enrollments, coaches } = raw;

  // ---- ตัวเลขรวม ----
  // รายได้/รายจ่าย/กำไร ใช้ยอด "เดือนนี้" (คำนวณจาก bucket เดือนปัจจุบันด้านล่าง)
  const paidBillings = billings.filter((b) => b.billingstatus === "paid");

  // "นักเรียน" = customer ที่มีคอร์สกำลังเรียนอยู่ (enrollment active + เหลือคาบ)
  // ดึงจาก /admin/students โดยตรง ไม่ใช่นับทุกบัญชี customer
  const activeStudents = students.length;
  const customerAccounts = users.filter(
    (u) => u.role?.toLowerCase() === "customer"
  ).length;
  const activeCourses = courses.filter(
    (c) => c.status?.toLowerCase() === "active"
  ).length;

  // ---- กราฟ 6 เดือนล่าสุด ----
  const now = new Date();
  const buckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: THAI_MONTHS[d.getMonth()],
      revenue: 0,
      expense: 0,
    };
  });
  const bucketByKey = new Map(buckets.map((b) => [b.key, b]));
  paidBillings.forEach((b) => {
    // จัดรายได้เข้าเดือนตามวันที่ชำระจริง (paid_at) ให้ตรงกับหน้าสรุปการเงิน
    // fallback เป็นวันที่ออกบิลถ้า backend ยังไม่ส่ง paid_at มา
    const bk = bucketByKey.get(monthKey(b.paid_at || b.created_at));
    if (bk) bk.revenue += b.billingamount || 0;
  });
  expenses.forEach((e) => {
    const bk = bucketByKey.get(monthKey(e.expensedate));
    if (bk) bk.expense += e.expenseamount || 0;
  });

  const last = buckets[buckets.length - 1];
  const prev = buckets[buckets.length - 2] ?? { revenue: 0, expense: 0 };
  const revChange = pctChange(last.revenue, prev.revenue);
  const expChange = pctChange(last.expense, prev.expense);

  // ยอดของ "เดือนนี้" (bucket สุดท้าย = เดือนปัจจุบัน)
  const monthRevenue = last.revenue;
  const monthExpense = last.expense;
  const monthNetProfit = monthRevenue - monthExpense;
  const monthMargin = monthRevenue > 0 ? (monthNetProfit / monthRevenue) * 100 : 0;

  // ---- KPI ----
  const kpis: Kpi[] = [
    {
      label: "รายได้เดือนนี้",
      value: fmtBaht(monthRevenue),
      accent: "#2563EB",
      icon: revChange >= 0 ? TrendingUp : TrendingDown,
      trend: { up: revChange >= 0, text: fmtPct(revChange), note: "เทียบกับเดือนที่แล้ว" },
    },
    {
      label: "ค่าใช้จ่ายเดือนนี้",
      value: fmtBaht(monthExpense),
      accent: "#E63946",
      icon: expChange > 0 ? TrendingUp : TrendingDown,
      trend: { up: expChange <= 0, text: fmtPct(expChange), note: "เทียบกับเดือนที่แล้ว" }, // ค่าใช้จ่ายลด = ดี
    },
    {
      label: "กำไรสุทธิเดือนนี้",
      value: fmtBaht(monthNetProfit),
      accent: monthNetProfit >= 0 ? "#0D9488" : "#E63946",
      icon: BadgeCheck,
      trend: {
        up: monthNetProfit >= 0,
        text: monthNetProfit >= 0 ? "ดี" : "ขาดทุน",
        note: `มาร์จิ้น ${monthMargin.toFixed(0)}%`,
      },
    },
    {
      label: "นักเรียนที่ใช้งานอยู่",
      value: activeStudents.toLocaleString("th-TH"),
      accent: "#4F46E5",
      icon: Users,
      trend: { up: true, text: `${customerAccounts}`, note: "บัญชีลูกค้า" },
    },
    {
      label: "หลักสูตรทั้งหมด",
      value: courses.length.toLocaleString("th-TH"),
      accent: "#0EA5E9",
      icon: BookOpen,
      trend: { up: true, text: `${activeCourses}`, note: "เปิดสอนอยู่" },
    },
  ];

  // ---- หลักสูตรขายดี (นับเฉพาะยอดที่ชำระจริง) ----
  // จับคู่ enrollment → billing ที่ชำระแล้ว แล้วรวมยอดจากจำนวนเงินที่ชำระจริง
  // (billingamount) ไม่ใช่ราคาแพ็กเกจ — enrollment ที่ยังไม่ชำระจะไม่ถูกนับ
  const paidAmountByBillingId = new Map<number, number>(
    paidBillings.map((b) => [b.id, b.billingamount || 0])
  );
  // students นับเฉพาะลูกค้าที่ไม่ซ้ำ — ใช้ email เป็นคีย์ (ลูกค้าคนเดิมที่ลงหลายครั้ง
  // ในหลักสูตรเดียวกัน นับเป็น 1)
  const courseAgg = new Map<string, { students: Set<string>; revenue: number }>();
  enrollments.forEach((e) => {
    const name = e.package?.course?.course_name;
    if (!name || e.billing_id == null) return;
    const paidAmount = paidAmountByBillingId.get(e.billing_id);
    if (paidAmount === undefined) return; // ยังไม่ชำระ (paid) — ข้าม
    const cur = courseAgg.get(name) ?? { students: new Set<string>(), revenue: 0 };
    const customerKey = e.customer?.email?.trim() || `enrollment:${e.id}`;
    cur.students.add(customerKey);
    cur.revenue += paidAmount;
    courseAgg.set(name, cur);
  });
  const courseRows: CourseRow[] = [...courseAgg.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 4)
    .map(([name, v], i) => ({
      name,
      students: v.students.size,
      revenue: `+${fmtBaht(v.revenue)}`,
      tint: COURSE_TINTS[i % COURSE_TINTS.length],
    }));

  // ---- กิจกรรมล่าสุด ----
  type Ev = { at: number; node: React.ReactNode; dot: string; icon: LucideIcon };
  const events: Ev[] = [
    ...enrollments.map((e) => {
      const cust = e.customer
        ? `${e.customer.first_name} ${e.customer.last_name}`.trim()
        : "นักเรียน";
      const course = e.package?.course?.course_name ?? "หลักสูตร";
      return {
        at: new Date(e.enrollment_date).getTime() || 0,
        dot: "bg-emerald-500",
        icon: UserPlus,
        node: (
          <>
            <b className="font-semibold text-gray-900">{cust}</b> ลงทะเบียนเรียน {course}
          </>
        ),
      };
    }),
    ...paidBillings.map((b) => {
      const cust = b.customer
        ? `${b.customer.firstName} ${b.customer.lastName}`.trim()
        : "ลูกค้า";
      return {
        at: new Date(b.created_at).getTime() || 0,
        dot: "bg-blue-500",
        icon: CreditCard,
        node: (
          <>
            ได้รับชำระเงินจำนวน{" "}
            <b className="font-semibold text-gray-900">{fmtBaht(b.billingamount || 0)}</b> จาก{" "}
            {cust}
          </>
        ),
      };
    }),
  ];
  const activities: ActivityRow[] = events
    .sort((a, b) => b.at - a.at)
    .slice(0, 5)
    .map((e) => ({
      dot: e.dot,
      icon: e.icon,
      text: e.node,
      time: timeAgo(new Date(e.at).toISOString()),
    }));

  // ---- การแจ้งเตือน ----
  // "ค้างชำระ" = บิลที่ยังไม่ชำระ = ไม่ใช่ paid และไม่ใช่ waitcheck (คือ unfunded + overdue)
  // เกินกำหนดจริงดูจาก due_date ไม่ใช่คอลัมน์ status เพราะระบบไม่มี job เลื่อน
  // unfunded → overdue เมื่อเลยกำหนด (อ้างอิง backend enrollment_review.go)
  const unpaidBillings = billings.filter(
    (b) => b.billingstatus !== "paid" && b.billingstatus !== "waitcheck"
  );
  const isOverdue = (b: BillingDTO) => {
    const due = new Date(b.billingdue_date);
    return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
  };
  const overdue = unpaidBillings.filter(isOverdue);
  const pending = unpaidBillings.filter((b) => !isOverdue(b));
  const sumAmt = (arr: BillingDTO[]) => arr.reduce((s, b) => s + (b.billingamount || 0), 0);
  const waitcheck = billings.filter((b) => b.billingstatus === "waitcheck");

  // คลาสที่นั่งใกล้เต็ม — แพ็กเกจที่ลงทะเบียนไปแล้ว >= 90% ของ max_seats
  const NEAR_FULL = 0.9;
  const nearFullCourses = courses.filter((c) =>
    (c.packages || []).some(
      (p) =>
        (p.max_seats ?? 0) > 0 &&
        (p.current_enrollments ?? 0) / (p.max_seats ?? 1) >= NEAR_FULL
    )
  );

  const alerts: AlertRow[] = [];
  if (overdue.length > 0) {
    alerts.push({
      tone: "danger",
      icon: AlertTriangle,
      title: "การชำระเงินเกินกำหนด",
      body: `มีบิลค้างชำระเกินกำหนด ${overdue.length} รายการ รวม ${fmtBaht(sumAmt(overdue))}`,
      action: "จัดการการชำระเงิน",
      href: "/admin/payment?tab=slips&filter=unpaid",
    });
  }
  if (pending.length > 0) {
    alerts.push({
      tone: "warning",
      icon: CreditCard,
      title: "บิลค้างชำระ (รอชำระเงิน)",
      body: `มีบิลค้างชำระจากการสมัครคอร์ส ${pending.length} รายการ รวม ${fmtBaht(sumAmt(pending))}`,
      action: "จัดการการชำระเงิน",
      href: "/admin/payment?tab=slips&filter=unpaid",
    });
  }
  if (waitcheck.length > 0) {
    alerts.push({
      tone: "info",
      icon: CreditCard,
      title: "สลิปรอตรวจสอบ",
      body: `มีสลิปการโอนเงินรอการยืนยัน ${waitcheck.length} รายการ`,
      action: "ตรวจสอบสลิป",
      href: "/admin/payment?tab=slips&filter=pending",
    });
  }
  if (nearFullCourses.length > 0) {
    alerts.push({
      tone: "success",
      icon: TrendingUp,
      title: "ที่นั่งใกล้เต็ม",
      body: `มีหลักสูตรที่นั่งเต็มตั้งแต่ 90% ขึ้นไป ${nearFullCourses.length} หลักสูตร ควรพิจารณาเปิดคลาสเพิ่ม`,
      action: "จัดการหลักสูตร",
      href: "/admin/courses",
    });
  }
  if (alerts.length === 0) {
    alerts.push({
      tone: "success",
      icon: BadgeCheck,
      title: "ระบบปกติ",
      body: "ไม่มีบิลค้างชำระ สลิปรอตรวจสอบ หรือคลาสที่นั่งใกล้เต็มในขณะนี้",
      action: "ดูรายงานการเงิน",
      href: "/admin/payment",
    });
  }

  // ---- ข้อมูลเชิงลึก ----
  const curKey = `${now.getFullYear()}-${now.getMonth()}`;
  const prevKey = `${now.getFullYear()}-${now.getMonth() - 1}`;
  // "นักเรียนใหม่" = ลูกค้าที่ชำระเงินค่าคอร์สแล้วเท่านั้น (ต้องจ่ายก่อนถึงเป็นนักเรียน)
  // นับไม่ซ้ำต่อคนต่อเดือน — ใช้ email เป็นคีย์แบบเดียวกับ courseAgg ด้านบน
  const paidBillingIds = new Set(paidBillings.map((b) => b.id));
  const countNewStudents = (key: string) => {
    const set = new Set<string>();
    enrollments.forEach((e) => {
      if (monthKey(e.enrollment_date) !== key) return;
      if (e.billing_id == null || !paidBillingIds.has(e.billing_id)) return; // ยังไม่ชำระ → ไม่นับ
      set.add(e.customer?.email?.trim() || `enrollment:${e.id}`);
    });
    return set.size;
  };
  const newThisMonth = countNewStudents(curKey);
  const newLastMonth = countNewStudents(prevKey);
  const totalSessions = enrollments.reduce((s, e) => s + (e.total_sessions || 0), 0);
  const remainingSessions = enrollments.reduce(
    (s, e) => s + (e.remaining_sessions || 0),
    0
  );
  const sessionUsage =
    totalSessions > 0 ? ((totalSessions - remainingSessions) / totalSessions) * 100 : 0;
  // ---- โค้ชดีเด่น: จัดอันดับจากผลงานจริง ----
  // โยงโค้ชกับคอร์สผ่านเจ้าของคอร์ส (course.user email) แล้วนับนักเรียน/คาบที่สอนไปแล้ว
  // ต่อโค้ช จาก enrollment ที่กำลังเรียน/เรียนจบ (active/completed)
  const coachByEmail = new Map<string, Coach>();
  coaches.forEach((c) => {
    const email = c.email?.toLowerCase().trim();
    if (email) coachByEmail.set(email, c);
  });
  const coachEmailByCourseId = new Map<number, string>();
  courses.forEach((c) => {
    const email = c.user?.email?.toLowerCase().trim();
    if (email && coachByEmail.has(email)) coachEmailByCourseId.set(c.id, email);
  });
  const statsByCoach = new Map<string, { students: Set<string>; sessions: number }>();
  enrollments.forEach((e) => {
    const st = e.status?.toLowerCase();
    if (st !== "active" && st !== "completed") return;
    const courseId = e.package?.course?.id;
    if (courseId == null) return;
    const email = coachEmailByCourseId.get(courseId);
    if (!email) return;
    let agg = statsByCoach.get(email);
    if (!agg) {
      agg = { students: new Set(), sessions: 0 };
      statsByCoach.set(email, agg);
    }
    agg.students.add(e.customer?.email?.trim() || `enr:${e.id}`);
    agg.sessions += Math.max(0, (e.total_sessions || 0) - (e.remaining_sessions || 0));
  });

  let topCoachEmail: string | null = null;
  let topCoachStudents = 0;
  let topCoachSessions = 0;
  statsByCoach.forEach((agg, email) => {
    const students = agg.students.size;
    if (students > topCoachStudents || (students === topCoachStudents && agg.sessions > topCoachSessions)) {
      topCoachStudents = students;
      topCoachSessions = agg.sessions;
      topCoachEmail = email;
    }
  });
  // ถ้าไม่มีข้อมูลผลงานเลย ให้ fallback เป็นโค้ชคนแรก (สถิติ = 0 การ์ดจะไม่ติดป้ายดีเด่น)
  const topCoach = topCoachEmail ? coachByEmail.get(topCoachEmail) : coaches[0];

  const insights: Insights = {
    newThisMonth,
    newDelta: pctChange(newThisMonth, newLastMonth),
    sessionUsage,
    coachCount: coaches.length,
    topCoachName: topCoach
      ? topCoach.nickname ||
        `${topCoach.firstName ?? ""} ${topCoach.lastName ?? ""}`.trim() ||
        "โค้ช"
      : "—",
    topCoachStudents,
    topCoachSessions,
  };

  return { kpis, chart: buckets, courses: courseRows, activities, alerts, insights };
}
