"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  Plus,
  RefreshCw,
  Search,
  AlertCircle,
  Dumbbell,
  Award,
  Phone,
  UserRound,
} from "lucide-react";
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
import Modal from "@/components/Modal";
import InputField from "@/components/InputField";
import {
  Avatar,
  Pill,
  SummaryCard,
  RowActionMenu,
  DetailItem,
  FormError,
  BRAND,
} from "@/components/admin/ManagementUI";

type ModalMode = "view" | "edit" | "create" | null;

// ฟอร์มแก้ไข: รวมข้อมูลทั่วไป + ระดับ/ค่าจ้าง (ยิงเป็น 2 endpoint แยกกันตอนบันทึก)
interface CoachEditForm {
  nickname: string;
  phone: string;
  address: string;
  profile_picture: string;
  specialization: string;
  pay_rate_per_session: string;
}

const emptyCreateForm: CreateCoachInput = {
  user_id: 0,
  phone: "",
  uid: "",
  address: "",
  birth_date: "",
  nickname: "",
  profile_picture: "",
  specialization: "",
  bank_account: "",
  payment_info: "",
  pay_rate_per_session: 0,
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

  const [editForm, setEditForm] = useState<CoachEditForm>({
    nickname: "",
    phone: "",
    address: "",
    profile_picture: "",
    specialization: "",
    pay_rate_per_session: "",
  });
  const [createForm, setCreateForm] = useState<CreateCoachInput>(emptyCreateForm);

  const loadCoaches = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getAllCoachesAPI();
      setCoaches(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการโหลดข้อมูลโค้ช"
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCoaches();
  }, []);

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
    } catch {
      // ใช้ข้อมูลจากแถวไปก่อน
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const openEdit = async (item: CoachListItem) => {
    setModalMode("edit");
    setSelected(item);
    setFormError(null);
    setIsLoadingDetail(true);
    try {
      const d = await getCoachDetailAPI(item.id);
      setEditForm({
        nickname: d.nickname || "",
        phone: d.phone || "",
        address: d.address || "",
        profile_picture: d.profile_picture || "",
        specialization: d.specialization || "",
        pay_rate_per_session:
          d.pay_rate_per_session != null ? String(d.pay_rate_per_session) : "",
      });
    } catch {
      setEditForm({
        nickname: item.nickname || "",
        phone: item.phone || "",
        address: "",
        profile_picture: item.profile_picture || "",
        specialization: item.specialization || "",
        pay_rate_per_session: "",
      });
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const openCreate = () => {
    setCreateForm(emptyCreateForm);
    setFormError(null);
    setModalMode("create");
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    setFormError(null);

    try {
      setIsSubmitting(true);

      // 1) อัปเดตข้อมูลทั่วไป
      await updateCoachAPI(selected.id, {
        nickname: editForm.nickname,
        phone: editForm.phone,
        address: editForm.address,
        profile_picture: editForm.profile_picture,
      });

      // 2) อัปเดตระดับ + ค่าจ้าง (เฉพาะแอดมิน)
      const payRate = editForm.pay_rate_per_session.trim();
      await adminUpdateCoachLevelAPI(selected.id, {
        specialization: editForm.specialization,
        ...(payRate !== "" ? { pay_rate_per_session: Number(payRate) } : {}),
      });

      closeModal();
      await loadCoaches();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "ไม่สามารถบันทึกข้อมูลได้");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreate = async () => {
    setFormError(null);

    if (!createForm.user_id || createForm.user_id <= 0) {
      setFormError("กรุณาระบุ User ID ของผู้ใช้ (ต้องเป็นผู้ใช้ที่มี role = coach)");
      return;
    }
    const required: [keyof CreateCoachInput, string][] = [
      ["nickname", "ชื่อเล่น"],
      ["phone", "เบอร์โทรศัพท์"],
      ["uid", "เลขบัตรประชาชน (UID)"],
      ["address", "ที่อยู่"],
      ["birth_date", "วันเกิด"],
      ["specialization", "ระดับ/ความเชี่ยวชาญ"],
      ["profile_picture", "รูปโปรไฟล์ (URL)"],
      ["bank_account", "เลขบัญชีธนาคาร"],
      ["payment_info", "ข้อมูลการจ่ายเงิน"],
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
      setFormError(
        err instanceof Error ? err.message : "ไม่สามารถสร้างโปรไฟล์โค้ชได้"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: CoachListItem) => {
    if (
      !confirm(`ต้องการลบโปรไฟล์โค้ช "${item.firstName} ${item.lastName}" ใช่หรือไม่?`)
    )
      return;
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

  // ===== สรุปตัวเลข =====
  const stats = {
    total: coaches.length,
    specializations: new Set(
      coaches.map((c) => c.specialization?.trim()).filter(Boolean)
    ).size,
    withPhone: coaches.filter((c) => !!c.phone).length,
    withNickname: coaches.filter((c) => !!c.nickname).length,
  };

  return (
    <div className="mx-auto max-w-7xl">
      {/* ===== Header ===== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">จัดการโค้ช</h1>
          <p className="mt-1 text-sm text-gray-500">
            ดู เพิ่ม แก้ไข ระดับ และค่าจ้างของโค้ชทั้งหมดในระบบ
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadCoaches}
            disabled={isLoading}
            className="grid h-10 w-10 place-items-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={openCreate}
            style={{ backgroundColor: BRAND }}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-red-500/20 transition hover:brightness-95 active:brightness-90"
          >
            <Plus className="h-4 w-4" />
            เพิ่มโค้ชใหม่
          </button>
        </div>
      </div>

      {/* ===== Summary Cards ===== */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="โค้ชทั้งหมด"
          value={stats.total}
          icon={Dumbbell}
          tint="bg-sky-100 text-sky-700"
        />
        <SummaryCard
          label="ความเชี่ยวชาญ (ประเภท)"
          value={stats.specializations}
          icon={Award}
          tint="bg-violet-100 text-violet-700"
        />
        <SummaryCard
          label="ระบุเบอร์ติดต่อ"
          value={stats.withPhone}
          icon={Phone}
          tint="bg-emerald-100 text-emerald-700"
        />
        <SummaryCard
          label="ระบุชื่อเล่น"
          value={stats.withNickname}
          icon={UserRound}
          tint="bg-rose-100 text-rose-700"
        />
      </div>

      {error && (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ===== Toolbar ===== */}
      <div className="mt-6">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="ค้นหาชื่อ, ระดับ, เบอร์โทร..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:ring-2 focus:ring-gray-900/5"
          />
        </div>
      </div>

      {/* ===== Table Card ===== */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-gray-200/80 bg-gray-50/60 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                <th className="px-5 py-3.5">โค้ช</th>
                <th className="px-5 py-3.5">ระดับ / ความเชี่ยวชาญ</th>
                <th className="px-5 py-3.5">เบอร์โทรศัพท์</th>
                <th className="w-16 px-5 py-3.5 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-5 py-20 text-center">
                    <Loader2
                      className="mx-auto h-7 w-7 animate-spin"
                      style={{ color: BRAND }}
                    />
                  </td>
                </tr>
              ) : filteredCoaches.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-16 text-center text-sm text-gray-500">
                    <AlertCircle className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                    ไม่พบข้อมูลโค้ช
                  </td>
                </tr>
              ) : (
                filteredCoaches.map((item) => (
                  <tr
                    key={item.id}
                    className="group transition-colors hover:bg-gray-50/70"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar
                          firstName={item.firstName}
                          lastName={item.lastName}
                          role="coach"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-semibold text-gray-900">
                              {item.firstName} {item.lastName}
                            </span>
                            {item.nickname && (
                              <span className="truncate text-xs text-gray-400">
                                ({item.nickname})
                              </span>
                            )}
                          </div>
                          <div className="truncate text-xs text-gray-500">
                            ID #{item.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {item.specialization ? (
                        <Pill
                          label={item.specialization}
                          color="bg-sky-50 text-sky-700 ring-sky-600/20"
                        />
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">
                      {item.phone || "-"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <RowActionMenu
                        onView={() => openView(item)}
                        onEdit={() => openEdit(item)}
                        onDelete={() => handleDelete(item)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && filteredCoaches.length > 0 && (
          <div className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
            แสดง {filteredCoaches.length} จาก {coaches.length} รายการ
          </div>
        )}
      </div>

      {/* ===== Modal: ดูรายละเอียด ===== */}
      <Modal
        isOpen={modalMode === "view"}
        onClose={closeModal}
        title="รายละเอียดโค้ช"
        subtitle={selected ? `ID #${selected.id}` : undefined}
        footer={
          <button
            onClick={closeModal}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            ปิด
          </button>
        }
      >
        {isLoadingDetail ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: BRAND }} />
          </div>
        ) : detail ? (
          <div>
            <div className="mb-5 flex items-center gap-3">
              <Avatar
                firstName={detail.first_name}
                lastName={detail.last_name}
                role="coach"
                size="lg"
              />
              <div>
                <div className="font-bold text-gray-900">
                  {detail.first_name} {detail.last_name}
                </div>
                {detail.specialization && (
                  <div className="mt-1">
                    <Pill
                      label={detail.specialization}
                      color="bg-sky-50 text-sky-700 ring-sky-600/20"
                    />
                  </div>
                )}
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <DetailItem label="ชื่อเล่น" value={detail.nickname} />
              <DetailItem label="อีเมล" value={detail.email} />
              <DetailItem label="เบอร์โทรศัพท์" value={detail.phone} />
              <DetailItem label="วันเกิด" value={detail.birth_date} />
              <DetailItem label="ที่อยู่" value={detail.address} />
              <DetailItem
                label="ค่าจ้างต่อครั้ง"
                value={
                  detail.pay_rate_per_session != null
                    ? `${detail.pay_rate_per_session.toLocaleString()} บาท`
                    : "-"
                }
              />
            </dl>
          </div>
        ) : selected ? (
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <DetailItem
              label="ชื่อ - นามสกุล"
              value={`${selected.firstName} ${selected.lastName}`}
            />
            <DetailItem label="ชื่อเล่น" value={selected.nickname} />
            <DetailItem label="ระดับ" value={selected.specialization} />
            <DetailItem label="เบอร์โทรศัพท์" value={selected.phone} />
          </dl>
        ) : null}
      </Modal>

      {/* ===== Modal: แก้ไข ===== */}
      <Modal
        isOpen={modalMode === "edit"}
        onClose={closeModal}
        title="แก้ไขข้อมูลโค้ช"
        subtitle={selected ? `ID #${selected.id}` : undefined}
        footer={
          <>
            <button
              onClick={closeModal}
              disabled={isSubmitting}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={isSubmitting || isLoadingDetail}
              style={{ backgroundColor: BRAND }}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white hover:brightness-95 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              บันทึก
            </button>
          </>
        }
      >
        {isLoadingDetail ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: BRAND }} />
          </div>
        ) : (
          <div className="space-y-4">
            {formError && <FormError message={formError} />}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField
                label="ชื่อเล่น"
                value={editForm.nickname}
                onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
              />
              <InputField
                label="เบอร์โทรศัพท์"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>
            <InputField
              label="ที่อยู่"
              value={editForm.address}
              onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
            />
            <InputField
              label="รูปโปรไฟล์ (URL)"
              value={editForm.profile_picture}
              onChange={(e) =>
                setEditForm({ ...editForm, profile_picture: e.target.value })
              }
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField
                label="ระดับ / ความเชี่ยวชาญ"
                value={editForm.specialization}
                onChange={(e) =>
                  setEditForm({ ...editForm, specialization: e.target.value })
                }
              />
              <InputField
                label="ค่าจ้างต่อครั้ง (บาท)"
                type="number"
                value={editForm.pay_rate_per_session}
                onChange={(e) =>
                  setEditForm({ ...editForm, pay_rate_per_session: e.target.value })
                }
              />
            </div>
          </div>
        )}
      </Modal>

      {/* ===== Modal: สร้างโค้ชใหม่ ===== */}
      <Modal
        isOpen={modalMode === "create"}
        onClose={closeModal}
        title="เพิ่มโค้ชใหม่"
        subtitle="สร้างโปรไฟล์โค้ชจากผู้ใช้ที่มีบทบาท coach อยู่แล้ว"
        maxWidth="max-w-2xl"
        footer={
          <>
            <button
              onClick={closeModal}
              disabled={isSubmitting}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleCreate}
              disabled={isSubmitting}
              style={{ backgroundColor: BRAND }}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white hover:brightness-95 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              สร้างโค้ช
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <FormError message={formError} />}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            หมายเหตุ: ต้องสร้างบัญชีผู้ใช้ที่มีบทบาท (role) เป็น <b>coach</b> ก่อนในหน้า
            &quot;จัดการสมาชิก&quot; แล้วนำ User ID มากรอกที่นี่
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InputField
              label="User ID"
              type="number"
              required
              value={createForm.user_id || ""}
              onChange={(e) =>
                setCreateForm({ ...createForm, user_id: Number(e.target.value) })
              }
            />
            <InputField
              label="ชื่อเล่น"
              required
              value={createForm.nickname}
              onChange={(e) => setCreateForm({ ...createForm, nickname: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InputField
              label="เบอร์โทรศัพท์"
              required
              value={createForm.phone}
              onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
            />
            <InputField
              label="เลขบัตรประชาชน (UID)"
              required
              value={createForm.uid}
              onChange={(e) => setCreateForm({ ...createForm, uid: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InputField
              label="วันเกิด"
              type="date"
              required
              value={createForm.birth_date}
              onChange={(e) => setCreateForm({ ...createForm, birth_date: e.target.value })}
            />
            <InputField
              label="ระดับ / ความเชี่ยวชาญ"
              required
              value={createForm.specialization}
              onChange={(e) =>
                setCreateForm({ ...createForm, specialization: e.target.value })
              }
            />
          </div>
          <InputField
            label="ที่อยู่"
            required
            value={createForm.address}
            onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
          />
          <InputField
            label="รูปโปรไฟล์ (URL)"
            required
            value={createForm.profile_picture}
            onChange={(e) =>
              setCreateForm({ ...createForm, profile_picture: e.target.value })
            }
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InputField
              label="เลขบัญชีธนาคาร"
              required
              value={createForm.bank_account}
              onChange={(e) =>
                setCreateForm({ ...createForm, bank_account: e.target.value })
              }
            />
            <InputField
              label="ข้อมูลการจ่ายเงิน"
              required
              value={createForm.payment_info}
              onChange={(e) =>
                setCreateForm({ ...createForm, payment_info: e.target.value })
              }
            />
          </div>
          <InputField
            label="ค่าจ้างต่อครั้ง (บาท)"
            type="number"
            required
            value={createForm.pay_rate_per_session || ""}
            onChange={(e) =>
              setCreateForm({
                ...createForm,
                pay_rate_per_session: Number(e.target.value),
              })
            }
          />
        </div>
      </Modal>
    </div>
  );
}
