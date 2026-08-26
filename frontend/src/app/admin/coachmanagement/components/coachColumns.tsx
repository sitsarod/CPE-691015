"use client";

import { CoachListItem } from "@/services/coachAPI";
import { Column } from "@/components/admin/DataTable";
import { Pill, RowActionMenu } from "@/components/admin/ManagementUI";

/**
 * นิยามคอลัมน์ของตารางโค้ช
 *
 * ⚠️ ใช้กับหน้าจอคอมพิวเตอร์เท่านั้น
 *
 * ห้าคอลัมน์นี้ลงจอมือถือไม่ได้ ฝั่งมือถือต้องออกแบบเป็นการ์ดใหม่
 * ไม่ต้องพยายามทำให้ไฟล์นี้ตอบโจทย์ทั้งสองแบบ
 */
export function buildCoachColumns(actions: {
  onView: (item: CoachListItem) => void;
  onSchedule: (item: CoachListItem) => void;
  onToggleStatus: (item: CoachListItem) => void;
  onDelete: (item: CoachListItem) => void;
}): Column<CoachListItem>[] {
  return [
    {
      header: "โค้ช",
      render: (item) => (
        <div className="flex items-center gap-3 min-w-0">
          {item.profile_picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.profile_picture}
              alt=""
              className="h-10 w-10 rounded-full object-cover ring-1 ring-gray-200 shrink-0"
            />
          ) : (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#E63946] to-[#CC0000] text-sm font-bold text-white">
              {(item.firstName?.[0] || item.nickname?.[0] || "C").toUpperCase()}
            </span>
          )}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-gray-900">
                {item.firstName} {item.lastName}
              </span>
              {item.nickname && <span className="text-xs text-gray-400">({item.nickname})</span>}
              {item.status === "inactive" && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500 ring-1 ring-inset ring-gray-300">
                  พักงาน
                </span>
              )}
            </div>
            {item.email && <span className="text-xs text-gray-500 mt-0.5 truncate">{item.email}</span>}
          </div>
        </div>
      ),
    },
    {
      header: "ระดับฝีมือ",
      render: (item) =>
        item.specialization ? (
          <Pill label={item.specialization} color="bg-sky-50 text-sky-700 ring-sky-600/20" />
        ) : (
          <span className="text-gray-400">-</span>
        ),
    },
    {
      header: "ใบรับรองผู้ฝึกสอน",
      render: (item) =>
        item.coach_license ? (
          <Pill label={item.coach_license} color="bg-violet-50 text-violet-700 ring-violet-600/20" />
        ) : (
          <span className="text-gray-400">-</span>
        ),
    },
    {
      header: "เบอร์โทรศัพท์",
      render: (item) => <span className="text-gray-600">{item.phone || "-"}</span>,
    },
    {
      header: "การจัดการ",
      className: "text-right w-20",
      render: (item) => (
        <div className="flex justify-end">
          <RowActionMenu
            onView={() => actions.onView(item)}
            onSchedule={() => actions.onSchedule(item)}
            onToggleStatus={() => actions.onToggleStatus(item)}
            isActive={item.status !== "inactive"}
            onDelete={() => actions.onDelete(item)}
          />
        </div>
      ),
    },
  ];
}
