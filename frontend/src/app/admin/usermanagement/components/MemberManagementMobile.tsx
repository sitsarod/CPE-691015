"use client";

import { MobileNotReady } from "@/components/admin/shared/AdminPageShell";

import type { MemberManagement } from "./useMemberManagement";

/**
 * หน้าจัดการสมาชิก — เวอร์ชันมือถือ (ยังไม่ได้ทำ)
 *
 * ─── สถานะตอนนี้ ───
 *
 * ⚠️ ต่อสายกับ page.tsx ไว้แล้ว แต่ข้างในยังว่าง
 *
 * เปิดหน้านี้ด้วยจอกว้างไม่เกิน 767px จะมาโผล่ที่ไฟล์นี้ทันที
 * แปลว่าตอนนี้แอดมินใช้งานผ่านมือถือไม่ได้ ซึ่งเป็นเรื่องที่รู้อยู่แล้ว
 *
 * ถ้าระหว่างนี้อยากให้มือถือพอใช้งานได้ไปก่อน ไปที่ page.tsx แล้วเรียก
 * MemberManagementDesktop อย่างเดียว จอจะแน่นหน่อยแต่กดได้ครบทุกปุ่ม
 *
 * ─── ทำต่อยังไง ───
 *
 * เขียน JSX ในฟังก์ชันข้างล่างนี้ได้เลย ใช้ค่าจาก m ตัวเดียวกับฝั่งคอมพิวเตอร์
 * ไม่ต้องเรียก API เองและไม่ต้องเขียนตรรกะซ้ำ ทุกอย่างมีให้แล้วใน useMemberManagement
 * พอเขียนเสร็จไม่ต้องไปแก้ page.tsx อีก เพราะต่อสายไว้ให้แล้ว
 *
 * ─── ข้อควรระวังตอนออกแบบ ───
 *
 * อย่าเอา DataTable มาใช้ซ้ำ — ตารางสี่คอลัมน์บีบลงจอกว้าง 375px ไม่ได้
 * ต้องเลื่อนแนวนอนซึ่งใช้งานยากมากบนมือถือ ให้ทำเป็นการ์ดเรียงลงมาแทน
 * การ์ดละหนึ่งคน แสดงชื่อ บทบาท สถานะ แล้วแตะทั้งใบเพื่อเปิดดูรายละเอียด
 *
 * ส่วนฟอร์มเพิ่ม/แก้ไขสมาชิกมีช่องเยอะมาก (โค้ชมีสิบกว่าช่อง)
 * บนมือถือควรเป็นหน้าเต็มจอ ไม่ใช่ modal ลอย เพราะคีย์บอร์ดจะบังครึ่งจอ
 *
 * ─── ตัวอย่างโครงที่จะเขียน ───
 *
 *   export function MemberManagementMobile({ manager }: { manager: MemberManagement }) {
 *     if (manager.isLoading) return <ตัวโหลด />;
 *     return (
 *       <div className="flex flex-col gap-3 p-4">
 *         <หัวเรื่องพร้อมปุ่มเพิ่ม onClick={manager.openCreate} />
 *         <ช่องค้นหา value={manager.searchTerm} onChange={manager.setSearchTerm} />
 *         {manager.filteredMembers.map((member) => (
 *           <การ์ดสมาชิก key={getId(member)} onClick={() => manager.openView(member)} />
 *         ))}
 *       </div>
 *     );
 *   }
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function MemberManagementMobile({ manager }: { manager: MemberManagement }) {
  return <MobileNotReady />;
}
