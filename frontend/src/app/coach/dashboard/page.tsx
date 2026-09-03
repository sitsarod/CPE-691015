"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Wallet, CalendarDays, CalendarClock, Clock, Star, type LucideIcon } from "lucide-react";

import { fetchMyCoachProfile, fetchCoachSchedules, fetchCoachWages } from "@/services/coachAPI";
import { CoachProfile, WorkScheduleItem, CoachWageEntry } from "@/types/coach";

// ปุ่มลัดไปหน้าที่โค้ชใช้บ่อย (สไตล์เดียวกับหน้าลูกค้า)
const QUICK_ACTIONS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "ตารางงาน", href: "/coach/schedule", icon: CalendarDays },
  { label: "การเงิน", href: "/coach/payment", icon: Wallet },
  { label: "เวลาว่าง", href: "/coach/availability", icon: Clock },
  { label: "รีวิวของฉัน", href: "/coach/feedback", icon: Star },
];

export default function CoachDashboardPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [schedules, setSchedules] = useState<WorkScheduleItem[]>([]);
  const [wages, setWages] = useState<CoachWageEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setError(null);
        const token = localStorage.getItem("token");
        if (!token) {
          router.push("/login");
          return;
        }

        const myProfile = await fetchMyCoachProfile(token);
        setProfile(myProfile);

        const schedulesData = await fetchCoachSchedules(myProfile.id, token);
        setSchedules(schedulesData);

        // รายได้เป็น best-effort — ถ้าดึงไม่ได้ก็แสดง ฿0 ไม่ทำให้ทั้งหน้าพัง
        try {
          const wagesData = await fetchCoachWages(myProfile.id, token);
          setWages(wagesData);
        } catch (wErr) {
          console.error("โหลดข้อมูลรายได้ไม่สำเร็จ:", wErr);
        }
      } catch (err: unknown) {
        console.error(err);
        setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการดึงข้อมูล");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [router]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || !profile) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3 max-w-2xl">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold">เกิดข้อผิดพลาด</h4>
          <p className="text-sm mt-0.5">{error || "ไม่พบข้อมูลโค้ช"}</p>
        </div>
      </div>
    );
  }

  // วันที่ "วันนี้" ตามเขตเวลาเครื่อง — ห้ามใช้ toISOString() ที่เป็น UTC
  // ไม่งั้นช่วงเช้า/ดึกวันที่จะเพี้ยนไปคนละวันกับ agenda (ที่คิดแบบ local) แล้วนับคาบวันนี้ผิด
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // date จาก backend อาจมี suffix เวลา (เช่น "2026-08-26T00:00:00Z") — ตัดเหลือ YYYY-MM-DD ก่อนเทียบเสมอ
  const dayKey = (s: WorkScheduleItem) => s.date.slice(0, 10);

  const upcomingSchedules = schedules
    .filter(s => dayKey(s) >= today)
    .sort((a, b) => (dayKey(a) + a.start_time).localeCompare(dayKey(b) + b.start_time))
    .slice(0, 5);

  // สรุปคาบสอนวันนี้ / ที่กำลังจะถึง (วันในอนาคต)
  const todayCount = schedules.filter(s => dayKey(s) === today).length;
  const upcomingCount = schedules.filter(s => dayKey(s) > today).length;

  // รายได้เดือนนี้ = ผลรวมค่าจ้างที่บันทึกในเดือนปัจจุบัน
  const earningsThisMonth = wages
    .filter(w => {
      const d = new Date(w.expensedate);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, w) => sum + w.expenseamount, 0);

  // คำโปรยท้ายการ์ด (เหมือนสไตล์การ์ดฝั่งลูกค้า)
  const thDate = (iso: string) =>
    new Date(iso).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });
  const nextItem = schedules
    .filter(s => dayKey(s) > today)
    .sort((a, b) => (dayKey(a) + a.start_time).localeCompare(dayKey(b) + b.start_time))[0];
  const nextDate = nextItem ? dayKey(nextItem) : undefined;
  const todayNote = todayCount > 0 ? thDate(today) : "ไม่มีคาบสอนวันนี้";
  const upcomingNote = nextDate ? `ถัดไป ${thDate(nextDate)}` : "ไม่มีคาบที่จะถึง";
  const earningsNote = `ประจำเดือน${now.toLocaleDateString("th-TH", { month: "long" })}`;

  // ข้อมูลการ์ดสถิติ — ใช้ร่วมทั้งเลย์เอาต์จอเล็ก (ยุบ 3 ช่อง) และจอใหญ่ (การ์ดเต็ม)
  const statCards = [
    { key: "today", icon: <CalendarDays className="h-5 w-5" />, label: "คาบสอนวันนี้", value: `${todayCount} คาบ`, note: todayNote, accent: "#CC0000" },
    { key: "upcoming", icon: <CalendarClock className="h-5 w-5" />, label: "คาบสอนที่จะถึง", value: `${upcomingCount} คาบ`, note: upcomingNote, accent: "#2563EB" },
    { key: "income", icon: <Wallet className="h-5 w-5" />, label: "รายได้เดือนนี้", value: `฿${earningsThisMonth.toLocaleString()}`, note: earningsNote, accent: "#0D9488" },
  ];

  // จัดคาบสอนเป็นกลุ่มตามวัน (agenda) — upcomingSchedules เรียงตามวัน+เวลาอยู่แล้ว
  const dayGroups: { date: string; items: WorkScheduleItem[] }[] = [];
  for (const s of upcomingSchedules) {
    const key = dayKey(s);
    const last = dayGroups[dayGroups.length - 1];
    if (last && last.date === key) last.items.push(s);
    else dayGroups.push({ date: key, items: [s] });
  }

  // ป้ายหัววัน: "วันนี้/พรุ่งนี้" + วันแบบเต็ม (เช่น จันทร์ 26 ส.ค.)
  const fmtDayHeader = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { rel: "", full: iso };
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    const diff = Math.round((day.getTime() - base.getTime()) / 86400000);
    const rel = diff === 0 ? "วันนี้" : diff === 1 ? "พรุ่งนี้" : "";
    return { rel, full: d.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "short" }) };
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 sm:space-y-8 animate-fadeIn">
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-5 sm:pb-6">
        <div>
          <p className="text-sm text-gray-500">ยินดีต้อนรับกลับ</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-gray-900">
            สวัสดี, {profile.nickname || profile.first_name} 👋
          </h1>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {QUICK_ACTIONS.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-[#CC0000]/40 hover:text-[#CC0000] sm:justify-start sm:px-4"
            >
              <Icon className="h-4 w-4 text-[#CC0000]" />
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* จอเล็ก: เรียงเป็นแถวเต็มความกว้าง (ป้าย+คำโปรยซ้าย / ค่าตัวใหญ่ขวา) อ่านง่ายกว่าแบ่งช่อง */}
      <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white sm:hidden">
        {statCards.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.accent }} />
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-700">{c.label}</p>
                <p className="truncate text-[11px] text-gray-400">{c.note}</p>
              </div>
            </div>
            <span className="shrink-0 text-xl font-black tabular-nums" style={{ color: c.accent }}>
              {c.value}
            </span>
          </div>
        ))}
      </div>

      {/* จอ tablet ขึ้นไป: การ์ดเต็มรายละเอียด */}
      <div className="hidden gap-6 sm:grid sm:grid-cols-3">
        {statCards.map((c) => (
          <StatCard key={c.key} icon={c.icon} label={c.label} value={c.value} note={c.note} accent={c.accent} />
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">คาบสอนที่จะถึง</h3>
          <p className="text-sm text-gray-500 mt-0.5">5 คาบสอนถัดไปของคุณ</p>
        </div>

        {upcomingSchedules.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-14">ไม่มีคาบสอนที่จะถึงในขณะนี้</p>
        ) : (
          <div>
            {dayGroups.map(g => {
              const h = fmtDayHeader(g.date);
              return (
                <div key={g.date}>
                  {/* หัววัน */}
                  <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/70 px-4 sm:px-6 py-3">
                    <div className="flex items-center gap-2.5">
                      {h.rel && (
                        <span className="rounded-full bg-[#FFF0F0] px-2.5 py-0.5 text-xs font-bold text-[#CC0000]">
                          {h.rel}
                        </span>
                      )}
                      <span className="text-sm font-bold text-gray-800">{h.full}</span>
                    </div>
                    <span className="text-xs font-semibold text-gray-400">{g.items.length} คาบ</span>
                  </div>

                  {/* คาบในวันนั้น */}
                  {g.items.map(s => (
                    <div
                      key={s.ID}
                      className="flex items-center gap-3 sm:gap-4 border-b border-gray-50 px-4 sm:px-6 py-4 transition-colors last:border-0 hover:bg-gray-50"
                    >
                      <div className="flex w-[112px] sm:w-36 shrink-0 items-center gap-2 sm:gap-2.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#CC0000]" />
                        <span className="text-sm sm:text-base font-bold text-gray-900 tabular-nums">
                          {s.start_time}–{s.end_time}
                        </span>
                      </div>
                      <p className="min-w-0 flex-1 truncate text-sm sm:text-base font-bold text-gray-900">
                        {s.course?.course_name || "-"}
                      </p>
                      <span className="shrink-0 rounded-lg bg-gray-100 px-2.5 sm:px-3 py-1 text-xs sm:text-sm font-semibold text-gray-600">
                        สนาม {s.court_number}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  note,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
  accent: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 hover:shadow-md sm:p-5">
      {/* แถบ accent สีด้านซ้าย = สไตล์เดียวกับการ์ดฝั่งลูกค้า */}
      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: accent }} />

      {/* หัวการ์ด: จุดสี + ป้ายกำกับ + ไอคอนมุมขวา */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
          <span className="text-sm font-bold text-gray-600">{label}</span>
        </div>
        <span style={{ color: accent }}>{icon}</span>
      </div>

      {/* ค่า */}
      <p className="mt-5 text-2xl font-black tabular-nums text-gray-900 sm:text-[28px]">{value}</p>

      {/* คำโปรยท้ายการ์ด */}
      {note && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <span className="text-xs text-gray-500">{note}</span>
        </div>
      )}
    </div>
  );
}

// โครงหน้าตอนโหลด — ล้อ layout จริง (header + การ์ด 3 ใบ + การ์ดตารางสอน)
function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="border-b border-gray-200 pb-5 sm:pb-6 space-y-4">
        <div className="space-y-2">
          <div className="h-3.5 w-28 rounded bg-gray-100" />
          <div className="h-8 sm:h-9 w-56 sm:w-64 max-w-full rounded-lg bg-gray-200" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 rounded-xl bg-gray-100 sm:w-32" />
          ))}
        </div>
      </div>

      {/* Stat cards — จอเล็ก: เรียงเป็นแถว */}
      <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white sm:hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-28 rounded bg-gray-200" />
                <div className="h-2.5 w-20 rounded bg-gray-100" />
              </div>
            </div>
            <div className="h-6 w-16 rounded bg-gray-200" />
          </div>
        ))}
      </div>

      {/* Stat cards — จอใหญ่: การ์ดเต็ม */}
      <div className="hidden gap-6 sm:grid sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5">
            <span className="absolute inset-y-0 left-0 w-1 bg-gray-200" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-gray-200" />
                <div className="h-3.5 w-24 rounded bg-gray-200" />
              </div>
              <div className="h-5 w-5 rounded bg-gray-200" />
            </div>
            <div className="mt-5 h-8 w-32 rounded-lg bg-gray-200" />
            <div className="mt-4 border-t border-gray-100 pt-3">
              <div className="h-3 w-28 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>

      {/* Schedule card */}
      <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white">
        <div className="border-b border-gray-100 p-5 sm:p-6 space-y-2">
          <div className="h-5 w-40 rounded bg-gray-200" />
          <div className="h-3.5 w-52 rounded bg-gray-100" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 sm:gap-4 border-b border-gray-50 px-4 sm:px-6 py-4 last:border-0">
            <div className="h-5 w-[112px] sm:w-32 shrink-0 rounded bg-gray-200" />
            <div className="h-5 w-40 max-w-full flex-1 rounded bg-gray-200" />
            <div className="ml-auto h-6 w-14 sm:w-16 shrink-0 rounded-lg bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
