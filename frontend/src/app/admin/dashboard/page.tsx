"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";
import { getAllUsersAPI, getActiveStudentsAPI } from "@/services/userAPI";
import { fetchAllCourses } from "@/services/courseAPI";
import { fetchBillings, fetchExpenses, fetchCoaches } from "@/services/paymentAPI";
import { fetchAllEnrollments } from "@/services/enrollmentAPI";
import { buildDashboard } from "./components/buildDashboard";
import type { DashboardData } from "./components/types";
import DashboardSkeleton from "./components/DashboardSkeleton";
import DashboardNotifications from "./components/DashboardNotifications";
import ClassHeadcountPanel from "./components/ClassHeadcountPanel";
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
  const [updatedAt, setUpdatedAt] = useState("");
  // วันที่วันนี้ (จับครั้งเดียว เพื่อไม่เรียก Date ตอน render)
  const [todayLabel] = useState(() =>
    new Date().toLocaleDateString("th-TH", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  );

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
      setUpdatedAt(
        new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
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
  }, []);

  // Refetch อัตโนมัติเมื่อผู้ใช้กลับมาโฟกัสหน้าต่าง/แท็บอีกครั้ง (แทนปุ่มรีเฟรช)
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
  }, []);

  return (
    <div className="mx-auto max-w-[1400px] space-y-10">
      {/* แถบสถานะตอน refetch เบื้องหลัง */}
      {isRefetching && (
        <div className="fixed left-1/2 top-[104px] z-30 -translate-x-1/2 animate-fadeIn">
          <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-4 py-1.5 text-xs font-medium text-gray-600 shadow-md backdrop-blur">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#CC0000]" />
            กำลังอัปเดตข้อมูล...
          </div>
        </div>
      )}

      {/* ---------- header ---------- */}
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="text-[11.5px] font-medium uppercase tracking-[0.2em] text-[#CC0000]">
            Admin Overview
          </span>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-gray-900">แดชบอร์ด</h1>
          <p className="mt-1.5 text-[13px] font-light text-gray-500">
            {todayLabel} · ข้อมูลอัปเดตอัตโนมัติเมื่อกลับมาที่หน้านี้
          </p>
        </div>
        <div className="flex items-center gap-3">
          {updatedAt && (
            <span className="flex items-center gap-2 border border-gray-200 px-3.5 py-2 text-[12.5px] font-light text-gray-500">
              <span className="h-2 w-2 rounded-full bg-[#CC0000]" />
              อัปเดตล่าสุด {updatedAt}
            </span>
          )}
          <Link
            href="/admin/payment"
            className="flex items-center rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-[#CC0000] hover:text-[#CC0000]"
          >
            รายงานการเงิน
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {isLoading && !data ? (
        <DashboardSkeleton />
      ) : data ? (
        <>
          {/* แถบสถิติ (จอเล็กซ่อน) */}
          <div className="hidden md:block">
            <KpiCards kpis={data.kpis} />
          </div>

          {/* ยอดคนมาเรียนวันนี้ — เต็มความกว้าง, แสดงบนมือถือด้วย (ใช้จริงที่สนาม) */}
          <ClassHeadcountPanel />

          {/* เนื้อหา 2 คอลัมน์ · มือถือ: แจ้งเตือน/ฟีด มาก่อนกิจกรรม */}
          <div className="grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-[1.55fr_1fr]">
            <div className="order-2 flex min-w-0 flex-col gap-10 lg:order-1">
              <div className="hidden md:block">
                <RevenueChart chart={data.chart} />
              </div>
              <div className="hidden md:block">
                <TopCourses courses={data.courses} />
              </div>
              <RecentActivity activities={data.activities} />
            </div>

            <div className="order-1 flex min-w-0 flex-col gap-10 lg:order-2">
              <ImportantAlerts alerts={data.alerts} />
              <DashboardNotifications />
              <div className="hidden md:block">
                <RealtimeInsights insights={data.insights} />
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
