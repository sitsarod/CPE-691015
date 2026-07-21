"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Edit, Trash2, Eye, RefreshCw } from "lucide-react";
import { getAllUsersAPI, UserProfileResponseDTO } from "@/services/userAPI";
import StatusBadge from "@/components/StatusBadge";
import SearchInput from "@/components/SearchInput";
import DataTable, { Column } from "@/components/DataTable";

export default function AdminMembersPage() {
  const [members, setMembers] = useState<UserProfileResponseDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const loadAllMembers = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await getAllUsersAPI();
      setMembers(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "เกิดข้อผิดพลาดในการโหลดข้อมูลสมาชิก"
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllMembers();
  }, []);

  const handleDeleteMember = async (id: number) => {
    if (!confirm("คุณต้องการลบข้อมูลสมาชิกคนนี้ใช่หรือไม่?")) return;
    try {
      alert("ลบสมาชิกสำเร็จ");
      loadAllMembers();
    } catch (err: unknown) {
      alert("ไม่สามารถลบข้อมูลสมาชิกได้");
    }
  };

  const filteredMembers = members.filter((member) => {
    const term = searchTerm.toLowerCase();
    const memberId = (member.id ?? (member as any).ID)?.toString() || "";

    return (
      memberId.includes(term) ||
      member.firstName?.toLowerCase().includes(term) ||
      member.lastName?.toLowerCase().includes(term) ||
      member.nickname?.toLowerCase().includes(term) ||
      member.email?.toLowerCase().includes(term) ||
      member.role?.toLowerCase().includes(term)
    );
  });

  const renderRoleBadge = (role: string, isStudent: boolean) => {
    const normalizedRole = role?.toLowerCase();
    if (normalizedRole === "admin") {
      return (
        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-100 text-purple-800">
          Admin
        </span>
      );
    }
    if (normalizedRole === "coach") {
      return (
        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 text-blue-800">
          Coach
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 text-xs font-semibold rounded bg-gray-100 text-gray-800">
        {isStudent ? "Student" : "Customer"}
      </span>
    );
  };

  const columns: Column<UserProfileResponseDTO>[] = [
    {
      header: "ID",
      className: "font-semibold text-gray-900 w-16",
      render: (item) => `#${item.id ?? (item as any).ID ?? "-"}`,
    },
    {
      header: "ชื่อ - นามสกุล",
      render: (item) => (
        <div>
          <div className="font-semibold text-gray-900">
            {item.firstName} {item.lastName}
            {item.nickname && (
              <span className="ml-2 text-xs font-normal text-gray-500">
                ({item.nickname})
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500">{item.email}</div>
        </div>
      ),
    },
    {
      header: "บทบาท (Role)",
      render: (item) => renderRoleBadge(item.role, item.isStudent),
    },

    {
      header: "สถานะ",
      render: (item) => <StatusBadge status={item.status || "active"} />,
    },
    {
      header: "จัดการ",
      headerClassName: "text-center",
      className: "text-center",
      render: (item) => {
        const itemId = item.id ?? (item as any).ID;
        return (
          <div className="flex items-center justify-center gap-1.5">
            <button
              onClick={() =>  {}}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="ดูรายละเอียด"
            >
              <Eye className="w-4 h-4" />
            </button>

            <button
              onClick={() => {}}
              className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
              title="แก้ไข"
            >
              <Edit className="w-4 h-4" />
            </button>

            <button
              onClick={() => handleDeleteMember(itemId)}
              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="ลบสมาชิก"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            จัดการข้อมูลสมาชิกทั้งหมด
          </h1>
          <p className="text-gray-500 mt-1">
            รายการสมาชิกทั้งหมดในระบบ ({filteredMembers.length} คน)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadAllMembers}
            disabled={isLoading}
            className="p-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </button>

          <button
            onClick={() =>  {}}
            className="flex items-center gap-2 px-4 py-2 bg-[#CC0000] text-white font-bold text-sm rounded-lg hover:bg-red-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            เพิ่มสมาชิกใหม่
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 text-red-600 p-4 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <SearchInput
          placeholder="ค้นหาชื่อ, รหัส, อีเมล, เบอร์โทร, หรือ Role..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-[360px]"
        />
      </div>

      <DataTable
        columns={columns}
        data={filteredMembers}
        isLoading={isLoading}
        emptyText="ไม่พบข้อมูลสมาชิกในระบบ"
        keyExtractor={(item) => item.id ?? (item as any).ID}
      />
    </div>
  );
}