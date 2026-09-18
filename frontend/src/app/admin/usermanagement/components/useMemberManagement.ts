"use client";

import { useState } from "react";
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
import { normalizeRole, isActive, type RoleKey } from "@/components/admin/ManagementUI";
import { emptyCustomer, emptyCoach } from "@/components/admin/modals/CreateMemberModal";
import { useAdminResource, errorMessage, getId } from "@/components/admin/shared/useAdminResource";

import { useGlobalToast } from "@/components/ToastProvider";
/** เผื่อไฟล์อื่นในโฟลเดอร์นี้ยัง import getId จากที่นี่ตามเดิม */
export { getId };

/**
 * สมองของหน้าจัดการสมาชิก
 *
 * โครงพื้นฐาน (โหลด ค้นหา เปิดดู บันทึก ลบ) มาจาก useAdminResource ที่ใช้ร่วมกับ
 * หน้าจัดการโค้ชและหน้าจัดการผู้เรียน ไฟล์นี้เหลือเฉพาะเรื่องที่เป็นของสมาชิกจริง ๆ
 * คือฟอร์มสร้าง/แก้ไข กติกาการตรวจข้อมูล และกติกาการลบ
 *
 * ไม่มี JSX ในไฟล์นี้แม้แต่บรรทัดเดียวโดยตั้งใจ ทั้งหน้าจอคอมพิวเตอร์และมือถือ
 * ใช้ค่าจากที่นี่ชุดเดียวกัน ถ้าเผลอใส่หน้าตาลงมาแปลว่าเส้นแบ่งเริ่มพัง
 */

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

/**
 * ตรวจฟอร์มสร้างสมาชิก คืนข้อความผิดพลาดข้อแรกที่เจอ หรือ null ถ้าผ่านหมด
 *
 * แยกออกมาเป็นฟังก์ชันล้วน ๆ ที่ไม่ยุ่งกับ state เพื่อให้อ่านง่ายและเทสได้
 * ถ้าวันหนึ่งอยากเขียนเทสของกติกาพวกนี้ ก็เรียกตรงนี้ได้เลยโดยไม่ต้องเรนเดอร์อะไร
 *
 * ⚠️ นี่เป็นแค่ความสะดวกของผู้ใช้ ไม่ใช่ด่านความปลอดภัย
 * เซิร์ฟเวอร์ตรวจซ้ำอีกชั้นเสมอ เพราะยิง API ตรงข้ามหน้าเว็บได้
 */
function validateCreateForm(form: AdminCreateUserInput): string | null {
  if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.password) {
    return "กรุณากรอกข้อมูลบัญชีให้ครบทุกช่อง";
  }
  if (form.password.length < 8) {
    return "รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร";
  }
  if (!/\d/.test(form.password)) {
    return "รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว";
  }

  if (form.role === "customer") {
    const c = form.customer;
    if (!c?.nickname.trim()) return "กรุณากรอก: ชื่อเล่น";
    if (!c.gender) return "กรุณาเลือก: เพศ";
    if (!c.birthDate) return "กรุณากรอก: วันเกิด";
    if (new Date(c.birthDate) > new Date()) return "วันเกิดต้องไม่ใช่วันที่ในอนาคต";
    const minBirthDate = new Date();
    minBirthDate.setFullYear(minBirthDate.getFullYear() - 3);
    if (new Date(c.birthDate) > minBirthDate) return "อายุต้องไม่ต่ำกว่า 3 ปี";
    if (!/^0\d{9}$/.test(c.phoneNumber)) return "เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0";
  }

  if (form.role === "coach") {
    const co = form.coach;
    if (!co?.nickname.trim()) return "กรุณากรอก: ชื่อเล่น";
    if (!/^0\d{9}$/.test(co.phone)) return "เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0";
    if (!/^\d{13}$/.test(co.uid)) return "เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก";
    if (!co.birth_date) return "กรุณากรอก: วันเกิด";
    if (!co.address.trim()) return "กรุณากรอก: ที่อยู่";
    if (!co.specialization) return "กรุณาเลือก: ระดับฝีมือ";
    if (!co.coach_license) return "กรุณาเลือก: ใบรับรองผู้ฝึกสอน";
    if (!co.bank_account.trim()) return "กรุณาเลือก: ธนาคาร";
    if (!co.payment_info.trim()) return "กรุณากรอก: เลขบัญชี";
    if (!co.prompt_pay?.trim()) return "กรุณากรอก: พร้อมเพย์";
    if (!co.pay_rate || co.pay_rate <= 0) return "กรุณากรอกค่าจ้างให้มากกว่า 0";
  }

  return null;
}

