"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  Plus,
  RefreshCw,
  Search,
  AlertCircle,
  GraduationCap,
  Mail,
  Phone,
  UserRound,
} from "lucide-react";
import {
  getActiveStudentsAPI,
  getUserProfileAPI,
  updateUserProfileAPI,
  createUserAPI,
  deleteUserAPI,
  StudentListResponseDTO,
  UpdateProfileInput,
} from "@/services/userAPI";
import Modal from "@/components/Modal";
import InputField from "@/components/InputField";
import {
  Avatar,
  StatusPill,
  SummaryCard,
  RowActionMenu,
  DetailItem,
  FormError,
  BRAND,
} from "@/components/admin/ManagementUI";

type ModalMode = "view" | "edit" | "create" | null;

interface StudentDetail {
  firstName?: string;
  lastName?: string;
  email?: string;
  nickname?: string;
  phoneNumber?: string;
  birthDate?: string;
  gender?: string;
  parentEmail?: string;
  parentPhoneNumber?: string;
  status?: string;
}

export default function StudentManagementPage() {
  const [students, setStudents] = useState<StudentListResponseDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<StudentListResponseDTO | null>(null);
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editForm, setEditForm] = useState<UpdateProfileInput>({});
  const [createForm, setCreateForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });

  const loadStudents = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getActiveStudentsAPI();
      setStudents(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการโหลดข้อมูลนักเรียน"
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const closeModal = () => {
    setModalMode(null);
    setSelected(null);
    setDetail(null);
    setFormError(null);
  };

  const openView = async (item: StudentListResponseDTO) => {
    setModalMode("view");
    setSelected(item);
    setDetail(null);
    setIsLoadingDetail(true);
    try {
      const d = await getUserProfileAPI(item.id);
      setDetail(d);
    } catch {
      setDetail(item);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const openEdit = async (item: StudentListResponseDTO) => {
    setModalMode("edit");
    setSelected(item);
    setFormError(null);
    setIsLoadingDetail(true);
    try {
      const d = await getUserProfileAPI(item.id);
      setEditForm({
        firstName: d.firstName || "",
        lastName: d.lastName || "",
        email: d.email || "",
        nickname: d.nickname || "",
        phoneNumber: d.phoneNumber || "",
        parentEmail: d.parentEmail || "",
        parentPhoneNumber: d.parentPhoneNumber || "",
      });
    } catch {
      setEditForm({
        firstName: item.firstName || "",
        lastName: item.lastName || "",
        email: item.email || "",
        nickname: item.nickname || "",
        phoneNumber: item.phoneNumber || "",
      });
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const openCreate = () => {
    setCreateForm({ firstName: "", lastName: "", email: "", password: "" });
    setFormError(null);
    setModalMode("create");
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    setFormError(null);

    if (!editForm.firstName?.trim() || !editForm.lastName?.trim()) {
      setFormError("กรุณากรอกชื่อและนามสกุล");
      return;
    }

    const payload: UpdateProfileInput = {};
    (Object.keys(editForm) as (keyof UpdateProfileInput)[]).forEach((key) => {
      const value = editForm[key];
      if (value !== undefined && value !== "") payload[key] = value;
    });

    try {
      setIsSubmitting(true);
      await updateUserProfileAPI(selected.id, payload);
      closeModal();
      await loadStudents();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "ไม่สามารถบันทึกข้อมูลได้");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreate = async () => {
    setFormError(null);
    if (
      !createForm.firstName.trim() ||
      !createForm.lastName.trim() ||
      !createForm.email.trim() ||
      !createForm.password
    ) {
      setFormError("กรุณากรอกข้อมูลให้ครบทุกช่อง");
      return;
    }
    if (createForm.password.length < 6) {
      setFormError("รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร");
      return;
    }

    try {
      setIsSubmitting(true);
      await createUserAPI({
        role: "customer",
        firstName: createForm.firstName,
        lastName: createForm.lastName,
        email: createForm.email.trim().toLowerCase(),
        password: createForm.password,
      });
      closeModal();
      await loadStudents();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "ไม่สามารถสร้างบัญชีได้");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: StudentListResponseDTO) => {
    if (
      !confirm(`ต้องการลบข้อมูลนักเรียน "${item.firstName} ${item.lastName}" ใช่หรือไม่?`)
    )
      return;
    try {
      await deleteUserAPI(item.id);
      await loadStudents();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถลบข้อมูลได้");
    }
  };

  const filteredStudents = students.filter((s) => {
    const term = searchTerm.toLowerCase();
    return (
      s.id?.toString().includes(term) ||
      s.firstName?.toLowerCase().includes(term) ||
      s.lastName?.toLowerCase().includes(term) ||
      s.nickname?.toLowerCase().includes(term) ||
      s.email?.toLowerCase().includes(term)
    );
  });

  // ===== สรุปตัวเลข (คุณภาพข้อมูล) =====
  const stats = {
    total: students.length,
    withEmail: students.filter((s) => !!s.email).length,
    withPhone: students.filter((s) => !!s.phoneNumber).length,
    withNickname: students.filter((s) => !!s.nickname).length,
  };

  return (
    <div className="mx-auto max-w-7xl">
      {/* ===== Header ===== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            จัดการนักเรียน
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            ดู เพิ่ม แก้ไข และจัดการข้อมูลนักเรียนที่กำลังเรียนอยู่ทั้งหมด
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadStudents}
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
            เพิ่มนักเรียนใหม่
          </button>
        </div>
      </div>

      {/* ===== Summary Cards ===== */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="นักเรียนทั้งหมด"
          value={stats.total}
          icon={GraduationCap}
          tint="bg-rose-100 text-rose-700"
        />
        <SummaryCard
          label="ระบุอีเมล"
          value={stats.withEmail}
          icon={Mail}
          tint="bg-sky-100 text-sky-700"
        />
        <SummaryCard
          label="ระบุเบอร์โทร"
          value={stats.withPhone}
          icon={Phone}
          tint="bg-emerald-100 text-emerald-700"
        />
        <SummaryCard
          label="ระบุชื่อเล่น"
          value={stats.withNickname}
          icon={UserRound}
          tint="bg-violet-100 text-violet-700"
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
            placeholder="ค้นหาชื่อ, รหัสนักเรียน, อีเมล..."
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
                <th className="px-5 py-3.5">นักเรียน</th>
                <th className="px-5 py-3.5">เบอร์โทรศัพท์</th>
                <th className="px-5 py-3.5">สถานะ</th>
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
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-16 text-center text-sm text-gray-500">
                    <AlertCircle className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                    ไม่พบข้อมูลนักเรียน
                  </td>
                </tr>
              ) : (
                filteredStudents.map((item) => (
                  <tr
                    key={item.id}
                    className="group transition-colors hover:bg-gray-50/70"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar
                          firstName={item.firstName}
                          lastName={item.lastName}
                          role="customer"
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
                            {item.email || `ID #${item.id}`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">
                      {item.phoneNumber || "-"}
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill active status="active" />
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

        {!isLoading && filteredStudents.length > 0 && (
          <div className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
            แสดง {filteredStudents.length} จาก {students.length} รายการ
          </div>
        )}
      </div>

      {/* ===== Modal: ดูรายละเอียด ===== */}
      <Modal
        isOpen={modalMode === "view"}
        onClose={closeModal}
        title="รายละเอียดนักเรียน"
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
                firstName={detail.firstName}
                lastName={detail.lastName}
                role="customer"
                size="lg"
              />
              <div>
                <div className="font-bold text-gray-900">
                  {detail.firstName} {detail.lastName}
                </div>
                <div className="mt-1">
                  <StatusPill active status="active" />
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <DetailItem label="ชื่อเล่น" value={detail.nickname} />
              <DetailItem label="อีเมล" value={detail.email} />
              <DetailItem label="เบอร์โทรศัพท์" value={detail.phoneNumber} />
              <DetailItem label="วันเกิด" value={detail.birthDate} />
              <DetailItem label="เพศ" value={detail.gender} />
              <DetailItem label="อีเมลผู้ปกครอง" value={detail.parentEmail} />
              <DetailItem label="เบอร์ผู้ปกครอง" value={detail.parentPhoneNumber} />
            </dl>
          </div>
        ) : null}
      </Modal>

      {/* ===== Modal: แก้ไข ===== */}
      <Modal
        isOpen={modalMode === "edit"}
        onClose={closeModal}
        title="แก้ไขข้อมูลนักเรียน"
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
                label="ชื่อ"
                required
                value={editForm.firstName || ""}
                onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
              />
              <InputField
                label="นามสกุล"
                required
                value={editForm.lastName || ""}
                onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
              />
            </div>
            <InputField
              label="อีเมล"
              type="email"
              value={editForm.email || ""}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField
                label="ชื่อเล่น"
                value={editForm.nickname || ""}
                onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
              />
              <InputField
                label="เบอร์โทรศัพท์"
                value={editForm.phoneNumber || ""}
                onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField
                label="อีเมลผู้ปกครอง"
                type="email"
                value={editForm.parentEmail || ""}
                onChange={(e) => setEditForm({ ...editForm, parentEmail: e.target.value })}
              />
              <InputField
                label="เบอร์ผู้ปกครอง"
                value={editForm.parentPhoneNumber || ""}
                onChange={(e) =>
                  setEditForm({ ...editForm, parentPhoneNumber: e.target.value })
                }
              />
            </div>
          </div>
        )}
      </Modal>

      {/* ===== Modal: สร้างบัญชีนักเรียนใหม่ ===== */}
      <Modal
        isOpen={modalMode === "create"}
        onClose={closeModal}
        title="เพิ่มนักเรียนใหม่"
        subtitle="สร้างบัญชีสมาชิก (Customer) ใหม่เข้าสู่ระบบ"
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
              สร้างบัญชี
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <FormError message={formError} />}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InputField
              label="ชื่อ"
              required
              value={createForm.firstName}
              onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })}
            />
            <InputField
              label="นามสกุล"
              required
              value={createForm.lastName}
              onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })}
            />
          </div>
          <InputField
            label="อีเมล (@gmail.com)"
            type="email"
            required
            value={createForm.email}
            onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
          />
          <InputField
            label="รหัสผ่าน"
            type="password"
            required
            value={createForm.password}
            onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
            placeholder="อย่างน้อย 6 ตัวอักษร"
          />
        </div>
      </Modal>
    </div>
  );
}
