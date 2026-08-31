"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, Save, Pencil, X } from "lucide-react";

import { fetchMyCoachProfile, fetchCoachAvailability, updateCoachAvailability } from "@/services/coachAPI";
import { AvailabilitySlot } from "@/types/coach";
import Toast from "@/components/Toast";

// เรียงวันแบบเดียวกับ UI อ้างอิง (issue-84): เริ่มวันอาทิตย์
const DAYS: { value: string; label: string }[] = [
  { value: "Sunday", label: "SUN" },
  { value: "Monday", label: "MON" },
  { value: "Tuesday", label: "TUE" },
  { value: "Wednesday", label: "WED" },
  { value: "Thursday", label: "THU" },
  { value: "Friday", label: "FRI" },
  { value: "Saturday", label: "SAT" },
];

// สเกลกริด: ทุก ๆ 1 ชั่วโมง ตั้งแต่ 08:00 ถึง 24:00 (16 คอลัมน์)
const START_HOUR = 8;
const END_HOUR = 24;
const HOURS: number[] = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

const pad2 = (n: number) => String(n).padStart(2, "0");
const cellKey = (day: string, hour: number) => `${day}|${hour}`;

// แปลงเวลา "HH:MM" เป็นนาที เพื่อใช้เทียบช่วงทับซ้อนกับแต่ละช่องชั่วโมง
const timeToMinutes = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

// โหลด slot เดิม (ซึ่งอาจมีเวลาไม่ตรงชั่วโมงเป๊ะจากของเก่า) มาระบายลงกริดชั่วโมง
// ช่องไหนที่ช่วงเวลาเดิมคาบเกี่ยวด้วย (แม้บางส่วน) จะถือว่า "ว่าง" ในช่องนั้น
const slotsToSelected = (list: AvailabilitySlot[]): Set<string> => {
  const set = new Set<string>();
  for (const item of list) {
    const start = timeToMinutes(item.start_time);
    const end = timeToMinutes(item.end_time);
    for (const h of HOURS) {
      const cellStart = h * 60;
      const cellEnd = (h + 1) * 60;
      if (start < cellEnd && end > cellStart) {
        set.add(cellKey(item.day_of_week, h));
      }
    }
  }
  return set;
};

// จุดสิ้นสุดของช่วง "24:00" ไม่ใช่เวลาที่ backend ยอมรับ (timeToMinutesWS จำกัดชั่วโมงไว้ 0-23)
// ถ้าช่วงที่เลือกไปจนถึงคอลัมน์สุดท้าย (23-24) ต้องปัดจุดสิ้นสุดเป็น 23:59 แทน
const endTimeLabel = (endHour: number): string => (endHour >= 24 ? "23:59" : `${pad2(endHour)}:00`);

// แปลงช่องชั่วโมงที่เลือกไว้ กลับเป็นช่วงเวลาต่อเนื่อง (รวมชั่วโมงติดกันเป็นช่วงเดียว) เพื่อส่งไปบันทึก
const selectedToSlots = (set: Set<string>): AvailabilitySlot[] => {
  const byDay: Record<string, number[]> = {};
  for (const key of set) {
    const [day, hourStr] = key.split("|");
    (byDay[day] ||= []).push(Number(hourStr));
  }

  const result: AvailabilitySlot[] = [];
  for (const day of Object.keys(byDay)) {
    const hours = byDay[day].sort((a, b) => a - b);
    let rangeStart = hours[0];
    let prevHour = hours[0];

    for (let i = 1; i < hours.length; i++) {
      const cur = hours[i];
      if (cur === prevHour + 1) {
        prevHour = cur;
        continue;
      }
      result.push({ day_of_week: day, start_time: `${pad2(rangeStart)}:00`, end_time: endTimeLabel(prevHour + 1) });
      rangeStart = cur;
      prevHour = cur;
    }
    result.push({ day_of_week: day, start_time: `${pad2(rangeStart)}:00`, end_time: endTimeLabel(prevHour + 1) });
  }
  return result;
};

const GRID_TEMPLATE_COLUMNS = `92px repeat(${HOURS.length}, minmax(54px, 1fr))`;
// บนมือถือใช้ตารางแบบสลับแกน: แถว = ชั่วโมง, คอลัมน์ = 7 วัน (พอดีความกว้างจอ ไม่ต้องเลื่อนแนวนอน)
const MOBILE_GRID_COLUMNS = `48px repeat(${DAYS.length}, minmax(0, 1fr))`;

