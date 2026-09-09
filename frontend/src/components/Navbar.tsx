"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

// เมนูใน Top bar — id ต้องตรงกับ section id ใน frontend/src/app/page.tsx
// เรียงตามลำดับหัวข้อจริงบนหน้าแรก
const NAV_ITEMS: { id: string; label: string }[] = [
  { id: "courses", label: "คอร์สเรียน" },
  { id: "coaches", label: "บุคลากร" },
  { id: "facility", label: "ภาพบรรยากาศ" },
  { id: "news", label: "ข่าว" },
  { id: "faq", label: "FAQ" },
  { id: "about", label: "ติดต่อเรา" },
];
const SECTIONS = NAV_ITEMS.map((item) => item.id);

export default function Navbar() {
  const pathname = usePathname();
  const [active, setActive] = useState<string>("");
  // เปิด/ปิดเมนู Hamburger สำหรับมือถือ
  const [menuOpen, setMenuOpen] = useState(false);

  // ปิดเมนูมือถืออัตโนมัติเมื่อเปลี่ยนหน้า (กันเมนูค้างเปิดหลังกดลิงก์)
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // ล็อกไม่ให้หน้าเลื่อนตอนเปิด drawer (ให้โฟกัสอยู่ที่เมนู)
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

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

  // ลิงก์ในเมนู drawer มือถือ: ตัวหนา ขนาดใหญ่ อ่านง่าย
  const drawerLinkClass = (id: string) =>
    `text-xl font-bold transition-colors ${
      active === id ? "text-red-600" : "text-gray-900 hover:text-red-600"
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

        {/* เมนูฝั่งขวา (จอ lg ขึ้นไป — เมนูยาวขึ้นจึงเลื่อน breakpoint) */}
        <div className="hidden lg:flex items-center gap-7 text-black text-base font-medium">
          {NAV_ITEMS.map((item) => (
            <Link key={item.id} href={`/#${item.id}`} className={linkClass(item.id)}>
              {item.label}
            </Link>
          ))}

          {/* เส้นกั้นแนวตั้ง */}
          <div className="h-6 w-px bg-gray-400 mx-1"></div>

          <Link href="/login" className="hover:text-red-600 transition-colors">
            เข้าสู่ระบบ
          </Link>
        </div>

        {/* ปุ่ม Hamburger (จอเล็กกว่า lg) */}
        <button
          type="button"
          className="lg:hidden text-black hover:text-red-600 transition-colors p-2 -mr-2"
          onClick={() => setMenuOpen(true)}
          aria-label="เปิดเมนู"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
        >
          <Menu className="w-7 h-7" />
        </button>
      </div>

      {/* เมนูมือถือแบบ drawer เลื่อนเข้าจากขวา + ฉากหลังมืด */}
      {menuOpen && (
        <>
          {/* ฉากหลังมืด: กดที่ว่างเพื่อปิดเมนู */}
          <div
            className="lg:hidden fixed inset-0 z-[60] bg-black/40"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />

          {/* แผง drawer ฝั่งขวา */}
          <aside
            id="mobile-menu"
            className="lg:hidden fixed top-0 right-0 z-[70] h-full w-4/5 max-w-xs bg-white shadow-2xl flex flex-col"
          >
            {/* ปุ่มปิด (X) มุมบนขวา */}
            <div className="flex justify-end p-4">
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="ปิดเมนู"
                className="text-gray-900 hover:text-red-600 transition-colors p-1"
              >
                <X className="w-7 h-7" />
              </button>
            </div>

            {/* ปุ่มเข้าสู่ระบบ (เด่น) + รายการเมนู — เริ่มจากด้านบน จัดกลางแนวนอน */}
            <nav className="flex flex-col items-center gap-7 px-8 pt-2">
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="bg-black text-white font-bold tracking-wide px-8 py-3 rounded-md hover:bg-gray-800 transition-colors"
              >
                เข้าสู่ระบบ
              </Link>

              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.id}
                  href={`/#${item.id}`}
                  onClick={() => setMenuOpen(false)}
                  className={drawerLinkClass(item.id)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
        </>
      )}
    </nav>
  );
}
