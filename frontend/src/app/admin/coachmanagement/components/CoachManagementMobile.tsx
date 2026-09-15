"use client";

import { useState } from "react";
import { Dumbbell, CircleCheck, CircleSlash, Phone, Eye, CalendarClock, Power, Trash2, ChevronRight } from "lucide-react";
import { Pill, SummaryCard } from "@/components/admin/ManagementUI";
import { AdminPageHeader, AdminErrorBanner } from "@/components/admin/shared/AdminPageShell";
import { MemberFilterToolbar } from "@/components/admin/MemberFilterToolbar";
import { ViewCoachModal } from "@/components/admin/modals/ViewCoachModal";
import { ViewCoachScheduleModal } from "@/components/admin/modals/ViewCoachScheduleModal";
import { EditCoachModal } from "@/components/admin/modals/EditCoachModal";
import { CoachListItem } from "@/services/coachAPI";
import type { CoachManagement } from "./useCoachManagement";

/**
 * หน้าจัดการโค้ช — เวอร์ชันมือถือ
 *
 * ตารางฝั่งคอมมีห้าคอลัมน์บีบลงจอแคบไม่ได้ จึงทำเป็น "การ์ดต่อคน" แตะทั้งใบ
 * เพื่อเปิดแผ่นเลื่อน (action sheet) จากด้านล่าง มีเมนู ดู/ตารางเวลา/พักงาน/ลบ
 * ตรรกะทั้งหมด (โหลด ค้นหา เปิดดู บันทึก ลบ) ใช้ของ useCoachManagement ตัวเดียวกับฝั่งคอม
 */
export function CoachManagementMobile({ manager }: { manager: CoachManagement }) {
  const [actionCoach, setActionCoach] = useState<CoachListItem | null>(null);

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

      {/* การ์ด — กดที่ใดก็ได้ของการ์ดเพื่อเปิดเมนูจัดการ */}
      <div className="mt-6 space-y-2.5">
        {manager.isLoading ? (
          // การ์ดจำลองตอนโหลด — ล้อการ์ดจริง (รูปกลม + ชื่อ + อีเมล + ป้ายระดับ)
          <>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4">
                <div className="h-11 w-11 flex-none rounded-full bg-gray-200" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-40 max-w-full rounded bg-gray-200" />
                  <div className="h-3 w-32 max-w-full rounded bg-gray-100" />
                </div>
                <div className="h-6 w-14 flex-none rounded-full bg-gray-100" />
              </div>
            ))}
          </>
        ) : manager.filteredCoaches.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center text-sm text-gray-400">
            ไม่พบข้อมูลโค้ชในระบบ
          </div>
        ) : (
          <>
            {manager.filteredCoaches.map((item) => (
              <div
                key={item.id}
                onClick={() => setActionCoach(item)}
                className="relative cursor-pointer rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition active:scale-[0.99]"
              >
                <ChevronRight className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />

                <div className="flex items-center gap-2.5 pr-6">
                  {item.profile_picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.profile_picture}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-gray-200"
                    />
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#E63946] to-[#CC0000] text-sm font-bold text-white">
                      {(item.firstName?.[0] || item.nickname?.[0] || "C").toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-gray-900">
                        {item.firstName} {item.lastName}
                      </span>
                      {item.nickname && <span className="text-xs text-gray-400">({item.nickname})</span>}
                      {item.status === "inactive" && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500 ring-1 ring-inset ring-gray-300">
                          พักงาน
                        </span>
                      )}
                    </div>
                    {item.email && <p className="mt-0.5 truncate text-xs text-gray-500">{item.email}</p>}
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2.5 text-xs">
                  {item.specialization && (
                    <Pill label={`ระดับ ${item.specialization}`} color="bg-sky-50 text-sky-700 ring-sky-600/20" />
                  )}
                  {item.coach_license && (
                    <Pill label={item.coach_license} color="bg-violet-50 text-violet-700 ring-violet-600/20" />
                  )}
                  <span className="inline-flex items-center gap-1 text-gray-500">
                    <Phone className="h-3.5 w-3.5" /> {item.phone || "-"}
                  </span>
                </div>
              </div>
            ))}
            <p className="px-1 pt-1 text-xs text-gray-400">
              แสดง {manager.filteredCoaches.length} จาก {manager.coaches.length} รายการ
            </p>
          </>
        )}
      </div>

      {/* action sheet — เปิดเมื่อแตะการ์ด */}
      {actionCoach && (
        <div className="fixed inset-0 z-50" onClick={() => setActionCoach(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white pb-[calc(env(safe-area-inset-bottom)+10px)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-gray-200" />

            <div className="flex items-center gap-3 px-5 py-3">
              {actionCoach.profile_picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={actionCoach.profile_picture}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-gray-200"
                />
              ) : (
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#E63946] to-[#CC0000] text-sm font-bold text-white">
                  {(actionCoach.firstName?.[0] || actionCoach.nickname?.[0] || "C").toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-gray-900">
                  {actionCoach.firstName} {actionCoach.lastName}
                </p>
                {actionCoach.email && <p className="truncate text-xs text-gray-500">{actionCoach.email}</p>}
              </div>
            </div>

            <div className="border-t border-gray-100 py-1">
              <button
                onClick={() => { const c = actionCoach; setActionCoach(null); manager.openView(c); }}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm font-medium text-gray-700 active:bg-gray-50"
              >
                <Eye className="h-5 w-5 text-gray-400" /> ดูรายละเอียด
              </button>
              <button
                onClick={() => { const c = actionCoach; setActionCoach(null); manager.openSchedule(c); }}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm font-medium text-gray-700 active:bg-gray-50"
              >
                <CalendarClock className="h-5 w-5 text-gray-400" /> ดูตารางเวลาว่าง
              </button>
              <button
                onClick={() => { const c = actionCoach; setActionCoach(null); manager.handleToggleStatus(c); }}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm font-medium text-gray-700 active:bg-gray-50"
              >
                <Power className="h-5 w-5 text-gray-400" />
                {actionCoach.status !== "inactive" ? "ปิดใช้งาน (พักงาน)" : "เปิดใช้งาน"}
              </button>
              <button
                onClick={() => { const c = actionCoach; setActionCoach(null); manager.handleDelete(c); }}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm font-medium text-red-600 active:bg-red-50"
              >
                <Trash2 className="h-5 w-5" /> ลบ
              </button>
            </div>

            <div className="px-3 pt-2">
              <button
                onClick={() => setActionCoach(null)}
                className="w-full rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-600 active:bg-gray-200"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* modal ต่าง ๆ — ใช้ร่วมกับฝั่งคอม */}
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
