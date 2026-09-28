import React, { useMemo, useState, useEffect } from "react";
import { Trash2, Plus, UserCheck, Search, Check, MapPin } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import { FormError } from "@/components/admin/ManagementUI";
import { CoachListItem } from "@/services/coachAPI";
import { Court } from "@/services/courtAPI";
import { AvailabilitySlot, COACH_LEVEL_OPTIONS, COACH_LICENSE_OPTIONS } from "@/types/coach";
import { WeekSession, createWorkSchedule, deleteWorkSchedule } from "@/services/workScheduleAPI";
import { suggestedCoaches } from "@/lib/coachRatio";
import { courtLabel } from "@/lib/courtLabel";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  session: WeekSession | null;
  isPast: boolean; // คาบที่ผ่านมาแล้ว — ห้าม assign เพิ่ม
  coaches: CoachListItem[];
  courts: Court[]; // รายการสนาม (จาก API) — เลือกได้หรือเว้นว่าง (ไม่ระบุ)
  availByCoach: Map<number, Map<string, AvailabilitySlot[]>>;
  studentsPerCoach: number; // อัตราส่วนแนะนำ: โค้ช 1 : นักเรียนกี่คน
  onChanged: () => void;
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};


export function AssignCoachModal({ isOpen, onClose, session, isPast, coaches, courts, availByCoach, studentsPerCoach, onChanged }: Props) {
  // ตัวเลือกสนาม: เฉพาะสนามที่เปิดใช้งาน (SelectField มี placeholder ว่าง = ไม่ระบุ อยู่แล้ว)
  // value เป็น id — backend ตัดสินสนามซ้อนด้วย court_id ไม่ใช่ชื่อ
  const activeCourts = courts.filter((c) => c.is_active);
  const courtOptions = activeCourts.map((c) => ({ label: c.name, value: String(c.ID) }));
  const [selectedCoach, setSelectedCoach] = useState("");
  const [court, setCourt] = useState("");
  const [description, setDescription] = useState("");
  const [emergency, setEmergency] = useState(false); // โหมดฉุกเฉิน: ข้ามเช็คเวลาว่าง
  const [search, setSearch] = useState(""); // ค้นหาชื่อโค้ช
  const [formError, setFormError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null); // แถวโค้ชที่กำลังถามยืนยันถอน

  // รีเซ็ตฟอร์มทุกครั้งที่เปิด modal ใหม่
  useEffect(() => {
    if (!isOpen) return;
    setSelectedCoach("");
    setCourt("");
    setDescription("");
    setEmergency(false);
    setSearch("");
    setFormError(null);
    setConfirmRemoveId(null);
  }, [isOpen]);

  const assignedIds = useMemo(
    () => new Set((session?.assigned_coaches ?? []).map((a) => a.coach_id)),
    [session]
  );

  // โค้ชที่พักงาน (inactive) มอบหมายไม่ได้ กรองออกก่อนเสมอ (backend ก็บล็อกซ้ำอีกชั้น)
  const activeCoaches = useMemo(() => coaches.filter((c) => c.status !== "inactive"), [coaches]);

  // โค้ชที่ "ว่าง" ตรงเวลาคาบนี้ และยังไม่ถูก assign
  const availableCoaches = useMemo(() => {
    if (!session) return [];
    const start = toMin(session.start_time);
    const end = toMin(session.end_time);
    return activeCoaches.filter((c) => {
      if (assignedIds.has(c.id)) return false;
      const windows = availByCoach.get(c.id)?.get(session.day_of_week) ?? [];
      return windows.some((w) => toMin(w.start_time) <= start && toMin(w.end_time) >= end);
    });
  }, [session, activeCoaches, assignedIds, availByCoach]);

  // โหมดฉุกเฉิน: แสดงโค้ชทุกคน (ที่ยัง active) ที่ยังไม่ถูก assign — ไม่สนเวลาว่าง
  const baseCoaches = emergency ? activeCoaches.filter((c) => !assignedIds.has(c.id)) : availableCoaches;

  // กรองด้วยชื่อ (ค้นหา)
  const shownCoaches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return baseCoaches;
    return baseCoaches.filter((c) =>
      `${c.firstName} ${c.lastName} ${c.nickname ?? ""}`.toLowerCase().includes(term)
    );
  }, [baseCoaches, search]);

  const handleAdd = async () => {
    if (!session) return;
    setFormError(null);
    if (!selectedCoach) return setFormError("กรุณาเลือกโค้ช");
    // สนามเป็น optional — เว้นว่างได้ (ไม่ระบุสนาม)

    try {
      setIsBusy(true);
      await createWorkSchedule({
        coach_id: Number(selectedCoach),
        course_id: session.course_id,
        date: session.date,
        start_time: session.start_time,
        end_time: session.end_time,
        court_id: court ? Number(court) : undefined,
        court_number: activeCourts.find((c) => String(c.ID) === court)?.name ?? "",
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

  // ถอนจริง — ยืนยันด้วย UI inline ในแถวโค้ช (ไม่ใช้ window.confirm ที่หน้าตาเป็นของเบราว์เซอร์)
  const doRemove = async (workScheduleId: number) => {
    try {
      setIsBusy(true);
      await deleteWorkSchedule(workScheduleId);
      setConfirmRemoveId(null);
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
      maxWidth="max-w-2xl"
      footer={<Button variant="outline" onClick={onClose}>ปิด</Button>}
    >
      {session && (
        <div className="space-y-7">
          {formError && <FormError message={formError} />}

          {/* สรุปจำนวนนักเรียน (ยืนยัน/ทั้งหมด) + คำแนะนำจำนวนโค้ช */}
          {(() => {
            const suggested = suggestedCoaches(session.going_count, studentsPerCoach);
            const short = suggested - session.assigned_coaches.length;
            return (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <span className="inline-flex items-center gap-1.5 text-slate-600">
                  <UserCheck className="h-4 w-4 text-emerald-500" />
                  ยืนยันมาเรียน <span className="font-bold text-slate-800">{session.going_count}</span>
                  <span className="text-slate-400">/ {session.total_count} คน</span>
                </span>
                {suggested > 0 && (
                  <span className="text-slate-500">
                    แนะนำ <span className="font-bold text-slate-800">{suggested}</span> โค้ช
                    <span className="text-slate-400"> (1:{studentsPerCoach})</span>
                  </span>
                )}
                <span className="text-slate-500">
                  มอบหมายแล้ว <span className="font-bold text-slate-800">{session.assigned_coaches.length}</span>
                </span>
                {short > 0 && session.assigned_coaches.length > 0 && (
                  <span className="font-semibold text-amber-600">ควรเพิ่มอีก {short}</span>
                )}
              </div>
            );
          })()}

          {/* โค้ชที่สอนคาบนี้อยู่ — แสดงเฉพาะเมื่อมีโค้ชแล้ว */}
          {session.assigned_coaches.length > 0 && (
            <div>
              <p className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-[#CD0D13]" /> โค้ชที่สอนคาบนี้ ({session.assigned_coaches.length})
              </p>
              <div className="space-y-2.5">
                {session.assigned_coaches.map((a) => {
                  const confirming = confirmRemoveId === a.work_schedule_id;
                  return (
                    <div
                      key={a.work_schedule_id}
                      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5 transition-colors ${
                        confirming ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      <div className="min-w-0">
                        <span className="text-base font-semibold text-slate-800">{a.coach_name || `โค้ช #${a.coach_id}`}</span>
                        <span className="text-sm text-slate-400 ml-3">{courtLabel(a.court_number) || "ไม่ระบุสนาม"}</span>
                        {/* แถวฉุกเฉินไม่ผ่านกฎครบ ต้องเด่นพอให้แอดมินเห็นแล้วกดแก้ */}
                        {a.is_emergency && (
                          <p className="mt-1 text-xs font-semibold text-amber-700">
                            กรณีฉุกเฉิน{!a.court_number && " — ยังไม่ได้ระบุสนาม"}
                          </p>
                        )}
                      </div>

                      {!isPast && (
                        confirming ? (
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="hidden text-xs font-medium text-slate-500 sm:inline">ถอนออกจากคาบ?</span>
                            <button
                              onClick={() => setConfirmRemoveId(null)}
                              disabled={isBusy}
                              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-white cursor-pointer disabled:opacity-50"
                            >
                              ยกเลิก
                            </button>
                            <button
                              onClick={() => doRemove(a.work_schedule_id)}
                              disabled={isBusy}
                              className="rounded-lg bg-[#E63946] px-3 py-2 text-sm font-bold text-white hover:bg-[#d62839] cursor-pointer disabled:opacity-60"
                            >
                              {isBusy ? "กำลังถอน..." : "ยืนยันถอน"}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmRemoveId(a.work_schedule_id)}
                            disabled={isBusy}
                            className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-rose-50 hover:text-[#CD0D13] cursor-pointer disabled:opacity-50"
                            title="ถอนโค้ช"
                          >
                            <Trash2 className="w-4 h-4" /> ถอน
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* เพิ่มโค้ช — ซ่อนถ้าคาบผ่านไปแล้ว */}
          {isPast ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-400">
              คาบสอนนี้ผ่านไปแล้ว — มอบหมายเพิ่มไม่ได้
            </p>
          ) : (
            <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-[#CD0D13]" /> เลือกโค้ชที่จะมอบหมาย
                </p>
                <span className="text-xs text-slate-400">{emergency ? "แสดงทุกคน" : "เฉพาะที่ว่างเวลานี้"}</span>
              </div>

              {/* ค้นหาชื่อโค้ช */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหาชื่อโค้ช..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-slate-300"
                />
              </div>

              {/* รายชื่อโค้ช — คลิกเพื่อเลือก */}
              {shownCoaches.length === 0 ? (
                <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-700">
                  {search
                    ? "ไม่พบโค้ชตามคำค้น"
                    : emergency
                    ? "ไม่มีโค้ชที่มอบหมายได้"
                    : "ไม่มีโค้ชว่างตรงเวลานี้ — เปิด “กรณีฉุกเฉิน” ด้านล่างเพื่อแสดงทุกคน"}
                </p>
              ) : (
                <>
                  <p className="text-xs text-slate-400">แตะที่ชื่อโค้ชเพื่อเลือก แล้วกด &quot;มอบหมายโค้ชคนนี้&quot;</p>
                  <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {shownCoaches.map((c) => {
                    const active = selectedCoach === String(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCoach(active ? "" : String(c.id))}
                        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                          active ? "border-[#E63946] bg-rose-50 ring-1 ring-[#E63946]" : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {c.profile_picture ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.profile_picture} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
                        ) : (
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#E63946] to-[#CC0000] text-xs font-bold text-white">
                            {(c.firstName?.[0] || c.nickname?.[0] || "C").toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-slate-800 truncate">
                            {c.firstName} {c.lastName}
                            {c.nickname && <span className="text-xs font-normal text-slate-400"> ({c.nickname})</span>}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {c.specialization && (
                              <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">{c.specialization}</span>
                            )}
                            {c.coach_license && (
                              <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">{c.coach_license}</span>
                            )}
                          </div>
                        </div>
                        {active && <Check className="h-5 w-5 shrink-0 text-[#E63946]" />}
                      </button>
                    );
                  })}
                  </div>
                </>
              )}

              {/* สนาม + รายละเอียด (ไม่บังคับ) */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    value={court}
                    onChange={(e) => setCourt(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-slate-300 cursor-pointer"
                  >
                    <option value="">— ไม่ระบุสนาม —</option>
                    {courtOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="รายละเอียด (ไม่บังคับ)"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-sm outline-none focus:border-slate-300"
                />
              </div>

              {/* โหมดฉุกเฉิน — เล็ก อยู่ล่าง */}
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={emergency}
                  onChange={(e) => { setEmergency(e.target.checked); setSelectedCoach(""); }}
                  className="w-4 h-4 accent-[#CD0D13] cursor-pointer"
                />
                กรณีฉุกเฉิน: แสดงโค้ชทุกคน (มอบหมายได้แม้ไม่ว่าง)
              </label>

              <Button
                variant="primary"
                onClick={handleAdd}
                disabled={isBusy || !selectedCoach}
                className="w-full bg-[#E63946] hover:bg-[#d62839] py-3 text-base disabled:opacity-50"
              >
                {isBusy ? "กำลังบันทึก..." : "มอบหมายโค้ชคนนี้"}
              </Button>
            </div>
          )}

          <p className="text-xs text-slate-400 text-center">
            ระบบตรวจเวลาชนและสนามซ้ำเสมอ (แม้โหมดฉุกเฉิน) — 1 คาบมอบหมายได้หลายโค้ช
          </p>
        </div>
      )}
    </Modal>
  );
}
