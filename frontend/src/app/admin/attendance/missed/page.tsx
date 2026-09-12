"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CalendarDays, Clock, Loader2, ShieldAlert } from "lucide-react";

import { fetchMissedClasses, resolveMissedClass } from "@/services/attendanceAPI";
import type { AttendanceStatus, MissedClass } from "@/types/attendance";
import { COACH_STATUS_LABEL, COACH_STATUS_NOTE } from "@/types/attendance";

// ─── หน้านี้มีไว้ทำอะไร ───────────────────────────────────────────────────────
//
// ค่าจ้างของโค้ชนับจากคาบที่ "มีรอบเช็คชื่อปิดแล้ว" เท่านั้น
// แต่รอบเช็คชื่อเปิดได้เฉพาะตอนอยู่ในคาบจริง (±30 นาที) และเปิดย้อนหลังไม่ได้
//
// ถ้าแอดมินลืมเปิดรอบ เน็ตล่ม หรือมาสายเกิน 30 นาที คาบนั้นจะไม่ถูกนับเป็นเงิน
// ตลอดไป โดยไม่มี error ไม่มีคำเตือน — โค้ชสอนจริงแต่ได้ 0 บาทแบบเงียบ ๆ
//
// หน้านี้คือทางเดียวที่ทำให้เรื่องนั้นมองเห็นได้ และแก้ได้
// (ฝั่ง backend: services/coach_missed_class.go)

