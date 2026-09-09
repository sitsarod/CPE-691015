"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Check, Loader2, Lock, X } from "lucide-react";

import {
  cancelClassConfirmation,
  confirmClass,
  fetchUpcomingClasses,
} from "@/services/classConfirmationAPI";
import type {
  ConfirmationStatus,
  UpcomingClass,
} from "@/types/classConfirmation";
import { dayLabel } from "@/components/course/courseUtils";

/**
 * ยืนยันการมาเรียนล่วงหน้า 7 วัน — โรงเรียนใช้จำนวนคนไปตัดสินใจจองสนาม
 *
 * ⚠️ ปุ่มที่ปิดแล้วเป็นแค่การบอกผู้ใช้ backend ตรวจเส้นตายซ้ำเสมอ
 */

const keyOf = (c: UpcomingClass) =>
  `${c.enrollment_id}-${c.class_date}-${c.start_time}`;

/** "2026-09-01" → "1 ก.ย." — แปลงเองไม่ผ่าน new Date() เพราะเป็นวันตามปฏิทิน
 *  ไม่ใช่จุดเวลา ถ้าให้เบราว์เซอร์ตีความจะเลื่อนวันในบางโซนเวลา */
const TH_MONTH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

function formatClassDate(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  if (!m || !d) return ymd;
  return `${d} ${TH_MONTH[m - 1] ?? ""}`;
}

function todayYMD(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function deadlineLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

export default function ClassConfirmationSection() {
  const [classes, setClasses] = useState<UpcomingClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setClasses(await fetchUpcomingClasses());
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "ไม่สามารถดึงตารางเรียนได้"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // ยิง API แล้วอัปเดตเฉพาะการ์ดใบนั้น
  const run = async (
    item: UpcomingClass,
    action: (payload: {
      enrollment_id: number;
      class_date: string;
      start_time: string;
    }) => Promise<UpcomingClass>
  ) => {
    const key = keyOf(item);
    setSavingKey(key);
    try {
      const updated = await action({
        enrollment_id: item.enrollment_id,
        class_date: item.class_date,
        start_time: item.start_time,
      });
      setClasses((prev) =>
        prev.map((c) => (keyOf(c) === key ? { ...c, ...updated } : c))
      );
    } catch (err: unknown) {
      // เส้นตายผ่านไประหว่างเปิดหน้าค้างไว้ก็มาที่นี่ — โหลดใหม่ให้เห็นสถานะจริง
      alert(err instanceof Error ? err.message : "บันทึกคำตอบไม่สำเร็จ");
      load();
    } finally {
      setSavingKey(null);
    }
  };

  const confirm = (item: UpcomingClass) =>
    run(item, (p) => confirmClass({ ...p, status: "going" }));

  const cancel = (item: UpcomingClass) => run(item, cancelClassConfirmation);

  if (isLoading) {
    return (
      <div className="mb-10 flex items-center gap-2 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">กำลังโหลดตารางเรียน…</span>
      </div>
    );
  }

  // ไม่มีคาบใน 7 วันข้างหน้า = ไม่ต้องแสดงหัวข้อนี้เลย
  if (!error && classes.length === 0) return null;

  const today = todayYMD();
  const pendingOpen = classes.filter(
    (c) => c.is_open && c.status === "pending"
  ).length;

  return (
    <div className="mb-10">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <CalendarCheck className="h-5 w-5 text-[#CC0000]" />
          ยืนยันการมาเรียน
        </h2>
        {pendingOpen > 0 && (
          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-[#CC0000]">
            ยังไม่ได้ตอบ {pendingOpen} คาบ
          </span>
        )}
      </div>

      <p className="mb-2 text-sm text-gray-500">
        กดยืนยันล่วงหน้าเพื่อให้โรงเรียนจองสนามได้พอดีกับจำนวนคน ·
        ปิดรับตอนเที่ยงของวันที่เรียน
      </p>

      <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        ยืนยันแล้วไม่มา จะยัง<strong className="font-semibold">ถูกคิดค่าสนาม</strong>ของคาบนั้น
        (แต่ไม่ถูกหักจำนวนครั้งที่เรียน) เพราะโรงเรียนจองสนามเผื่อไว้แล้ว —
        ถ้ามาไม่ได้ ให้กดยกเลิกก่อนปิดรับ
      </p>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {classes.map((item) => {
          const key = keyOf(item);
          const isSaving = savingKey === key;
          const isToday = item.class_date === today;

          return (
            <div
              key={key}
              className={`w-[220px] shrink-0 snap-start rounded-xl border bg-white p-3 shadow-sm ${
                item.is_open ? "border-gray-200" : "border-gray-200 opacity-60"
              }`}
            >
              <div className="mb-1 flex items-baseline gap-1.5">
                <span className="text-sm font-bold text-gray-900">
                  {dayLabel(item.day_of_week)}
                </span>
                <span className="text-sm text-gray-500">
                  {formatClassDate(item.class_date)}
                </span>
                {isToday && (
                  <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                    วันนี้
                  </span>
                )}
              </div>

              <p className="truncate text-xs text-gray-500" title={item.course_name}>
                {item.course_name}
              </p>
              <p className="mb-3 text-xs font-semibold text-gray-700">
                {item.start_time}–{item.end_time}
              </p>

              {item.is_open ? (
                <ConfirmToggle
                  confirmed={item.status === "going"}
                  loading={isSaving}
                  onClick={() =>
                    item.status === "going" ? cancel(item) : confirm(item)
                  }
                />
              ) : (
                <ClosedNotice status={item.status} />
              )}

              {item.is_open && (
                <p className="mt-2 text-[11px] text-gray-400">
                  ปิดรับ {deadlineLabel(item.confirm_deadline)} น.
                  {isToday ? " วันนี้" : ""}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** ปุ่มเดียวสลับตามสถานะ: ยังไม่ตอบ → "มา" · ยืนยันแล้ว → "ยกเลิกการยืนยัน" สีแดง
 *
 * ปุ่มคู่จะสื่อว่ามีสามทางเลือก ซึ่งไม่ตรงกับระบบที่มีแค่สองสถานะ */
function ConfirmToggle({
  confirmed,
  loading,
  onClick,
}: {
  confirmed: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-pressed={confirmed}
      className={`flex w-full items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
        confirmed
          ? "border-[#CC0000] bg-[#CC0000] text-white hover:bg-red-700"
          : "border-gray-300 text-gray-700 hover:border-green-600 hover:bg-green-50 hover:text-green-700"
      }`}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : confirmed ? (
        <X className="h-3.5 w-3.5" />
      ) : (
        <Check className="h-3.5 w-3.5" />
      )}
      {confirmed ? "ยกเลิกการยืนยัน" : "มา"}
    </button>
  );
}

/** คาบที่ปิดรับแล้ว — แสดงคำตอบที่ค้างไว้ แทนปุ่มที่กดไม่ได้ */
function ClosedNotice({ status }: { status: ConfirmationStatus }) {
  const label =
    status === "going" ? "ยืนยันไว้ว่ามา" : "ปิดรับแล้ว · ไม่ได้ยืนยัน";

  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-gray-100 py-2 text-xs font-semibold text-gray-600">
      <Lock className="ml-2 h-3.5 w-3.5 shrink-0" />
      {label}
    </div>
  );
}
