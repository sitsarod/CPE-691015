"use client";

import { useState } from "react";
import { Loader2, Pencil, UserPlus, Users } from "lucide-react";
import type { CoachRosterItem } from "@/types/attendance";
import { METHOD_LABEL, coachStatusLabel, statusTone } from "@/types/attendance";
import { courtLabel } from "@/lib/courtLabel";

interface Props {
  coaches: CoachRosterItem[];
  // ปุ่มเช็คชื่อให้ผูกกับ canCheckIn ไม่ใช่แค่ status — ManualCoachCheckIn ผ่าน
  // loadOpenSession เหมือนการสแกน ปุ่มที่กดแล้ว error ทุกครั้งไม่ควรมีให้กด
  canCheckIn: boolean;
  onManualCheckIn: (coachId: number) => Promise<void>;
  onEditStatus: (item: CoachRosterItem) => void;
}

/**
 * รายชื่อโค้ชของรอบ — แยกกล่องจากนักเรียนเพราะมาคนละที่ (ตารางงาน vs enrollment)
 * ถ้ารวมตารางเดียวกันจะอธิบายไม่ได้ว่าทำไมบางแถวไม่มีโควตา
 *
 */
export default function CoachRosterList({
  coaches,
  canCheckIn,
  onManualCheckIn,
  onEditStatus,
}: Props) {
  const [busyId, setBusyId] = useState<number | null>(null);

  const handleCheckIn = async (coachId: number) => {
    setBusyId(coachId);
    try {
      await onManualCheckIn(coachId);
    } finally {
      setBusyId(null);
    }
  };

  if (coaches.length === 0) {
    return (
      <div className="shrink-0 rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-400">
        คาบนี้ยังไม่มีโค้ชในตารางงาน
      </div>
    );
  }

  const checkedIn = coaches.filter((c) => c.attendance_id).length;

  return (
    <div className="shrink-0 rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-700">
        <Users className="h-4 w-4 text-[#CD0D13]" />
        โค้ช
        <span className="font-normal text-gray-400">
          {checkedIn}/{coaches.length} เช็คชื่อแล้ว
        </span>
      </p>

      <ul className="flex flex-col gap-2">
        {coaches.map((c) => {
          const sub = [
            courtLabel(c.court_number) || null,
            c.check_in_method ? METHOD_LABEL[c.check_in_method] : null,
            c.check_in_time
              ? new Date(c.check_in_time).toLocaleTimeString("th-TH", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : null,
          ].filter(Boolean);

          return (
            <li key={c.coach_id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-800">
                  {c.full_name.trim() || c.nickname || `โค้ช #${c.coach_id}`}
                  {/* สองสถานะคนละเรื่องกัน — is_emergency คือมอบหมายนอกกฎปกติ
                      ส่วน !is_scheduled คือตารางถูกลบทีหลังจนบันทึกกลายเป็นกำพร้า */}
                  {c.is_emergency && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                      กรณีฉุกเฉิน
                    </span>
                  )}
                  {!c.is_scheduled && (
                    <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs font-semibold text-gray-600">
                      ไม่อยู่ในตารางงาน
                    </span>
                  )}
                </p>
                {sub.length > 0 && (
                  <p className="truncate text-xs text-gray-400">{sub.join(" · ")}</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {c.status ? (
                  <>
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(c.status)}`}
                    >
                      {coachStatusLabel(c.status)}
                    </span>
                    <button
                      onClick={() => onEditStatus(c)}
                      aria-label="แก้สถานะ"
                      className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </>
                ) : canCheckIn ? (
                  <button
                    onClick={() => handleCheckIn(c.coach_id)}
                    disabled={busyId !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                  >
                    {busyId === c.coach_id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="h-3.5 w-3.5" />
                    )}
                    เช็คให้
                  </button>
                ) : (
                  <span className="inline-flex whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500">
                    ยังไม่เช็ค
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
