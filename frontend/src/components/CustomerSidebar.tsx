"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Wallet, ClipboardList, Calendar, StarCheck, UserCircle, LayoutDashboard, MoreHorizontal } from "lucide-react";

const navItems = [
  { href: "/customer/dashboard", icon: <Home />, label: "หน้าแรก" },
  { href: "/customer/overview", icon: <LayoutDashboard />, label: "แดชบอร์ด" },
  { href: "/customer/payment", icon: <Wallet />, label: "การเงิน" },
  { href: "/customer/enrollment", icon: <ClipboardList />, label: "คอร์สของฉัน" },
  { href: "/customer/schedule", icon: <Calendar />, label: "ตารางเรียน" },
  { href: "/customer/feedback", icon: <StarCheck />, label: "รีวิวของฉัน" },
];

// Mobile bottom bar: 4 primary icons + a "more" button that reveals the rest
const primaryItems = [
  { href: "/customer/dashboard", icon: <Home />, label: "หน้าแรก" },
  { href: "/customer/overview", icon: <LayoutDashboard />, label: "แดชบอร์ด" },
  { href: "/customer/payment", icon: <Wallet />, label: "การเงิน" },
  { href: "/customer/enrollment", icon: <ClipboardList />, label: "คอร์ส" },
];

const moreItems = [
  { href: "/customer/schedule", icon: <Calendar />, label: "ตารางเรียน" },
  { href: "/customer/feedback", icon: <StarCheck />, label: "รีวิวของฉัน" },
  { href: "/customer/profile", icon: <UserCircle />, label: "โปรไฟล์" },
];

export default function CustomerSidebar() {
  const pathname = usePathname();

  const [userName, setUserName] = useState("กำลังโหลด...");
  const [userEmail, setUserEmail] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedFirstName = localStorage.getItem("firstName");
    const storedLastName = localStorage.getItem("lastName");
    const storedEmail = localStorage.getItem("email");

    const fullName = [storedFirstName, storedLastName].filter(Boolean).join(" ");
    if (fullName) setUserName(fullName);
    if (storedEmail) setUserEmail(storedEmail);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const moreActive = moreItems.some((item) => item.href === pathname);

  return (
    <>
      {/* Desktop / tablet (md+): vertical sidebar */}
      <aside className="hidden md:flex fixed top-24 left-0 h-[calc(100vh-96px)] bg-white flex-col z-40 transition-all duration-300 ease-in-out w-[84px] hover:w-[260px] group overflow-hidden">

        <div className="flex-1 flex flex-col min-w-[260px] overflow-y-auto overflow-x-hidden py-4">
          <nav className="flex flex-col gap-3 w-full my-auto">
            {navItems.map((item) => (
              <SidebarItem key={item.href} href={item.href} icon={item.icon} label={item.label} active={pathname === item.href} />
            ))}
          </nav>
        </div>

        <Link href="/customer/profile">
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
          <BottomBarItem key={item.href} href={item.href} icon={item.icon} label={item.label} active={pathname === item.href} />
        ))}

        <div className="relative flex flex-1 min-w-0" ref={moreRef}>
          <button
            type="button"
            aria-label="เพิ่มเติม"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
            className={`flex flex-1 min-w-0 items-center justify-center py-3.5 transition-colors ${
              moreOpen || moreActive ? "text-[#CC0000]" : "text-gray-600"
            }`}
          >
            <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
              <MoreHorizontal className="w-8 h-8" />
            </div>
          </button>

          {moreOpen && (
            <div className="absolute bottom-full right-1 mb-2 flex flex-col items-center gap-1 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
              {moreItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-label={item.label}
                    onClick={() => setMoreOpen(false)}
                    className={`flex h-[52px] w-[52px] items-center justify-center rounded-xl transition-colors ${
                      active ? "bg-[#FFF0F0] text-[#CC0000]" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 [&>svg]:w-8 [&>svg]:h-8">
                      {item.icon}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </nav>
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

function BottomBarItem({ icon, label, href, active }: { icon: React.ReactNode; label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-label={label}
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
