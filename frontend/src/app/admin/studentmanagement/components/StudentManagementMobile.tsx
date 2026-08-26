"use client";

import { MobileNotReady } from "@/components/admin/shared/AdminPageShell";

import type { StudentManagement } from "./useStudentManagement";

/**
 * หน้าจัดการนักเรียน — เวอร์ชันมือถือ (ยังไม่ได้ทำ)
 *
 * ⚠️ ต่อสายกับ page.tsx ไว้แล้ว แต่ข้างในยังว่าง
 *
 * เปิดหน้านี้ด้วยจอกว้างไม่เกิน 767px จะมาโผล่ที่ไฟล์นี้ทันที
 * ถ้าอยากให้มือถือพอใช้งานได้ไปก่อน ไปที่ page.tsx แล้วเรียก
 * StudentManagementDesktop อย่างเดียว
 *
 * ─── ทำต่อยังไง ───
 *
 * เขียน JSX ในฟังก์ชันข้างล่างได้เลย ใช้ค่าจาก m ตัวเดียวกับฝั่งคอมพิวเตอร์
 * ทุกอย่างมีให้แล้วใน useStudentManagement ไม่ต้องเรียก API เอง
 *
 * ─── ข้อควรระวังตอนออกแบบ ───
 *
 * หน้านี้มีของที่หน้าอื่นไม่มีคือ "แถบเตือนกลุ่มรอขยายสิทธิ์" ซึ่งกดเพื่อกรองได้
 * บนมือถือควรอยู่บนสุดและเห็นชัด เพราะเป็นงานที่แอดมินต้องรีบทำ
 * ใช้ manager.graceStudents.length กับ manager.setShowGraceOnly ได้เลย
 *
 * ปุ่ม "คอร์สเรียน" ต้องแตะง่ายด้วย เพราะเป็นทางเดียวที่จะขยายสิทธิ์ให้นักเรียนได้
 * อย่าซ่อนไว้ในเมนูสามจุด
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function StudentManagementMobile({ manager }: { manager: StudentManagement }) {
  return <MobileNotReady />;
}
