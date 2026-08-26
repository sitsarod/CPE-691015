"use client";

import { useIsMobile } from "@/hooks/useIsMobile";
import {
  useMemberManagement,
  MemberManagementDesktop,
  MemberManagementMobile,
} from "./components";

/**
 * หน้าจัดการสมาชิก (แอดมิน)
 *
 * ไฟล์นี้ตั้งใจให้สั้นและไม่มีตรรกะของตัวเอง ทำแค่สามอย่าง:
 * เรียกสมอง เช็คขนาดจอ แล้วเลือกหน้าจอที่ตรงกับขนาดนั้น
 * ของจริงอยู่ที่ ./components
 *
 * ⚠️ ทั้งสองหน้าจอใช้ค่าจาก useMemberManagement ก้อนเดียวกัน
 *
 * ต้องเรียก hook ก่อนแล้วค่อยเลือกหน้าจอเสมอ ห้ามย้ายการเรียก hook
 * เข้าไปในแต่ละหน้าจอ เพราะกฎของ React ห้ามเรียก hook แบบมีเงื่อนไข
 * และถ้าแยกกันเรียก สองหน้าจอจะมีสถานะคนละชุด สลับจอทีข้อมูลหายที
 *
 * ⚠️ MemberManagementMobile ยังเป็นโครงเปล่า
 *
 * ตอนนี้ต่อสายไว้แล้วแต่ข้างในยังไม่มีอะไร คนที่เปิดด้วยมือถือจะเห็น
 * ข้อความว่ากำลังพัฒนา ถ้าอยากให้มือถือใช้งานได้ไปพลางก่อน
 * เปลี่ยนบรรทัดล่างสุดเป็น <MemberManagementDesktop manager={manager} /> อย่างเดียวได้
 */
export default function AdminMembersPage() {
  const manager = useMemberManagement();
  const isMobile = useIsMobile();

  return isMobile ? <MemberManagementMobile manager={manager} /> : <MemberManagementDesktop manager={manager} />;
}
