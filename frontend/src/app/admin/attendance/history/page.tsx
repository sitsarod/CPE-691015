"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Pencil, Search, ArrowLeft, CalendarDays } from "lucide-react";

import { fetchHistory, updateAttendanceStatus } from "@/services/attendanceAPI";
import { fetchAllCourses } from "@/services/courseAPI";
import type { AttendanceHistoryItem, AttendanceStatus } from "@/types/attendance";
import { STATUS_LABEL, METHOD_LABEL } from "@/types/attendance";
import type { CourseDTO } from "@/types/course";

import EditStatusModal from "../components/EditStatusModal";


function todayISO() {
  // ใช้เวลาของเครื่องแอดมินซึ่งอยู่ที่สนาม ตรงกับวันที่ backend บันทึกไว้
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const STATUS_TONE: Record<AttendanceStatus, string> = {
  present: "bg-green-100 text-green-700",
  absent: "bg-red-100 text-red-700",
  leave: "bg-amber-100 text-amber-700",
};

export default function AttendanceHistoryPage() {
  const [date, setDate] = useState(todayISO());
  const [courseId, setCourseId] = useState<number>(0);
  const [courses, setCourses] = useState<CourseDTO[]>([]);

  const [items, setItems] = useState<AttendanceHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<AttendanceHistoryItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  const load = useCallback(() => {
    setIsLoading(true);
    setRefreshTick((t) => t + 1);
  }, []);

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
    <div className="mx-auto max-w-6xl">
      <Link
        href="/admin/attendance"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" />
        กลับไปหน้าเช็คชื่อ
      </Link>

      <h1 className="mt-1 text-2xl font-bold text-gray-900">ประวัติการเช็คชื่อ</h1>
      <p className="mt-1 text-gray-500">
        แก้สถานะเป็น &quot;ลา&quot; ได้ที่นี่ — โควตาจะถูกคืนให้นักเรียนทันที
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">วันที่</label>
          <div className="relative mt-1">
            <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border border-gray-300 py-2.5 pl-10 pr-3 text-gray-900 outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">คอร์ส</label>
          <select
            value={courseId}
            onChange={(e) => setCourseId(Number(e.target.value))}
            className="mt-1 rounded-xl border border-gray-300 px-3 py-2.5 text-gray-900 outline-none focus:border-blue-500"
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
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          ค้นหา
        </button>
      </div>

      {error && <div className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}

      <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-sm text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">ชื่อ</th>
              <th className="px-4 py-3 font-medium">คอร์ส</th>
              <th className="px-4 py-3 font-medium">เวลา</th>
              <th className="px-4 py-3 font-medium">สถานะ</th>
              <th className="px-4 py-3 font-medium">วิธีบันทึก</th>
              <th className="px-4 py-3 font-medium">หมายเหตุ</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  ไม่มีบันทึกในวันและคอร์สที่เลือก
                </td>
              </tr>
            )}

            {items.map((item) => (
              <tr key={item.attendance_id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">
                    {item.full_name.trim() || "ไม่ทราบชื่อ"}
                  </p>
                  {item.nickname && <p className="text-sm text-gray-400">{item.nickname}</p>}
                </td>

                <td className="px-4 py-3 text-gray-700">{item.course_name}</td>

                <td className="px-4 py-3 text-gray-500">
                  {new Date(item.check_in_time).toLocaleString("th-TH", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>

                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_TONE[item.status]}`}
                  >
                    {STATUS_LABEL[item.status]}
                  </span>
                </td>

                <td className="px-4 py-3 text-sm text-gray-500">
                  {METHOD_LABEL[item.check_in_method] ?? item.check_in_method}
                </td>

                <td className="max-w-xs px-4 py-3 text-sm text-gray-500">
                  {item.remarks || "—"}
                </td>

                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setEditing(item)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
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
