"use client";

import { useState } from "react";
import {
  getActiveStudentsAPI,
  adminGetUserDetailAPI,
  adminUpdateUserAPI,
  deleteUserAPI,
  type AdminUserDetail,
  type AdminUpdateUserInput,
  StudentListResponseDTO,
} from "@/services/userAPI";
import { useAdminResource, errorMessage, getId } from "@/components/admin/shared/useAdminResource";

/** เผื่อไฟล์อื่นในโฟลเดอร์นี้ยัง import getId จากที่นี่ตามเดิม */
export { getId };

/**
 * สมองของหน้าจัดการนักเรียน
 *
 * โครงพื้นฐาน (โหลด ค้นหา เปิดดู บันทึก ลบ) มาจาก useAdminResource ตัวเดียวกับ
 * หน้าจัดการสมาชิกและหน้าจัดการโค้ช ไฟล์นี้เหลือเฉพาะเรื่องของนักเรียนจริง ๆ
 * คือฟอร์มแก้ไข ตัวกรอง "รอขยายสิทธิ์" และหน้าต่างคอร์สเรียน
 */

export function useStudentManagement() {
  const base = useAdminResource<StudentListResponseDTO, AdminUserDetail>({
    fetchList: getActiveStudentsAPI,
    fetchDetail: (item) => adminGetUserDetailAPI(item.id),
    listError: "เกิดข้อผิดพลาดในการโหลดข้อมูลนักเรียน",
    detailError: "ไม่สามารถดึงรายละเอียดนักเรียนได้",
    matches: (s, term) =>
      (getId(s)?.toString() || "").includes(term) ||
      !!s.firstName?.toLowerCase().includes(term) ||
      !!s.lastName?.toLowerCase().includes(term) ||
      !!s.nickname?.toLowerCase().includes(term) ||
      !!s.email?.toLowerCase().includes(term),
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<AdminUpdateUserInput>({});

  /** นักเรียนที่กำลังดูคอร์สเรียนอยู่ (null = ปิดหน้าต่างนั้น) */
  const [enrollmentsOf, setEnrollmentsOf] = useState<StudentListResponseDTO | null>(null);

  /** แสดงเฉพาะคนที่รอขยายสิทธิ์ */
  const [showGraceOnly, setShowGraceOnly] = useState(false);

  /**
   * เปิดฟอร์มแก้ไข
   *
   * ⚠️ ต้องโหลดรายละเอียดเต็มก่อนเสมอ
   *
   * ข้อมูลในตารางไม่มีวันเกิด เพศ และข้อมูลผู้ปกครองครบ ถ้าเอาข้อมูลจากแถว
   * มาเติมฟอร์มแล้วกดบันทึก ค่าที่ไม่ได้โหลดมาจะถูกเขียนทับด้วยค่าว่างหายไป
   */
  const openEdit = async (item: StudentListResponseDTO) => {
    base.setModalMode("edit");
    base.setSelected(item);
    base.setFormError(null);

    try {
      const d = base.detail?.id === item.id ? base.detail : await adminGetUserDetailAPI(item.id);
      base.setDetail(d);
      setEditingId(d.id);
      setEditForm({
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email,
        ...(d.customer ? { customer: { ...d.customer } } : {}),
      });
    } catch (err: unknown) {
      base.setFormError(errorMessage(err, "ไม่สามารถดึงข้อมูลนักเรียนได้"));
    }
  };

  const handleUpdate = async () => {
    if (editingId == null) return;
    await base.submit(
      () => adminUpdateUserAPI(editingId, editForm).then(() => undefined),
      "ไม่สามารถบันทึกการแก้ไขได้",
    );
  };

  const handleDelete = (item: StudentListResponseDTO) =>
    base.confirmAndRun(
      `ต้องการลบข้อมูลนักเรียน "${item.firstName} ${item.lastName}" ใช่หรือไม่?`,
      () => deleteUserAPI(getId(item)).then(() => undefined),
      "ไม่สามารถลบข้อมูลได้",
    );

  /** นักเรียนที่คอร์สหมดอายุแล้วแต่ยังเรียนไม่ครบ */
  const graceStudents = base.items.filter((s) => (s.graceEnrollments ?? 0) > 0);

  // กรอง "รอขยายสิทธิ์" ต่อจากผลค้นหา — เป็นตัวกรองเฉพาะของหน้านี้
  const filteredStudents = showGraceOnly
    ? base.filtered.filter((s) => (s.graceEnrollments ?? 0) > 0)
    : base.filtered;

  const stats = {
    total: base.items.length,
    grace: graceStudents.length,
    withPhone: base.items.filter((s) => !!s.phoneNumber).length,
    withNickname: base.items.filter((s) => !!s.nickname).length,
  };

  return {
    ...base,
    students: base.items,
    filteredStudents,
    graceStudents,
    stats,

    editForm,
    setEditForm,

    enrollmentsOf,
    setEnrollmentsOf,
    showGraceOnly,
    setShowGraceOnly,

    openEdit,
    handleUpdate,
    handleDelete,
  };
}

/** ชนิดของค่าที่ hook คืนออกมา ใช้เป็น prop ให้หน้าจอทั้งสองแบบ */
export type StudentManagement = ReturnType<typeof useStudentManagement>;
