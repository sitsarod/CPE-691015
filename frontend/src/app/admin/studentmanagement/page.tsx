"use client";

import { useState, useEffect } from "react";
import { RefreshCw, GraduationCap, Phone, UserRound, AlertCircle, Search, BookOpen, CalendarClock } from "lucide-react";
import {
  getActiveStudentsAPI,
  adminGetUserDetailAPI,
  adminUpdateUserAPI,
  type AdminUserDetail,
  type AdminUpdateUserInput,
  deleteUserAPI,
  StudentListResponseDTO,
} from "@/services/userAPI";
import Button from "@/components/Button";
import { SummaryCard, RowActionMenu } from "@/components/admin/ManagementUI";
import { ViewMemberModal } from "@/components/admin/modals/ViewMemberModal";
import { EditMemberModal } from "@/components/admin/modals/EditMemberModal";
import StudentEnrollmentsModal from "@/components/admin/modals/StudentEnrollmentsModal";
import { DataTable, Column } from "@/components/admin/DataTable";

const getId = (item: any): number => item?.id ?? item?.ID ?? 0;
type ModalMode = "view" | "edit" | null;

export default function StudentManagementPage() {
  const [students, setStudents] = useState<StudentListResponseDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<any>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<AdminUpdateUserInput>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const [enrollmentsOf, setEnrollmentsOf] = useState<StudentListResponseDTO | null>(null);
  const [showGraceOnly, setShowGraceOnly] = useState(false);

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
    setDetail(null);
    setIsLoadingDetail(true);
    try {
      setDetail(await adminGetUserDetailAPI(item.id));
    } catch {
      /* ไม่มีรายละเอียด — modal จะแสดงว่าโหลดไม่ได้ */
    } finally {
      setIsLoadingDetail(false);
    }
  };

  /**
   * เปิดฟอร์มแก้ไข — โหลดรายละเอียดเต็มก่อนเสมอ
   *
   * ข้อมูลในตารางไม่มีวันเกิด/เพศ/ข้อมูลผู้ปกครองครบ ถ้า prefill จากแถว
   * แล้วกดบันทึก ค่าที่ไม่ได้โหลดมาจะถูกทับด้วยค่าว่าง
   */
  const openEdit = async (item: StudentListResponseDTO) => {
    setModalMode("edit");
    setSelected(item);
    setFormError(null);
    setIsLoadingDetail(true);
    try {
      const d = detail?.id === item.id ? detail : await adminGetUserDetailAPI(item.id);
      setDetail(d);
      setEditingId(d.id);
      setEditForm({
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email,
        ...(d.customer ? { customer: { ...d.customer } } : {}),
      });
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "ไม่สามารถดึงข้อมูลนักเรียนได้");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleUpdate = async () => {
    if (editingId == null) return;
    setFormError(null);
    try {
      setIsSubmitting(true);
      await adminUpdateUserAPI(editingId, editForm);
      closeModal();
      await loadStudents();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "ไม่สามารถบันทึกการแก้ไขได้");
    } finally {
      setIsSubmitting(false);
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


  const graceStudents = students.filter((s) => (s.graceEnrollments ?? 0) > 0);

  const filteredStudents = students
    .filter((s) => (showGraceOnly ? (s.graceEnrollments ?? 0) > 0 : true))
    .filter((s) => {
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
    grace: graceStudents.length,
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
      header: "สิทธิ์เรียน",
      render: (item) =>
        (item.graceEnrollments ?? 0) > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
            <CalendarClock className="h-3 w-3" />
            รอขยายสิทธิ์ {item.graceEnrollments} คอร์ส
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
            onClick={() => setEnrollmentsOf(item)}
            title="ดูคอร์สและขยายสิทธิ์"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors ${
              (item.graceEnrollments ?? 0) > 0
                ? "border-[#CC0000] bg-red-50 text-[#CC0000] hover:bg-red-100"
                : "border-gray-300 bg-white text-gray-600 hover:border-[#CC0000] hover:text-[#CC0000]"
            }`}
          >
            <BookOpen className="h-4 w-4" />
            คอร์สเรียน
          </button>
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
        <SummaryCard label="รอขยายสิทธิ์" value={stats.grace} icon={CalendarClock} tint="bg-red-100 text-red-700" />
        <SummaryCard label="ระบุเบอร์โทร" value={stats.withPhone} icon={Phone} tint="bg-emerald-100 text-emerald-700" />
        <SummaryCard label="ระบุชื่อเล่น" value={stats.withNickname} icon={UserRound} tint="bg-violet-100 text-violet-700" />
      </div>

      {error && (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {graceStudents.length > 0 && (
        <button
          type="button"
          onClick={() => setShowGraceOnly((v) => !v)}
          className={`mt-6 flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${
            showGraceOnly
              ? "border-red-300 bg-red-100"
              : "border-red-200 bg-red-50 hover:bg-red-100"
          }`}
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-red-900">
              มี {graceStudents.length} คนที่คอร์สหมดอายุแล้วแต่ยังเรียนไม่ครบ
            </p>
            <p className="mt-0.5 text-sm text-red-700">
              ติดต่อกลับเพื่อขยายเวลาหรือเพิ่มจำนวนครั้งให้ก่อนพ้นช่วงผ่อนผัน ·{" "}
              <span className="font-semibold underline">
                {showGraceOnly ? "แสดงทั้งหมด" : "ดูเฉพาะกลุ่มนี้"}
              </span>
            </p>
          </div>
        </button>
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
        detail={detail}
        isLoadingDetail={isLoadingDetail}
        onEdit={() => selected && openEdit(selected)}
      />

      <EditMemberModal
        isOpen={modalMode === "edit"}
        onClose={closeModal}
        role={detail?.role ?? "customer"}
        editForm={editForm}
        setEditForm={setEditForm}
        formError={formError}
        isSubmitting={isSubmitting || isLoadingDetail}
        onSave={handleUpdate}
      />

      <StudentEnrollmentsModal
        userId={enrollmentsOf ? getId(enrollmentsOf) : null}
        studentName={
          enrollmentsOf
            ? `${enrollmentsOf.firstName} ${enrollmentsOf.lastName}`
            : ""
        }
        onClose={() => setEnrollmentsOf(null)}
        // โหลดรายชื่อใหม่เพราะธง "รอขยายสิทธิ์" อาจหายไปหลังขยายให้แล้ว
        onChanged={loadStudents}
      />
    </div>
  );
}