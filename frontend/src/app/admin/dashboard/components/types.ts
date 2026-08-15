import type { LucideIcon } from "lucide-react";

export interface Kpi {
  label: string;
  value: string;
  accent: string;
  icon: LucideIcon;
  trend: { up: boolean; text: string; note: string };
}

export interface ChartPoint {
  label: string;
  revenue: number;
  expense: number;
}

export interface CourseRow {
  name: string;
  students: number;
  revenue: string;
  tint: string;
}

export interface ActivityRow {
  dot: string;
  icon: LucideIcon;
  text: React.ReactNode;
  time: string;
}

export interface AlertRow {
  tone: "danger" | "warning" | "info" | "success";
  icon: LucideIcon;
  title: string;
  body: string;
  action: string;
  href: string;
}

export interface Insights {
  newThisMonth: number;
  newDelta: number;
  sessionUsage: number;
  coachCount: number;
  topCoachName: string;
  topCoachStudents: number; // จำนวนนักเรียนที่โค้ชดีเด่นดูแล (0 = ไม่มีข้อมูลผลงาน)
  topCoachSessions: number; // จำนวนคาบที่สอนไปแล้วของโค้ชดีเด่น
}

export interface DashboardData {
  kpis: Kpi[];
  chart: ChartPoint[];
  courses: CourseRow[];
  activities: ActivityRow[];
  alerts: AlertRow[];
  insights: Insights;
}
