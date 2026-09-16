"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, Clock, Wallet, UserCircle, Camera, ListTodo, Star, MoreHorizontal, X, ShieldCheck, ScanFace, ChevronRight } from "lucide-react";

const navItems = [
  { href: "/coach/dashboard", icon: <Home />, label: "หน้าแรก" },
  { href: "/coach/schedule", icon: <Calendar />, label: "ตารางงาน" },
  { href: "/coach/availability", icon: <Clock />, label: "เวลาว่าง" },
  { href: "/coach/evalution", icon: <ListTodo />, label: "ประเมินผู้เรียน" },
  { href: "/coach/detect", icon: <Camera />, label: "จำแนกผู้เรียน" },
  { href: "/coach/feedback", icon: <Star />, label: "รีวิวของฉัน" },
  { href: "/coach/payment", icon: <Wallet />, label: "การเงิน" },
];

// Mobile bottom bar: 4 primary icons + a "more" button that opens a full-screen menu
const primaryItems = [
  { href: "/coach/dashboard", icon: <Home />, label: "หน้าแรก" },
  { href: "/coach/payment", icon: <Wallet />, label: "การเงิน" },
  { href: "/coach/schedule", icon: <Calendar />, label: "ตารางงาน" },
  { href: "/coach/evalution", icon: <ListTodo />, label: "ประเมินผู้เรียน" },
];

const settingsItems = [
  { href: "/coach/settings/privacy", icon: ShieldCheck, label: "ความเป็นส่วนตัว" },
  { href: "/coach/settings/face", icon: ScanFace, label: "ลงทะเบียนใบหน้า" },
];

