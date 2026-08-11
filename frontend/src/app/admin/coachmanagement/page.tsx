"use client";

import { useState, useEffect } from "react";
import { Plus, RefreshCw, AlertCircle, Dumbbell, Award, Phone, UserRound } from "lucide-react";
import {
  getAllCoachesAPI,
  getCoachDetailAPI,
  createCoachAPI,
  updateCoachAPI,
  adminUpdateCoachLevelAPI,
  deleteCoachAPI,
  CoachListItem,
  CreateCoachInput,
} from "@/services/coachAPI";
import { CoachProfile } from "@/types/coach";
import Button from "@/components/Button";
import { MemberFilterToolbar } from "@/components/admin/MemberFilterToolbar";
import { Pill, SummaryCard, RowActionMenu } from "@/components/admin/ManagementUI";
import { ViewCoachModal } from "@/components/admin/modals/ViewCoachModal";
import { CreateCoachModal } from "@/components/admin/modals/CreateCoachModal";
import { EditCoachModal, EditCoachForm } from "@/components/admin/modals/EditCoachModal";
import { DataTable, Column } from "@/components/admin/DataTable";

type ModalMode = "view" | "create" | "edit" | null;

const emptyCreateForm: CreateCoachInput = {
  user_id: 0, phone: "", uid: "", address: "", birth_date: "", nickname: "",
  profile_picture: "", specialization: "", coach_license: "", bank_account: "", payment_info: "",
  payment_type: "per_session", pay_rate: 0,
};

const emptyEditForm: EditCoachForm = {
  nickname: "", phone: "", address: "", bank_account: "", payment_info: "",
  specialization: "", coach_license: "", payment_type: "per_session", pay_rate: 0,
};