export default function CoachAvailabilityPage() {
  const router = useRouter();

  const [coachId, setCoachId] = useState<number | null>(null);
  // committed = ข้อมูลที่บันทึกไว้จริงในระบบ (โหมดดูอย่างเดียวจะแสดงอันนี้)
  const [committed, setCommitted] = useState<Set<string>>(new Set());
  // draft = สำเนาที่กำลังแก้ไข ใช้เฉพาะตอนอยู่ในโหมดแก้ไขเท่านั้น
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [isEditing, setIsEditing] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // สถานะระหว่างลากเมาส์เลือก/ยกเลิกหลายช่องพร้อมกัน
  const [isPainting, setIsPainting] = useState(false);
  const [paintValue, setPaintValue] = useState(true);

  const displayed = isEditing ? draft : committed;

  const triggerToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

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
        setCoachId(myProfile.id);

        const availabilityData = await fetchCoachAvailability(myProfile.id, token);
        setCommitted(slotsToSelected(availabilityData));
      } catch (err: unknown) {
        console.error(err);
        setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการดึงข้อมูล");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ปล่อยเมาส์ที่ไหนก็ได้ในหน้าจอ ให้หยุดโหมดลากเลือกเสมอ (กันเคสลากออกนอกตาราง)
  useEffect(() => {
    const stopPainting = () => setIsPainting(false);
    window.addEventListener("mouseup", stopPainting);
    return () => window.removeEventListener("mouseup", stopPainting);
  }, []);

  const applyPaint = useCallback((day: string, hour: number, value: boolean) => {
    setDraft((prev) => {
      const next = new Set(prev);
      const key = cellKey(day, hour);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const handleStartEdit = () => {
    setDraft(new Set(committed));
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setIsPainting(false);
  };

  const handleCellMouseDown = (day: string, hour: number) => {
    if (!isEditing) return;
    const key = cellKey(day, hour);
    const newValue = !draft.has(key);
    setPaintValue(newValue);
    setIsPainting(true);
    applyPaint(day, hour, newValue);
  };

  const handleCellMouseEnter = (day: string, hour: number) => {
    if (!isEditing || !isPainting) return;
    applyPaint(day, hour, paintValue);
  };

  const handleSave = async () => {
    if (!coachId) return;

    const flattened = selectedToSlots(draft);
    if (flattened.length === 0) {
      triggerToast("กรุณาเลือกช่วงเวลาว่างอย่างน้อย 1 ชั่วโมง", "error");
      return;
    }

    setIsSaving(true);
    try {
      const token = localStorage.getItem("token") || "";
      // บันทึกทีเดียวทั้งชุด — ฝั่ง backend จะลบตารางเดิมทั้งหมดแล้วสร้างใหม่ตามนี้เสมอ (hard delete ทุกครั้งที่บันทึก)
      const saved = await updateCoachAvailability(coachId, flattened, token);
      setCommitted(slotsToSelected(saved));
      setIsEditing(false);
      triggerToast("บันทึกตารางเวลาว่างเรียบร้อยแล้ว");
    } catch (err: unknown) {
      // error ที่ backend บล็อก (เช่น เวลาว่างชนคาบที่ assign แล้ว) เป็นเคสที่คาดไว้ — แจ้งผ่าน toast พอ
      // ไม่ใช้ console.error เพราะจะไปกระตุ้น dev overlay ของ Next.js ให้เด้งจอแดงโดยไม่จำเป็น
      triggerToast(err instanceof Error ? err.message : "บันทึกตารางเวลาว่างไม่สำเร็จ", "error");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full min-h-[60vh] flex flex-col items-center justify-center text-gray-500">
        <Loader2 className="w-12 h-12 animate-spin text-[#CC0000] mb-4" />
        <span className="text-sm font-semibold tracking-wide animate-pulse">กำลังโหลดข้อมูล...</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">ตารางเวลาว่าง</h1>
          <p className="text-gray-500 mt-1 text-sm">เลือกช่วงเวลาที่สอนได้ เพื่อให้แอดมินมอบหมายงานได้ตรงเวลา</p>
        </div>

        {isEditing ? (
          <div className="flex items-center gap-2.5 self-start md:self-auto">
            <button
              onClick={handleCancelEdit}
              disabled={isSaving}
              className="flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 py-2.5 px-6 rounded-xl text-sm font-bold transition-all cursor-pointer disabled:opacity-60"
            >
              <X className="w-4 h-4" />
              ยกเลิก
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center justify-center gap-2 bg-[#CD0D13] hover:bg-[#A30A0E] text-white py-2.5 px-8 rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-lg cursor-pointer disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {isSaving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        ) : (
          <button
            onClick={handleStartEdit}
            className="flex items-center justify-center gap-2 bg-[#CD0D13] hover:bg-[#A30A0E] text-white py-2.5 px-6 rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-lg cursor-pointer self-start md:self-auto"
          >
            <Pencil className="w-4 h-4" />
            แก้ไขเวลาว่าง
          </button>
        )}
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

      {isEditing && (
        <p className="text-xs font-bold text-[#CD0D13]">
          โหมดแก้ไข: คลิกช่องเพื่อเลือก/ยกเลิกเวลาว่าง (คลิกค้างแล้วลากเพื่อเลือกหลายช่อง)
        </p>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* เดสก์ท็อป (md+): แถว = วัน, คอลัมน์ = ชั่วโมง */}
        <div className="hidden md:block overflow-x-auto">
          <div className={`min-w-[1000px] ${isEditing ? "select-none" : ""}`}>
            {/* หัวตาราง — เลขเวลาอยู่ที่ "เส้นแบ่งชั่วโมง" (หมุด) มีหมุดปิดท้าย 24:00
                เพื่อให้อ่านชัดว่าแท่งที่เต็มถึงช่อง 20:00 = ว่างถึง 21:00 */}
            <div className="flex bg-slate-50 border-b border-slate-200">
              <div className="w-[92px] shrink-0 py-3.5 px-4 text-[11px] font-bold uppercase tracking-wider text-slate-500">DAY</div>
              <div className="relative flex-1">
                {Array.from({ length: HOURS.length + 1 }, (_, i) => {
                  const hour = START_HOUR + i;
                  const transform =
                    i === 0 ? "translateY(-50%)" : i === HOURS.length ? "translate(-100%,-50%)" : "translate(-50%,-50%)";
                  return (
                    <span
                      key={hour}
                      className="absolute top-1/2 text-[10px] font-bold text-slate-400 tabular-nums whitespace-nowrap"
                      style={{ left: `${(i / HOURS.length) * 100}%`, transform }}
                    >
                      {hour}:00
                    </span>
                  );
                })}
              </div>
            </div>

            {/* แถวแต่ละวัน */}
            {DAYS.map((day, dayIdx) => (
              <div
                key={day.value}
                className={`grid items-center ${dayIdx !== DAYS.length - 1 ? "border-b border-slate-100" : ""}`}
                style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
              >
                <div className="py-1 px-4 text-xs font-extrabold text-slate-700">{day.label}</div>

                {HOURS.map((h) => {
                  const isSel = displayed.has(cellKey(day.value, h));
                  const prevSel = h > START_HOUR && displayed.has(cellKey(day.value, h - 1));
                  const nextSel = h < END_HOUR - 1 && displayed.has(cellKey(day.value, h + 1));
                  const roundLeft = isSel && !prevSel;
                  const roundRight = isSel && !nextSel;

                  if (isEditing) {
                    // โหมดแก้ไข: แต่ละช่องเป็น pill แยกกัน มีระยะห่างระหว่างช่อง
                    return (
                      <div key={h} className="px-0.5 py-1.5">
                        <div
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleCellMouseDown(day.value, h);
                          }}
                          onMouseEnter={() => handleCellMouseEnter(day.value, h)}
                          title={`${day.label} ${pad2(h)}:00-${pad2(h + 1)}:00`}
                          className={`h-8 rounded-full cursor-pointer transition-all ${
                            isSel
                              ? "bg-gradient-to-r from-[#E63946] to-[#CD0D13] shadow-sm"
                              : "bg-slate-50 border border-dashed border-slate-300 hover:border-[#E63946]/50 hover:bg-rose-50/40"
                          }`}
                        />
                      </div>
                    );
                  }

                  // โหมดดูอย่างเดียว: แท่งต่อเนื่อง (ช่องที่เลือกติดกันจะเชื่อมเป็นแท่งเดียว)
                  return (
                    <div
                      key={h}
                      title={isSel ? `${day.label} ${pad2(h)}:00-${pad2(h + 1)}:00` : undefined}
                      className={`h-10 flex items-center ${roundLeft ? "pl-1.5" : ""} ${roundRight ? "pr-1.5" : ""}`}
                    >
                      {isSel && (
                        <div
                          className={`h-8 w-full bg-gradient-to-r from-[#E63946] to-[#CD0D13] shadow-sm ${
                            roundLeft ? "rounded-l-full" : ""
                          } ${roundRight ? "rounded-r-full" : ""}`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* มือถือ (< md): สลับแกน — แถว = ชั่วโมง, คอลัมน์ = วัน (ไม่ต้องเลื่อนแนวนอน) */}
        <div className={`md:hidden ${isEditing ? "select-none" : ""}`}>
          {/* หัวตาราง */}
          <div
            className="grid bg-slate-50 border-b border-slate-200"
            style={{ gridTemplateColumns: MOBILE_GRID_COLUMNS }}
          >
            <div className="py-2.5 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">TIME</div>
            {DAYS.map((day) => (
              <div key={day.value} className="py-2.5 text-center text-[10px] font-bold text-slate-500">
                {day.label}
              </div>
            ))}
          </div>

          {/* แถวแต่ละชั่วโมง */}
          {HOURS.map((h, hIdx) => (
            <div
              key={h}
              className={`grid items-stretch ${hIdx !== HOURS.length - 1 ? "border-b border-slate-100" : ""}`}
              style={{ gridTemplateColumns: MOBILE_GRID_COLUMNS }}
            >
              <div className="py-1 px-2 flex items-center text-[11px] font-bold text-slate-600">{h}:00</div>

              {DAYS.map((day) => {
                const isSel = displayed.has(cellKey(day.value, h));
                const prevSel = h > START_HOUR && displayed.has(cellKey(day.value, h - 1));
                const nextSel = h < END_HOUR - 1 && displayed.has(cellKey(day.value, h + 1));
                const roundTop = isSel && !prevSel;
                const roundBottom = isSel && !nextSel;

                if (isEditing) {
                  // โหมดแก้ไข: แต่ละช่องเป็นปุ่มแยก แตะเพื่อเลือก/ยกเลิก
                  return (
                    <div key={day.value} className="px-1 py-0.5">
                      <div
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleCellMouseDown(day.value, h);
                        }}
                        onMouseEnter={() => handleCellMouseEnter(day.value, h)}
                        title={`${day.label} ${pad2(h)}:00-${pad2(h + 1)}:00`}
                        className={`h-9 rounded-lg cursor-pointer transition-all ${
                          isSel
                            ? "bg-gradient-to-b from-[#E63946] to-[#CD0D13] shadow-sm"
                            : "bg-slate-50 border border-dashed border-slate-300 hover:border-[#E63946]/50 hover:bg-rose-50/40"
                        }`}
                      />
                    </div>
                  );
                }

                // โหมดดูอย่างเดียว: แท่งต่อเนื่องแนวตั้ง (ชั่วโมงติดกันเชื่อมเป็นแท่งเดียว)
                return (
                  <div
                    key={day.value}
                    title={isSel ? `${day.label} ${pad2(h)}:00-${pad2(h + 1)}:00` : undefined}
                    className={`flex justify-center h-9 ${roundTop ? "pt-1" : ""} ${roundBottom ? "pb-1" : ""}`}
                  >
                    {isSel && (
                      <div
                        className={`w-7 h-full bg-gradient-to-b from-[#E63946] to-[#CD0D13] shadow-sm ${
                          roundTop ? "rounded-t-full" : ""
                        } ${roundBottom ? "rounded-b-full" : ""}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-5 text-xs text-slate-500">
        <span className="flex items-center gap-2">
          <span className="w-6 h-3.5 rounded-full bg-gradient-to-r from-[#E63946] to-[#CD0D13]" /> ว่าง
        </span>
        <span className="flex items-center gap-2">
          <span className="w-6 h-3.5 rounded-full bg-slate-100 ring-1 ring-slate-200" /> ไม่ว่าง
        </span>
        {!isEditing && (
          <span className="ml-auto text-slate-400 italic">โหมดดูอย่างเดียว — กด &quot;แก้ไขเวลาว่าง&quot; เพื่อแก้ไข</span>
        )}
      </div>
    </div>
  );
}
