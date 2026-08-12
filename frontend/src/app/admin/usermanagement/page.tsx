"use client";

import { useState, useEffect } from "react";
import { Plus, RefreshCw, Users, UserCheck, Dumbbell, ShieldCheck, AlertCircle } from "lucide-react";
import Button from "@/components/Button";
import {
  getAllUsersAPI,
  adminGetUserDetailAPI,
  adminCreateUserAPI,
  adminUpdateUserAPI,
  deleteUserAPI,
  type AdminCreateUserInput,
  type AdminUpdateUserInput,
  type AdminUserDetail,
} from "@/services/userAPI";
import { UserProfileResponseDTO } from "@/types/user";
import { SummaryCard, RoleBadge, StatusPill, RowActionMenu, normalizeRole, isActive, type RoleKey } from "@/components/admin/ManagementUI";
import { ViewMemberModal } from "@/components/admin/modals/ViewMemberModal";
import { CreateMemberModal, emptyCustomer, emptyCoach } from "@/components/admin/modals/CreateMemberModal";
import { EditMemberModal } from "@/components/admin/modals/EditMemberModal";
import { MemberFilterToolbar } from "@/components/admin/MemberFilterToolbar";
import { DataTable, Column } from "@/components/admin/DataTable";

export const getId = (item: UserProfileResponseDTO): number => item.id ?? (item as unknown as { ID: number }).ID;
type ModalMode = "view" | "edit" | "create" | null;

/**
 * ค่าเริ่มต้นของฟอร์มสร้างสมาชิก
 *
 * แนบโปรไฟล์เปล่าไว้ทั้งสองก้อนตั้งแต่แรก เพื่อให้สลับบทบาทไปมาแล้วค่าที่กรอกค้างไว้
 * ไม่หาย และ modal ไม่ต้องเช็ค null ทุกช่อง — ตอนส่งค่อยเลือกส่งเฉพาะก้อนที่ตรงกับ role
 */
