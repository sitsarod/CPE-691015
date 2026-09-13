"use client";

import { BookOpen, CalendarClock } from "lucide-react";
import { StudentListResponseDTO } from "@/services/userAPI";
import { Column } from "@/components/admin/DataTable";
import { RowActionMenu } from "@/components/admin/ManagementUI";
import { getId } from "./useStudentManagement";

/**
 * นิยามคอลัมน์ของตารางนักเรียน
 *
 * ⚠️ ใช้กับหน้าจอคอมพิวเตอร์เท่านั้น — ฝั่งมือถือต้องออกแบบเป็นการ์ดใหม่
 */
export function buildStudentColumns(actions: {
  onView: (item: StudentListResponseDTO) => void;
  onDelete: (item: StudentListResponseDTO) => void;
  onOpenEnrollments: (item: StudentListResponseDTO) => void;
}): Column<StudentListResponseDTO>[] {
  return [
    {
      header: "นักเรียน",
      render: (item) => (
        <div className="flex items-center gap-3 min-w-0">
          {item.profile_picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.profile_picture} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-gray-200" />
          ) : (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#E63946] to-[#CC0000] text-sm font-bold text-white">
              {(item.firstName?.[0] || item.nickname?.[0] || "S").toUpperCase()}
            </span>
          )}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-gray-900">
                {item.firstName} {item.lastName}
              </span>
              {item.nickname && <span className="text-xs text-gray-400">({item.nickname})</span>}
            </div>
            <span className="mt-0.5 text-xs text-gray-400">{item.email || `ID #${getId(item)}`}</span>
          </div>
        </div>
      ),
    },
    {
      header: "เบอร์โทรศัพท์",
      render: (item) => <span className="text-gray-600">{item.phoneNumber || "-"}</span>,
    },
    {
      header: "สิทธิ์เรียน",
      render: (item) =>
        (item.carryOverSessions ?? 0) > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
            <CalendarClock className="h-3 w-3" />
            ทบรอใช้ {item.carryOverSessions} ครั้ง
          </span>
        ) : (
          <span className="text-xs text-gray-400">ปกติ</span>
        ),
    },
    {
      header: "การจัดการ",
      className: "text-right w-44",
      render: (item) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => actions.onOpenEnrollments(item)}
            title="ดูคอร์สเรียนและครั้งที่ทบไว้"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors ${
              (item.carryOverSessions ?? 0) > 0
                ? "border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border-gray-300 bg-white text-gray-600 hover:border-[#CC0000] hover:text-[#CC0000]"
            }`}
          >
            <BookOpen className="h-4 w-4" />
            คอร์สเรียน
          </button>
          <RowActionMenu onView={() => actions.onView(item)} onDelete={() => actions.onDelete(item)} />
        </div>
      ),
    },
  ];
}
