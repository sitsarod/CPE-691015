"use client";

import { GraduationCap, Phone, UserRound, AlertCircle, CalendarClock } from "lucide-react";
import { SummaryCard } from "@/components/admin/ManagementUI";
import { MemberFilterToolbar } from "@/components/admin/MemberFilterToolbar";
import { AdminPageHeader, AdminErrorBanner } from "@/components/admin/shared/AdminPageShell";
import { DataTable } from "@/components/admin/DataTable";
import { ViewMemberModal } from "@/components/admin/modals/ViewMemberModal";
import { EditMemberModal } from "@/components/admin/modals/EditMemberModal";
import StudentEnrollmentsModal from "@/components/admin/modals/StudentEnrollmentsModal";
import { buildStudentColumns } from "./studentColumns";
import { getId, type StudentManagement } from "./useStudentManagement";

/**
 * หน้าจัดการนักเรียน — เวอร์ชันหน้าจอคอมพิวเตอร์
 *
 * วางของอย่างเดียว ไม่มีการเรียก API และไม่มีการตัดสินใจ
 * ทุกอย่างมาจาก useStudentManagement ที่ส่งเข้ามาทาง prop เดียว
 */
export function StudentManagementDesktop({ manager }: { manager: StudentManagement }) {
  const columns = buildStudentColumns({
    onView: manager.openView,
    onDelete: manager.handleDelete,
    onOpenEnrollments: manager.setEnrollmentsOf,
  });

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        title="จัดการนักเรียน"
        subtitle="ดูและจัดการข้อมูลนักเรียนที่กำลังเรียนอยู่ทั้งหมด"
        onRefresh={manager.reload}
        isLoading={manager.isLoading}
      />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="นักเรียนทั้งหมด" value={manager.stats.total} icon={GraduationCap} tint="bg-rose-100 text-rose-700" />
        <SummaryCard label="มีครั้งทบรอใช้" value={manager.stats.carryOver} icon={CalendarClock} tint="bg-emerald-100 text-emerald-700" />
        <SummaryCard label="ระบุเบอร์โทร" value={manager.stats.withPhone} icon={Phone} tint="bg-emerald-100 text-emerald-700" />
        <SummaryCard label="ระบุชื่อเล่น" value={manager.stats.withNickname} icon={UserRound} tint="bg-violet-100 text-violet-700" />
      </div>

      <AdminErrorBanner message={manager.error} />

      {/* แถบกลุ่มที่มีครั้งทบรอใช้ — กดเพื่อกรองเฉพาะกลุ่มนี้ */}
      {manager.carryOverStudents.length > 0 && (
        <button
          type="button"
          onClick={() => manager.setShowCarryOverOnly((v) => !v)}
          className={`mt-6 flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${
            manager.showCarryOverOnly ? "border-emerald-300 bg-emerald-100" : "border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
          }`}
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-emerald-900">
              มี {manager.carryOverStudents.length} คนที่มีครั้งทบรอใช้อยู่
            </p>
            <p className="mt-0.5 text-sm text-emerald-700">
              ครั้งพวกนี้จะถูกบวกเข้าให้อัตโนมัติเมื่อสมัครคอร์สเดิมอีกครั้ง ·{" "}
              <span className="font-semibold underline">
                {manager.showCarryOverOnly ? "แสดงทั้งหมด" : "ดูเฉพาะกลุ่มนี้"}
              </span>
            </p>
          </div>
        </button>
      )}

      {/*
        เดิมหน้านี้เขียนช่องค้นหาเองแทนที่จะใช้ MemberFilterToolbar เหมือนอีกสองหน้า
        ผลคือขอบมนกับเงาไม่เท่ากับหน้าอื่นโดยไม่มีเหตุผล ตอนนี้ใช้ตัวเดียวกันแล้ว
      */}
      <MemberFilterToolbar
        searchTerm={manager.searchTerm}
        setSearchTerm={manager.setSearchTerm}
        placeholder="ค้นหาชื่อ, รหัสนักเรียน, อีเมล..."
      />

      <DataTable
        isLoading={manager.isLoading}
        data={manager.filteredStudents}
        columns={columns}
        keyExtractor={(item) => getId(item)}
        emptyMessage="ไม่พบข้อมูลนักเรียนในระบบ"
        totalCount={manager.students.length}
      />

      <ViewMemberModal
        isOpen={manager.modalMode === "view"}
        onClose={manager.closeModal}
        detail={manager.detail}
        isLoadingDetail={manager.isLoadingDetail}
        onEdit={() => manager.selected && manager.openEdit(manager.selected)}
      />

      <EditMemberModal
        isOpen={manager.modalMode === "edit"}
        onClose={manager.closeModal}
        role={manager.detail?.role ?? "customer"}
        editForm={manager.editForm}
        setEditForm={manager.setEditForm}
        formError={manager.formError}
        isSubmitting={manager.isSubmitting || manager.isLoadingDetail}
        onSave={manager.handleUpdate}
      />

      <StudentEnrollmentsModal
        userId={manager.enrollmentsOf ? getId(manager.enrollmentsOf) : null}
        studentName={manager.enrollmentsOf ? `${manager.enrollmentsOf.firstName} ${manager.enrollmentsOf.lastName}` : ""}
        onClose={() => manager.setEnrollmentsOf(null)}
      />
    </div>
  );
}
