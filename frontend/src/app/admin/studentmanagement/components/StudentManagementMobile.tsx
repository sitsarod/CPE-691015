"use client";

import { useState } from "react";
import { GraduationCap, Phone, UserRound, AlertCircle, CalendarClock, Loader2, Eye, BookOpen, Trash2, ChevronRight } from "lucide-react";
import { SummaryCard } from "@/components/admin/ManagementUI";
import { AdminPageHeader, AdminErrorBanner } from "@/components/admin/shared/AdminPageShell";
import { MemberFilterToolbar } from "@/components/admin/MemberFilterToolbar";
import { ViewMemberModal } from "@/components/admin/modals/ViewMemberModal";
import { EditMemberModal } from "@/components/admin/modals/EditMemberModal";
import StudentEnrollmentsModal from "@/components/admin/modals/StudentEnrollmentsModal";
import { StudentListResponseDTO } from "@/services/userAPI";
import { getId, type StudentManagement } from "./useStudentManagement";

/**
 * หน้าจัดการนักเรียน — เวอร์ชันมือถือ
 *
 * การ์ดต่อคน แตะทั้งใบเพื่อเปิด action sheet (ดูรายละเอียด / คอร์สเรียน / ลบ)
 * ปุ่ม "คอร์สเรียน" โชว์บนการ์ดด้วยเพื่อให้แตะง่าย
 * แถบ "มีครั้งทบรอใช้" อยู่บนสุด กดเพื่อกรองเฉพาะกลุ่มนั้น
 */
export function StudentManagementMobile({ manager }: { manager: StudentManagement }) {
  const [actionItem, setActionItem] = useState<StudentListResponseDTO | null>(null);

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        title="จัดการนักเรียน"
        subtitle="ดูและจัดการข้อมูลนักเรียนที่กำลังเรียนอยู่ทั้งหมด"
        onRefresh={manager.reload}
        isLoading={manager.isLoading}
      />

      <div className="mt-6 grid grid-cols-2 gap-3">
        <SummaryCard label="นักเรียนทั้งหมด" value={manager.stats.total} icon={GraduationCap} tint="bg-rose-100 text-rose-700" />
        <SummaryCard label="มีครั้งทบรอใช้" value={manager.stats.carryOver} icon={CalendarClock} tint="bg-emerald-100 text-emerald-700" />
        <SummaryCard label="ระบุเบอร์โทร" value={manager.stats.withPhone} icon={Phone} tint="bg-emerald-100 text-emerald-700" />
        <SummaryCard label="ระบุชื่อเล่น" value={manager.stats.withNickname} icon={UserRound} tint="bg-violet-100 text-violet-700" />
      </div>

      <AdminErrorBanner message={manager.error} />

      {/* แถบกลุ่มที่มีครั้งทบรอใช้ — กดเพื่อกรอง */}
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
              <span className="font-semibold underline">{manager.showCarryOverOnly ? "แสดงทั้งหมด" : "ดูเฉพาะกลุ่มนี้"}</span>
            </p>
          </div>
        </button>
      )}

      <MemberFilterToolbar
        searchTerm={manager.searchTerm}
        setSearchTerm={manager.setSearchTerm}
        placeholder="ค้นหาชื่อ, รหัสนักเรียน, อีเมล..."
      />

      {/* การ์ด — แตะที่ใดก็ได้เพื่อเปิดเมนูจัดการ */}
      <div className="mt-4 space-y-2.5">
        {manager.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-[#E63946]" /></div>
        ) : manager.filteredStudents.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center text-sm text-gray-400">ไม่พบข้อมูลนักเรียนในระบบ</div>
        ) : (
          <>
            {manager.filteredStudents.map((item) => {
              const carried = item.carryOverSessions ?? 0;
              return (
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
                        {(item.firstName?.[0] || item.nickname?.[0] || "S").toUpperCase()}
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

                  <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2.5 text-xs">
                    <span className="inline-flex items-center gap-1 text-gray-500">
                      <Phone className="h-3.5 w-3.5" /> {item.phoneNumber || "-"}
                    </span>
                    {carried > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                        <CalendarClock className="h-3 w-3" /> ทบรอใช้ {carried} ครั้ง
                      </span>
                    )}
                    {/* ปุ่มคอร์สเรียน — โชว์บนการ์ด แตะแล้วไม่เปิด action sheet */}
                    <button
                      onClick={(e) => { e.stopPropagation(); manager.setEnrollmentsOf(item); }}
                      className={`ml-auto inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold ${
                        carried > 0 ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-300 bg-white text-gray-600"
                      }`}
                    >
                      <BookOpen className="h-3.5 w-3.5" /> คอร์สเรียน
                    </button>
                  </div>
                </div>
              );
            })}
            <p className="px-1 pt-1 text-xs text-gray-400">แสดง {manager.filteredStudents.length} จาก {manager.students.length} รายการ</p>
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
                  {(actionItem.firstName?.[0] || actionItem.nickname?.[0] || "S").toUpperCase()}
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
              <button onClick={() => { const it = actionItem; setActionItem(null); manager.setEnrollmentsOf(it); }} className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm font-medium text-gray-700 active:bg-gray-50">
                <BookOpen className="h-5 w-5 text-gray-400" /> คอร์สเรียน
              </button>
              <button onClick={() => { const it = actionItem; setActionItem(null); manager.handleDelete(it); }} className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm font-medium text-red-600 active:bg-red-50">
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
