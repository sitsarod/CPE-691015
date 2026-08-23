"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, RefreshCw, AlertCircle, Loader2, Users } from "lucide-react";

import { getAllCoachesAPI, fetchAllCoachAvailabilities, CoachListItem } from "@/services/coachAPI";
import { getWeekSessions, WeekSession } from "@/services/workScheduleAPI";
import { getCourts, Court } from "@/services/courtAPI";
import { AvailabilitySlot } from "@/types/coach";
import { AssignCoachModal } from "@/components/admin/modals/AssignCoachModal";
import { CourtManageModal } from "@/components/admin/modals/CourtManageModal";
import { MapPin } from "lucide-react";

const DAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// พาเลตสีของคาบเรียน อิงระดับคอร์ส (คอร์สเดียวกัน = สีเดียวกัน) แบบอัตโนมัติจาก hash ของ course_id
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
// hash แบบง่ายให้ course_id กระจายลงพาเลต (ลดโอกาสสีชนเมื่อเทียบกับ id % n ตรงๆ)
const colorForCourse = (courseId: number) => {
  const h = Math.abs(Math.imul(courseId ^ 0x9e3779b9, 2654435761));
  return COURSE_COLORS[h % COURSE_COLORS.length];
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const toISODate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const startOfWeek = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
};

