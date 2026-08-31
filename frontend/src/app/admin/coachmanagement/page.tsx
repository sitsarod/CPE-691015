"use client";

import { useState, useEffect } from "react";
import { RefreshCw, AlertCircle, Dumbbell, CircleCheck, CircleSlash, Loader2, Phone, Eye, CalendarClock, Power, Trash2, ChevronRight } from "lucide-react";
import {
  getAllCoachesAPI,
  getCoachDetailAPI,
  deleteCoachAPI,
  CoachListItem,
} from "@/services/coachAPI";
import { CoachProfile } from "@/types/coach";
import { adminUpdateUserAPI } from "@/services/userAPI";
import Button from "@/components/Button";
import { MemberFilterToolbar } from "@/components/admin/MemberFilterToolbar";
import { Pill, SummaryCard, RowActionMenu } from "@/components/admin/ManagementUI";
import { ViewCoachModal } from "@/components/admin/modals/ViewCoachModal";
import { ViewCoachScheduleModal } from "@/components/admin/modals/ViewCoachScheduleModal";
import { EditCoachModal, EditCoachForm } from "@/components/admin/modals/EditCoachModal";
import { DataTable, Column } from "@/components/admin/DataTable";

// การ "เพิ่มโค้ช" ย้ายไปอยู่หน้าจัดการสมาชิกแล้ว (สร้าง user + โปรไฟล์ใน transaction เดียว)
// หน้านี้จึงเหลือแค่ ดู / แก้ไข / ดูตารางเวลาว่าง / ลบ
type ModalMode = "view" | "edit" | "schedule" | null;

const emptyEditForm: EditCoachForm = {
  nickname: "", phone: "", lineId: "", facebook: "", address: "", bank_account: "", payment_info: "", prompt_pay: "",
  specialization: "", coach_license: "", payment_type: "per_session", pay_rate: 0, bio: "",
};

