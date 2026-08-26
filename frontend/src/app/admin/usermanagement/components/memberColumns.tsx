"use client";

import { UserProfileResponseDTO } from "@/types/user";
import { Column } from "@/components/admin/DataTable";
import { RoleBadge, StatusPill, RowActionMenu, normalizeRole, isActive } from "@/components/admin/ManagementUI";
import { getId } from "./useMemberManagement";

/**
 * นิยามคอลัมน์ของตารางสมาชิก
 *
 * แยกออกมาเพราะเป็นก้อนที่ยาวและแทบไม่เปลี่ยน ถ้าปล่อยไว้ในไฟล์หน้าจอ
 * มันจะบังโครงหน้าเว็บจนอ่านไม่ออกว่าหน้านี้ประกอบด้วยอะไรบ้าง
 *
 * ⚠️ ตารางนี้ใช้กับหน้าจอคอมพิวเตอร์เท่านั้น
 *
 * มือถือจอแคบเกินกว่าจะวางสี่คอลัมน์ได้ ฝั่งมือถือจะแสดงเป็นการ์ดแทน
 * จึงไม่ต้องพยายามทำให้ไฟล์นี้ตอบโจทย์ทั้งสองแบบ
 */
export function buildMemberColumns(actions: {
  onView: (item: UserProfileResponseDTO) => void;
  onDelete: (item: UserProfileResponseDTO) => void;
}): Column<UserProfileResponseDTO>[] {
  return [
    {
      header: "สมาชิก",
      render: (item) => (
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-900">
              {item.firstName} {item.lastName}
            </span>
            {item.nickname && <span className="text-xs text-gray-400">({item.nickname})</span>}
          </div>
          <span className="mt-0.5 text-xs text-gray-400">{item.email || `ID #${getId(item)}`}</span>
        </div>
      ),
    },
    {
      header: "บทบาท",
      render: (item) => <RoleBadge role={normalizeRole(item.role)} />,
    },
    {
      header: "สถานะ",
      render: (item) => <StatusPill active={isActive(item.status)} status={item.status} />,
    },
    {
      header: "การจัดการ",
      className: "text-right w-20",
      render: (item) => (
        <div className="flex justify-end">
          <RowActionMenu onView={() => actions.onView(item)} onDelete={() => actions.onDelete(item)} />
        </div>
      ),
    },
  ];
}