export default function CoachSidebar() {
  const pathname = usePathname();

  const [userName, setUserName] = useState("กำลังโหลด...");
  const [userEmail, setUserEmail] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const storedFirstName = localStorage.getItem("firstName");
    const storedLastName = localStorage.getItem("lastName");
    const storedEmail = localStorage.getItem("email");

    const fullName = [storedFirstName, storedLastName].filter(Boolean).join(" ");
    if (fullName) setUserName(fullName);
    if (storedEmail) setUserEmail(storedEmail);
  }, []);

  // ล็อก scroll พื้นหลังตอนเปิดเมนูเต็มหน้าจอ
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  // ปิดเมนูอัตโนมัติเมื่อเปลี่ยนหน้า
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // ปุ่ม "เพิ่มเติม" ต้อง active เมื่อหน้าปัจจุบันไม่ได้อยู่ใน primary bar
  const moreActive = !primaryItems.some((item) => item.href === pathname);

  return (
    <>
      {/* Desktop / tablet (md+): vertical sidebar */}
      <aside className="hidden md:flex fixed top-24 left-0 h-[calc(100vh-96px)] bg-white flex-col z-40 transition-all duration-300 ease-in-out w-[84px] hover:w-[260px] group overflow-hidden">

        <div className="flex-1 flex flex-col min-w-[260px] overflow-y-auto overflow-x-hidden no-scrollbar py-4">
          <nav className="flex flex-col gap-3 w-full my-auto">
            {navItems.map((item) => (
              <SidebarItem key={item.href} href={item.href} icon={item.icon} label={item.label} active={pathname === item.href} />
            ))}
          </nav>
        </div>

        <Link href="/coach/profile">
          <div className="flex items-center gap-4 flex-shrink-0 min-w-[260px] cursor-pointer hover:bg-gray-50 px-[22px] py-6 transition-colors">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 flex-shrink-0 bg-gray-100">
              <UserCircle className="w-8 h-8" />
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
              <p className="text-[15px] font-bold text-gray-800 leading-tight truncate w-[160px]">{userName}</p>
              <p className="text-[12px] text-gray-500 mt-0.5 truncate w-[160px]">{userEmail}</p>
            </div>
          </div>
        </Link>

      </aside>

      {/* Mobile (< md): icon-only horizontal bottom bar */}
      <nav className="flex md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 z-40 items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
        {primaryItems.map((item) => (
          <BottomBarItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            active={pathname === item.href}
            // กดเมนูที่อยู่หน้าเดิมอยู่แล้ว pathname ไม่เปลี่ยน effect ที่ปิดเมนูจึงไม่ทำงาน
            onNavigate={() => setMenuOpen(false)}
          />
        ))}

        <button
          type="button"
          aria-label="เพิ่มเติม"
          aria-expanded={menuOpen}
          // ต้อง toggle ไม่ใช่ set true — ตั้งแต่แถบล่างไม่ถูกบังแล้ว ปุ่มนี้มองเห็นได้
          // ตอนเมนูเปิดอยู่ ผู้ใช้ย่อมคาดว่ากดซ้ำแล้วจะปิด
          onClick={() => setMenuOpen((v) => !v)}
          className={`flex flex-1 min-w-0 items-center justify-center py-3.5 transition-colors ${
            menuOpen || moreActive ? "text-[#CC0000]" : "text-gray-600"
          }`}
        >
          <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
            <MoreHorizontal className="w-8 h-8" />
          </div>
        </button>
      </nav>

      {/* Mobile (< md): เมนูเต็มหน้าจอ แสดงทุกเมนูพร้อมชื่อ */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-0 flex flex-col bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-bold text-gray-900">เมนูทั้งหมด</h2>
              <button
                type="button"
                aria-label="ปิดเมนู"
                onClick={() => setMenuOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-4 pb-24">
              <div className="grid grid-cols-3 gap-3">
                {navItems.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className={`flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-colors ${
                        active ? "border-[#CC0000] bg-[#FFF0F0]" : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <div className={`flex h-9 w-9 items-center justify-center flex-shrink-0 [&>svg]:w-8 [&>svg]:h-8 ${active ? "text-[#CC0000]" : "text-[#CC0000]"}`}>
                        {item.icon}
                      </div>
                      <span className={`text-xs font-semibold leading-tight ${active ? "text-[#CC0000]" : "text-gray-700"}`}>
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>

              <div className="mt-6 flex flex-col gap-2">
                <span className="px-1 text-xs font-bold text-gray-500">การตั้งค่า</span>

                {settingsItems.map(({ href, icon: Icon, label }) => {
                  const active = pathname === href;
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 transition-colors ${
                        active ? "border-[#CC0000] bg-[#FFF0F0]" : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <Icon className="h-6 w-6 flex-shrink-0 text-[#CC0000]" />
                      <span className={`flex-1 text-sm font-semibold ${active ? "text-[#CC0000]" : "text-gray-700"}`}>
                        {label}
                      </span>
                      <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-300" />
                    </Link>
                  );
                })}
              </div>

              <Link
                href="/coach/profile"
                onClick={() => setMenuOpen(false)}
                className={`mt-4 flex items-center gap-4 rounded-2xl border p-4 transition-colors ${
                  pathname === "/coach/profile" ? "border-[#CC0000] bg-[#FFF0F0]" : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 flex-shrink-0 bg-gray-100">
                  <UserCircle className="w-8 h-8" />
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-gray-800 leading-tight truncate">{userName}</p>
                  <p className="text-[12px] text-gray-500 mt-0.5 truncate">{userEmail}</p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SidebarItem({ icon, label, href, active }: { icon: React.ReactNode; label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-6 py-4 pl-[26px] transition-all duration-200 whitespace-nowrap ${
        active ? "bg-[#FFF0F0]" : "hover:bg-gray-50"
      }`}
    >
      <div className={`flex-shrink-0 w-8 h-8 flex items-center justify-center transition-transform duration-200 group-hover:scale-110 ${active ? "text-[#CC0000]" : "text-[#CC0000]"}`}>
        {icon}
      </div>
      <span className={`text-[17px] font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${active ? "text-[#CC0000]" : "text-gray-700"}`}>
        {label}
      </span>
    </Link>
  );
}

function BottomBarItem({ icon, label, href, active, onNavigate }: { icon: React.ReactNode; label: string; href: string; active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={href}
      aria-label={label}
      onClick={onNavigate}
      className={`flex flex-1 min-w-0 items-center justify-center py-3.5 transition-colors ${
        active ? "text-[#CC0000]" : "text-gray-600"
      }`}
    >
      <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 [&>svg]:w-8 [&>svg]:h-8">
        {icon}
      </div>
    </Link>
  );
}
