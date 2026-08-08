"use client";

import { useState, useEffect } from "react";
import { Plus, RefreshCw, AlertCircle, Dumbbell, Award, Phone, UserRound } from "lucide-react";
import {
  getAllCoachesAPI,
  getCoachDetailAPI,
  createCoachAPI,
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
import { DataTable, Column } from "@/components/admin/DataTable";

type ModalMode = "view" | "create" | null;

const emptyCreateForm: CreateCoachInput = {
  user_id: 0, phone: "", uid: "", address: "", birth_date: "", nickname: "",
  profile_picture: "", specialization: "", bank_account: "", payment_info: "", pay_rate_per_session: 0,
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
      ["address", "ที่อยู่"], ["birth_date", "วันเกิด"], ["specialization", "ระดับ/ความเชี่ยวชาญ"],
      ["profile_picture", "รูปโปรไฟล์ (URL)"], ["bank_account", "เลขบัญชีธนาคาร"], ["payment_info", "ข้อมูลการจ่ายเงิน"],
    ];
    for (const [key, label] of required) {
      if (!String(createForm[key]).trim()) {
        setFormError(`กรุณากรอก: ${label}`);
        return;
      }
    }
    if (!createForm.pay_rate_per_session || createForm.pay_rate_per_session <= 0) {
      setFormError("กรุณากรอกค่าจ้างต่อครั้งให้ถูกต้อง");
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
      c.nickname?.toLowerCase().includes(term) ||
      c.specialization?.toLowerCase().includes(term) ||
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
        </div>
      ),
    },
    {
      header: "ระดับ / ความเชี่ยวชาญ",
      render: (item) =>
        item.specialization ? (
          <Pill label={item.specialization} color="bg-sky-50 text-sky-700 ring-sky-600/20" />
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

      <ViewCoachModal isOpen={modalMode === "view"} onClose={closeModal} selected={selected} detail={detail} isLoadingDetail={isLoadingDetail} />
      <CreateCoachModal isOpen={modalMode === "create"} onClose={closeModal} createForm={createForm} setCreateForm={setCreateForm} formError={formError} isSubmitting={isSubmitting} onCreate={handleCreate} />
    </div>
  );
}