function emptyCreateForm(): AdminCreateUserInput {
  return {
    role: "customer",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    customer: { ...emptyCustomer },
    coach: { ...emptyCoach },
  };
}

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

  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<AdminUpdateUserInput>({});
  const [createForm, setCreateForm] = useState<AdminCreateUserInput>(emptyCreateForm());

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
    setDetail(null);
    setEditingId(null);
    setFormError(null);
  };

  const openView = async (item: UserProfileResponseDTO) => {
    setModalMode("view");
    setSelected(item);
    setDetail(null);
    setIsLoadingDetail(true);
    try {
      setDetail(await adminGetUserDetailAPI(getId(item)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ไม่สามารถดึงรายละเอียดสมาชิกได้");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  /**
   * เปิดฟอร์มแก้ไข
   *
   * ต้องโหลดรายละเอียดเต็มก่อนเสมอ เพราะข้อมูลในตาราง (UserProfileResponseDTO)
   * ไม่มีฟิลด์ของโค้ชและไม่มีวันเกิด/เลขบัตร — ถ้า prefill จากแถวจะได้ฟอร์มที่ว่างเปล่า
   * แล้วกดบันทึกทับข้อมูลเดิมหายหมด
   */
  const openEdit = async (item: UserProfileResponseDTO) => {
    setModalMode("edit");
    setSelected(item);
    setFormError(null);
    setIsLoadingDetail(true);

    try {
      const d = detail?.id === getId(item) ? detail : await adminGetUserDetailAPI(getId(item));
      setDetail(d);
      setEditingId(d.id);
      setEditForm({
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email,
        ...(d.customer ? { customer: { ...d.customer } } : {}),
        ...(d.coach ? { coach: { ...d.coach } } : {}),
      });
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "ไม่สามารถดึงข้อมูลสมาชิกได้");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleUpdate = async () => {
    if (editingId == null) return;
    setFormError(null);

    try {
      setIsSubmitting(true);
      await adminUpdateUserAPI(editingId, editForm);
      closeModal();
      await loadAllMembers();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "ไม่สามารถบันทึกการแก้ไขได้");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openCreate = () => {
    setCreateForm(emptyCreateForm());
    setFormError(null);
    setModalMode("create");
  };

  const handleCreate = async () => {
    setFormError(null);

    if (!createForm.firstName.trim() || !createForm.lastName.trim() || !createForm.email.trim() || !createForm.password) {
      setFormError("กรุณากรอกข้อมูลบัญชีให้ครบทุกช่อง");
      return;
    }
    if (createForm.password.length < 6) {
      setFormError("รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร");
      return;
    }

    // ตรวจโปรไฟล์ตามบทบาทก่อนยิง เพื่อให้ผู้ใช้เห็น error ทันทีโดยไม่ต้องรอ round-trip
    // (เซิร์ฟเวอร์ตรวจซ้ำอีกชั้นอยู่แล้ว ตรงนี้เป็นแค่ความสะดวก ไม่ใช่ด่านความปลอดภัย)
    if (createForm.role === "customer") {
      const c = createForm.customer;
      if (!c?.nickname.trim()) return setFormError("กรุณากรอก: ชื่อเล่น");
      if (!c.gender) return setFormError("กรุณาเลือก: เพศ");
      if (!c.birthDate) return setFormError("กรุณากรอก: วันเกิด");
      if (!/^\d{10}$/.test(c.phoneNumber)) return setFormError("เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก");
    }

    if (createForm.role === "coach") {
      const co = createForm.coach;
      if (!co?.nickname.trim()) return setFormError("กรุณากรอก: ชื่อเล่น");
      if (!/^\d{10}$/.test(co.phone)) return setFormError("เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก");
      if (!/^\d{13}$/.test(co.uid)) return setFormError("เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก");
      if (!co.birth_date) return setFormError("กรุณากรอก: วันเกิด");
      if (!co.address.trim()) return setFormError("กรุณากรอก: ที่อยู่");
      if (!co.specialization) return setFormError("กรุณาเลือก: ระดับฝีมือ");
      if (!co.coach_license) return setFormError("กรุณาเลือก: ใบรับรองผู้ฝึกสอน");
      if (!co.bank_account.trim()) return setFormError("กรุณากรอก: เลขบัญชีธนาคาร");
      if (!co.payment_info.trim()) return setFormError("กรุณากรอก: ข้อมูลการจ่ายเงิน");
      if (!co.pay_rate || co.pay_rate <= 0) return setFormError("กรุณากรอกค่าจ้างให้มากกว่า 0");
    }

    try {
      setIsSubmitting(true);

      // ส่งเฉพาะโปรไฟล์ที่ตรงกับบทบาท ไม่งั้นเซิร์ฟเวอร์จะได้ก้อนที่ไม่เกี่ยวติดไปด้วย
      const payload: AdminCreateUserInput = {
        role: createForm.role,
        firstName: createForm.firstName.trim(),
        lastName: createForm.lastName.trim(),
        email: createForm.email.trim().toLowerCase(),
        password: createForm.password,
      };
      if (createForm.role === "customer" && createForm.customer) {
        payload.customer = {
          ...createForm.customer,
          // ช่อง date ให้ค่ามาเป็น YYYY-MM-DD แต่ backend รอ time.Time จึงต้องแปลงเป็น ISO
          birthDate: createForm.customer.birthDate
            ? new Date(createForm.customer.birthDate).toISOString()
            : null,
        };
      }
      if (createForm.role === "coach" && createForm.coach) {
        payload.coach = createForm.coach;
      }

      await adminCreateUserAPI(payload);
      closeModal();
      await loadAllMembers();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "ไม่สามารถสร้างสมาชิกได้");
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
      <ViewMemberModal
        isOpen={modalMode === "view"}
        onClose={closeModal}
        detail={detail}
        isLoadingDetail={isLoadingDetail}
        onEdit={() => selected && openEdit(selected)}
      />
      <CreateMemberModal isOpen={modalMode === "create"} onClose={closeModal} createForm={createForm} setCreateForm={setCreateForm} formError={formError} isSubmitting={isSubmitting} onCreate={handleCreate} />

      <EditMemberModal
        isOpen={modalMode === "edit"}
        onClose={closeModal}
        role={detail?.role ?? ""}
        editForm={editForm}
        setEditForm={setEditForm}
        formError={formError}
        isSubmitting={isSubmitting || isLoadingDetail}
        onSave={handleUpdate}
      />
    </div>
  );
}