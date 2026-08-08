"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { getAllUsersAPI, getActiveStudentsAPI } from "@/services/userAPI";
import { fetchAllCourses } from "@/services/courseAPI";
import { fetchBillings, fetchExpenses, fetchCoaches } from "@/services/paymentAPI";
import { fetchAllEnrollments } from "@/services/enrollmentAPI";
import { buildDashboard } from "./components/buildDashboard";
import type { DashboardData } from "./components/types";
import DashboardSkeleton from "./components/DashboardSkeleton";
import {
  KpiCards,
  RevenueChart,
  TopCourses,
  RealtimeInsights,
  RecentActivity,
  ImportantAlerts,
} from "./components/DashboardSections";

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";

    // แต่ละแหล่งข้อมูลแยกอิสระ — endpoint ใดล้มเหลว ส่วนที่เหลือยังแสดงผลได้
    const results = await Promise.allSettled([
      getAllUsersAPI(),
      getActiveStudentsAPI(),
      fetchAllCourses(),
      fetchBillings(token),
      fetchExpenses(token),
      fetchAllEnrollments(token),
      fetchCoaches(token),
    ]);

    if (results.every((r) => r.status === "rejected")) {
      setError("ไม่สามารถโหลดข้อมูลแดชบอร์ดได้ กรุณาลองใหม่อีกครั้ง");
      setData(null);
      setIsLoading(false);
      return;
    }

    const val = <T,>(r: PromiseSettledResult<T[]>): T[] =>
      r.status === "fulfilled" ? r.value : [];
    const [usersR, studentsR, coursesR, billingsR, expensesR, enrollmentsR, coachesR] =
      results;

    setData(
      buildDashboard({
        users: val(usersR),
        students: val(studentsR),
        courses: val(coursesR),
        billings: val(billingsR),
        expenses: val(expensesR),
        enrollments: val(enrollmentsR),
        coaches: val(coachesR),
      })
    );
    setIsLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* ===== Header ===== */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">ภาพรวมระบบ</h1>
          <p className="mt-1 text-sm text-gray-500">
            สรุปข้อมูลสำคัญ รายได้ นักเรียน และการแจ้งเตือนแบบเรียลไทม์
          </p>
        </div>
        <button
          onClick={load}
          disabled={isLoading}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
          title="รีเฟรชข้อมูล"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {isLoading && !data ? (
        <DashboardSkeleton />
      ) : data ? (
        <>
          <KpiCards kpis={data.kpis} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <RevenueChart chart={data.chart} />
            <TopCourses courses={data.courses} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <RealtimeInsights insights={data.insights} />
            <RecentActivity activities={data.activities} />
            <ImportantAlerts alerts={data.alerts} />
          </div>
        </>
      ) : null}
    </div>
  );
}
