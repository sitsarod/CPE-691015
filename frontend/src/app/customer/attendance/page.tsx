"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, History, Loader2, XCircle } from "lucide-react";
import { fetchMyAttendance } from "@/services/attendanceAPI";
import type { MyAttendanceItem } from "@/types/attendance";

import { useGlobalToast } from "@/components/ToastProvider";
const PAGE_SIZE = 30;

const METHOD_LABEL: Record<string, string> = {
  qr_code: "สแกน QR",
  face_scan: "สแกนใบหน้า",
  manual: "แอดมินเช็คชื่อให้",
  system: "ระบบบันทึกตอนปิดรอบ",
};

// session_date เป็นวันล้วน (เที่ยงคืน UTC) — แสดงเป็นวันที่ไทยได้ตรงวัน
function formatClassDate(item: MyAttendanceItem) {
  return new Date(item.session_date ?? item.check_in_time).toLocaleDateString("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

export default function CustomerAttendancePage() {
  const showToast = useGlobalToast();
  const [items, setItems] = useState<MyAttendanceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [presentCount, setPresentCount] = useState(0);
  const [absentCount, setAbsentCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyAttendance(PAGE_SIZE, 0)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
        setPresentCount(res.present_count);
        setAbsentCount(res.absent_count);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "ไม่สามารถโหลดประวัติการเข้าเรียนได้");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = async () => {
    setIsLoadingMore(true);
    try {
      const res = await fetchMyAttendance(PAGE_SIZE, items.length);
      setItems((prev) => [...prev, ...res.items]);
      setTotal(res.total);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "ไม่สามารถโหลดประวัติเพิ่มได้", "error");
    } finally {
      setIsLoadingMore(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        <div className="flex items-center rounded-xl border border-red-200 bg-red-50 p-4 text-red-600 shadow-sm">
          <AlertCircle className="mr-3 h-5 w-5" />
          <span className="font-medium">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-24">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-4 sm:px-6">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#CC0000]">
            <History className="h-5 w-5" />
          </span>
          <h1 className="text-base font-bold text-gray-900 sm:text-lg">ประวัติการเข้าเรียน</h1>
        </div>

        <div className="grid grid-cols-3 divide-x divide-gray-100">
          <div className="px-3 py-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{total}</p>
            <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">ทั้งหมด</p>
          </div>
          <div className="px-3 py-4 text-center">
            <p className="text-2xl font-bold text-green-600">{presentCount}</p>
            <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">มาเรียน</p>
          </div>
          <div className="px-3 py-4 text-center">
            <p className="text-2xl font-bold text-red-600">{absentCount}</p>
            <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">ขาดเรียน</p>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-500">
          ยังไม่มีประวัติการเข้าเรียน
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const present = item.status === "present";
            return (
              <li
                key={item.attendance_id}
                className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                {present ? (
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-green-600" />
                ) : (
                  <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-red-500" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-gray-900">
                      {item.course_name || "ไม่ระบุคอร์ส"}
                    </p>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        present ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}
                    >
                      {present ? "มาเรียน" : "ขาดเรียน"}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-gray-600">
                    {formatClassDate(item)}
                    {item.schedule_start_time &&
                      ` · ${item.schedule_start_time}–${item.schedule_end_time} น.`}
                  </p>

                  <p className="mt-1 text-xs text-gray-500">
                    {present
                      ? `เช็คชื่อ ${formatClock(item.check_in_time)} น. · ${
                          METHOD_LABEL[item.check_in_method] ?? item.check_in_method
                        } · หักโควตา 1 ครั้ง`
                      : "ยืนยันว่าจะมาแต่ไม่ได้เช็คชื่อ · ไม่หักโควตา"}
                  </p>

                  {present && item.is_off_schedule && (
                    <p className="mt-1 text-xs text-amber-700">เช็คชื่อโดยไม่ได้ยืนยันล่วงหน้า</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {items.length < total && (
        <div className="flex justify-center">
          <button
            onClick={loadMore}
            disabled={isLoadingMore}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-5 font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
          >
            {isLoadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
            โหลดเพิ่ม
          </button>
        </div>
      )}
    </div>
  );
}
