/**
 * ทางเข้าเดียวของโฟลเดอร์นี้ — ส่งออกเฉพาะที่ page.tsx ใช้จริง
 *
 * ของที่ใช้กันเองข้างในโฟลเดอร์ (getId, build*Columns) ไม่ต้องผ่านที่นี่
 * ให้นำเข้าจากไฟล์ต้นทางตรง ๆ ไปเลย จะได้รู้ทันทีว่าอะไรเป็นของภายใน
 * และอะไรเป็นของที่เปิดให้ข้างนอกใช้
 */

export { useStudentManagement } from "./useStudentManagement";
export type { StudentManagement } from "./useStudentManagement";
export { StudentManagementDesktop } from "./StudentManagementDesktop";
export { StudentManagementMobile } from "./StudentManagementMobile";
