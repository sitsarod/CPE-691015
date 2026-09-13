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
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import {
  fetchHistory,
  fetchCoachHistory,
  downloadHistoryCsv,
  updateAttendanceStatus,
  updateCoachAttendanceStatus,
} from "@/services/attendanceAPI";
import { fetchAllCourses } from "@/services/courseAPI";
import type { AttendanceHistoryItem, AttendanceStatus, CoachHistoryItem } from "@/types/attendance";
import {
  STATUS_LABEL,
  STATUS_TONE,
  displayStatus,
  METHOD_LABEL,
  OFF_SCHEDULE_LABEL,
  OFF_SCHEDULE_TONE,
  COACH_STATUS_LABEL,
  COACH_STATUS_NOTE,
  coachStatusLabel,
  statusTone,
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
  coaches: CoachHistoryItem[];
}

// backend ส่งมาเรียง check_in_time DESC อยู่แล้ว ไล่ตามลำดับที่ได้มาก็จะได้
function groupIntoRounds(items: AttendanceHistoryItem[], coaches: CoachHistoryItem[]): Round[] {
  const byKey = new Map<string, Round>();

  for (const item of items) {
    // แถวที่ session_id เป็น null แยกเป็นกลุ่มต่อคอร์ส และใช้ check_in_time
    const hasSession = item.session_id !== null;
    const key = hasSession
      ? `s${item.session_id}`
      : `n:${item.course_name}:${item.check_in_time.slice(0, 10)}`;

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
        coaches: [],
      };
      byKey.set(key, round);
    }

    if (item.status in round.counts) round.counts[item.status] += 1;
    if (item.is_off_schedule && item.status === "present") round.offScheduleCount += 1;
    round.items.push(item);
  }

  for (const c of coaches) {
    byKey.get(`s${c.session_id}`)?.coaches.push(c);
  }

  return [...byKey.values()];
}

const PAGE_SIZE = 100;

