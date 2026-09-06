"use client";

import { useState } from "react";
import {
  getAllCoachesAPI,
  getCoachDetailAPI,
  deleteCoachAPI,
  CoachListItem,
} from "@/services/coachAPI";
import { CoachProfile } from "@/types/coach";
import { adminUpdateUserAPI } from "@/services/userAPI";
import { EditCoachForm } from "@/components/admin/modals/EditCoachModal";
import { useAdminResource } from "@/components/admin/shared/useAdminResource";

/**
 * สมองของหน้าจัดการโค้ช
 *
 * โครงพื้นฐาน (โหลด ค้นหา เปิดดู บันทึก ลบ) มาจาก useAdminResource ตัวเดียวกับ
 * หน้าจัดการสมาชิกและหน้าจัดการผู้เรียน ไฟล์นี้เหลือเฉพาะเรื่องของโค้ชจริง ๆ
 *
 * การ "เพิ่มโค้ช" ไม่ได้อยู่ที่หน้านี้ ย้ายไปหน้าจัดการสมาชิกแล้ว
 * เพราะการสร้างโค้ชต้องสร้าง user กับโปรไฟล์พร้อมกันในทรานแซกชันเดียว
 * หน้านี้จึงเหลือแค่ ดู / แก้ไข / ดูตารางเวลาว่าง / เปิดปิดใช้งาน / ลบ
 */

const emptyEditForm: EditCoachForm = {
  nickname: "",
  phone: "",
  lineId: "",
  facebook: "",
  address: "",
  bank_account: "",
  payment_info: "",
  prompt_pay: "",
  specialization: "",
  coach_license: "",
  payment_type: "per_session",
  pay_rate: 0,
  bio: "",
  home_image: "",
};

/**
 * ตรวจฟอร์มแก้ไขโค้ช คืนข้อความผิดพลาดข้อแรกที่เจอ หรือ null ถ้าผ่านหมด
 *
 * แยกเป็นฟังก์ชันล้วน ๆ ที่ไม่ยุ่งกับ state เพื่อให้อ่านง่ายและเทสได้
 * โดยไม่ต้องเรนเดอร์อะไรเลย
 */
function validateEditForm(form: EditCoachForm): string | null {
  const required: [keyof EditCoachForm, string][] = [
    ["nickname", "ชื่อเล่น"],
    ["phone", "เบอร์โทรศัพท์"],
    ["address", "ที่อยู่"],
    ["bank_account", "ธนาคาร"],
    ["payment_info", "เลขบัญชี"],
    ["prompt_pay", "พร้อมเพย์"],
    ["specialization", "ระดับฝีมือ"],
    ["coach_license", "ใบรับรองผู้ฝึกสอน"],
  ];

  for (const [key, label] of required) {
    if (!String(form[key]).trim()) return `กรุณากรอก: ${label}`;
  }

  if (!/^\d{10}$/.test(form.phone)) return "เบอร์โทรต้องเป็นตัวเลข 10 หลัก";

  if (!form.pay_rate || form.pay_rate <= 0) {
    return form.payment_type === "monthly"
      ? "กรุณากรอกค่าจ้างต่อเดือนให้ถูกต้อง"
      : "กรุณากรอกค่าจ้างต่อครั้งให้ถูกต้อง";
  }

  return null;
}

