import React, { useMemo, useState, useEffect } from "react";
import { Trash2, Plus, UserCheck, CalendarClock, AlertTriangle } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import InputField from "@/components/InputField";
import SelectField from "@/components/SelectField";
import { FormError } from "@/components/admin/ManagementUI";
import { CoachListItem } from "@/services/coachAPI";
import { AvailabilitySlot, COACH_LEVEL_OPTIONS, COACH_LICENSE_OPTIONS } from "@/types/coach";
import { WeekSession, createWorkSchedule, deleteWorkSchedule } from "@/services/workScheduleAPI";

const COURT_OPTIONS = Array.from({ length: 8 }, (_, i) => ({ label: `สนาม ${i + 1}`, value: String(i + 1) }));

interface Props {
  isOpen: boolean;
  onClose: () => void;
  session: WeekSession | null;
  isPast: boolean; // คาบที่ผ่านมาแล้ว — ห้าม assign เพิ่ม
  coaches: CoachListItem[];
  availByCoach: Map<number, Map<string, AvailabilitySlot[]>>;
  onChanged: () => void;
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function AssignCoachModal({ isOpen, onClose, session, isPast, coaches, availByCoach, onChanged }: Props) {
  const [selectedCoach, setSelectedCoach] = useState("");
  const [court, setCourt] = useState("");
  const [description, setDescription] = useState("");
  const [emergency, setEmergency] = useState(false); // โหมดฉุกเฉิน: ข้ามเช็คเวลาว่าง
  const [levelFilter, setLevelFilter] = useState(""); // กรองตามระดับฝีมือ
  const [licenseFilter, setLicenseFilter] = useState(""); // กรองตามใบรับรอง
  const [formError, setFormError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // รีเซ็ตฟอร์มทุกครั้งที่เปิด modal ใหม่
  useEffect(() => {
    if (!isOpen) return;
    setSelectedCoach("");
    setCourt("");
    setDescription("");
    setEmergency(false);
    setLevelFilter("");
    setLicenseFilter("");
    setFormError(null);
  }, [isOpen]);

  const assignedIds = useMemo(
    () => new Set((session?.assigned_coaches ?? []).map((a) => a.coach_id)),
    [session]
  );

  // โค้ชที่ "ว่าง" ตรงเวลาคาบนี้ และยังไม่ถูก assign
  const availableCoaches = useMemo(() => {
    if (!session) return [];
    const start = toMin(session.start_time);
    const end = toMin(session.end_time);
    return coaches.filter((c) => {
      if (assignedIds.has(c.id)) return false;
      const windows = availByCoach.get(c.id)?.get(session.day_of_week) ?? [];
      return windows.some((w) => toMin(w.start_time) <= start && toMin(w.end_time) >= end);
    });
  }, [session, coaches, assignedIds, availByCoach]);

  // โหมดฉุกเฉิน: แสดงโค้ชทุกคนที่ยังไม่ถูก assign (ไม่สนเวลาว่าง)
  const baseCoaches = emergency ? coaches.filter((c) => !assignedIds.has(c.id)) : availableCoaches;

  // กรองตามระดับฝีมือ + ใบรับรอง
  const shownCoaches = baseCoaches.filter(
    (c) => (!levelFilter || c.specialization === levelFilter) && (!licenseFilter || c.coach_license === licenseFilter)
  );

  const coachOptions = shownCoaches.map((c) => ({
    label: `${c.firstName} ${c.lastName}${c.nickname ? ` (${c.nickname})` : ""}${c.specialization ? ` · ${c.specialization}` : ""}`,
    value: String(c.id),
  }));

  const handleAdd = async () => {
    if (!session) return;
    setFormError(null);
    if (!selectedCoach) return setFormError("กรุณาเลือกโค้ช");
    if (!court) return setFormError("กรุณาเลือกสนาม");

    try {
      setIsBusy(true);
      await createWorkSchedule({
        coach_id: Number(selectedCoach),
        course_id: session.course_id,
        date: session.date,
        start_time: session.start_time,
        end_time: session.end_time,
        court_number: court,
        description: description.trim() || session.course_name,
        ignore_availability: emergency,
        package_id: session.package_id,
        package_schedule_id: session.package_schedule_id,
      });
      setSelectedCoach("");
      setCourt("");
      setDescription("");
      onChanged();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "มอบหมายโค้ชไม่สำเร็จ");
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemove = async (workScheduleId: number) => {
    if (!confirm("ถอนโค้ชคนนี้ออกจากคาบสอนนี้ใช่หรือไม่?")) return;
    try {
      setIsBusy(true);
      await deleteWorkSchedule(workScheduleId);
      onChanged();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "ถอนโค้ชไม่สำเร็จ");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="มอบหมายโค้ชให้คาบสอน"
      subtitle={session ? `${session.course_name} · ${session.date} · ${session.start_time}-${session.end_time}` : undefined}
      maxWidth="max-w-lg"
      footer={<Button variant="outline" onClick={onClose}>ปิด</Button>}
    >
      {session && (
        <div className="space-y-5">
          {formError && <FormError message={formError} />}

          {/* โค้ชที่สอนคาบนี้อยู่ */}
          <div>
            <p className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-[#CD0D13]" /> โค้ชที่สอนคาบนี้ ({session.assigned_coaches.length})
            </p>
            {session.assigned_coaches.length === 0 ? (
              <p className="text-xs text-slate-400 rounded-lg border border-dashed border-slate-200 py-3 text-center">
                ยังไม่มีโค้ชรับผิดชอบคาบนี้
              </p>
            ) : (
              <div className="space-y-2">
                {session.assigned_coaches.map((a) => (
                  <div key={a.work_schedule_id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-sm">
                      <span className="font-semibold text-slate-800">{a.coach_name || `โค้ช #${a.coach_id}`}</span>
                      <span className="text-xs text-slate-400 ml-2">สนาม {a.court_number}</span>
                    </div>
                    {!isPast && (
                      <button
                        onClick={() => handleRemove(a.work_schedule_id)}
                        disabled={isBusy}
                        className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-[#CD0D13] cursor-pointer disabled:opacity-50"
                        title="ถอนโค้ช"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* เพิ่มโค้ช — ซ่อนถ้าคาบผ่านไปแล้ว */}
          {isPast ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center text-xs text-slate-400">
              คาบสอนนี้ผ่านไปแล้ว — มอบหมายเพิ่มไม่ได้
            </p>
          ) : (
            <div className="rounded-xl border border-slate-200 p-3 space-y-3">
              <p className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-[#CD0D13]" /> เพิ่มโค้ช {emergency ? "(โหมดฉุกเฉิน: แสดงทุกคน)" : "(แสดงเฉพาะคนที่ว่างตรงเวลานี้)"}
              </p>

              {/* toggle โหมดฉุกเฉิน */}
              <label className="flex items-start gap-2 cursor-pointer rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                <input
                  type="checkbox"
                  checked={emergency}
                  onChange={(e) => { setEmergency(e.target.checked); setSelectedCoach(""); }}
                  className="mt-0.5 accent-[#CD0D13] cursor-pointer"
                />
                <span className="text-[11px] text-amber-700 leading-snug">
                  <span className="font-bold flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> โหมดฉุกเฉิน</span>
                  ข้ามการเช็คเวลาว่าง — แสดงโค้ชทุกคนและมอบหมายได้แม้โค้ชไม่ว่าง (ใช้เมื่อไม่มีใครว่างตรงเวลานี้จริงๆ)
                </span>
              </label>

              {/* ตัวกรองโค้ช: ระดับฝีมือ + ใบรับรอง (ค่าเริ่มต้น = ทั้งหมด) */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700">กรองระดับฝีมือ</label>
                  <select
                    value={levelFilter}
                    onChange={(e) => { setLevelFilter(e.target.value); setSelectedCoach(""); }}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white text-gray-900 focus:outline-none focus:border-orange-primary cursor-pointer"
                  >
                    <option value="">ทุกระดับ</option>
                    {COACH_LEVEL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700">กรองใบรับรอง</label>
                  <select
                    value={licenseFilter}
                    onChange={(e) => { setLicenseFilter(e.target.value); setSelectedCoach(""); }}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white text-gray-900 focus:outline-none focus:border-orange-primary cursor-pointer"
                  >
                    <option value="">ทั้งหมด</option>
                    {COACH_LICENSE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {coachOptions.length === 0 ? (
                <p className="text-[11px] text-amber-600 flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5" />
                  {levelFilter || licenseFilter
                    ? "ไม่มีโค้ชตรงตามตัวกรอง — ลองปรับตัวกรอง"
                    : "ไม่มีโค้ชที่ว่างตรงเวลานี้ — เปิดโหมดฉุกเฉินด้านบนเพื่อมอบหมายได้"}
                </p>
              ) : (
                <>
                  <SelectField label="โค้ช" options={coachOptions} value={selectedCoach} onChange={(e) => setSelectedCoach(e.target.value)} />
                  <SelectField label="สนาม" options={COURT_OPTIONS} value={court} onChange={(e) => setCourt(e.target.value)} />
                  <InputField label="รายละเอียด (ไม่บังคับ)" value={description} onChange={(e) => setDescription(e.target.value)} />
                  <Button variant="primary" onClick={handleAdd} disabled={isBusy} className="w-full bg-[#E63946] hover:bg-[#d62839]">
                    {isBusy ? "กำลังบันทึก..." : "มอบหมายโค้ชคนนี้"}
                  </Button>
                </>
              )}
            </div>
          )}

          <p className="text-xs text-slate-400">
            ระบบตรวจเวลาชนคาบอื่นและสนามซ้ำเสมอ (แม้โหมดฉุกเฉิน) — 1 คาบมอบหมายได้หลายโค้ช
          </p>
        </div>
      )}
    </Modal>
  );
}
