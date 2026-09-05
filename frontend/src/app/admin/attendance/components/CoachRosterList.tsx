"use client";

import { Users } from "lucide-react";
import type { CoachRosterItem } from "@/types/attendance";
import { METHOD_LABEL, statusLabel, statusTone } from "@/types/attendance";

interface Props {
  coaches: CoachRosterItem[];
}

/**
 * รายชื่อโค้ชของรอบ — แยกกล่องจากนักเรียนเพราะมาคนละที่ (ตารางงาน vs enrollment)
 * ถ้ารวมตารางเดียวกันจะอธิบายไม่ได้ว่าทำไมบางแถวไม่มีโควตา
 *
 * อ่านอย่างเดียว — แอดมินเช็คชื่อให้โค้ชยังทำไม่ได้
 */
export default function CoachRosterList({ coaches }: Props) {
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
            c.court_number ? `สนาม ${c.court_number}` : null,
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
                  {/* มาสแกนทั้งที่ไม่ได้ถูก assign = ตารางงานไม่ตรงกับความจริง */}
                  {!c.is_scheduled && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                      ไม่อยู่ในตารางงาน
                    </span>
                  )}
                </p>
                {sub.length > 0 && (
                  <p className="truncate text-xs text-gray-400">{sub.join(" · ")}</p>
                )}
              </div>

              {c.status ? (
                <span
                  className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(c.status)}`}
                >
                  {statusLabel(c.status)}
                </span>
              ) : (
                <span className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500">
                  ยังไม่เช็ค
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