export default function CoachSchedulePage() {
  const [coaches, setCoaches] = useState<CoachListItem[]>([]);
  const [availByCoach, setAvailByCoach] = useState<Map<number, Map<string, AvailabilitySlot[]>>>(new Map());
  const [sessions, setSessions] = useState<WeekSession[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtModalOpen, setCourtModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [search, setSearch] = useState("");
  const [activeSession, setActiveSession] = useState<WeekSession | null>(null);
  const [activeIsPast, setActiveIsPast] = useState(false);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; }),
    [weekStart]
  );
  const weekStartISO = toISODate(weekStart);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      // ดึงทั้งหมดพร้อมกันในครั้งเดียว — availability รวมทุกโค้ชมาใน request เดียว (ไม่ยิงทีละคนแล้ว)
      const [coachData, sessionData, availRows, courtData] = await Promise.all([
        getAllCoachesAPI(),
        getWeekSessions(weekStartISO),
        fetchAllCoachAvailabilities(),
        getCourts(),
      ]);
      setCoaches(coachData);
      setSessions(sessionData);
      setCourts(courtData);

      // group เวลาว่าง: coach_id -> (day_of_week -> ช่วงเวลา)
      const map = new Map<number, Map<string, AvailabilitySlot[]>>();
      for (const row of availRows) {
        let byDay = map.get(row.coach_id);
        if (!byDay) {
          byDay = new Map<string, AvailabilitySlot[]>();
          map.set(row.coach_id, byDay);
        }
        const slot: AvailabilitySlot = { day_of_week: row.day_of_week, start_time: row.start_time, end_time: row.end_time };
        const list = byDay.get(row.day_of_week);
        if (list) list.push(slot);
        else byDay.set(row.day_of_week, [slot]);
      }
      setAvailByCoach(map);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล");
    } finally {
      setIsLoading(false);
    }
  }, [weekStartISO]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const weekRangeLabel = useMemo(() => {
    const s = weekDays[0], e = weekDays[6];
    return `${s.getDate()} ${TH_MONTHS[s.getMonth()]} - ${e.getDate()} ${TH_MONTHS[e.getMonth()]} ${e.getFullYear() + 543}`;
  }, [weekDays]);

  const todayISO = toISODate(new Date());

  // จัดกลุ่มคาบตามวันที่ + กรองด้วยชื่อคอร์ส
  const sessionsByDate = useMemo(() => {
    const term = search.trim().toLowerCase();
    const map = new Map<string, WeekSession[]>();
    for (const s of sessions) {
      if (term && !s.course_name.toLowerCase().includes(term)) continue;
      const list = map.get(s.date);
      if (list) list.push(s);
      else map.set(s.date, [s]);
    }
    for (const list of map.values()) list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    return map;
  }, [sessions, search]);

  const goPrevWeek = () => setWeekStart((d) => { const n = new Date(d); n.setDate(d.getDate() - 7); return n; });
  const goNextWeek = () => setWeekStart((d) => { const n = new Date(d); n.setDate(d.getDate() + 7); return n; });
  const goThisWeek = () => setWeekStart(startOfWeek(new Date()));

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2.5">
            <CalendarDays className="h-6 w-6 text-[#CC0000]" />
            จัดตารางสอน
          </h1>
          <p className="mt-1 text-sm text-gray-500">คลิกที่คาบเรียนเพื่อมอบหมายว่าโค้ชคนไหนเป็นผู้สอน (แสดงเฉพาะคอร์สที่มีนักเรียนกำลังเรียน)</p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={goPrevWeek} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer" title="สัปดาห์ก่อนหน้า">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-[210px] text-center">
            <p className="text-sm font-bold text-gray-800">{weekRangeLabel}</p>
            <button onClick={goThisWeek} className="text-[11px] font-semibold text-[#CC0000] hover:underline cursor-pointer">กลับมาสัปดาห์นี้</button>
          </div>
          <button onClick={goNextWeek} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer" title="สัปดาห์ถัดไป">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button onClick={loadData} disabled={isLoading} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer" title="รีเฟรช">
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => setCourtModalOpen(true)} className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer text-sm font-semibold" title="จัดการสนาม">
            <MapPin className="h-4 w-4" /> จัดการสนาม
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mt-6 w-full sm:max-w-xs">
        <input
          type="text"
          placeholder="ค้นหาชื่อคอร์ส..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 px-4 text-sm text-gray-900 shadow-sm outline-none placeholder:text-gray-400 focus:border-gray-300"
        />
      </div>

      {error && (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Weekly session board */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[1100px]">
            {/* Day headers */}
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

            {isLoading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-6 w-6 animate-spin text-[#CC0000]" />
              </div>
            ) : (
              <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
                {weekDays.map((d) => {
                  const dISO = toISODate(d);
                  const isPast = dISO < todayISO;
                  const daySessions = sessionsByDate.get(dISO) ?? [];
                  return (
                    <div key={dISO} className={`min-h-[320px] border-l border-slate-100 first:border-l-0 p-2 space-y-2 ${isPast ? "bg-slate-50/40" : ""}`}>
                      {daySessions.length === 0 ? (
                        <p className="text-[10px] text-slate-300 text-center pt-6">ไม่มีคาบสอน</p>
                      ) : (
                        daySessions.map((s) => {
                          const color = colorForCourse(s.course_id);
                          const hasCoach = s.assigned_coaches.length > 0;
                          return (
                            <button
                              key={`${s.course_id}-${s.date}-${s.start_time}`}
                              onClick={() => { setActiveSession(s); setActiveIsPast(isPast); }}
                              className={`w-full text-left rounded-xl border ${color.soft} p-3 transition hover:shadow-md cursor-pointer ${isPast ? "opacity-60" : ""}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${color.bar}`} />
                                <span className="text-sm font-bold leading-tight truncate">{s.course_name}</span>
                              </div>
                              <div className="mt-1.5 text-xs font-semibold text-slate-500">{s.start_time} - {s.end_time}</div>
                              <div className="mt-2 flex items-center gap-1.5 text-xs">
                                <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                {hasCoach ? (
                                  <span className="text-slate-600 truncate">{s.assigned_coaches.map((c) => c.coach_name).join(", ")}</span>
                                ) : (
                                  <span className="font-semibold text-[#CC0000]">ยังไม่มีโค้ช</span>
                                )}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {!isLoading && sessions.length === 0 && !error && (
        <p className="mt-4 text-center text-sm text-slate-400">
          สัปดาห์นี้ยังไม่มีคาบเรียนที่ต้องมอบหมาย (ไม่มีคอร์สที่มีนักเรียนกำลังเรียนอยู่)
        </p>
      )}

      <AssignCoachModal
        isOpen={activeSession !== null}
        onClose={() => setActiveSession(null)}
        session={activeSession}
        isPast={activeIsPast}
        coaches={coaches}
        courts={courts}
        availByCoach={availByCoach}
        onChanged={() => {
          setActiveSession(null);
          loadData();
        }}
      />

      <CourtManageModal
        isOpen={courtModalOpen}
        onClose={() => setCourtModalOpen(false)}
        onChanged={loadData}
      />
    </div>
  );
}
