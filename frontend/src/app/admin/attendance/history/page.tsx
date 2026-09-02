"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Pencil,
  Search,
  ArrowLeft,
  CalendarDays,
  Clock,
  ChevronDown,
} from "lucide-react";

import { fetchHistory, updateAttendanceStatus } from "@/services/attendanceAPI";
import { fetchAllCourses } from "@/services/courseAPI";
import type { AttendanceHistoryItem, AttendanceStatus } from "@/types/attendance";
import {
  STATUS_LABEL,
  STATUS_TONE,
  statusLabel,
  statusTone,
  METHOD_LABEL,
  OFF_SCHEDULE_LABEL,
  OFF_SCHEDULE_TONE,
} from "@/types/attendance";
import type { CourseDTO } from "@/types/course";

import EditStatusModal from "../components/EditStatusModal";


function todayISO() {
  // ใช้เวลาของเครื่องแอดมินซึ่งอยู่ที่สนาม ตรงกับวันที่ backend บันทึกไว้
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const STATUS_ORDER: AttendanceStatus[] = ["present", "absent"];

function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── การจัดกลุ่มเป็น "รอบ" ───────────────────────────────────────────────────

interface Round {
  key: string;
  courseName: string;
  dateISO: string;
  startTime?: string;
  endTime?: string;
  counts: Record<AttendanceStatus, number>;
  offScheduleCount: number;
  items: AttendanceHistoryItem[];
}

// backend ส่งมาเรียง check_in_time DESC อยู่แล้ว ไล่ตามลำดับที่ได้มาก็จะได้
// รอบที่มีคนเช็คล่าสุดขึ้นก่อนเอง ไม่ต้องเรียงใหม่
function groupIntoRounds(items: AttendanceHistoryItem[]): Round[] {
  const byKey = new Map<string, Round>();

  for (const item of items) {
    // แถวที่ session_id เป็น null แยกเป็นกลุ่มต่อคอร์ส และใช้ check_in_time
    // แทน session_date เพราะ session_date ของแถวพวกนี้เป็นค่าศูนย์ของ Go (ปี 0001)
    const hasSession = item.session_id !== null;
    const key = hasSession ? `s${item.session_id}` : `n:${item.course_name}`;

    let round = byKey.get(key);
    if (!round) {
      round = {
        key,
        courseName: item.course_name || "ไม่ทราบคอร์ส",
        dateISO: hasSession ? item.session_date : item.check_in_time,
        startTime: item.schedule_start_time,
        endTime: item.schedule_end_time,
        counts: { present: 0, absent: 0 },
        offScheduleCount: 0,
        items: [],
      };
      byKey.set(key, round);
    }

    if (item.status in round.counts) round.counts[item.status] += 1;
    if (item.is_off_schedule) round.offScheduleCount += 1;
    round.items.push(item);
  }

  return [...byKey.values()];
}

export default function AttendanceHistoryPage() {
  const [date, setDate] = useState(todayISO());
  const [courseId, setCourseId] = useState<number>(0);
  const [courses, setCourses] = useState<CourseDTO[]>([]);

  const [items, setItems] = useState<AttendanceHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<AttendanceHistoryItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // null = ยังไม่ได้กดพับ/กางอะไรเลย ให้กางรอบแรกไว้ให้
  // (ใช้ null แทนการ setState ตอนข้อมูลมาถึง ซึ่งผิดกฎ react-hooks/set-state-in-effect)
  const [openKeys, setOpenKeys] = useState<Set<string> | null>(null);

  useEffect(() => {
    fetchAllCourses()
      .then(setCourses)
      .catch(() => {
        // ตัวกรองคอร์สโหลดไม่ได้ก็ยังดูประวัติตามวันได้ ไม่ต้องขึ้น error
      });
  }, []);


  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await fetchHistory({
          date: date || undefined,
          courseId: courseId || undefined,
        });
        if (cancelled) return;
        setItems(data);
        setError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "ไม่สามารถโหลดประวัติได้");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [date, courseId, refreshTick]);

  const rounds = useMemo(() => groupIntoRounds(items), [items]);

  // เปลี่ยนตัวกรองแล้วคีย์เดิมจะไม่ตรงกับรอบชุดใหม่ ถ้าไม่ล้างจะพับหมดทุกอัน
  const resetOpenState = () => setOpenKeys(null);

  const load = useCallback(() => {
    setIsLoading(true);
    setOpenKeys(null);
    setRefreshTick((t) => t + 1);
  }, []);

  const isOpen = (key: string, index: number) =>
    openKeys === null ? index === 0 : openKeys.has(key);

  const toggleRound = (key: string) => {
    setOpenKeys((prev) => {
      // ตอนยังเป็น null รอบแรกกางอยู่บนจอ ต้อง seed จากสถานะที่ตาเห็นจริง
      // ไม่งั้นกดพับรอบแรกแล้วจะไม่มีอะไรเกิดขึ้น
      const base = prev ?? new Set(rounds.length > 0 ? [rounds[0].key] : []);

      const next = new Set(base);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async (status: AttendanceStatus, remarks: string) => {
    if (!editing) return;

    setIsSaving(true);
    try {
      const result = await updateAttendanceStatus(editing.attendance_id, status, remarks);
      const note =
        result.quota_delta === 1
          ? "คืนโควตา 1 ครั้ง"
          : result.quota_delta === -1
            ? "หักโควตา 1 ครั้ง"
            : "โควตาไม่เปลี่ยน";
      alert(`แก้สถานะเรียบร้อย — ${note} (เหลือ ${result.remaining_sessions} ครั้ง)`);
      setEditing(null);
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถแก้สถานะได้");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <Link
        href="/admin/attendance"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" />
        กลับไปหน้าเช็คชื่อ
      </Link>

      <div className="hidden sm:block">
        <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">ประวัติการเช็คชื่อ</h1>
        <p className="mt-1 text-gray-500">
          เลือกรอบเพื่อดูรายชื่อ — แก้สถานะเป็น &quot;ลา&quot; ได้ที่นี่ โควตาจะถูกคืนให้ทันที
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 items-end gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">วันที่</label>
          <div className="relative mt-1">
            <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => {
                resetOpenState();
                setDate(e.target.value);
              }}
              className="w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-3 text-gray-900 outline-none transition focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20"
            />
          </div>
        </div>

        <div className="sm:max-w-xs">
          <label className="block text-sm font-medium text-gray-700">คอร์ส</label>
          <select
            value={courseId}
            onChange={(e) => {
              resetOpenState();
              setCourseId(Number(e.target.value));
            }}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-gray-900 outline-none transition focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20"
          >
            <option value={0}>ทุกคอร์ส</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.course_name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={load}
          disabled={isLoading}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#CC0000] px-5 py-2.5 font-semibold text-white transition hover:bg-[#A30A0E] disabled:opacity-60"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          ค้นหา
        </button>
      </div>

      {error && <div className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}

      {!isLoading && rounds.length === 0 && (
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <CalendarDays className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-4 text-gray-500">ไม่มีรอบเช็คชื่อในวันและคอร์สที่เลือก</p>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {rounds.map((round, index) => {
          const open = isOpen(round.key, index);
          const total = round.items.length;

          return (
            <div
              key={round.key}
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
            >
              {/* ── หัวรอบ ── */}
              <button
                onClick={() => toggleRound(round.key)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-gray-50"
              >
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${
                    open ? "rotate-180" : ""
                  }`}
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-gray-900">{round.courseName}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                    <span>{formatDay(round.dateISO)}</span>
                    {round.startTime && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {round.startTime} – {round.endTime}
                      </span>
                    )}
                    <span>{total} คน</span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {STATUS_ORDER.filter((st) => round.counts[st] > 0).map((st) => (
                    <span
                      key={st}
                      className={`whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-medium ${STATUS_TONE[st]}`}
                    >
                      {STATUS_LABEL[st]} {round.counts[st]}
                    </span>
                  ))}
                  {round.offScheduleCount > 0 && (
                    <span
                      className={`whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-medium ${OFF_SCHEDULE_TONE}`}
                    >
                      {OFF_SCHEDULE_LABEL} {round.offScheduleCount}
                    </span>
                  )}
                </div>
              </button>

              {/* ── รายชื่อในรอบ ── */}
              {open && (
                <div className="border-t border-gray-200">
                  {/* มือถือ: การ์ดต่อคน */}
                  <ul className="divide-y divide-gray-100 lg:hidden">
                    {round.items.map((item) => (
                      <li key={item.attendance_id} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900">
                              {item.full_name.trim() || "ไม่ทราบชื่อ"}
                            </p>
                            {item.nickname && (
                              <p className="text-sm text-gray-400">{item.nickname}</p>
                            )}
                          </div>

                          <div className="flex shrink-0 flex-wrap justify-end gap-1">
                            <span
                              className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium ${statusTone(item.status)}`}
                            >
                              {statusLabel(item.status)}
                            </span>
                            {item.is_off_schedule && (
                              <span
                                className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium ${OFF_SCHEDULE_TONE}`}
                              >
                                {OFF_SCHEDULE_LABEL}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-500">
                          <span>{formatClock(item.check_in_time)}</span>
                          <span>
                            {METHOD_LABEL[item.check_in_method] ?? item.check_in_method}
                          </span>
                        </div>

                        {item.remarks && (
                          <p className="mt-2 rounded-lg bg-gray-50 p-2 text-sm text-gray-500">
                            {item.remarks}
                          </p>
                        )}

                        <button
                          onClick={() => setEditing(item)}
                          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
                        >
                          <Pencil className="h-4 w-4" />
                          แก้สถานะ
                        </button>
                      </li>
                    ))}
                  </ul>

                  {/* เดสก์ท็อป: ตาราง — ไม่มีคอลัมน์คอร์ส/วันที่ หัวรอบบอกไปแล้ว */}
                  <table className="hidden w-full table-fixed text-left lg:table">
                    <thead className="bg-gray-50 text-sm font-semibold text-gray-600">
                      <tr>
                        <th className="px-4 py-3">ชื่อ</th>
                        <th className="w-20 px-4 py-3">เวลา</th>
                        <th className="w-28 px-4 py-3">สถานะ</th>
                        <th className="w-36 px-4 py-3">วิธีบันทึก</th>
                        <th className="w-40 px-4 py-3">หมายเหตุ</th>
                        <th className="w-36 px-4 py-3" />
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100">
                      {round.items.map((item) => (
                        <tr key={item.attendance_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="truncate font-medium text-gray-900">
                              {item.full_name.trim() || "ไม่ทราบชื่อ"}
                            </p>
                            {item.nickname && (
                              <p className="truncate text-sm text-gray-400">{item.nickname}</p>
                            )}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                            {formatClock(item.check_in_time)}
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              <span
                                className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium ${statusTone(item.status)}`}
                              >
                                {statusLabel(item.status)}
                              </span>
                              {item.is_off_schedule && (
                                <span
                                  className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium ${OFF_SCHEDULE_TONE}`}
                                >
                                  {OFF_SCHEDULE_LABEL}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3 text-sm text-gray-500">
                            <div className="truncate">
                              {METHOD_LABEL[item.check_in_method] ?? item.check_in_method}
                            </div>
                          </td>

                          {/* title ให้เอาเมาส์ชี้อ่านเต็มได้ เพราะหมายเหตุถูกตัดท้าย */}
                          <td className="px-4 py-3 text-sm text-gray-500">
                            <div className="truncate" title={item.remarks || undefined}>
                              {item.remarks || "—"}
                            </div>
                          </td>

                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => setEditing(item)}
                              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
                            >
                              <Pencil className="h-4 w-4" />
                              แก้สถานะ
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {items.length >= 500 && (
        <p className="mt-3 text-sm text-amber-700">
          แสดงได้สูงสุด 500 รายการต่อครั้ง — กรองตามวันหรือคอร์สให้แคบลงเพื่อดูให้ครบ
        </p>
      )}

      {editing && (
        <EditStatusModal
          studentName={editing.full_name.trim() || editing.nickname}
          currentStatus={editing.status}
          currentRemarks={editing.remarks}
          isSubmitting={isSaving}
          onSubmit={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