function formatDay(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function classKey(item: MissedClass) {
  return `${item.course_id}|${item.date}|${item.start_time}|${item.end_time}`;
}

function coachName(c: { full_name: string; nickname: string }) {
  return c.nickname ? `${c.full_name} (${c.nickname})` : c.full_name || "ไม่ทราบชื่อ";
}

export default function MissedClassesPage() {
  const [items, setItems] = useState<MissedClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // ⚠️ แยก error ของการโหลด ออกจาก error ของการกดปุ่ม โดยตั้งใจ
  //
  // เดิมใช้ตัวแปรเดียวกัน แล้วตอนกดไม่ผ่านโค้ดจะ set error แล้วสั่งโหลดใหม่
  // ตัวโหลดก็เคลียร์ error เมื่อสำเร็จ → ข้อความที่บอกสาเหตุ "แว้บแล้วหาย"
  // ผู้ใช้เห็นไม่ทันว่ากดไม่ได้เพราะอะไร แล้วก็กดวนอยู่อย่างนั้น
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // คำตัดสินที่แอดมินเลือกไว้ แยกตามคลาส → โค้ช
  //
  // ค่าเริ่มต้นเป็น "มาสอน" เพราะคาบเหล่านี้ถูกมอบหมายไว้จริงและตามปกติโค้ชก็มาสอน
  // สิ่งที่หายไปคือรอบเช็คชื่อ ไม่ใช่ตัวโค้ช — ตั้งค่าเริ่มเป็น "ไม่มาสอน"
  // จะกลายเป็นการเดาในทางที่ตัดเงินคนที่ทำงานจริง
  const [decisions, setDecisions] = useState<Record<string, Record<number, AttendanceStatus>>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // โหลดผ่าน refreshTick แทนการเรียกฟังก์ชันตรง ๆ ใน effect
  // (แพทเทิร์นเดียวกับหน้าเช็คชื่อ — เขียน state ทั้งหมดหลัง await เท่านั้น)
  const [refreshTick, setRefreshTick] = useState(0);
  const reload = useCallback(() => setRefreshTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await fetchMissedClasses();
        if (cancelled) return;
        setItems(data);
        setDecisions(
          Object.fromEntries(
            data.map((item) => [
              classKey(item),
              Object.fromEntries(
                item.coaches.map((c) => [c.coach_id, "present" as AttendanceStatus]),
              ),
            ]),
          ),
        );
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "โหลดรายการไม่สำเร็จ");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const totalCoachSlots = useMemo(
    () => items.reduce((sum, item) => sum + item.coaches.length, 0),
    [items],
  );

  function setDecision(item: MissedClass, coachId: number, status: AttendanceStatus) {
    const key = classKey(item);
    setDecisions((prev) => ({ ...prev, [key]: { ...prev[key], [coachId]: status } }));
  }

  async function handleResolve(item: MissedClass) {
    const key = classKey(item);
    const chosen = decisions[key] ?? {};

    // ส่งครบทุกคนเสมอ — backend ปฏิเสธถ้าขาด และคนที่ตกหล่นจะได้เงินโดยไม่มีใครตัดสิน
    const coaches = item.coaches.map((c) => ({
      coach_id: c.coach_id,
      status: chosen[c.coach_id] ?? ("present" as AttendanceStatus),
    }));

    setSavingKey(key);
    setNotice(null);
    setActionError(null);
    try {
      const result = await resolveMissedClass(item.work_schedule_id, coaches);
      const paid = result.present_coach_ids.length;
      const unpaid = result.absent_coach_ids.length;
      setNotice(
        `บันทึกคาบวันที่ ${formatDay(item.date)} เวลา ${item.start_time}-${item.end_time} แล้ว · ` +
          `นับค่าจ้างให้ ${paid} คน` +
          (unpaid > 0 ? ` · ไม่นับให้ ${unpaid} คน` : ""),
      );
      setItems((prev) => prev.filter((x) => classKey(x) !== key));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      // รายการอาจถูกคนอื่นเคลียร์ไปแล้ว ดึงใหม่ให้เห็นสถานะจริง
      // (สาเหตุอยู่ใน actionError จึงไม่ถูกตัวโหลดล้างทิ้ง)
      reload();
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/admin/attendance"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-300 text-gray-600 transition hover:bg-gray-50"
          aria-label="กลับไปหน้าเช็คชื่อ"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">คาบที่ยังไม่มีรอบเช็คชื่อ</h1>
          <p className="text-sm text-gray-500">
            คาบที่มอบหมายโค้ชไว้ ผ่านวันมาแล้ว แต่ไม่มีรอบเช็คชื่อ — ยังไม่ถูกนับเป็นค่าจ้าง
          </p>
        </div>
      </div>

      <div className="mb-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">ทุกคาบในหน้านี้คือเงินที่โค้ชยังไม่ได้รับ</p>
          <p>
            การกดยืนยันจะสร้างรอบเช็คชื่อย้อนหลังและบันทึกว่าโค้ชคนไหนมาสอนบ้าง
            คนที่บันทึกว่ามาสอนจะถูกนับค่าจ้างทันที — ตรวจให้แน่ใจก่อนกด
          </p>
          <p className="text-amber-800">
            ประวัติของนักเรียนจะไม่ถูกแตะเลย เพราะคาบนี้ไม่เคยมีการเช็คชื่อเกิดขึ้นจริง
          </p>
        </div>
      </div>

      {notice && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </div>
      )}
      {actionError && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="shrink-0 font-medium text-red-800 underline"
          >
            ปิด
          </button>
        </div>
      )}
      {loadError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          กำลังโหลด...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <p className="font-medium text-gray-900">ไม่มีคาบค้างอยู่</p>
          <p className="mt-1 text-sm text-gray-500">
            ทุกคาบที่มอบหมายโค้ชไว้มีรอบเช็คชื่อครบแล้ว
          </p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-gray-600">
            ค้างอยู่ <span className="font-semibold text-gray-900">{items.length}</span> คลาส
            รวม <span className="font-semibold text-gray-900">{totalCoachSlots}</span> คาบของโค้ช
          </p>

          <div className="space-y-4">
            {items.map((item) => {
              const key = classKey(item);
              const chosen = decisions[key] ?? {};
              const isSaving = savingKey === key;

              return (
                <div key={key} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-semibold text-gray-900">
                      {item.course_name || `คอร์ส #${item.course_id}`}
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                      <CalendarDays className="h-4 w-4" />
                      {formatDay(item.date)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                      <Clock className="h-4 w-4" />
                      {item.start_time}-{item.end_time}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {item.coaches.map((coach) => {
                      const status = chosen[coach.coach_id] ?? "present";
                      return (
                        <div
                          key={coach.coach_id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-900">
                              {coachName(coach)}
                              {coach.is_emergency && (
                                <span className="ml-2 inline-flex items-center gap-1 rounded bg-orange-100 px-1.5 py-0.5 text-xs font-normal text-orange-700">
                                  <ShieldAlert className="h-3 w-3" />
                                  คาบฉุกเฉิน
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500">{COACH_STATUS_NOTE[status]}</p>
                          </div>

                          <div className="flex shrink-0 gap-1 rounded-lg border border-gray-300 bg-white p-0.5">
                            {(["present", "absent"] as AttendanceStatus[]).map((option) => (
                              <button
                                key={option}
                                type="button"
                                disabled={isSaving}
                                onClick={() => setDecision(item, coach.coach_id, option)}
                                className={`min-h-9 rounded-md px-3 text-sm font-medium transition disabled:opacity-50 ${
                                  status === option
                                    ? option === "present"
                                      ? "bg-green-600 text-white"
                                      : "bg-red-600 text-white"
                                    : "text-gray-600 hover:bg-gray-100"
                                }`}
                              >
                                {COACH_STATUS_LABEL[option]}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => void handleResolve(item)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-2 font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
                    >
                      {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                      ยืนยันและบันทึกค่าจ้าง
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
