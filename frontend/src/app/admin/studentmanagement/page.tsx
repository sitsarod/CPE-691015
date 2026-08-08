"use client";

import { useState, useEffect } from "react";
import { Loader2, RefreshCw, GraduationCap, Mail, Phone, UserRound, AlertCircle, Search } from "lucide-react";
import {
  getActiveStudentsAPI,
  getUserProfileAPI,
  deleteUserAPI,
  StudentListResponseDTO,
} from "@/services/userAPI";
import Button from "@/components/Button";
import { SummaryCard, RowActionMenu } from "@/components/admin/ManagementUI";
import { ViewMemberModal } from "@/components/admin/modals/ViewMemberModal";
import { DataTable, Column } from "@/components/admin/DataTable";

const getId = (item: any): number => item?.id ?? item?.ID ?? 0;
type ModalMode = "view" | null;

export default function StudentManagementPage() {
  const [students, setStudents] = useState<StudentListResponseDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<any>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const loadStudents = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getActiveStudentsAPI();
      setStudents(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการโหลดข้อมูลนักเรียน");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadStudents(); }, []);

  const closeModal = () => {
    setModalMode(null);
    setSelected(null);
  };

  const openView = async (item: StudentListResponseDTO) => {
    setModalMode("view");
    setSelected(item);
    setIsLoadingDetail(true);
    try {
      const d = await getUserProfileAPI(item.id);
      setSelected(d);
    } catch {
      setSelected(item);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleDelete = async (item: StudentListResponseDTO) => {
    if (!confirm(`ต้องการลบข้อมูลนักเรียน "${item.firstName} ${item.lastName}" ใช่หรือไม่?`)) return;
    try {
      await deleteUserAPI(getId(item));
      await loadStudents();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถลบข้อมูลได้");
    }
  };

  const filteredStudents = students.filter((s) => {
    const term = searchTerm.toLowerCase();
    return (
      getId(s)?.toString().includes(term) ||
      s.firstName?.toLowerCase().includes(term) ||
      s.lastName?.toLowerCase().includes(term) ||
      s.nickname?.toLowerCase().includes(term) ||
      s.email?.toLowerCase().includes(term)
    );
  });

  const stats = {
    total: students.length,
    withEmail: students.filter((s) => !!s.email).length,
    withPhone: students.filter((s) => !!s.phoneNumber).length,
    withNickname: students.filter((s) => !!s.nickname).length,
  };

  /* 🌟 1. กำหนดคอลัมน์เฉพาะสำหรับนักเรียน */
  const studentColumns: Column<StudentListResponseDTO>[] = [
    {
      header: "นักเรียน",
      render: (item) => (
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-900">
              {item.firstName} {item.lastName}
            </span>
            {item.nickname && (
              <span className="text-xs text-gray-400">({item.nickname})</span>
            )}
          </div>
          <span className="mt-0.5 text-xs text-gray-400">
            {item.email || `ID #${getId(item)}`}
          </span>
        </div>
      ),
    },
    {
      header: "เบอร์โทรศัพท์",
      render: (item) => <span className="text-gray-600">{item.phoneNumber || "-"}</span>,
    },
    {
      header: "การจัดการ",
      className: "text-right w-20",
      render: (item) => (
        <div className="flex justify-end">
          <RowActionMenu onView={() => openView(item)} onDelete={() => handleDelete(item)} />
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      {/* ===== Header ===== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">จัดการนักเรียน</h1>
          <p className="mt-1 text-sm text-gray-500">ดูและจัดการข้อมูลนักเรียนที่กำลังเรียนอยู่ทั้งหมด</p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button variant="outline" onClick={loadStudents} disabled={isLoading} className="!w-10 !h-10 !p-0 !rounded-xl border-gray-200" title="รีเฟรชข้อมูล">
            <RefreshCw className={`h-4 w-4 text-gray-600 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* ===== Summary Cards ===== */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="นักเรียนทั้งหมด" value={stats.total} icon={GraduationCap} tint="bg-rose-100 text-rose-700" />
        <SummaryCard label="ระบุอีเมล" value={stats.withEmail} icon={Mail} tint="bg-sky-100 text-sky-700" />
        <SummaryCard label="ระบุเบอร์โทร" value={stats.withPhone} icon={Phone} tint="bg-emerald-100 text-emerald-700" />
        <SummaryCard label="ระบุชื่อเล่น" value={stats.withNickname} icon={UserRound} tint="bg-violet-100 text-violet-700" />
      </div>

      {error && (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ===== Search Toolbar (สไตล์สอดคล้องกับการ์ด) ===== */}
      <div className="mt-6">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="ค้นหาชื่อ, รหัสนักเรียน, อีเมล..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-2xl border border-gray-100 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] transition-all outline-none placeholder:text-gray-400 focus:border-gray-200 focus:shadow-[0_6px_20px_-2px_rgba(0,0,0,0.08)]"
          />
        </div>
      </div>

      {/* ===== Table Component ===== */}
      <DataTable
        isLoading={isLoading}
        data={filteredStudents}
        columns={studentColumns}
        keyExtractor={(item) => getId(item)}
        emptyMessage="ไม่พบข้อมูลนักเรียนในระบบ"
        totalCount={students.length}
      />

      {/* ===== View Modal ===== */}
      <ViewMemberModal 
        isOpen={modalMode === "view"} 
        onClose={closeModal} 
        selected={selected} 
        isLoadingDetail={isLoadingDetail} 
        getId={getId} 
      />
    </div>
  );
}