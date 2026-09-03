"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Bell, ShieldCheck, ScanFace } from "lucide-react";

/**
 * แถบเมนูของหน้าตั้งค่า ใช้ร่วมกันทั้งฝั่งนักเรียนและฝั่งโค้ช
 *
 * เมนูเหมือนกันทั้งสองฝั่งโดยตั้งใจ ต่างกันแค่ base path เท่านั้น
 * เพราะทั้งสองบทบาทมีเรื่องให้ตั้งค่าชุดเดียวกัน คือข้อมูลติดต่อของตัวเอง
 * กับความยินยอมเก็บข้อมูลใบหน้า (โค้ชก็สแกนหน้าเช็คชื่อเข้างานเหมือนกัน)
 */
interface Props {
  /** เช่น "/customer/settings" หรือ "/coach/settings" — ไม่ต้องมี / ปิดท้าย */
  basePath: string;
}

export default function SettingsSidebar({ basePath }: Props) {
  const pathname = usePathname();

  const linkClass = (href: string) =>
    `flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-colors ${
      pathname === href
        ? "bg-gray-50 font-bold text-gray-900"
        : "font-medium text-gray-500 hover:bg-gray-50"
    }`;

  const iconClass = (href: string) =>
    `w-4 h-4 ${pathname === href ? "text-[#CC0000]" : "text-gray-400"}`;

  const profileHref = `${basePath}/profile`;
  const privacyHref = `${basePath}/privacy`;
  const faceHref = `${basePath}/face`;

  // หน้าลงทะเบียนใบหน้ามีเฉพาะฝั่งนักเรียน — ตาราง face_images ผูกกับ customers เท่านั้น
  // ถ้าโชว์ให้โค้ชจะกดแล้ว 404 (ต่างจากหน้าความยินยอมที่ทั้งสองบทบาทใช้ร่วมกันได้)
  const showFaceLink = basePath.startsWith("/customer");

  return (
    <div className="w-80 border-r border-gray-200 p-6 hidden md:flex flex-col space-y-6 bg-white">
      <h2 className="text-2xl font-bold px-2">ตั้งค่า</h2>

      <div className="flex flex-col space-y-1">
        <span className="text-xs font-bold text-gray-500 px-2 pb-2">บัญชีของฉัน</span>

        <Link href={profileHref} className={linkClass(profileHref)}>
          <User className={iconClass(profileHref)} />
          <span>แก้ไขโปรไฟล์</span>
        </Link>

        <Link href={privacyHref} className={linkClass(privacyHref)}>
          <ShieldCheck className={iconClass(privacyHref)} />
          <span>ความเป็นส่วนตัว</span>
        </Link>

        {showFaceLink && (
          <Link href={faceHref} className={linkClass(faceHref)}>
            <ScanFace className={iconClass(faceHref)} />
            <span>ลงทะเบียนใบหน้า</span>
          </Link>
        )}

        {/* ยังไม่มีหน้านี้ในระบบ — แสดงเป็น disabled ไว้ก่อน ไม่ผูก Link เพื่อไม่ให้กดแล้ว 404 */}
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl font-medium text-sm text-gray-300 cursor-not-allowed">
          <Bell className="w-4 h-4 text-gray-300" />
          <span>การแจ้งเตือน</span>
        </div>
      </div>
    </div>
  );
}
