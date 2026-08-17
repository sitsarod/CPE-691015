"use client";

import { useMemo, useState } from "react";
import { Loader2, UserPlus, Pencil, Search, X } from "lucide-react";
import type { RosterItem, AttendanceSession } from "@/types/attendance";
import { STATUS_LABEL, METHOD_LABEL } from "@/types/attendance";

interface Props {
  session: AttendanceSession;
  onManualCheckIn: (enrollmentId: number) => Promise<void>;
  onEditStatus: (item: RosterItem) => void;
}

function statusPill(item: RosterItem) {
  if (!item.status) {
    return (
      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-sm text-gray-500">
        ยังไม่เช็ค
      </span>
    );
  }

  const tone = {
    present: "bg-green-100 text-green-700",
    absent: "bg-red-100 text-red-700",
    leave: "bg-amber-100 text-amber-700",
  }[item.status];

  return (
    <span className={`rounded-full px-2.5 py-1 text-sm font-medium ${tone}`}>
      {STATUS_LABEL[item.status]}
    </span>
  );
}

export default function RosterList({ session, onManualCheckIn, onEditStatus }: Props) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);

  const isOpen = session.status === "open";
  const pendingCount = session.roster.filter((r) => !r.attendance_id).length;

  const rows = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return session.roster
      .filter((r) => {
        if (pendingOnly && r.attendance_id) return false;
        if (!keyword) return true;
        return (
          r.full_name.toLowerCase().includes(keyword) ||
          r.nickname.toLowerCase().includes(keyword)
        );
      })
      .sort((a, b) => {
        const aDone = a.attendance_id ? 1 : 0;
        const bDone = b.attendance_id ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        return a.full_name.localeCompare(b.full_name, "th");
      });
  }, [session.roster, search, pendingOnly]);

  const handleManual = async (enrollmentId: number) => {
    setBusyId(enrollmentId);
    try {
      await onManualCheckIn(enrollmentId);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-col rounded-2xl border border-gray-200">
      {/* แถบค้นหา — อยู่นอกส่วนที่เลื่อน จะได้ไม่หลุดจากจอตอนเลื่อนหารายชื่อ */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-200 p-3">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อหรือชื่อเล่น"
            className="w-full rounded-xl border border-gray-300 py-2.5 pl-9 pr-9 text-gray-900 outline-none focus:border-blue-500"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="ล้างคำค้นหา"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <button
          onClick={() => setPendingOnly((v) => !v)}
          className={`shrink-0 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
            pendingOnly
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          เฉพาะยังไม่เช็ค ({pendingCount})
        </button>
      </div>


      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 z-10 bg-gray-50 text-sm text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">ชื่อ</th>
              <th className="px-3 py-3 font-medium">คงเหลือ</th>
              <th className="px-3 py-3 font-medium">สถานะ</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                  {session.roster.length === 0
                    ? "ไม่มีผู้เรียนที่ยังใช้สิทธิ์อยู่ในแพ็กเกจนี้"
                    : "ไม่พบชื่อที่ค้นหา"}
                </td>
              </tr>
            )}

            {rows.map((item) => (
              <tr key={item.enrollment_id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">
                    {item.full_name.trim() || "ไม่ทราบชื่อ"}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 text-sm text-gray-400">
                    {item.nickname && <span>{item.nickname}</span>}
                    {item.check_in_method && (
                      <span>{METHOD_LABEL[item.check_in_method]}</span>
                    )}
                    {item.check_in_time && (
                      <span>
                        {new Date(item.check_in_time).toLocaleTimeString("th-TH", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                </td>

                <td className="whitespace-nowrap px-3 py-3 text-gray-700">
                  {item.remaining_sessions} / {item.total_sessions}
                </td>

                <td className="px-3 py-3">{statusPill(item)}</td>

                <td className="px-3 py-3 text-right">
                  {/* ปุ่มสูง 44px ขึ้นไปตามขนาดนิ้วมือ — จอนี้ใช้นิ้วกดบน iPad ไม่ใช่เมาส์
                      ปุ่มเล็กกว่านั้นจะกดพลาดไปโดนแถวข้างเคียงตอนรีบ */}
                  {!item.attendance_id && isOpen && (
                    <button
                      onClick={() => handleManual(item.enrollment_id)}
                      disabled={busyId !== null}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                    >
                      {busyId === item.enrollment_id ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <UserPlus className="h-5 w-5" />
                      )}
                      เช็คให้
                    </button>
                  )}

                  {item.attendance_id && (
                    <button
                      onClick={() => onEditStatus(item)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-300 px-4 py-2.5 font-medium text-gray-700 transition hover:bg-gray-100"
                    >
                      <Pencil className="h-4 w-4" />
                      แก้
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
