"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User, Bell, ShieldCheck } from 'lucide-react';

export default function EditSidebar() {
  const pathname = usePathname();

  const linkClass = (href: string) =>
    `flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-colors ${
      pathname === href
        ? 'bg-gray-50 font-bold text-gray-900'
        : 'font-medium text-gray-500 hover:bg-gray-50'
    }`;

  const iconClass = (href: string) =>
    `w-4 h-4 ${pathname === href ? 'text-[#CC0000]' : 'text-gray-400'}`;

  return (
    <div className="w-80 border-r border-gray-200 p-6 hidden md:flex flex-col space-y-6 bg-white">
      <h2 className="text-2xl font-bold px-2">ตั้งค่า</h2>

      <div className="flex flex-col space-y-1">
        <span className="text-xs font-bold text-gray-500 px-2 pb-2">บัญชีของฉัน</span>

        <Link href="/customer/settings/profile" className={linkClass('/customer/settings/profile')}>
          <User className={iconClass('/customer/settings/profile')} />
          <span>แก้ไขโปรไฟล์</span>
        </Link>

        <Link href="/customer/settings/privacy" className={linkClass('/customer/settings/privacy')}>
          <ShieldCheck className={iconClass('/customer/settings/privacy')} />
          <span>ความเป็นส่วนตัว</span>
        </Link>

        {/* ยังไม่มีหน้านี้ในระบบ — แสดงเป็น disabled ไว้ก่อน ไม่ผูก Link เพื่อไม่ให้กดแล้ว 404 */}
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl font-medium text-sm text-gray-300 cursor-not-allowed">
          <Bell className="w-4 h-4 text-gray-300" />
          <span>การแจ้งเตือน</span>
        </div>
      </div>
    </div>
  );
}
