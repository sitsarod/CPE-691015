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

const STATUS_TONE: Record<NonNullable<RosterItem["status"]>, string> = {
  present: "bg-green-100 text-green-700",
  absent: "bg-red-100 text-red-700",
  leave: "bg-amber-100 text-amber-700",
};

function StatusPill({ item }: { item: RosterItem }) {
  if (!item.status) {
    return (
      <span className="inline-flex whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-sm text-gray-500">
        ยังไม่เช็ค
      </span>
    );
  }

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-medium ${STATUS_TONE[item.status]}`}
    >
      {STATUS_LABEL[item.status]}
    </span>
  );
}

function SubLine({ item }: { item: RosterItem }) {
  const parts = [
    item.nickname,
    item.check_in_method && METHOD_LABEL[item.check_in_method],
    item.check_in_time &&
      new Date(item.check_in_time).toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
      }),
  ].filter(Boolean);

  if (parts.length === 0) return null;

  // บรรทัดเดียวที่ truncate ได้ — ของเดิมเป็น flex ซึ่งอยู่ในช่องตารางความกว้างคงที่
  // ไม่ได้ ข้อความจะทะลุออกนอกช่องแทนที่จะตัดด้วย …
  return <p className="truncate text-sm text-gray-400">{parts.join(" · ")}</p>;
}

export default function RosterList({ session, onManualCheckIn, onEditStatus }: Props) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);

  // ต้องผูกกับ can_scan ไม่ใช่แค่ status — ManualCheckIn โดน checkSessionWindow
  // ปฏิเสธเหมือนการสแกน ปุ่มที่กดแล้ว error ทุกครั้งไม่ควรมีให้กด
  const canCheckIn = session.status === "open" && session.can_scan;
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

  // ปุ่มสูง 44px ขึ้นไปตามขนาดนิ้วมือ — จอนี้ใช้นิ้วกดบน iPad ไม่ใช่เมาส์
  // ปุ่มเล็กกว่านั้นจะกดพลาดไปโดนแถวข้างเคียงตอนรีบ
  const ActionButton = ({ item, block }: { item: RosterItem; block?: boolean }) => {
    const width = block ? "w-full" : "";

    if (!item.attendance_id) {
      if (!canCheckIn) return null;
      return (
        <button
          onClick={() => handleManual(item.enrollment_id)}
          disabled={busyId !== null}
          className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#CC0000] px-4 py-2.5 font-medium text-white transition hover:bg-[#A30A0E] disabled:opacity-50 ${width}`}
        >
          {busyId === item.enrollment_id ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <UserPlus className="h-5 w-5" />
          )}
          เช็คให้
        </button>
      );
    }

    return (
      <button
        onClick={() => onEditStatus(item)}
        className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-gray-300 px-4 py-2.5 font-medium text-gray-700 transition hover:bg-gray-100 ${width}`}
      >
        <Pencil className="h-4 w-4" />
        แก้
      </button>
    );
  };

  const emptyMessage =
    session.roster.length === 0
      ? "ไม่มีผู้เรียนที่ยังใช้สิทธิ์อยู่ในแพ็กเกจนี้"
      : "ไม่พบชื่อที่ค้นหา";

  return (
    <div className="flex min-h-0 flex-col rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* แถบค้นหา — อยู่นอกส่วนที่เลื่อน จะได้ไม่หลุดจากจอตอนเลื่อนหารายชื่อ */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-200 p-3">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อหรือชื่อเล่น"
            className="w-full rounded-xl border border-gray-300 py-2.5 pl-9 pr-9 text-gray-900 outline-none transition focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20"
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
          className={`min-h-11 w-full shrink-0 rounded-xl border px-3 py-2.5 text-sm font-medium transition sm:w-auto ${
            pendingOnly
              ? "border-[#CC0000] bg-[#FFF0F0] text-[#CC0000]"
              : "border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          เฉพาะยังไม่เช็ค ({pendingCount})
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 && (
          <p className="px-4 py-10 text-center text-gray-400">{emptyMessage}</p>
        )}

        {/* ── มือถือ: การ์ดต่อคน — ตารางสี่คอลัมน์ไม่ลงจอกว้าง 375px ── */}
        <ul className="divide-y divide-gray-100 md:hidden">
          {rows.map((item) => (
            <li key={item.enrollment_id} className="p-4">
              <p className="font-medium text-gray-900">
                {item.full_name.trim() || "ไม่ทราบชื่อ"}
              </p>
              <SubLine item={item} />

              <div className="mt-3 flex items-center justify-between gap-3">
                <StatusPill item={item} />
                <span className="whitespace-nowrap text-sm text-gray-500">
                  คงเหลือ {item.remaining_sessions} / {item.total_sessions}
                </span>
              </div>

              <div className="mt-3 empty:mt-0">
                <ActionButton item={item} block />
              </div>
            </li>
          ))}
        </ul>

        {/* ── แท็บเล็ต/เดสก์ท็อป: ตาราง ── */}
        <table className="hidden w-full table-fixed text-left md:table">
          <thead className="sticky top-0 z-10 bg-gray-50 text-sm font-semibold text-gray-600">
            <tr>
              <th className="px-4 py-3">ชื่อ</th>
              <th className="w-24 px-3 py-3">คงเหลือ</th>
              <th className="w-32 px-3 py-3">สถานะ</th>
              <th className="w-36 px-3 py-3" />
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {rows.map((item) => (
              <tr key={item.enrollment_id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="truncate font-medium text-gray-900">
                    {item.full_name.trim() || "ไม่ทราบชื่อ"}
                  </p>
                  <SubLine item={item} />
                </td>

                <td className="whitespace-nowrap px-3 py-3 text-gray-700">
                  {item.remaining_sessions} / {item.total_sessions}
                </td>

                <td className="px-3 py-3">
                  <StatusPill item={item} />
                </td>

                <td className="px-3 py-3 text-right">
                  <ActionButton item={item} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