export default function CoachManagementPage() {
  const [coaches, setCoaches] = useState<CoachListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<CoachListItem | null>(null);
  const [detail, setDetail] = useState<CoachProfile | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateCoachInput>(emptyCreateForm);
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

  const openCreate = () => {
    setCreateForm(emptyCreateForm);
    setFormError(null);
    setModalMode("create");
  };

  const handleCreate = async () => {
    setFormError(null);

    if (!createForm.user_id || createForm.user_id <= 0) {
      setFormError("กรุณาระบุ User ID ของผู้ใช้ (ต้องเป็นผู้ใช้ที่มี role = coach)");
      return;
    }
    const required: [keyof CreateCoachInput, string][] = [
      ["nickname", "ชื่อเล่น"], ["phone", "เบอร์โทรศัพท์"], ["uid", "เลขบัตรประชาชน (UID)"],
      ["address", "ที่อยู่"], ["birth_date", "วันเกิด"], ["specialization", "ระดับฝีมือ"],
      ["coach_license", "ใบรับรองผู้ฝึกสอน"],
      ["bank_account", "เลขบัญชีธนาคาร"], ["payment_info", "ข้อมูลการจ่ายเงิน"],
    ];
    for (const [key, label] of required) {
      if (!String(createForm[key]).trim()) {
        setFormError(`กรุณากรอก: ${label}`);
        return;
      }
    }
    if (!/^\d{10}$/.test(createForm.phone)) {
      setFormError("เบอร์โทรต้องเป็นตัวเลข 10 หลัก");
      return;
    }
    if (!/^\d{13}$/.test(createForm.uid)) {
      setFormError("เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก");
      return;
    }
    if (!createForm.pay_rate || createForm.pay_rate <= 0) {
      setFormError(createForm.payment_type === "monthly" ? "กรุณากรอกค่าจ้างต่อเดือนให้ถูกต้อง" : "กรุณากรอกค่าจ้างต่อครั้งให้ถูกต้อง");
      return;
    }

    try {
      setIsSubmitting(true);
      await createCoachAPI(createForm);
      closeModal();
      await loadCoaches();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "ไม่สามารถสร้างโปรไฟล์โค้ชได้");
    } finally {
      setIsSubmitting(false);
    }
  };

  // เปิดฟอร์มแก้ไข โดยโหลดข้อมูลจาก detail (ที่หน้า View โหลดไว้แล้ว) มา prefill
  const openEdit = () => {
    if (!detail) return;
    setEditingId(detail.id);
    setEditForm({
      nickname: detail.nickname ?? "",
      phone: detail.phone ?? "",
      address: detail.address ?? "",
      bank_account: detail.bank_account ?? "",
      payment_info: detail.payment_info ?? "",
      specialization: detail.specialization ?? "",
      coach_license: detail.coach_license ?? "",
      payment_type: detail.payment_type ?? "per_session",
      pay_rate: detail.pay_rate ?? 0,
    });
    setFormError(null);
    setModalMode("edit");
  };

  const handleUpdate = async () => {
    if (editingId == null) return;
    setFormError(null);

    const required: [keyof EditCoachForm, string][] = [
      ["nickname", "ชื่อเล่น"], ["phone", "เบอร์โทรศัพท์"], ["address", "ที่อยู่"],
      ["bank_account", "เลขบัญชีธนาคาร"], ["payment_info", "ข้อมูลการจ่ายเงิน"],
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

    try {
      setIsSubmitting(true);
      // ข้อมูลโปรไฟล์ทั่วไป + ระดับ/ค่าจ้าง (admin) — ยิงพร้อมกัน
      await Promise.all([
        updateCoachAPI(editingId, {
          nickname: editForm.nickname.trim(),
          phone: editForm.phone.trim(),
          address: editForm.address.trim(),
          bank_account: editForm.bank_account.trim(),
          payment_info: editForm.payment_info.trim(),
        }),
        adminUpdateCoachLevelAPI(editingId, {
          specialization: editForm.specialization.trim(),
          coach_license: editForm.coach_license.trim(),
          payment_type: editForm.payment_type,
          pay_rate: editForm.pay_rate,
        }),
      ]);
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

  const stats = {
    total: coaches.length,
    specializations: new Set(coaches.map((c) => c.specialization?.trim()).filter(Boolean)).size,
    withPhone: coaches.filter((c) => !!c.phone).length,
    withNickname: coaches.filter((c) => !!c.nickname).length,
  };

  const coachColumns: Column<CoachListItem>[] = [
    {
      header: "โค้ช",
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
          {item.email && (
            <span className="text-xs text-gray-500 mt-0.5 truncate">{item.email}</span>
          )}
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
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">จัดการโค้ช</h1>
          <p className="mt-1 text-sm text-gray-500">ดู และเพิ่มข้อมูลโค้ชทั้งหมดในระบบ</p>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={loadCoaches} disabled={isLoading} className="!w-10 !h-10 !p-0 !rounded-xl border-gray-200" title="รีเฟรชข้อมูล">
            <RefreshCw className={`h-4 w-4 text-gray-600 ${isLoading ? "animate-spin" : ""}`} />
          </Button>

          <Button variant="primary" onClick={openCreate} className="!w-auto flex items-center gap-2 rounded-xl px-4 py-2.5 bg-[#E63946] hover:bg-[#d62839]">
            <Plus className="h-4 w-4" /> เพิ่มโค้ชใหม่
          </Button>
        </div>
      </div>


      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="โค้ชทั้งหมด" value={stats.total} icon={Dumbbell} tint="bg-sky-100 text-sky-700" />
        <SummaryCard label="ความเชี่ยวชาญ (ประเภท)" value={stats.specializations} icon={Award} tint="bg-violet-100 text-violet-700" />
        <SummaryCard label="ระบุเบอร์ติดต่อ" value={stats.withPhone} icon={Phone} tint="bg-emerald-100 text-emerald-700" />
        <SummaryCard label="ระบุชื่อเล่น" value={stats.withNickname} icon={UserRound} tint="bg-rose-100 text-rose-700" />
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

      <DataTable
        isLoading={isLoading}
        data={filteredCoaches}
        columns={coachColumns}
        keyExtractor={(item) => item.id}
        totalCount={coaches.length}
        emptyMessage="ไม่พบข้อมูลโค้ชในระบบ"
      />

      <ViewCoachModal isOpen={modalMode === "view"} onClose={closeModal} selected={selected} detail={detail} isLoadingDetail={isLoadingDetail} onEdit={openEdit} />
      <CreateCoachModal isOpen={modalMode === "create"} onClose={closeModal} createForm={createForm} setCreateForm={setCreateForm} formError={formError} isSubmitting={isSubmitting} onCreate={handleCreate} />
      <EditCoachModal isOpen={modalMode === "edit"} onClose={closeModal} editForm={editForm} setEditForm={setEditForm} detail={detail} formError={formError} isSubmitting={isSubmitting} onSave={handleUpdate} />
    </div>
  );
}