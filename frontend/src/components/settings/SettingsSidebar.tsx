"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Bell, ShieldCheck, ScanFace } from "lucide-react";

/**
 * แถบเมนูของหน้าตั้งค่า ใช้ร่วมกันทั้งฝั่งนักเรียนและฝั่งโค้ช
 *
 * เมนูเหมือนกันทั้งสองฝั่งโดยตั้งใจ ต่างกันแค่ base path เท่านั้น
 * เพราะทั้งสองบทบาทมีเรื่องให้ตั้งค่าชุดเดียวกัน — ข้อมูลติดต่อ ความยินยอม
 * และการลงทะเบียนใบหน้า (โค้ชก็สแกนหน้าเช็คชื่อเข้าสอนเหมือนกัน)
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

  const items = [
    { href: `${basePath}/profile`, icon: User, label: "แก้ไขโปรไฟล์" },
    { href: `${basePath}/privacy`, icon: ShieldCheck, label: "ความเป็นส่วนตัว" },
    { href: `${basePath}/face`, icon: ScanFace, label: "ลงทะเบียนใบหน้า" },
  ];


  return (
    <>
      <div className="w-80 border-r border-gray-200 p-6 hidden md:flex flex-col space-y-6 bg-white">
        <h2 className="text-2xl font-bold px-2">ตั้งค่า</h2>

        <div className="flex flex-col space-y-1">
          <span className="text-xs font-bold text-gray-500 px-2 pb-2">บัญชีของฉัน</span>

          {items.map(({ href, icon: Icon, label }) => (
            <Link key={href} href={href} className={linkClass(href)}>
              <Icon className={iconClass(href)} />
              <span>{label}</span>
            </Link>
          ))}

          {/* ยังไม่มีหน้านี้ในระบบ — แสดงเป็น disabled ไว้ก่อน ไม่ผูก Link เพื่อไม่ให้กดแล้ว 404 */}
          <div className="flex items-center gap-3 px-3 py-3 rounded-xl font-medium text-sm text-gray-300 cursor-not-allowed">
            <Bell className="w-4 h-4 text-gray-300" />
            <span>การแจ้งเตือน</span>
          </div>
        </div>
      </div>

      <nav
        aria-label="เมนูตั้งค่า"
        className="md:hidden sticky top-0 z-20 flex gap-2 overflow-x-auto border-b border-gray-200 bg-white px-4 py-3
                   [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
                active
                  ? "border-[#CC0000] bg-[#FFF0F0] font-bold text-[#CC0000]"
                  : "border-gray-200 font-medium text-gray-600"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-[#CC0000]" : "text-gray-400"}`} />
              <span className="whitespace-nowrap">{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