export default function AttendanceHistoryPage() {
  // ค่าเริ่มต้นเป็นวันนี้ทั้งคู่ = พฤติกรรมเดิม แต่ตอนนี้ขยายเป็นช่วงได้
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [courseId, setCourseId] = useState<number>(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [courses, setCourses] = useState<CourseDTO[]>([]);

  const [items, setItems] = useState<AttendanceHistoryItem[]>([]);
  const [coaches, setCoaches] = useState<CoachHistoryItem[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<AttendanceHistoryItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // แก้สถานะโค้ชย้อนหลังต้องทำได้จากหน้านี้ ไม่ใช่แค่หน้ารอบที่เปิดอยู่
  const [editingCoach, setEditingCoach] = useState<CoachHistoryItem | null>(null);
  const [isSavingCoach, setIsSavingCoach] = useState(false);

  // null = ยังไม่ได้กดพับ/กางอะไรเลย ให้กางรอบแรกไว้ให้
  const [openKeys, setOpenKeys] = useState<Set<string> | null>(null);

  useEffect(() => {
    fetchAllCourses()
      .then(setCourses)
      .catch(() => {
      });
  }, []);

  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const filters = {
          from: from || undefined,
          to: to || undefined,
          courseId: courseId || undefined,
          q: search || undefined,
        };

        const data = await fetchHistory(filters, { limit: PAGE_SIZE, offset });
        if (cancelled) return;

        // โค้ชต้องดึงตามรอบที่อยู่บนหน้านี้เท่านั้น ไม่งั้นเลขหน้าสองฝั่งไม่ตรงกัน
        const sessionIds = [
          ...new Set(
            data.items
              .map((it) => it.session_id)
              .filter((id): id is number => id !== null)
          ),
        ];
        const coachRows = sessionIds.length ? await fetchCoachHistory(filters, sessionIds) : [];
        if (cancelled) return;

        setItems(data.items);
        setCoaches(coachRows);
        setTotalRows(data.total);
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
  }, [from, to, courseId, search, offset, refreshTick]);

  const rounds = useMemo(() => groupIntoRounds(items, coaches), [items, coaches]);

  // เปลี่ยนตัวกรองแล้วคีย์เดิมจะไม่ตรงกับรอบชุดใหม่ ถ้าไม่ล้างจะพับหมดทุกอัน
  const resetOpenState = () => setOpenKeys(null);

  const load = useCallback(() => {
    setIsLoading(true);
    setOpenKeys(null);
    setOffset(0);
    setSearch(searchInput.trim());
    setRefreshTick((t) => t + 1);
  }, [searchInput]);

  // เปลี่ยนหน้าแล้วต้องเลื่อนขึ้นบนสุด ไม่งั้นค้างอยู่กลางรายการเดิมของหน้าที่แล้ว
  const goToOffset = useCallback((next: number) => {
    setIsLoading(true);
    setOpenKeys(null);
    setOffset(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const exportCsv = useCallback(
    async (type: "student" | "coach") => {
      setIsExporting(true);
      try {
        await downloadHistoryCsv(
          {
            from: from || undefined,
            to: to || undefined,
            courseId: courseId || undefined,
            q: search || undefined,
          },
          type
        );
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "ดาวน์โหลดไฟล์ไม่สำเร็จ");
      } finally {
        setIsExporting(false);
      }
    },
    [from, to, courseId, search]
  );

  const pageCount = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const isOpen = (key: string, index: number) =>
    openKeys === null ? index === 0 : openKeys.has(key);

  const toggleRound = (key: string) => {
    setOpenKeys((prev) => {
      // ตอนยังเป็น null รอบแรกกางอยู่บนจอ ต้อง seed จากสถานะที่ตาเห็นจริง
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

  // แก้สถานะการเข้าสอนของโค้ชย้อนหลัง
  const handleSaveCoach = async (status: AttendanceStatus, remarks: string) => {
    if (!editingCoach) return;

    setIsSavingCoach(true);
    try {
      await updateCoachAttendanceStatus(editingCoach.attendance_id, status, remarks);
      alert(
        status === "present"
          ? "แก้สถานะเรียบร้อย — นับคาบนี้เป็นคาบที่ได้ค่าจ้างแล้ว"
          : "แก้สถานะเรียบร้อย — คาบนี้จะไม่ถูกนับค่าจ้าง"
      );
      setEditingCoach(null);
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถแก้สถานะของโค้ชได้");
    } finally {
      setIsSavingCoach(false);
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

      <div className="mt-6 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(11.5rem,1fr)_minmax(11.5rem,1fr)_minmax(0,1.2fr)_minmax(0,1.5fr)_auto] sm:gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">ตั้งแต่วันที่</label>
          <div className="relative mt-1">
            <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => {
                resetOpenState();
                setOffset(0);
                setFrom(e.target.value);
              }}
              // iOS Safari ให้ช่องวันที่กว้างตามตัวเองจนล้นทับช่องข้าง ๆ ต้องปิด appearance แล้วยอมหดตาม grid
              className="block h-12 min-w-0 appearance-none bg-white w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-3 text-gray-900 outline-none transition focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">ถึงวันที่</label>
          <div className="relative mt-1">
            <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => {
                resetOpenState();
                setOffset(0);
                setTo(e.target.value);
              }}
              className="block h-12 min-w-0 appearance-none bg-white w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-3 text-gray-900 outline-none transition focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">คอร์ส</label>
          <div className="relative mt-1">
            {/* Safari วาด select เตี้ยกว่า input ช่องนี้เลยตกลงมาต่ำกว่าช่องอื่น — ปิด appearance แล้วตั้งความสูงเอง */}
            <select
              value={courseId}
              onChange={(e) => {
                resetOpenState();
                setOffset(0);
                setCourseId(Number(e.target.value));
              }}
              className="block h-12 w-full appearance-none rounded-xl border border-gray-300 bg-white pl-3 pr-9 text-gray-900 outline-none transition focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20"
            >
              <option value={0}>ทุกคอร์ส</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.course_name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">ค้นหาชื่อ</label>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") load();
              }}
              placeholder="ชื่อ นามสกุล หรือชื่อเล่น"
              className="h-12 w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-3 text-gray-900 outline-none transition focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20"
            />
          </div>
        </div>

        <button
          onClick={load}
          disabled={isLoading}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#CC0000] px-5 py-2.5 font-semibold text-white transition hover:bg-[#A30A0E] disabled:opacity-60"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          ค้นหา
        </button>
      </div>

      {error && <div className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}

      {!isLoading && totalRows > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
          <span className="text-gray-600">
            พบ <span className="font-semibold text-gray-900">{totalRows.toLocaleString("th-TH")}</span> รายการ
            {pageCount > 1 && ` · แสดงหน้า ${currentPage} จาก ${pageCount}`}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => exportCsv("student")}
              disabled={isExporting}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 font-medium text-gray-700 transition hover:border-[#CC0000] hover:text-[#CC0000] disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              CSV นักเรียน
            </button>
            <button
              onClick={() => exportCsv("coach")}
              disabled={isExporting}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 font-medium text-gray-700 transition hover:border-[#CC0000] hover:text-[#CC0000] disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              CSV โค้ช
            </button>
          </div>
        </div>
      )}

      {!isLoading && rounds.length === 0 && (
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <CalendarDays className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-4 text-gray-500">ไม่มีรอบเช็คชื่อตามเงื่อนไขที่เลือก</p>
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
                  {[
                    {
                      key: "present",
                      label: STATUS_LABEL.present,
                      tone: STATUS_TONE.present,
                      count: round.counts.present - round.offScheduleCount,
                    },
                    {
                      key: "off_schedule",
                      label: OFF_SCHEDULE_LABEL,
                      tone: OFF_SCHEDULE_TONE,
                      count: round.offScheduleCount,
                    },
                    {
                      key: "absent",
                      label: STATUS_LABEL.absent,
                      tone: STATUS_TONE.absent,
                      count: round.counts.absent,
                    },
                  ]
                    .filter((badge) => badge.count > 0)
                    .map((badge) => (
                      <span
                        key={badge.key}
                        className={`whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-medium ${badge.tone}`}
                      >
                        {badge.label} {badge.count}
                      </span>
                    ))}
                </div>
              </button>

              {open && (
                <div className="border-t border-gray-200">
                  {round.coaches.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
                      <span className="text-sm font-semibold text-gray-600">โค้ช</span>
                      {round.coaches.map((c) => (
                        <button
                          key={c.attendance_id}
                          onClick={() => setEditingCoach(c)}
                          title={c.remarks || "กดเพื่อแก้สถานะการเข้าสอน"}
                          aria-label={`แก้สถานะการเข้าสอนของ ${c.nickname || c.full_name.trim()}`}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium transition hover:ring-2 hover:ring-gray-300 ${statusTone(c.status)}`}
                        >
                          {c.nickname || c.full_name.trim() || `#${c.coach_id}`}
                          <span className="font-normal opacity-70">{coachStatusLabel(c.status)}</span>
                          {!c.is_scheduled && (
                            <span className="font-normal opacity-70">· ฉุกเฉิน</span>
                          )}
                          <Pencil className="h-3 w-3 opacity-50" />
                        </button>
                      ))}
                    </div>
                  )}

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

                          <span
                            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium ${
                              displayStatus(item.status, item.is_off_schedule).tone
                            }`}
                          >
                            {displayStatus(item.status, item.is_off_schedule).label}
                          </span>
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

                  <table className="hidden w-full table-fixed text-left lg:table">
                    <thead className="bg-gray-50 text-sm font-semibold text-gray-600">
                      <tr>
                        <th className="px-4 py-3">ชื่อ</th>
                        <th className="w-20 px-4 py-3">เวลา</th>
                        <th className="w-44 px-4 py-3">สถานะ</th>
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
                            <span
                              className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium ${
                                displayStatus(item.status, item.is_off_schedule).tone
                              }`}
                            >
                              {displayStatus(item.status, item.is_off_schedule).label}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-sm text-gray-500">
                            <div className="truncate">
                              {METHOD_LABEL[item.check_in_method] ?? item.check_in_method}
                            </div>
                          </td>

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

      {pageCount > 1 && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
          <button
            onClick={() => goToOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0 || isLoading}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-[#CC0000] hover:text-[#CC0000] disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-700"
          >
            <ChevronLeft className="h-4 w-4" />
            ก่อนหน้า
          </button>

          <span className="text-sm text-gray-600">
            หน้า {currentPage} / {pageCount}
          </span>

          <button
            onClick={() => goToOffset(offset + PAGE_SIZE)}
            disabled={currentPage >= pageCount || isLoading}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-[#CC0000] hover:text-[#CC0000] disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-700"
          >
            ถัดไป
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {pageCount > 1 && (
        <p className="mt-3 text-sm text-gray-500">
          แบ่งหน้าทีละ {PAGE_SIZE} รายการตามเวลาเช็คชื่อ รอบที่คาบเกี่ยวสองหน้าจะเห็นไม่ครบในหน้าเดียว
          · ต้องการทั้งช่วงพร้อมกันให้กดดาวน์โหลด CSV
        </p>
      )}

      {editing && (
        <EditStatusModal
          personName={editing.full_name.trim() || editing.nickname}
          currentStatus={editing.status}
          currentRemarks={editing.remarks}
          isSubmitting={isSaving}
          onSubmit={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      {editingCoach && (
        <EditStatusModal
          title="แก้สถานะการเข้าสอน"
          statusLabels={COACH_STATUS_LABEL}
          statusNote={COACH_STATUS_NOTE}
          personName={`โค้ช${editingCoach.full_name.trim() || editingCoach.nickname}`}
          currentStatus={editingCoach.status}
          currentRemarks={editingCoach.remarks}
          isSubmitting={isSavingCoach}
          onSubmit={handleSaveCoach}
          onClose={() => setEditingCoach(null)}
        />
      )}
    </div>
  );
}
