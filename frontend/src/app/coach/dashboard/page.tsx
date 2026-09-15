"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Wallet, CalendarDays, Clock, Star, type LucideIcon } from "lucide-react";

import { fetchMyCoachProfile, fetchCoachSchedules, fetchCoachWages } from "@/services/coachAPI";
import { CoachProfile, WorkScheduleItem, CoachWageEntry } from "@/types/coach";

// ปุ่มลัดไปหน้าที่โค้ชใช้บ่อย
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
  // จับ "เวลาปัจจุบัน" ครั้งเดียว เพื่อคำนวณวันแบบ pure ระหว่าง render
  const [nowMs] = useState(() => Date.now());

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
      <div className="flex max-w-2xl items-start gap-3 border border-red-200 bg-red-50 p-4 text-red-700">
        <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <div>
          <h4 className="font-bold">เกิดข้อผิดพลาด</h4>
          <p className="mt-0.5 text-sm">{error || "ไม่พบข้อมูลโค้ช"}</p>
        </div>
      </div>
    );
  }

  // วันที่ "วันนี้" ตามเขตเวลาเครื่อง — ห้ามใช้ toISOString() ที่เป็น UTC
  const now = new Date(nowMs);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // date จาก backend อาจมี suffix เวลา — ตัดเหลือ YYYY-MM-DD ก่อนเทียบเสมอ
  const dayKey = (s: WorkScheduleItem) => s.date.slice(0, 10);

  const upcomingSchedules = schedules
    .filter((s) => dayKey(s) >= today)
    .sort((a, b) => (dayKey(a) + a.start_time).localeCompare(dayKey(b) + b.start_time))
    .slice(0, 5);

  const todayCount = schedules.filter((s) => dayKey(s) === today).length;
  const upcomingCount = schedules.filter((s) => dayKey(s) > today).length;

  const earningsThisMonth = wages
    .filter((w) => {
      const d = new Date(w.expensedate);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, w) => sum + w.expenseamount, 0);

  const thDate = (iso: string) =>
    new Date(iso).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });
  const nextItem = schedules
    .filter((s) => dayKey(s) > today)
    .sort((a, b) => (dayKey(a) + a.start_time).localeCompare(dayKey(b) + b.start_time))[0];
  const nextDate = nextItem ? dayKey(nextItem) : undefined;
  const todayNote = todayCount > 0 ? thDate(today) : "ไม่มีคาบสอนวันนี้";
  const upcomingNote = nextDate ? `ถัดไป ${thDate(nextDate)}` : "ไม่มีคาบที่จะถึง";
  const earningsNote = `ประจำเดือน${now.toLocaleDateString("th-TH", { month: "long" })}`;

  // บรรทัดทักทาย: วันที่เต็ม + คาบแรกวันนี้
  const todayFull = now.toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const firstToday = schedules
    .filter((s) => dayKey(s) === today)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
  const firstTodayNote = firstToday
    ? `คาบแรกวันนี้ ${firstToday.start_time} สนาม ${firstToday.court_number}`
    : null;

  const statCards = [
    { key: "today", label: "คาบสอนวันนี้", value: `${todayCount} คาบ`, note: todayNote, red: false },
    { key: "upcoming", label: "คาบสอนที่จะถึง", value: `${upcomingCount} คาบ`, note: upcomingNote, red: false },
    { key: "income", label: "รายได้เดือนนี้", value: `฿${earningsThisMonth.toLocaleString()}`, note: earningsNote, red: true },
  ];

  // จัดคาบสอนเป็นกลุ่มตามวัน (agenda)
  const dayGroups: { date: string; items: WorkScheduleItem[] }[] = [];
  for (const s of upcomingSchedules) {
    const key = dayKey(s);
    const last = dayGroups[dayGroups.length - 1];
    if (last && last.date === key) last.items.push(s);
    else dayGroups.push({ date: key, items: [s] });
  }

  const fmtDayHeader = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { rel: "", full: iso };
    const base = new Date(nowMs);
    base.setHours(0, 0, 0, 0);
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    const diff = Math.round((day.getTime() - base.getTime()) / 86400000);
    const rel = diff === 0 ? "วันนี้" : diff === 1 ? "พรุ่งนี้" : "";
    return { rel, full: d.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "short" }) };
  };

  const coachName = profile.nickname || profile.first_name || "";

  return (
    <div className="mx-auto max-w-[1400px] space-y-9 animate-fadeIn">
      {/* ---------- header ---------- */}
      <div className="flex flex-col gap-6 border-b border-gray-200 pb-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#CC0000]">ยินดีต้อนรับกลับ</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
              สวัสดี โค้ช{coachName}
            </h1>
            <p className="mt-2 text-[13px] font-light text-gray-500">
              {todayFull}
              {firstTodayNote ? ` · ${firstTodayNote}` : ""}
            </p>
          </div>
          <div className="flex flex-none gap-3">
            <Link
              href="/coach/availability"
              className="flex items-center rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-[#CC0000] hover:text-[#CC0000]"
            >
              แจ้งเวลาว่าง
            </Link>
            <Link
              href="/coach/schedule"
              className="flex items-center rounded-lg bg-[#CC0000] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#990000]"
            >
              เช็คชื่อคาบนี้
            </Link>
          </div>
        </div>

        {/* ปุ่มลัด */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {QUICK_ACTIONS.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex h-[52px] items-center gap-3 rounded-lg border border-gray-300 px-4 text-sm text-gray-700 transition-colors hover:border-[#CC0000] hover:text-[#CC0000]"
            >
              <Icon className="h-5 w-5 flex-none text-[#CC0000]" />
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* ---------- สถิติ 3 ช่อง ---------- */}
      <div className="grid grid-cols-1 gap-px border border-gray-200 bg-gray-200 sm:grid-cols-3">
        {statCards.map((c) => (
          <div key={c.key} className="flex flex-col gap-2 bg-white px-5 py-6 sm:px-6">
            <span className="text-xs font-light text-gray-500">{c.label}</span>
            <span
              className={`text-3xl font-semibold leading-none tabular-nums ${c.red ? "text-[#CC0000]" : "text-gray-900"}`}
            >
              {c.value}
            </span>
            <span className="text-[11px] font-light text-gray-400">{c.note}</span>
          </div>
        ))}
      </div>

      {/* ---------- คาบสอนที่จะถึง (agenda) ---------- */}
      <div>
        <div className="mb-5 flex items-end justify-between gap-4 border-b border-gray-200 pb-4">
          <div className="flex items-baseline gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">คาบสอนที่จะถึง</h2>
            <span className="hidden whitespace-nowrap text-[13px] font-light text-gray-500 sm:inline">5 คาบสอนถัดไปของคุณ</span>
          </div>
          <Link href="/coach/schedule" className="whitespace-nowrap text-[13px] font-light text-gray-500 hover:text-[#CC0000]">
            ดูตารางงานทั้งหมด
          </Link>
        </div>

        {upcomingSchedules.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">ไม่มีคาบสอนที่จะถึงในขณะนี้</p>
        ) : (
          <div className="flex flex-col">
            {dayGroups.map((g) => {
              const h = fmtDayHeader(g.date);
              const isToday = h.rel === "วันนี้";
              return (
                <div key={g.date}>
                  {/* หัววัน */}
                  <div className="flex items-center justify-between border-b border-gray-200 py-3">
                    <div className="flex items-center gap-3">
                      {h.rel && (
                        <span
                          className={`px-2.5 py-0.5 text-xs font-medium ${
                            isToday ? "bg-[#CC0000] text-white" : "border border-gray-300 text-gray-500"
                          }`}
                        >
                          {h.rel}
                        </span>
                      )}
                      <span className="text-sm font-medium text-gray-900">{h.full}</span>
                    </div>
                    <span className="text-xs font-light text-gray-400">{g.items.length} คาบ</span>
                  </div>

                  {/* คาบในวันนั้น */}
                  {g.items.map((s) => (
                    <div key={s.ID} className="flex items-center gap-4 border-b border-gray-100 py-4 sm:gap-7">
                      <span className="flex w-[120px] flex-none items-center gap-3 sm:w-[150px]">
                        <span className={`h-2 w-2 flex-none ${isToday ? "bg-[#CC0000]" : "bg-gray-300"}`} />
                        <span className="text-sm font-medium tabular-nums text-gray-900 sm:text-[15px]">
                          {s.start_time}–{s.end_time}
                        </span>
                      </span>
                      <p className="min-w-0 flex-1 truncate text-sm text-gray-900 sm:text-[15px]">
                        {s.course?.course_name || "-"}
                      </p>
                      <span className="flex-none border border-gray-200 px-3 py-1 text-xs font-light text-gray-600">
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

// โครงหน้าตอนโหลด (editorial)
function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-[1400px] animate-pulse space-y-9">
      {/* header */}
      <div className="space-y-6 border-b border-gray-200 pb-7">
        <div className="space-y-2.5">
          <div className="h-3 w-28 rounded bg-gray-100" />
          <div className="h-9 w-64 max-w-full rounded bg-gray-200" />
          <div className="h-3.5 w-72 max-w-full rounded bg-gray-100" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[52px] rounded-lg bg-gray-100" />
          ))}
        </div>
      </div>

      {/* stat row */}
      <div className="grid grid-cols-1 gap-px border border-gray-200 bg-gray-200 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2.5 bg-white px-6 py-6">
            <div className="h-3 w-20 rounded bg-gray-100" />
            <div className="h-8 w-24 rounded bg-gray-200" />
            <div className="h-2.5 w-28 rounded bg-gray-100" />
          </div>
        ))}
      </div>

      {/* agenda */}
      <div>
        <div className="border-b border-gray-200 pb-4">
          <div className="h-6 w-52 rounded bg-gray-200" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 border-b border-gray-100 py-4">
            <div className="h-5 w-[130px] shrink-0 rounded bg-gray-200" />
            <div className="h-5 max-w-[220px] flex-1 rounded bg-gray-200" />
            <div className="h-6 w-16 shrink-0 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