export default function CoachManagementPage() {
  const [coaches, setCoaches] = useState<CoachListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [actionCoach, setActionCoach] = useState<CoachListItem | null>(null); // การ์ดมือถือที่ถูกแตะ → เปิด action sheet
  const [selected, setSelected] = useState<CoachListItem | null>(null);
  const [detail, setDetail] = useState<CoachProfile | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditCoachForm>(emptyEditForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  const loadCoaches = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getAllCoachesAPI();
      setCoaches(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการโหลดข้อมูลโค้ช");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadCoaches(); }, []);

  const closeModal = () => {
    setModalMode(null);
    setSelected(null);
    setDetail(null);
    setFormError(null);
    setEditingId(null);
  };

  const openView = async (item: CoachListItem) => {
    setModalMode("view");
    setSelected(item);
    setDetail(null);
    setIsLoadingDetail(true);
    try {
      const d = await getCoachDetailAPI(item.id);
      setDetail(d);
    } catch { /* ใช้ข้อมูลแถวไปก่อน */ } finally {
      setIsLoadingDetail(false);
    }
  };

  const openSchedule = (item: CoachListItem) => {
    setSelected(item);
    setModalMode("schedule");
  };

  // เปิดฟอร์มแก้ไข โดยโหลดข้อมูลจาก detail (ที่หน้า View โหลดไว้แล้ว) มา prefill
  const openEdit = () => {
    if (!detail) return;
    setEditingId(detail.id);
    setEditForm({
      nickname: detail.nickname ?? "",
      phone: detail.phone ?? "",
      lineId: detail.lineId ?? "",
      facebook: detail.facebook ?? "",
      address: detail.address ?? "",
      bank_account: detail.bank_account ?? "",
      payment_info: detail.payment_info ?? "",
      prompt_pay: detail.prompt_pay ?? "",
      specialization: detail.specialization ?? "",
      coach_license: detail.coach_license ?? "",
      payment_type: detail.payment_type ?? "per_session",
      pay_rate: detail.pay_rate ?? 0,
      bio: detail.bio ?? "",
    });
    setFormError(null);
    setModalMode("edit");
  };

  const handleUpdate = async () => {
    if (editingId == null) return;
    setFormError(null);

    const required: [keyof EditCoachForm, string][] = [
      ["nickname", "ชื่อเล่น"], ["phone", "เบอร์โทรศัพท์"], ["address", "ที่อยู่"],
      ["bank_account", "ธนาคาร"], ["payment_info", "เลขบัญชี"], ["prompt_pay", "พร้อมเพย์"],
      ["specialization", "ระดับฝีมือ"], ["coach_license", "ใบรับรองผู้ฝึกสอน"],
    ];
    for (const [key, label] of required) {
      if (!String(editForm[key]).trim()) {
        setFormError(`กรุณากรอก: ${label}`);
        return;
      }
    }
    if (!/^\d{10}$/.test(editForm.phone)) {
      setFormError("เบอร์โทรต้องเป็นตัวเลข 10 หลัก");
      return;
    }
    if (!editForm.pay_rate || editForm.pay_rate <= 0) {
      setFormError(editForm.payment_type === "monthly" ? "กรุณากรอกค่าจ้างต่อเดือนให้ถูกต้อง" : "กรุณากรอกค่าจ้างต่อครั้งให้ถูกต้อง");
      return;
    }

    if (!detail) {
      setFormError("ไม่พบข้อมูลโค้ช กรุณาปิดหน้าต่างแล้วลองใหม่");
      return;
    }

    try {
      setIsSubmitting(true);

      // ยิงผ่าน endpoint ของแอดมินเส้นเดียว เพราะหน้านี้เป็นหน้าของแอดมิน
      // และตามนโยบายใหม่ ชื่อเล่น/บัญชีธนาคาร/ข้อมูลจ่ายเงิน ถูกถอดออกจาก
      // PATCH /coaches/:id (ที่โค้ชเรียกเองได้) แล้ว จึงต้องแก้ทางนี้เท่านั้น
      //
      // ใช้ detail.user_id ไม่ใช่ editingId เพราะ endpoint นี้รับ users.id
      await adminUpdateUserAPI(detail.user_id, {
        coach: {
          nickname: editForm.nickname.trim(),
          phone: editForm.phone.trim(),
          lineId: editForm.lineId.trim(),
          facebook: editForm.facebook.trim(),
          address: editForm.address.trim(),
          bank_account: editForm.bank_account.trim(),
          payment_info: editForm.payment_info.trim(),
          prompt_pay: editForm.prompt_pay.trim(),
          specialization: editForm.specialization.trim(),
          coach_license: editForm.coach_license.trim(),
          payment_type: editForm.payment_type,
          pay_rate: editForm.pay_rate,
          bio: editForm.bio.trim(),
        },
      });

      closeModal();
      await loadCoaches();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "ไม่สามารถบันทึกการแก้ไขได้");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: CoachListItem) => {
    if (!confirm(`ต้องการลบโปรไฟล์โค้ช "${item.firstName} ${item.lastName}" ใช่หรือไม่?`)) return;
    try {
      await deleteCoachAPI(item.id);
      await loadCoaches();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถลบข้อมูลได้");
    }
  };

  // สลับสถานะเปิด/ปิดใช้งานของโค้ช (ยิงผ่าน endpoint แอดมินแก้สมาชิก)
  const handleToggleStatus = async (item: CoachListItem) => {
    const nextStatus = item.status === "inactive" ? "active" : "inactive";
    const verb = nextStatus === "inactive" ? "ปิดใช้งาน (พักงาน)" : "เปิดใช้งาน";
    if (!confirm(`ต้องการ${verb}โค้ช "${item.firstName} ${item.lastName}" ใช่หรือไม่?`)) return;
    try {
      await adminUpdateUserAPI(item.user_id, { coach: { status: nextStatus } });
      await loadCoaches();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถเปลี่ยนสถานะได้");
    }
  };

  const filteredCoaches = coaches.filter((c) => {
    const term = searchTerm.toLowerCase();
    return (
      c.id?.toString().includes(term) ||
      c.firstName?.toLowerCase().includes(term) ||
      c.lastName?.toLowerCase().includes(term) ||
      c.email?.toLowerCase().includes(term) ||
      c.nickname?.toLowerCase().includes(term) ||
      c.specialization?.toLowerCase().includes(term) ||
      c.coach_license?.toLowerCase().includes(term) ||
      c.phone?.toLowerCase().includes(term)
    );
  });

  // โค้ชที่ status = "inactive" ถือว่าพักงาน ที่เหลือ (รวมค่าว่าง/undefined) ถือว่า active
  const inactiveCount = coaches.filter((c) => c.status === "inactive").length;
  const stats = {
    total: coaches.length,
    active: coaches.length - inactiveCount,
    inactive: inactiveCount,
  };

  const coachColumns: Column<CoachListItem>[] = [
    {
      header: "โค้ช",
      render: (item) => (
        <div className="flex items-center gap-3 min-w-0">
          {item.profile_picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.profile_picture}
              alt=""
              className="h-10 w-10 rounded-full object-cover ring-1 ring-gray-200 shrink-0"
            />
          ) : (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#E63946] to-[#CC0000] text-sm font-bold text-white">
              {(item.firstName?.[0] || item.nickname?.[0] || "C").toUpperCase()}
            </span>
          )}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-gray-900">
                {item.firstName} {item.lastName}
              </span>
              {item.nickname && (
                <span className="text-xs text-gray-400">({item.nickname})</span>
              )}
              {item.status === "inactive" && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500 ring-1 ring-inset ring-gray-300">
                  พักงาน
                </span>
              )}
            </div>
            {item.email && (
              <span className="text-xs text-gray-500 mt-0.5 truncate">{item.email}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      header: "ระดับฝีมือ",
      render: (item) =>
        item.specialization ? (
          <Pill label={item.specialization} color="bg-sky-50 text-sky-700 ring-sky-600/20" />
        ) : (
          <span className="text-gray-400">-</span>
        ),
    },
    {
      header: "ใบรับรองผู้ฝึกสอน",
      render: (item) =>
        item.coach_license ? (
          <Pill label={item.coach_license} color="bg-violet-50 text-violet-700 ring-violet-600/20" />
        ) : (
          <span className="text-gray-400">-</span>
        ),
    },
    {
      header: "เบอร์โทรศัพท์",
      render: (item) => <span className="text-gray-600">{item.phone || "-"}</span>,
    },
    {
      header: "การจัดการ",
      className: "text-right w-20",
      render: (item) => (
        <div className="flex justify-end">
          <RowActionMenu
            onView={() => openView(item)}
            onSchedule={() => openSchedule(item)}
            onToggleStatus={() => handleToggleStatus(item)}
            isActive={item.status !== "inactive"}
            onDelete={() => handleDelete(item)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      {/* ===== Header ===== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">จัดการโค้ช</h1>
          <p className="mt-1 text-sm text-gray-500">ดู และเพิ่มข้อมูลโค้ชทั้งหมดในระบบ</p>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={loadCoaches} disabled={isLoading} className="!w-10 !h-10 !p-0 !rounded-xl border-gray-200" title="รีเฟรชข้อมูล">
            <RefreshCw className={`h-4 w-4 text-gray-600 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>


      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="โค้ชปัจจุบันทั้งหมด" value={stats.total} icon={Dumbbell} tint="bg-sky-100 text-sky-700" />
        <SummaryCard label="กำลังใช้งาน (active)" value={stats.active} icon={CircleCheck} tint="bg-emerald-100 text-emerald-700" />
        <SummaryCard label="พักงาน (inactive)" value={stats.inactive} icon={CircleSlash} tint="bg-gray-100 text-gray-600" />
      </div>

      {error && (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}


      <div className="mt-6">
        <MemberFilterToolbar
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          placeholder="ค้นหาชื่อ, ระดับ, เบอร์โทร..."
        />
      </div>

      {/* เดสก์ท็อป (md+): ตาราง */}
      <div className="hidden md:block">
        <DataTable
          isLoading={isLoading}
          data={filteredCoaches}
          columns={coachColumns}
          keyExtractor={(item) => item.id}
          totalCount={coaches.length}
          emptyMessage="ไม่พบข้อมูลโค้ชในระบบ"
        />
      </div>

      {/* มือถือ (< md): การ์ด — กดที่ใดก็ได้ของการ์ดเพื่อดูรายละเอียด */}
      <div className="mt-6 space-y-2.5 md:hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-[#E63946]" />
          </div>
        ) : filteredCoaches.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center text-sm text-gray-400">
            ไม่พบข้อมูลโค้ชในระบบ
          </div>
        ) : (
          <>
            {filteredCoaches.map((item) => (
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
              แสดง {filteredCoaches.length} จาก {coaches.length} รายการ
            </p>
          </>
        )}
      </div>

      <ViewCoachModal isOpen={modalMode === "view"} onClose={closeModal} selected={selected} detail={detail} isLoadingDetail={isLoadingDetail} onEdit={openEdit} />
      <ViewCoachScheduleModal isOpen={modalMode === "schedule"} onClose={closeModal} coach={selected} />
      <EditCoachModal isOpen={modalMode === "edit"} onClose={closeModal} editForm={editForm} setEditForm={setEditForm} detail={detail} formError={formError} isSubmitting={isSubmitting} onSave={handleUpdate} />

      {/* มือถือ: action sheet — เปิดเมื่อแตะการ์ด */}
      {actionCoach && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setActionCoach(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white pb-[calc(env(safe-area-inset-bottom)+10px)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-gray-200" />

            {/* หัว: ข้อมูลโค้ช */}
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
                onClick={() => { const c = actionCoach; setActionCoach(null); openView(c); }}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm font-medium text-gray-700 active:bg-gray-50"
              >
                <Eye className="h-5 w-5 text-gray-400" /> ดูรายละเอียด
              </button>
              <button
                onClick={() => { const c = actionCoach; setActionCoach(null); openSchedule(c); }}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm font-medium text-gray-700 active:bg-gray-50"
              >
                <CalendarClock className="h-5 w-5 text-gray-400" /> ดูตารางเวลาว่าง
              </button>
              <button
                onClick={() => { const c = actionCoach; setActionCoach(null); handleToggleStatus(c); }}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm font-medium text-gray-700 active:bg-gray-50"
              >
                <Power className="h-5 w-5 text-gray-400" />
                {actionCoach.status !== "inactive" ? "ปิดใช้งาน (พักงาน)" : "เปิดใช้งาน"}
              </button>
              <button
                onClick={() => { const c = actionCoach; setActionCoach(null); handleDelete(c); }}
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
    </div>
  );
}