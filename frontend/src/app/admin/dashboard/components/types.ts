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

// นักเรียนที่คาบเรียนใกล้หมด — จุดเตือนให้แอดมินตามต่อคอร์ส (โอกาสขายซ้ำ)
export interface LowSessionRow {
  name: string;
  course: string;
  remaining: number;
  daysLeft: number | null; // วันคงเหลือก่อนหมดอายุ (ถ้ามี); ติดลบ = เกินกำหนด
}

export interface Insights {
  newThisMonth: number;
  newDelta: number;
  coachCount: number;
  coachNames: string[]; // ชื่อโค้ชในทีม (สำหรับ roster บนแดชบอร์ด)
  lowSessions: LowSessionRow[]; // นักเรียนคาบใกล้หมด เรียงจากเหลือน้อยสุด
  lowSessionsTotal: number; // จำนวนทั้งหมดที่เข้าเกณฑ์ (อาจมากกว่าที่แสดง)
}

export interface DashboardData {
  kpis: Kpi[];
  chart: ChartPoint[];
  courses: CourseRow[];
  activities: ActivityRow[];
  alerts: AlertRow[];
  insights: Insights;
}
