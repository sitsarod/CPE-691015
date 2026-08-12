"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
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
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ป้องกันการดึงข้อมูลซ้อน + กันยิงถี่เกินไปตอน refetch-on-focus
  const isFetchingRef = useRef(false);
  const lastFetchRef = useRef(0);

  // background = true คือ refetch เงียบ ๆ (ไม่โชว์ skeleton) จะโชว์แถบสถานะลอยแทน
  const loadData = async (background = false) => {
    if (isFetchingRef.current) return; // มีการดึงข้อมูลค้างอยู่แล้ว ข้ามไป
    isFetchingRef.current = true;
    if (background) setIsRefetching(true);
    else setIsLoading(true);
    setError(null);

    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";

    try {
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
    } finally {
      setIsLoading(false);
      setIsRefetching(false);
      isFetchingRef.current = false;
      lastFetchRef.current = Date.now();
    }
  };

  // โหลดข้อมูลครั้งแรก
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch อัตโนมัติเมื่อผู้ใช้กลับมาโฟกัสหน้าต่าง/แท็บอีกครั้ง (แทนปุ่มรีเฟรช)
  // ดึงเงียบ ๆ ไม่โชว์ skeleton และ throttle 10 วินาทีเพื่อลดภาระ server
  useEffect(() => {
    const REFETCH_THROTTLE_MS = 10_000;
    const maybeRefetch = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchRef.current < REFETCH_THROTTLE_MS) return;
      loadData(true);
    };
    window.addEventListener("focus", maybeRefetch);
    document.addEventListener("visibilitychange", maybeRefetch);
    return () => {
      window.removeEventListener("focus", maybeRefetch);
      document.removeEventListener("visibilitychange", maybeRefetch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* แถบสถานะตอน refetch เบื้องหลัง — ลอยใต้ topbar ไม่บังเนื้อหา */}
      {isRefetching && (
        <div className="fixed left-1/2 top-[104px] z-30 -translate-x-1/2 animate-fadeIn">
          <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-4 py-1.5 text-xs font-bold text-gray-600 shadow-md backdrop-blur">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#CC0000]" />
            กำลังอัปเดตข้อมูล...
          </div>
        </div>
      )}

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
          {/* จอเล็ก (มือถือ): ซ่อน KPI / กราฟรายได้ / คอร์สขายดี / ข้อมูลเชิงลึก
              แสดงแค่การแจ้งเตือนที่สำคัญ และกิจกรรมล่าสุด */}
          <div className="hidden md:block">
            <KpiCards kpis={data.kpis} />
          </div>

          <div className="hidden gap-6 md:grid md:grid-cols-1 lg:grid-cols-3">
            <RevenueChart chart={data.chart} />
            <TopCourses courses={data.courses} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="hidden md:block">
              <RealtimeInsights insights={data.insights} />
            </div>
            {/* มือถือ: ดันการแจ้งเตือนขึ้นก่อนกิจกรรม (จอใหญ่คงลำดับเดิม) */}
            <div className="order-first md:order-none lg:order-last">
              <ImportantAlerts alerts={data.alerts} />
            </div>
            <RecentActivity activities={data.activities} />
          </div>
        </>
      ) : null}
    </div>
  );
}