export function useCoachManagement() {
  const base = useAdminResource<CoachListItem, CoachProfile>({
    fetchList: getAllCoachesAPI,
    fetchDetail: (item) => getCoachDetailAPI(item.id),
    listError: "เกิดข้อผิดพลาดในการโหลดข้อมูลโค้ช",
    detailError: "ไม่สามารถดึงรายละเอียดโค้ชได้",
    matches: (c, term) =>
      !!c.id?.toString().includes(term) ||
      !!c.firstName?.toLowerCase().includes(term) ||
      !!c.lastName?.toLowerCase().includes(term) ||
      !!c.email?.toLowerCase().includes(term) ||
      !!c.nickname?.toLowerCase().includes(term) ||
      !!c.specialization?.toLowerCase().includes(term) ||
      !!c.coach_license?.toLowerCase().includes(term) ||
      !!c.phone?.toLowerCase().includes(term),
  });

  const [editForm, setEditForm] = useState<EditCoachForm>(emptyEditForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  const openSchedule = (item: CoachListItem) => {
    base.setSelected(item);
    base.setModalMode("schedule");
  };

  /**
   * เปิดฟอร์มแก้ไข โดยเติมค่าจากรายละเอียดที่หน้าดูข้อมูลโหลดไว้แล้ว
   *
   * ⚠️ เข้าได้จากหน้าดูข้อมูลเท่านั้น จึงมั่นใจว่ามี detail อยู่แล้ว
   * ถ้าวันหนึ่งมีคนเพิ่มปุ่มแก้ไขตรงจากแถวในตาราง ต้องโหลด detail ก่อนเรียกตัวนี้
   * ไม่งั้นฟอร์มจะว่างเปล่าแล้วกดบันทึกทับข้อมูลเดิมหายหมด
   */
  const openEdit = () => {
    const d = base.detail;
    if (!d) return;

    setEditingId(d.id);
    setEditForm({
      nickname: d.nickname ?? "",
      phone: d.phone ?? "",
      lineId: d.lineId ?? "",
      facebook: d.facebook ?? "",
      address: d.address ?? "",
      bank_account: d.bank_account ?? "",
      payment_info: d.payment_info ?? "",
      prompt_pay: d.prompt_pay ?? "",
      specialization: d.specialization ?? "",
      coach_license: d.coach_license ?? "",
      payment_type: d.payment_type ?? "per_session",
      pay_rate: d.pay_rate ?? 0,
      bio: d.bio ?? "",
      home_image: d.home_image ?? "",
    });
    base.setFormError(null);
    base.setModalMode("edit");
  };

  const handleUpdate = async () => {
    if (editingId == null) return;

    const problem = validateEditForm(editForm);
    if (problem) {
      base.setFormError(problem);
      return;
    }

    const d = base.detail;
    if (!d) {
      base.setFormError("ไม่พบข้อมูลโค้ช กรุณาปิดหน้าต่างแล้วลองใหม่");
      return;
    }

    await base.submit(async () => {
      // ⚠️ ต้องยิงผ่าน endpoint ของแอดมินเท่านั้น
      //
      // ตามนโยบายปัจจุบัน ชื่อเล่น บัญชีธนาคาร และข้อมูลการจ่ายเงิน ถูกถอดออกจาก
      // PATCH /coaches/:id (เส้นที่โค้ชเรียกเองได้) แล้ว เพราะเป็นข้อมูลที่กระทบเงิน
      // จึงแก้ได้ทางนี้ทางเดียว
      //
      // ⚠️ ใช้ d.user_id ไม่ใช่ editingId — endpoint นี้รับ users.id
      // ส่วน editingId คือ coaches.id ซึ่งเป็นคนละชุดเลข ใส่ผิดจะไปแก้ของคนอื่น
      await adminUpdateUserAPI(d.user_id, {
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
          home_image: editForm.home_image,
        },
      });
    }, "ไม่สามารถบันทึกการแก้ไขได้");
  };

  /**
   * ลบโปรไฟล์โค้ช
   *
   * ข้อความยืนยันบอกให้ครบว่าอะไรหายอะไรอยู่ เพราะการลบไม่ได้กวาดทุกอย่างทิ้ง
   * ประวัติการทำงานถูกเก็บไว้โดยตั้งใจ (ใช้คิดค่าจ้างย้อนหลังและตรวจสอบภายหลัง)
   * และเลขบัตรประชาชนกับอีเมลจะยังถูกจองไว้ ใช้สมัครใหม่ด้วยเลขเดิมไม่ได้
   * ถ้าแค่ต้องการให้โค้ชหยุดรับงานชั่วคราว ให้ใช้ปุ่มพักงานแทน
   */
  const handleDelete = (item: CoachListItem) =>
    base.confirmAndRun(
      `ต้องการลบโปรไฟล์โค้ช "${item.firstName} ${item.lastName}" ใช่หรือไม่?\n\n` +
        `• บัญชีจะเข้าสู่ระบบไม่ได้อีก และหายจากรายชื่อโค้ช\n` +
        `• เวลาว่างและคาบสอนที่ยังไม่ถึงกำหนดจะถูกถอดออกจากตาราง\n` +
        `• ประวัติเช็คชื่อ คาบที่สอนไปแล้ว และรายการจ่ายค่าจ้างยังเก็บไว้\n` +
        `• เลขบัตรประชาชนและอีเมลเดิมจะใช้สมัครใหม่ไม่ได้\n\n` +
        `ถ้าต้องการแค่ให้หยุดรับงานชั่วคราว ให้ใช้ปุ่มพักงานแทน`,
      () => deleteCoachAPI(item.id).then(() => undefined),
      "ไม่สามารถลบข้อมูลได้",
    );

  /** สลับสถานะเปิด/ปิดใช้งานของโค้ช (พักงาน) */
  const handleToggleStatus = (item: CoachListItem) => {
    const nextStatus = item.status === "inactive" ? "active" : "inactive";
    const verb = nextStatus === "inactive" ? "ปิดใช้งาน (พักงาน)" : "เปิดใช้งาน";

    return base.confirmAndRun(
      `ต้องการ${verb}โค้ช "${item.firstName} ${item.lastName}" ใช่หรือไม่?`,
      () => adminUpdateUserAPI(item.user_id, { coach: { status: nextStatus } }).then(() => undefined),
      "ไม่สามารถเปลี่ยนสถานะได้",
    );
  };

  // โค้ชที่ status = "inactive" ถือว่าพักงาน ที่เหลือ (รวมค่าว่าง/undefined) ถือว่าใช้งานอยู่
  const inactiveCount = base.items.filter((c) => c.status === "inactive").length;
  const stats = {
    total: base.items.length,
    active: base.items.length - inactiveCount,
    inactive: inactiveCount,
  };

  return {
    ...base,
    coaches: base.items,
    filteredCoaches: base.filtered,
    stats,

    editForm,
    setEditForm,

    openSchedule,
    openEdit,
    handleUpdate,
    handleDelete,
    handleToggleStatus,
  };
}

/** ชนิดของค่าที่ hook คืนออกมา ใช้เป็น prop ให้หน้าจอทั้งสองแบบ */
export type CoachManagement = ReturnType<typeof useCoachManagement>;
