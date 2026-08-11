"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// section ที่มีเมนูใน Top bar (ต้องตรงกับ id ใน frontend/src/app/page.tsx)
const SECTIONS = ["coaches", "courses", "about"];

export default function Navbar() {
  const pathname = usePathname();
  const [active, setActive] = useState<string>("");

  // scroll-spy: ไฮไลท์เมนูของส่วนที่กำลังเลื่อนดูอยู่ (เฉพาะหน้าแรก)
  useEffect(() => {
    if (pathname !== "/") {
      setActive("");
      return;
    }
    const els = SECTIONS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null
    );
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) setActive(visible[0].target.id);
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pathname]);

  if (
    pathname?.startsWith("/customer") ||
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/coach")
  ) {
    return null;
  }

  const linkClass = (id: string) =>
    `transition-colors ${
      active === id ? "text-red-600 font-bold" : "text-black hover:text-red-600"
    }`;

  return (
    <nav className="sticky top-0 z-50 w-full bg-white h-24 flex items-center px-4 md:px-12 border-b border-gray-100">
      <div className="w-full flex justify-between items-center">
        {/* โลโก้ฝั่งซ้าย */}
        <Link href="/" className="flex items-center">
          <Image
            src="/logo.png"
            alt="Koyama Badminton School Logo"
            width={220}
            height={60}
            className="object-contain w-auto h-auto"
            priority
          />
        </Link>

        {/* เมนูฝั่งขวา */}
        <div className="hidden md:flex items-center gap-8 text-black text-lg font-medium">
          <Link href="/#coaches" className={linkClass("coaches")}>
            บุคลากร
          </Link>
          <Link href="/#courses" className={linkClass("courses")}>
            คอร์สเรียน
          </Link>
          <Link href="/#about" className={linkClass("about")}>
            เกี่ยวกับฉัน
          </Link>

          {/* เส้นกั้นแนวตั้ง */}
          <div className="h-6 w-px bg-gray-400 mx-2"></div>

          <Link href="/login" className="hover:text-red-600 transition-colors">
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    </nav>
  );
}