export function useMemberManagement() {
  const showToast = useGlobalToast();
  const base = useAdminResource<UserProfileResponseDTO, AdminUserDetail>({
    fetchList: getAllUsersAPI,
    fetchDetail: (item) => adminGetUserDetailAPI(getId(item)),
    listError: "เกิดข้อผิดพลาดในการโหลดข้อมูลสมาชิก",
    detailError: "ไม่สามารถดึงรายละเอียดสมาชิกได้",
    matches: (member, term) =>
      (getId(member)?.toString() || "").includes(term) ||
      !!member.firstName?.toLowerCase().includes(term) ||
      !!member.lastName?.toLowerCase().includes(term) ||
      !!member.nickname?.toLowerCase().includes(term) ||
      !!member.email?.toLowerCase().includes(term) ||
      !!member.role?.toLowerCase().includes(term),
  });

  const [roleFilter, setRoleFilter] = useState<RoleKey | "all">("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<AdminUpdateUserInput>({});
  const [createForm, setCreateForm] = useState<AdminCreateUserInput>(emptyCreateForm());

  /**
   * เปิดฟอร์มแก้ไข
   *
   * ⚠️ ต้องโหลดรายละเอียดเต็มก่อนเสมอ
   *
   * ข้อมูลในตาราง (UserProfileResponseDTO) ไม่มีฟิลด์ของโค้ชและไม่มีวันเกิด/เลขบัตร
   * ถ้าเอาข้อมูลจากแถวมาเติมฟอร์มจะได้ฟอร์มที่ช่องพวกนั้นว่าง แล้วพอกดบันทึก
   * ข้อมูลเดิมจะถูกเขียนทับด้วยค่าว่างหายไปทั้งหมด
   */
  const openEdit = async (item: UserProfileResponseDTO) => {
    base.setModalMode("edit");
    base.setSelected(item);
    base.setFormError(null);

    try {
      const d =
        base.detail?.id === getId(item) ? base.detail : await adminGetUserDetailAPI(getId(item));
      base.setDetail(d);
      setEditingId(d.id);
      setEditForm({
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email,
        ...(d.customer ? { customer: { ...d.customer } } : {}),
        ...(d.coach ? { coach: { ...d.coach } } : {}),
      });
    } catch (err: unknown) {
      base.setFormError(errorMessage(err, "ไม่สามารถดึงข้อมูลสมาชิกได้"));
    }
  };

  const openCreate = () => {
    setCreateForm(emptyCreateForm());
    base.setFormError(null);
    base.setModalMode("create");
  };

  const handleUpdate = async () => {
    if (editingId == null) return;
    await base.submit(
      () => adminUpdateUserAPI(editingId, editForm).then(() => undefined),
      "ไม่สามารถบันทึกการแก้ไขได้",
    );
  };

  const handleCreate = async () => {
    const problem = validateCreateForm(createForm);
    if (problem) {
      base.setFormError(problem);
      return;
    }

    await base.submit(async () => {
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
    }, "ไม่สามารถสร้างสมาชิกได้");
  };

  const handleDeleteMember = async (item: UserProfileResponseDTO) => {
    // ⚠️ ด่านสองข้อนี้มีไว้บอกผู้ใช้เร็ว ๆ เท่านั้น ไม่ใช่ด่านที่บังคับจริง
    // ตัวที่บังคับคือ services.DeleteUser ฝั่งเซิร์ฟเวอร์ ห้ามถอดออกจากตรงนั้น
    // เพราะยิง API ตรงข้ามหน้าเว็บได้เสมอ
    const currentUserId = Number(localStorage.getItem("user_id"));
    if (getId(item) === currentUserId) {
      showToast("ลบบัญชีของตัวเองไม่ได้ กรุณาให้ผู้ดูแลระบบคนอื่นเป็นผู้ดำเนินการ", "error");
      return;
    }

    const adminCount = base.items.filter((m) => normalizeRole(m.role) === "admin").length;
    if (normalizeRole(item.role) === "admin" && adminCount <= 1) {
      showToast("ลบไม่ได้ เพราะนี่คือผู้ดูแลระบบคนสุดท้าย หากลบแล้วจะไม่มีใครเข้าจัดการระบบได้อีก", "error");
      return;
    }

    await base.confirmAndRun(
      `ต้องการลบสมาชิก "${item.firstName} ${item.lastName}" ใช่หรือไม่?\n\n` +
        `ข้อมูลโปรไฟล์ทั้งหมดของคนนี้จะถูกลบไปด้วย (เบอร์โทร ที่อยู่ เลขบัตรประชาชน บัญชีธนาคาร)`,
      () => deleteUserAPI(getId(item)).then(() => undefined),
      "ไม่สามารถลบข้อมูลสมาชิกได้",
    );
  };

  const stats = {
    total: base.items.length,
    active: base.items.filter((m) => isActive(m.status)).length,
    coach: base.items.filter((m) => normalizeRole(m.role) === "coach").length,
    admin: base.items.filter((m) => normalizeRole(m.role) === "admin").length,
  };

  // กรองตามบทบาทต่อจากผลค้นหา — เป็นตัวกรองเฉพาะของหน้านี้ จึงไม่อยู่ในฐานร่วม
  const filteredMembers =
    roleFilter === "all"
      ? base.filtered
      : base.filtered.filter((m) => normalizeRole(m.role) === roleFilter);

  return {
    ...base,
    members: base.items,
    filteredMembers,
    stats,

    roleFilter,
    setRoleFilter,

    editForm,
    setEditForm,
    createForm,
    setCreateForm,

    openEdit,
    openCreate,
    handleCreate,
    handleUpdate,
    handleDeleteMember,
  };
}

/** ชนิดของค่าที่ hook คืนออกมา ใช้เป็น prop ให้หน้าจอทั้งสองแบบ */
export type MemberManagement = ReturnType<typeof useMemberManagement>;
