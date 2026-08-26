"use client";

import { Plus, Users, UserCheck, Dumbbell, ShieldCheck } from "lucide-react";
import Button from "@/components/Button";
import { SummaryCard } from "@/components/admin/ManagementUI";
import { AdminPageHeader, AdminErrorBanner } from "@/components/admin/shared/AdminPageShell";
import { ViewMemberModal } from "@/components/admin/modals/ViewMemberModal";
import { CreateMemberModal } from "@/components/admin/modals/CreateMemberModal";
import { EditMemberModal } from "@/components/admin/modals/EditMemberModal";
import { MemberFilterToolbar } from "@/components/admin/MemberFilterToolbar";
import { DataTable } from "@/components/admin/DataTable";
import { buildMemberColumns } from "./memberColumns";
import { getId, type MemberManagement } from "./useMemberManagement";

/**
 * หน้าจัดการสมาชิก — เวอร์ชันหน้าจอคอมพิวเตอร์
 *
 * ไฟล์นี้มีหน้าที่เดียวคือ "วางของ" ไม่มีการเรียก API ไม่มีการตัดสินใจ
 * ทุกอย่างมาจาก useMemberManagement ที่ส่งเข้ามาทาง prop เดียว
 *
 * เหตุผลที่รับเป็นก้อนเดียว (m) แทนที่จะแตกเป็น prop ละตัว:
 * หน้านี้ใช้ค่าจาก hook เกือบทั้งหมด ถ้าแตกเป็นรายตัวจะได้ prop ยี่สิบกว่าตัว
 * ซึ่งต้องตามแก้ทุกครั้งที่ hook เพิ่มอะไร แล้วก็ไม่ได้อ่านง่ายขึ้นเลย
 */
export function MemberManagementDesktop({ manager }: { manager: MemberManagement }) {
  const columns = buildMemberColumns({
    onView: manager.openView,
    onDelete: manager.handleDeleteMember,
  });

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        title="จัดการสมาชิก"
        subtitle="ดู เพิ่ม  และจัดการบัญชีผู้ใช้ทั้งหมดในระบบ"
        onRefresh={manager.reload}
        isLoading={manager.isLoading}
        actions={
          <Button
            variant="primary"
            onClick={manager.openCreate}
            className="!w-auto flex items-center gap-2 rounded-xl px-4 py-2.5 bg-[#E63946] hover:bg-[#d62839]"
          >
            <Plus className="h-4 w-4" /> เพิ่มสมาชิกใหม่
          </Button>
        }
      />

      {/* การ์ดสรุปยอด */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="สมาชิกทั้งหมด" value={manager.stats.total} icon={Users} tint="bg-gray-100 text-gray-700" />
        <SummaryCard label="กำลังใช้งาน (Active)" value={manager.stats.active} icon={UserCheck} tint="bg-emerald-100 text-emerald-700" />
        <SummaryCard label="โค้ช" value={manager.stats.coach} icon={Dumbbell} tint="bg-sky-100 text-sky-700" />
        <SummaryCard label="แอดมิน" value={manager.stats.admin} icon={ShieldCheck} tint="bg-violet-100 text-violet-700" />
      </div>

      <AdminErrorBanner message={manager.error} />

      <MemberFilterToolbar
        searchTerm={manager.searchTerm}
        setSearchTerm={manager.setSearchTerm}
        roleFilter={manager.roleFilter}
        setRoleFilter={manager.setRoleFilter}
      />

      <DataTable
        isLoading={manager.isLoading}
        data={manager.filteredMembers}
        columns={columns}
        keyExtractor={(item) => getId(item)}
        emptyMessage="ไม่พบข้อมูลสมาชิกในระบบ"
        totalCount={manager.members.length}
      />

      {/* หน้าต่างย่อย */}
      <ViewMemberModal
        isOpen={manager.modalMode === "view"}
        onClose={manager.closeModal}
        detail={manager.detail}
        isLoadingDetail={manager.isLoadingDetail}
        onEdit={() => manager.selected && manager.openEdit(manager.selected)}
      />

      <CreateMemberModal
        isOpen={manager.modalMode === "create"}
        onClose={manager.closeModal}
        createForm={manager.createForm}
        setCreateForm={manager.setCreateForm}
        formError={manager.formError}
        isSubmitting={manager.isSubmitting}
        onCreate={manager.handleCreate}
      />

      <EditMemberModal
        isOpen={manager.modalMode === "edit"}
        onClose={manager.closeModal}
        role={manager.detail?.role ?? ""}
        editForm={manager.editForm}
        setEditForm={manager.setEditForm}
        formError={manager.formError}
        isSubmitting={manager.isSubmitting || manager.isLoadingDetail}
        onSave={manager.handleUpdate}
        memberCode={manager.detail?.coach?.memberCode}
      />
    </div>
  );
}
