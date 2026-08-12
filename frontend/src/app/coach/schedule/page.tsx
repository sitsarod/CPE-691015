"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, Calendar, RefreshCw, ChevronLeft, ChevronRight, Clock, MapPin, BookOpen, FileText, X } from "lucide-react";

import { fetchMyCoachProfile, fetchCoachSchedules } from "@/services/coachAPI";
import { WorkScheduleItem } from "@/types/coach";

const DAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// สีคาบสอนอิงระดับคอร์สแบบอัตโนมัติจาก hash ของ course_id (คอร์สเดียวกัน = สีเดียวกัน)
// ต้องเป็นพาเลต "ชุดเดียวกันและลำดับเดียวกัน" กับหน้า admin (10 สี) ไม่งั้นคอร์สเดียวกันจะได้คนละสี
const COURSE_COLORS = [
  { bar: "bg-blue-500", soft: "bg-blue-50 border-blue-200 text-blue-700" },
  { bar: "bg-orange-500", soft: "bg-orange-50 border-orange-200 text-orange-700" },
  { bar: "bg-emerald-500", soft: "bg-emerald-50 border-emerald-200 text-emerald-700" },
  { bar: "bg-violet-500", soft: "bg-violet-50 border-violet-200 text-violet-700" },
  { bar: "bg-rose-500", soft: "bg-rose-50 border-rose-200 text-rose-700" },
  { bar: "bg-cyan-500", soft: "bg-cyan-50 border-cyan-200 text-cyan-700" },
  { bar: "bg-amber-500", soft: "bg-amber-50 border-amber-200 text-amber-700" },
  { bar: "bg-indigo-500", soft: "bg-indigo-50 border-indigo-200 text-indigo-700" },
  { bar: "bg-teal-500", soft: "bg-teal-50 border-teal-200 text-teal-700" },
  { bar: "bg-pink-500", soft: "bg-pink-50 border-pink-200 text-pink-700" },
];
const colorForCourse = (courseId: number) => {
  const h = Math.abs(Math.imul(courseId ^ 0x9e3779b9, 2654435761));
  return COURSE_COLORS[h % COURSE_COLORS.length];
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const toISODate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const normalizeDate = (raw: string) => (raw || "").split("T")[0]; // ตัด T00:00:00Z ออก
const startOfWeek = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
};
// "2026-08-12" -> "12 ส.ค. 2569"
const formatThaiDate = (iso: string) => {
  const [y, m, d] = normalizeDate(iso).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${TH_MONTHS[m - 1]} ${y + 543}`;
};

export default function CoachSchedulePage() {
  const router = useRouter();

  const [coachId, setCoachId] = useState<number | null>(null);
  const [schedules, setSchedules] = useState<WorkScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [detail, setDetail] = useState<WorkScheduleItem | null>(null);

  const loadData = async (id?: number) => {
    try {
      setError(null);
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      let resolvedId = id;
      if (!resolvedId) {
        const myProfile = await fetchMyCoachProfile(token);
        resolvedId = myProfile.id;
        setCoachId(myProfile.id);
      }

      const schedulesData = await fetchCoachSchedules(resolvedId, token);
      setSchedules(schedulesData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการดึงข้อมูล");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData(coachId || undefined);
  };

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; }),
    [weekStart]
  );
  const weekRangeLabel = useMemo(() => {
    const s = weekDays[0], e = weekDays[6];
    return `${s.getDate()} ${TH_MONTHS[s.getMonth()]} - ${e.getDate()} ${TH_MONTHS[e.getMonth()]} ${e.getFullYear() + 543}`;
  }, [weekDays]);

  const todayISO = toISODate(new Date());

  // จัดกลุ่มคาบตามวันที่
  const byDate = useMemo(() => {
    const map = new Map<string, WorkScheduleItem[]>();
    for (const s of schedules) {
      const key = normalizeDate(s.date);
      const list = map.get(key);
      if (list) list.push(s);
      else map.set(key, [s]);
    }
    for (const list of map.values()) list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    return map;
  }, [schedules]);

  const goPrevWeek = () => setWeekStart((d) => { const n = new Date(d); n.setDate(d.getDate() - 7); return n; });
  const goNextWeek = () => setWeekStart((d) => { const n = new Date(d); n.setDate(d.getDate() + 7); return n; });
  const goThisWeek = () => setWeekStart(startOfWeek(new Date()));

  if (isLoading) {
    return (
      <div className="w-full min-h-[60vh] flex flex-col items-center justify-center text-gray-500">
        <Loader2 className="w-12 h-12 animate-spin text-[#CC0000] mb-4" />
        <span className="text-sm font-semibold tracking-wide animate-pulse">กำลังโหลดตารางงาน...</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fadeIn">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-gray-150 pb-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Calendar className="w-8 h-8 text-[#CC0000]" />
            ตารางงานของฉัน
          </h1>
          <p className="text-gray-500 mt-1 text-sm">คาบสอนที่แอดมินมอบหมายให้คุณ — คลิกที่คาบเพื่อดูรายละเอียด</p>
        </div>

        <div className="flex items-center gap-2 self-start lg:self-auto">
          <button onClick={goPrevWeek} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer" title="สัปดาห์ก่อนหน้า">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-[200px] text-center">
            <p className="text-sm font-bold text-gray-800">{weekRangeLabel}</p>
            <button onClick={goThisWeek} className="text-[11px] font-semibold text-[#CC0000] hover:underline cursor-pointer">กลับมาสัปดาห์นี้</button>
          </div>
          <button onClick={goNextWeek} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer" title="สัปดาห์ถัดไป">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button onClick={handleRefresh} disabled={isRefreshing} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer" title="อัปเดตข้อมูล">
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin text-[#CC0000]" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold">เกิดข้อผิดพลาด</h4>
            <p className="text-sm mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Weekly board */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[1000px]">
            <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
              {weekDays.map((d) => {
                const isToday = toISODate(d) === todayISO;
                return (
                  <div key={d.toISOString()} className={`py-3 text-center border-l border-slate-200 first:border-l-0 ${isToday ? "bg-rose-50" : ""}`}>
                    <div className={`text-xs font-bold ${isToday ? "text-[#CC0000]" : "text-slate-600"}`}>{DAY_LABELS[d.getDay()]}</div>
                    <div className={`text-[11px] ${isToday ? "text-[#CC0000] font-bold" : "text-slate-400"}`}>{d.getDate()} {TH_MONTHS[d.getMonth()]}</div>
                  </div>
                );
              })}
            </div>

            <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
              {weekDays.map((d) => {
                const dISO = toISODate(d);
                const isPast = dISO < todayISO;
                const items = byDate.get(dISO) ?? [];
                return (
                  <div key={dISO} className={`min-h-[300px] border-l border-slate-100 first:border-l-0 p-2 space-y-2 ${isPast ? "bg-slate-50/40" : ""}`}>
                    {items.length === 0 ? (
                      <p className="text-[10px] text-slate-300 text-center pt-6">ไม่มีคาบสอน</p>
                    ) : (
                      items.map((s) => {
                        const color = colorForCourse(s.course_id);
                        return (
                          <button
                            key={s.ID}
                            onClick={() => setDetail(s)}
                            className={`w-full text-left rounded-xl border ${color.soft} p-3 transition hover:shadow-md cursor-pointer ${isPast ? "opacity-60" : ""}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${color.bar}`} />
                              <span className="text-sm font-bold leading-tight truncate">{s.course?.course_name || "คาบสอน"}</span>
                            </div>
                            <div className="mt-1.5 text-xs font-semibold text-slate-500">{s.start_time} - {s.end_time}</div>
                            {s.court_number && (
                              <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                                <MapPin className="h-3 w-3 shrink-0" /> สนาม {s.court_number}
                              </div>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {schedules.length === 0 && !error && (
        <p className="text-center text-sm text-slate-400">ยังไม่มีตารางงานที่ได้รับมอบหมาย</p>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDetail(null)} />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl ring-1 ring-black/5 overflow-hidden">
            <div className={`p-5 border-b border-gray-100 flex items-start justify-between gap-3 ${colorForCourse(detail.course_id).soft}`}>
              <div>
                <h2 className="text-lg font-bold text-slate-900">{detail.course?.course_name || "คาบสอน"}</h2>
                <p className="text-sm mt-0.5">{formatThaiDate(detail.date)}</p>
              </div>
              <button onClick={() => setDetail(null)} className="p-1.5 text-slate-500 hover:bg-white/40 rounded-lg" aria-label="ปิด">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <DetailRow icon={Clock} label="เวลา" value={`${detail.start_time} - ${detail.end_time} น.`} />
              <DetailRow icon={BookOpen} label="คอร์ส" value={detail.course?.course_name || "-"} />
              <DetailRow icon={MapPin} label="สนาม" value={detail.court_number || "ไม่ระบุสนาม"} />
              <DetailRow icon={FileText} label="รายละเอียด" value={detail.description || "-"} />
            </div>
            <div className="p-5 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button onClick={() => setDetail(null)} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 cursor-pointer">ปิด</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-500 shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-400">{label}</p>
        <p className="text-sm text-slate-800 mt-0.5 break-words">{value}</p>
      </div>
    </div>
  );
}
