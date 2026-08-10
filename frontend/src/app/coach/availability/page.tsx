"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, Clock, Save, Pencil, X } from "lucide-react";

import { fetchMyCoachProfile, fetchCoachAvailability, updateCoachAvailability } from "@/services/coachAPI";
import { AvailabilitySlot } from "@/types/coach";
import Toast from "@/components/Toast";

const DAYS: { value: string; label: string }[] = [
  { value: "Monday", label: "จันทร์" },
  { value: "Tuesday", label: "อังคาร" },
  { value: "Wednesday", label: "พุธ" },
  { value: "Thursday", label: "พฤหัสบดี" },
  { value: "Friday", label: "ศุกร์" },
  { value: "Saturday", label: "เสาร์" },
  { value: "Sunday", label: "อาทิตย์" },
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

const GRID_TEMPLATE_COLUMNS = `112px repeat(${HOURS.length}, minmax(56px, 1fr))`;

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
      console.error(err);
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
    <div className="max-w-7xl mx-auto space-y-8 animate-fadeIn">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-150 pb-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Clock className="w-8 h-8 text-[#CC0000]" />
            ตารางเวลาว่าง
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {isEditing
              ? "คลิก หรือคลิกค้างแล้วลาก เพื่อเลือกช่วงเวลาที่คุณสะดวกสอน (ทีละ 1 ชั่วโมง)"
              : "กดปุ่ม \"แก้ไขเวลาว่าง\" เพื่อเริ่มปรับตาราง แอดมินจะมอบหมายคาบสอนภายในช่วงเวลานี้เท่านั้น"}
          </p>
        </div>

        {isEditing ? (
          <div className="flex items-center gap-2.5 self-start md:self-auto">
            <button
              onClick={handleCancelEdit}
              disabled={isSaving}
              className="flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 py-2.5 px-5 rounded-xl text-sm font-bold transition-all cursor-pointer disabled:opacity-60"
            >
              <X className="w-4 h-4" />
              ยกเลิก
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center justify-center gap-2 bg-[#CD0D13] hover:bg-[#A30A0E] text-white py-2.5 px-5 rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-lg cursor-pointer disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {isSaving ? "กำลังบันทึก..." : "บันทึกตารางเวลาว่าง"}
            </button>
          </div>
        ) : (
          <button
            onClick={handleStartEdit}
            className="flex items-center justify-center gap-2 bg-[#CD0D13] hover:bg-[#A30A0E] text-white py-2.5 px-5 rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-lg cursor-pointer self-start md:self-auto"
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

      <div className="flex items-center gap-5 text-xs text-slate-500">
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-md bg-gradient-to-br from-[#4E92FF] to-[#2563EB] shadow-sm" /> ว่าง (เลือกแล้ว)
        </span>
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-md bg-slate-100 ring-1 ring-slate-200" /> ไม่ว่าง
        </span>
        {!isEditing && (
          <span className="ml-auto text-slate-400 italic">โหมดดูอย่างเดียว — กด &quot;แก้ไขเวลาว่าง&quot; เพื่อแก้ไข</span>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
        <div className="overflow-x-auto pb-1">
          <div
            className={`grid gap-1.5 min-w-[1050px] ${isEditing ? "select-none" : ""}`}
            style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
          >
            {/* หัวตาราง */}
            <div className="sticky left-0 z-10 bg-white" />
            {HOURS.map((h) => (
              <div key={h} className="text-center text-[11px] font-bold text-slate-500 pb-2">
                {pad2(h)}-{pad2(h + 1)}
              </div>
            ))}

            {/* แถวแต่ละวัน */}
            {DAYS.map((day) => (
              <React.Fragment key={day.value}>
                <div className="sticky left-0 z-10 bg-white flex items-center pr-3">
                  <span className="text-sm font-extrabold text-slate-700">{day.label}</span>
                </div>
                {HOURS.map((h) => {
                  const isSelected = displayed.has(cellKey(day.value, h));
                  return (
                    <div
                      key={h}
                      onMouseDown={(e) => {
                        if (!isEditing) return;
                        e.preventDefault();
                        handleCellMouseDown(day.value, h);
                      }}
                      onMouseEnter={() => handleCellMouseEnter(day.value, h)}
                      title={`${day.label} ${pad2(h)}:00-${pad2(h + 1)}:00`}
                      className={`h-12 rounded-lg transition-all ${isEditing ? "cursor-pointer" : "cursor-default"} ${
                        isSelected
                          ? "bg-gradient-to-br from-[#4E92FF] to-[#2563EB] shadow-sm"
                          : `bg-slate-100 ring-1 ring-slate-200/70 ${isEditing ? "hover:bg-slate-200" : ""}`
                      }`}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
