"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";

import { fetchClassRoster } from "@/services/classConfirmationAPI";
import type { ClassRoster, ClassRosterItem } from "@/types/classConfirmation";
import { dayLabel } from "@/components/course/courseUtils";

/** รายชื่อของคาบหนึ่ง — เปิดจากการกดแถวคาบในตารางยอดสรุป */

const TH_MONTH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

function formatClassDate(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  if (!m || !d) return ymd;
  return `${d} ${TH_MONTH[m - 1] ?? ""}`;
}

export interface ClassRosterTarget {
  packageId: number;
  classDate: string;
}

export default function ClassRosterModal({
  target,
  onClose,
}: {
  target: ClassRosterTarget | null;
  onClose: () => void;
}) {
  const [roster, setRoster] = useState<ClassRoster | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const packageId = target?.packageId;
  const classDate = target?.classDate;

  const load = useCallback(async () => {
    if (packageId == null || !classDate) return;
    setIsLoading(true);
    setError(null);
    try {
      setRoster(await fetchClassRoster(packageId, classDate));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ไม่สามารถดึงรายชื่อได้");
    } finally {
      setIsLoading(false);
    }
  }, [packageId, classDate]);

  // ปิดกฎเหมือนที่ useAdminResource ทำ — ดึงข้อมูลตอนเปิดคือข้อยกเว้นที่ตั้งใจ
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // กรองตอนแสดงผลแทนการล้าง state ในเอฟเฟกต์ — กดสลับคาบเร็ว ๆ แล้วคำขอเก่า
  // ตอบกลับมาทีหลัง ผลที่มาช้าจะถูกทิ้งเอง ไม่ไปทับรายชื่อของคาบที่เพิ่งเปิด
  const current =
    roster &&
    roster.package_id === packageId &&
    roster.class_date === classDate
      ? roster
      : null;

  // ปิดด้วย Esc
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  if (!target) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="รายชื่อผู้เรียนของคาบนี้"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-bold text-gray-900">
              {current?.course_name ?? "รายชื่อผู้เรียน"}
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {current
                ? `${dayLabel(current.day_of_week)} ${formatClassDate(current.class_date)} · ${current.start_time}–${current.end_time}`
                : formatClassDate(target.classDate)}
              {current?.is_closed && " · ปิดรับคำตอบแล้ว"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="px-5 py-4">
          {isLoading && (
            <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลดรายชื่อ…
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* แสดงเฉพาะคนที่ยืนยันว่ามา — backend ยังส่ง pending มาด้วยถ้าอยากโชว์เพิ่ม */}
          {current && !isLoading && (
            <GoingList items={current.going} />
          )}
        </div>
      </div>
    </div>
  );
}

function GoingList({ items }: { items: ClassRosterItem[] }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-green-700">
        <Check className="h-4 w-4" />
        ยืนยันว่ามา
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
          {items.length}
        </span>
      </h3>

      {items.length === 0 ? (
        <p className="text-xs text-gray-400">ยังไม่มีใครยืนยันว่ามา</p>
      ) : (
        <ul className="space-y-1">
          {items.map((s) => (
            <li
              key={s.enrollment_id}
              className="flex items-baseline justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2"
            >
              <div className="min-w-0">
                <span className="font-semibold text-gray-900">{s.nickname}</span>
                {s.full_name.trim() && (
                  <span className="ml-2 text-sm text-gray-600">{s.full_name}</span>
                )}
              </div>
              <span className="shrink-0 text-sm text-gray-500 tabular-nums">
                {s.phone_number || "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
