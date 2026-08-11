"use client";

import { useState, useEffect } from "react";
import { Plus, RefreshCw, Users, UserCheck, Dumbbell, ShieldCheck, AlertCircle } from "lucide-react";
import Button from "@/components/Button";
import { getAllUsersAPI, getUserProfileAPI, updateUserProfileAPI, createUserAPI, deleteUserAPI, CreateUserInput } from "@/services/userAPI";
import { UserProfileResponseDTO, UpdateProfileInput } from "@/types/user";
import { SummaryCard, RoleBadge, StatusPill, RowActionMenu, normalizeRole, isActive, type RoleKey } from "@/components/admin/ManagementUI";
import { ViewMemberModal } from "@/components/admin/modals/ViewMemberModal";
import { CreateMemberModal } from "@/components/admin/modals/CreateMemberModal";
import { MemberFilterToolbar } from "@/components/admin/MemberFilterToolbar";
import { DataTable, Column } from "@/components/admin/DataTable";

export const getId = (item: UserProfileResponseDTO): number => item.id ?? (item as unknown as { ID: number }).ID;
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
    role: "customer", firstName: "", lastName: "", email: "", password: "",
  });

  const loadAllMembers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getAllUsersAPI();
      setMembers(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการโหลดข้อมูลสมาชิก");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadAllMembers(); }, []);

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
    } catch { /* ใช้ข้อมูลเดิม */ } finally {
      setIsLoadingDetail(false);
    }
  };

  const openCreate = () => {
    setCreateForm({ role: "customer", firstName: "", lastName: "", email: "", password: "" });
    setFormError(null);
    setModalMode("create");
  };

  const handleCreate = async () => {
    setFormError(null);
    if (!createForm.firstName.trim() || !createForm.lastName.trim() || !createForm.email.trim() || !createForm.password) {
      setFormError("กรุณากรอกข้อมูลให้ครบทุกช่อง");
      return;
    }
    if (createForm.password.length < 6) {
      setFormError("รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร");
      return;
    }

    try {
      setIsSubmitting(true);
      await createUserAPI({ ...createForm, email: createForm.email.trim().toLowerCase() });
      closeModal();
      await loadAllMembers();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "ไม่สามารถสร้างผู้ใช้ได้");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMember = async (item: UserProfileResponseDTO) => {
    if (!confirm(`ต้องการลบสมาชิก "${item.firstName} ${item.lastName}" ใช่หรือไม่?`)) return;
    try {
      await deleteUserAPI(getId(item));
      await loadAllMembers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถลบข้อมูลสมาชิกได้");
    }
  };

  const stats = {
    total: members.length,
    active: members.filter((m) => isActive(m.status)).length,
    coach: members.filter((m) => normalizeRole(m.role) === "coach").length,
    admin: members.filter((m) => normalizeRole(m.role) === "admin").length,
  };

  const filteredMembers = members.filter((member) => {
    const term = searchTerm.toLowerCase();
    const memberId = getId(member)?.toString() || "";
    const matchesSearch = memberId.includes(term) || member.firstName?.toLowerCase().includes(term) || member.lastName?.toLowerCase().includes(term) || member.nickname?.toLowerCase().includes(term) || member.email?.toLowerCase().includes(term) || member.role?.toLowerCase().includes(term);
    const matchesRole = roleFilter === "all" || normalizeRole(member.role) === roleFilter;
    return matchesSearch && matchesRole;
  });

  const memberColumns: Column<UserProfileResponseDTO>[] = [
    {
      header: "สมาชิก",
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
          <span className="mt-0.5 text-xs text-gray-400">
            {item.email || `ID #${getId(item)}`}
          </span>
        </div>
      ),
    },
    {
      header: "บทบาท",
      render: (item) => <RoleBadge role={normalizeRole(item.role)} />,
    },
    {
      header: "สถานะ",
      render: (item) => <StatusPill active={isActive(item.status)} status={item.status} />,
    },
    {
      header: "การจัดการ",
      className: "text-right w-20",
      render: (item) => (
        <div className="flex justify-end">
          <RowActionMenu onView={() => openView(item)} onDelete={() => handleDeleteMember(item)} />
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">จัดการสมาชิก</h1>
          <p className="mt-1 text-sm text-gray-500">ดู เพิ่ม  และจัดการบัญชีผู้ใช้ทั้งหมดในระบบ</p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={loadAllMembers}
            disabled={isLoading}
            className="!w-10 !h-10 !p-0 !rounded-xl border-gray-200"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className={`h-4 w-4 text-gray-600 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="primary"
            onClick={openCreate}
            className="!w-auto flex items-center gap-2 rounded-xl px-4 py-2.5 bg-[#E63946] hover:bg-[#d62839]"
          >
            <Plus className="h-4 w-4" /> เพิ่มสมาชิกใหม่
          </Button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="สมาชิกทั้งหมด" value={stats.total} icon={Users} tint="bg-gray-100 text-gray-700" />
        <SummaryCard label="กำลังใช้งาน (Active)" value={stats.active} icon={UserCheck} tint="bg-emerald-100 text-emerald-700" />
        <SummaryCard label="โค้ช" value={stats.coach} icon={Dumbbell} tint="bg-sky-100 text-sky-700" />
        <SummaryCard label="แอดมิน" value={stats.admin} icon={ShieldCheck} tint="bg-violet-100 text-violet-700" />
      </div>

      {error && (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Filter Toolbar Component */}
      <MemberFilterToolbar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        roleFilter={roleFilter}
        setRoleFilter={setRoleFilter}
      />

      <DataTable
        isLoading={isLoading}
        data={filteredMembers}
        columns={memberColumns}
        keyExtractor={(item) => getId(item)}
        emptyMessage="ไม่พบข้อมูลสมาชิกในระบบ"
        totalCount={members.length}
      />

      {/* Modals */}
      <ViewMemberModal isOpen={modalMode === "view"} onClose={closeModal} selected={selected} isLoadingDetail={isLoadingDetail} getId={getId} />
      <CreateMemberModal isOpen={modalMode === "create"} onClose={closeModal} createForm={createForm} setCreateForm={setCreateForm} formError={formError} isSubmitting={isSubmitting} onCreate={handleCreate} />
    </div>
  );
}