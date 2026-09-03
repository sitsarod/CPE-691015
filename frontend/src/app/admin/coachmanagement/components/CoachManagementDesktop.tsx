"use client";

import { Dumbbell, CircleCheck, CircleSlash } from "lucide-react";
import { SummaryCard } from "@/components/admin/ManagementUI";
import { AdminPageHeader, AdminErrorBanner } from "@/components/admin/shared/AdminPageShell";
import { MemberFilterToolbar } from "@/components/admin/MemberFilterToolbar";
import { DataTable } from "@/components/admin/DataTable";
import { ViewCoachModal } from "@/components/admin/modals/ViewCoachModal";
import { ViewCoachScheduleModal } from "@/components/admin/modals/ViewCoachScheduleModal";
import { EditCoachModal } from "@/components/admin/modals/EditCoachModal";
import { buildCoachColumns } from "./coachColumns";
import type { CoachManagement } from "./useCoachManagement";

/**
 * หน้าจัดการโค้ช — เวอร์ชันหน้าจอคอมพิวเตอร์
 *
 * ไฟล์นี้วางของอย่างเดียว ไม่มีการเรียก API และไม่มีการตัดสินใจ
 * ทุกอย่างมาจาก useCoachManagement ที่ส่งเข้ามาทาง prop เดียว
 */
export function CoachManagementDesktop({ manager }: { manager: CoachManagement }) {
  const columns = buildCoachColumns({
    onView: manager.openView,
    onSchedule: manager.openSchedule,
    onToggleStatus: manager.handleToggleStatus,
    onDelete: manager.handleDelete,
  });

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        title="จัดการโค้ช"
        subtitle="ดู และเพิ่มข้อมูลโค้ชทั้งหมดในระบบ"
        onRefresh={manager.reload}
        isLoading={manager.isLoading}
      />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="โค้ชปัจจุบันทั้งหมด" value={manager.stats.total} icon={Dumbbell} tint="bg-sky-100 text-sky-700" />
        <SummaryCard label="กำลังใช้งาน (active)" value={manager.stats.active} icon={CircleCheck} tint="bg-emerald-100 text-emerald-700" />
        <SummaryCard label="พักงาน (inactive)" value={manager.stats.inactive} icon={CircleSlash} tint="bg-gray-100 text-gray-600" />
      </div>

      <AdminErrorBanner message={manager.error} />

      <div className="mt-6">
        <MemberFilterToolbar
          searchTerm={manager.searchTerm}
          setSearchTerm={manager.setSearchTerm}
          placeholder="ค้นหาชื่อ, ระดับ, เบอร์โทร..."
        />
      </div>

      <DataTable
        isLoading={manager.isLoading}
        data={manager.filteredCoaches}
        columns={columns}
        keyExtractor={(item) => item.id}
        totalCount={manager.coaches.length}
        emptyMessage="ไม่พบข้อมูลโค้ชในระบบ"
      />

      <ViewCoachModal
        isOpen={manager.modalMode === "view"}
        onClose={manager.closeModal}
        selected={manager.selected}
        detail={manager.detail}
        isLoadingDetail={manager.isLoadingDetail}
        onEdit={manager.openEdit}
      />
      <ViewCoachScheduleModal
        isOpen={manager.modalMode === "schedule"}
        onClose={manager.closeModal}
        coach={manager.selected}
      />
      <EditCoachModal
        isOpen={manager.modalMode === "edit"}
        onClose={manager.closeModal}
        editForm={manager.editForm}
        setEditForm={manager.setEditForm}
        detail={manager.detail}
        formError={manager.formError}
        isSubmitting={manager.isSubmitting}
        onSave={manager.handleUpdate}
      />
    </div>
  );
}
