"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, Clock, Plus, Trash2, Save } from "lucide-react";

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
  { value: "Sunday", label: "อาทิตย์" }
];

type SlotRow = { start_time: string; end_time: string };

export default function CoachAvailabilityPage() {
  const router = useRouter();

  const [coachId, setCoachId] = useState<number | null>(null);
  const [slotsByDay, setSlotsByDay] = useState<Record<string, SlotRow[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const triggerToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const groupByDay = (list: AvailabilitySlot[]): Record<string, SlotRow[]> => {
    const grouped: Record<string, SlotRow[]> = {};
    for (const day of DAYS) grouped[day.value] = [];
    for (const item of list) {
      if (!grouped[item.day_of_week]) grouped[item.day_of_week] = [];
      grouped[item.day_of_week].push({ start_time: item.start_time, end_time: item.end_time });
    }
    return grouped;
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
        setSlotsByDay(groupByDay(availabilityData));
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

  const handleAddSlot = (day: string) => {
    setSlotsByDay(prev => ({
      ...prev,
      [day]: [...(prev[day] || []), { start_time: "09:00", end_time: "12:00" }]
    }));
  };

  const handleRemoveSlot = (day: string, index: number) => {
    setSlotsByDay(prev => ({
      ...prev,
      [day]: prev[day].filter((_, i) => i !== index)
    }));
  };

  const handleSlotChange = (day: string, index: number, field: "start_time" | "end_time", value: string) => {
    setSlotsByDay(prev => ({
      ...prev,
      [day]: prev[day].map((slot, i) => (i === index ? { ...slot, [field]: value } : slot))
    }));
  };

  const handleSave = async () => {
    if (!coachId) return;

    const flattened: AvailabilitySlot[] = [];
    for (const day of DAYS) {
      for (const slot of slotsByDay[day.value] || []) {
        flattened.push({ day_of_week: day.value, start_time: slot.start_time, end_time: slot.end_time });
      }
    }

    if (flattened.length === 0) {
      triggerToast("กรุณาเพิ่มช่วงเวลาว่างอย่างน้อย 1 ช่วง", "error");
      return;
    }

    setIsSaving(true);
    try {
      const token = localStorage.getItem("token") || "";
      const saved = await updateCoachAvailability(coachId, flattened, token);
      setSlotsByDay(groupByDay(saved));
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
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-150 pb-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Clock className="w-8 h-8 text-[#CC0000]" />
            จัดการเวลาว่าง
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            กำหนดช่วงเวลาที่คุณสะดวกสอนในแต่ละวัน แอดมินจะมอบหมายคาบสอนภายในช่วงเวลานี้เท่านั้น
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center justify-center gap-2 bg-[#CD0D13] hover:bg-[#A30A0E] text-white py-2.5 px-5 rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-lg cursor-pointer self-start md:self-auto disabled:opacity-60"
        >
          <Save className="w-4 h-4" />
          {isSaving ? "กำลังบันทึก..." : "บันทึกตารางเวลาว่าง"}
        </button>
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

      <div className="space-y-4">
        {DAYS.map(day => (
          <div key={day.value} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-800">{day.label}</h3>
              <button
                onClick={() => handleAddSlot(day.value)}
                className="flex items-center gap-1 text-[#CC0000] text-xs font-bold hover:opacity-75 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                เพิ่มช่วงเวลา
              </button>
            </div>

            {(slotsByDay[day.value] || []).length === 0 ? (
              <p className="text-xs text-slate-400">ไม่ได้ตั้งเวลาว่างในวันนี้</p>
            ) : (
              <div className="space-y-2">
                {(slotsByDay[day.value] || []).map((slot, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <input
                      type="time"
                      value={slot.start_time}
                      onChange={(e) => handleSlotChange(day.value, index, "start_time", e.target.value)}
                      className="px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-xs outline-none focus:bg-white text-slate-800"
                    />
                    <span className="text-slate-400 text-xs">ถึง</span>
                    <input
                      type="time"
                      value={slot.end_time}
                      onChange={(e) => handleSlotChange(day.value, index, "end_time", e.target.value)}
                      className="px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-xs outline-none focus:bg-white text-slate-800"
                    />
                    <button
                      onClick={() => handleRemoveSlot(day.value, index)}
                      className="p-1.5 rounded-full hover:bg-rose-50 text-slate-400 hover:text-[#CD0D13] transition-colors cursor-pointer"
                      title="ลบช่วงเวลานี้"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
