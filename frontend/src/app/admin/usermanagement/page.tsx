"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  Plus,
  RefreshCw,
  Users,
  UserCheck,
  Dumbbell,
  ShieldCheck,
  Search,
  AlertCircle,
} from "lucide-react";
import {
  getAllUsersAPI,
  getUserProfileAPI,
  updateUserProfileAPI,
  createUserAPI,
  deleteUserAPI,
  UserProfileResponseDTO,
  UpdateProfileInput,
  CreateUserInput,
} from "@/services/userAPI";
import Modal from "@/components/Modal";
import InputField from "@/components/InputField";
import SelectField from "@/components/SelectField";
import {
  Avatar,
  RoleBadge,
  StatusPill,
  SummaryCard,
  RowActionMenu,
  DetailItem,
  FormError,
  normalizeRole,
  isActive,
  BRAND,
  type RoleKey,
} from "@/components/admin/ManagementUI";

// helper ดึง id ให้รองรับทั้ง id (จาก DTO) และ ID (จาก gorm.Model)
const getId = (item: UserProfileResponseDTO): number =>
  item.id ?? (item as unknown as { ID: number }).ID;

type ModalMode = "view" | "edit" | "create" | null;

export default function AdminMembersPage() {
  const [members, setMembers] = useState<UserProfileResponseDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleKey | "all">("all");

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<UserProfileResponseDTO | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editForm, setEditForm] = useState<UpdateProfileInput>({});
  const [createForm, setCreateForm] = useState<CreateUserInput>({
    role: "customer",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });

  const loadAllMembers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getAllUsersAPI();
      setMembers(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการโหลดข้อมูลสมาชิก"
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllMembers();
  }, []);

  const closeModal = () => {
    setModalMode(null);
    setSelected(null);
    setFormError(null);
  };

  const openView = async (item: UserProfileResponseDTO) => {
    setModalMode("view");
    setSelected(item);
    setIsLoadingDetail(true);
    try {
      const detail = await getUserProfileAPI(getId(item));
      setSelected(detail);
    } catch {
      // ใช้ข้อมูลจากแถวไปก่อน
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const openEdit = async (item: UserProfileResponseDTO) => {
    setModalMode("edit");
    setSelected(item);
    setFormError(null);
    setIsLoadingDetail(true);
    try {
      const detail = await getUserProfileAPI(getId(item));
      setSelected(detail);
      setEditForm({
        firstName: detail.firstName || "",
        lastName: detail.lastName || "",
        email: detail.email || "",
        nickname: detail.nickname || "",
        phoneNumber: detail.phoneNumber || "",
        parentEmail: detail.parentEmail || "",
        parentPhoneNumber: detail.parentPhoneNumber || "",
      });
    } catch {
      setEditForm({
        firstName: item.firstName || "",
        lastName: item.lastName || "",
        email: item.email || "",
      });
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const openCreate = () => {
    setCreateForm({
      role: "customer",
      firstName: "",
      lastName: "",
      email: "",
      password: "",
    });
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
      await updateUserProfileAPI(getId(selected), payload);
      closeModal();
      await loadAllMembers();
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
        ...createForm,
        email: createForm.email.trim().toLowerCase(),
      });
      closeModal();
      await loadAllMembers();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "ไม่สามารถสร้างผู้ใช้ได้");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMember = async (item: UserProfileResponseDTO) => {
    if (!confirm(`ต้องการลบสมาชิก "${item.firstName} ${item.lastName}" ใช่หรือไม่?`))
      return;
    try {
      await deleteUserAPI(getId(item));
      await loadAllMembers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถลบข้อมูลสมาชิกได้");
    }
  };

  // ===== สรุปตัวเลข =====
  const stats = {
    total: members.length,
    active: members.filter((m) => isActive(m.status)).length,
    coach: members.filter((m) => normalizeRole(m.role) === "coach").length,
    admin: members.filter((m) => normalizeRole(m.role) === "admin").length,
  };

  const filteredMembers = members.filter((member) => {
    const term = searchTerm.toLowerCase();
    const memberId = getId(member)?.toString() || "";
    const matchesSearch =
      memberId.includes(term) ||
      member.firstName?.toLowerCase().includes(term) ||
      member.lastName?.toLowerCase().includes(term) ||
      member.nickname?.toLowerCase().includes(term) ||
      member.email?.toLowerCase().includes(term) ||
      member.role?.toLowerCase().includes(term);
    const matchesRole =
      roleFilter === "all" || normalizeRole(member.role) === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="mx-auto max-w-7xl">
      {/* ===== Header ===== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            จัดการสมาชิก
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            ดู เพิ่ม แก้ไข และจัดการบัญชีผู้ใช้ทั้งหมดในระบบ
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadAllMembers}
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
            เพิ่มสมาชิกใหม่
          </button>
        </div>
      </div>

      {/* ===== Summary Cards ===== */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="สมาชิกทั้งหมด"
          value={stats.total}
          icon={Users}
          tint="bg-gray-100 text-gray-700"
        />
        <SummaryCard
          label="กำลังใช้งาน (Active)"
          value={stats.active}
          icon={UserCheck}
          tint="bg-emerald-100 text-emerald-700"
        />
        <SummaryCard
          label="โค้ช"
          value={stats.coach}
          icon={Dumbbell}
          tint="bg-sky-100 text-sky-700"
        />
        <SummaryCard
          label="แอดมิน"
          value={stats.admin}
          icon={ShieldCheck}
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
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="ค้นหาชื่อ, อีเมล, Role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:ring-2 focus:ring-gray-900/5"
          />
        </div>

        {/* Role filter pills */}
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          {(["all", "customer", "coach", "admin"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setRoleFilter(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                roleFilter === key
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {key === "all" ? "ทั้งหมด" : key}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Table Card ===== */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-gray-200/80 bg-gray-50/60 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                <th className="px-5 py-3.5">สมาชิก</th>
                <th className="px-5 py-3.5">บทบาท</th>
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
              ) : filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-16 text-center text-sm text-gray-500">
                    <AlertCircle className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                    ไม่พบข้อมูลสมาชิกในระบบ
                  </td>
                </tr>
              ) : (
                filteredMembers.map((item) => (
                  <tr
                    key={getId(item)}
                    className="group transition-colors hover:bg-gray-50/70"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar
                          firstName={item.firstName}
                          lastName={item.lastName}
                          role={normalizeRole(item.role)}
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
                            {item.email || `ID #${getId(item)}`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <RoleBadge role={normalizeRole(item.role)} />
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill active={isActive(item.status)} status={item.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <RowActionMenu
                        onView={() => openView(item)}
                        onEdit={() => openEdit(item)}
                        onDelete={() => handleDeleteMember(item)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && filteredMembers.length > 0 && (
          <div className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
            แสดง {filteredMembers.length} จาก {members.length} รายการ
          </div>
        )}
      </div>

      {/* ===== Modal: ดูรายละเอียด ===== */}
      <Modal
        isOpen={modalMode === "view"}
        onClose={closeModal}
        title="รายละเอียดสมาชิก"
        subtitle={selected ? `ID #${getId(selected)}` : undefined}
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
        ) : selected ? (
          <div>
            <div className="mb-5 flex items-center gap-3">
              <Avatar
                firstName={selected.firstName}
                lastName={selected.lastName}
                role={normalizeRole(selected.role)}
                size="lg"
              />
              <div>
                <div className="font-bold text-gray-900">
                  {selected.firstName} {selected.lastName}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <RoleBadge role={normalizeRole(selected.role)} />
                  <StatusPill active={isActive(selected.status)} status={selected.status} />
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <DetailItem label="ชื่อเล่น" value={selected.nickname} />
              <DetailItem label="อีเมล" value={selected.email} />
              <DetailItem label="เบอร์โทรศัพท์" value={selected.phoneNumber} />
              <DetailItem label="บทบาท" value={selected.role} />
              <DetailItem label="อีเมลผู้ปกครอง" value={selected.parentEmail} />
              <DetailItem label="เบอร์ผู้ปกครอง" value={selected.parentPhoneNumber} />
            </dl>
          </div>
        ) : null}
      </Modal>

      {/* ===== Modal: แก้ไข ===== */}
      <Modal
        isOpen={modalMode === "edit"}
        onClose={closeModal}
        title="แก้ไขข้อมูลสมาชิก"
        subtitle={selected ? `ID #${getId(selected)}` : undefined}
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

      {/* ===== Modal: สร้างผู้ใช้ใหม่ ===== */}
      <Modal
        isOpen={modalMode === "create"}
        onClose={closeModal}
        title="เพิ่มสมาชิกใหม่"
        subtitle="สร้างบัญชีผู้ใช้ใหม่เข้าสู่ระบบ"
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
              สร้างผู้ใช้
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <FormError message={formError} />}
          <SelectField
            label="บทบาท (Role)"
            required
            value={createForm.role}
            onChange={(e) =>
              setCreateForm({
                ...createForm,
                role: e.target.value as CreateUserInput["role"],
              })
            }
            options={[
              { label: "สมาชิก (Customer)", value: "customer" },
              { label: "โค้ช (Coach)", value: "coach" },
              { label: "แอดมิน (Admin)", value: "admin" },
            ]}
          />
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
