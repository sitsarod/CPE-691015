"use client";

import { useState } from "react";
import { Plus, Users, UserCheck, Dumbbell, ShieldCheck, Loader2, Eye, Trash2, ChevronRight } from "lucide-react";
import Button from "@/components/Button";
import { SummaryCard, RoleBadge, StatusPill, normalizeRole, isActive } from "@/components/admin/ManagementUI";
import { AdminPageHeader, AdminErrorBanner } from "@/components/admin/shared/AdminPageShell";
import { MemberFilterToolbar } from "@/components/admin/MemberFilterToolbar";
import { ViewMemberModal } from "@/components/admin/modals/ViewMemberModal";
import { CreateMemberModal } from "@/components/admin/modals/CreateMemberModal";
import { EditMemberModal } from "@/components/admin/modals/EditMemberModal";
import { UserProfileResponseDTO } from "@/types/user";
import { getId, type MemberManagement } from "./useMemberManagement";

/**
 * หน้าจัดการสมาชิก — เวอร์ชันมือถือ
 *
 * การ์ดต่อคน แสดง avatar/ชื่อ/บทบาท/สถานะ แตะทั้งใบเพื่อเปิด action sheet
 * (ดูรายละเอียด / ลบ) ปุ่ม "เพิ่มสมาชิกใหม่" อยู่บนหัวเรื่อง
 */
export function MemberManagementMobile({ manager }: { manager: MemberManagement }) {
  const [actionItem, setActionItem] = useState<UserProfileResponseDTO | null>(null);

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        title="จัดการสมาชิก"
        subtitle="ดู เพิ่ม และจัดการบัญชีผู้ใช้ทั้งหมดในระบบ"
        onRefresh={manager.reload}
        isLoading={manager.isLoading}
        actions={
          <Button
            variant="primary"
            onClick={manager.openCreate}
            className="!w-auto flex items-center gap-2 rounded-xl px-4 py-2.5 bg-[#E63946] hover:bg-[#d62839]"
          >
            <Plus className="h-4 w-4" /> เพิ่มสมาชิก
          </Button>
        }
      />

      <div className="mt-6 grid grid-cols-2 gap-3">
        <SummaryCard label="สมาชิกทั้งหมด" value={manager.stats.total} icon={Users} tint="bg-gray-100 text-gray-700" />
        <SummaryCard label="กำลังใช้งาน" value={manager.stats.active} icon={UserCheck} tint="bg-emerald-100 text-emerald-700" />
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

      {/* การ์ด — แตะที่ใดก็ได้เพื่อเปิดเมนูจัดการ */}
      <div className="mt-4 space-y-2.5">
        {manager.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-[#E63946]" /></div>
        ) : manager.filteredMembers.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center text-sm text-gray-400">ไม่พบข้อมูลสมาชิกในระบบ</div>
        ) : (
          <>
            {manager.filteredMembers.map((item) => (
              <div
                key={getId(item)}
                onClick={() => setActionItem(item)}
                className="relative cursor-pointer rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition active:scale-[0.99]"
              >
                <ChevronRight className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />

                <div className="flex items-center gap-2.5 pr-6">
                  {item.profile_picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.profile_picture} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-gray-200" />
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#E63946] to-[#CC0000] text-sm font-bold text-white">
                      {(item.firstName?.[0] || item.nickname?.[0] || "U").toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-gray-900">{item.firstName} {item.lastName}</span>
                      {item.nickname && <span className="text-xs text-gray-400">({item.nickname})</span>}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">{item.email || `ID #${getId(item)}`}</p>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2.5">
                  <RoleBadge role={normalizeRole(item.role)} />
                  <StatusPill active={isActive(item.status)} status={item.status} />
                </div>
              </div>
            ))}
            <p className="px-1 pt-1 text-xs text-gray-400">แสดง {manager.filteredMembers.length} จาก {manager.members.length} รายการ</p>
          </>
        )}
      </div>

      {/* action sheet */}
      {actionItem && (
        <div className="fixed inset-0 z-50" onClick={() => setActionItem(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white pb-[calc(env(safe-area-inset-bottom)+10px)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-gray-200" />
            <div className="flex items-center gap-3 px-5 py-3">
              {actionItem.profile_picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={actionItem.profile_picture} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-gray-200" />
              ) : (
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#E63946] to-[#CC0000] text-sm font-bold text-white">
                  {(actionItem.firstName?.[0] || actionItem.nickname?.[0] || "U").toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-gray-900">{actionItem.firstName} {actionItem.lastName}</p>
                {actionItem.email && <p className="truncate text-xs text-gray-500">{actionItem.email}</p>}
              </div>
            </div>

            <div className="border-t border-gray-100 py-1">
              <button onClick={() => { const it = actionItem; setActionItem(null); manager.openView(it); }} className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm font-medium text-gray-700 active:bg-gray-50">
                <Eye className="h-5 w-5 text-gray-400" /> ดูรายละเอียด
              </button>
              <button onClick={() => { const it = actionItem; setActionItem(null); manager.handleDeleteMember(it); }} className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm font-medium text-red-600 active:bg-red-50">
                <Trash2 className="h-5 w-5" /> ลบ
              </button>
            </div>

            <div className="px-3 pt-2">
              <button onClick={() => setActionItem(null)} className="w-full rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-600 active:bg-gray-200">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* modals — ใช้ร่วมกับฝั่งคอม */}
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
