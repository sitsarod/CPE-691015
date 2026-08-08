import React from "react";
import { Search } from "lucide-react";
import type { RoleKey } from "@/components/admin/ManagementUI";

interface Props {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  placeholder?: string;
  roleFilter?: RoleKey | "all";
  setRoleFilter?: (role: RoleKey | "all") => void;
  roles?: readonly (RoleKey | "all")[]; // กำหนดตัวเลือก role ที่อยากโชว์ได้
}

export function MemberFilterToolbar({
  searchTerm,
  setSearchTerm,
  placeholder = "ค้นหาชื่อ, อีเมล...",
  roleFilter,
  setRoleFilter,
  roles = ["all", "customer", "coach", "admin"] as const,
}: Props) {
  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Search Input */}
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:ring-2 focus:ring-gray-900/5"
        />
      </div>

      {/* Role Filter Pills (แสดงเฉพาะเมื่อส่ง roleFilter และ setRoleFilter มา) */}
      {roleFilter && setRoleFilter && (
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          {roles.map((key) => (
            <button
              key={key}
              onClick={() => setRoleFilter(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                roleFilter === key ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {key === "all" ? "ทั้งหมด" : key}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}