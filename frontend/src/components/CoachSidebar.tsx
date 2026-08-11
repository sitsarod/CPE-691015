"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, Clock, Wallet, UserCircle, Users, ListTodo, Star} from "lucide-react";

export default function CoachSidebar() {
  const pathname = usePathname();

  const [userName, setUserName] = useState("กำลังโหลด...");
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const storedFirstName = localStorage.getItem("firstName");
    const storedLastName = localStorage.getItem("lastName");
    const storedEmail = localStorage.getItem("email");

    const fullName = [storedFirstName, storedLastName].filter(Boolean).join(" ");
    if (fullName) setUserName(fullName);
    if (storedEmail) setUserEmail(storedEmail);
  }, []);

  return (
    <aside className="fixed top-24 left-0 h-[calc(100vh-96px)] bg-white flex flex-col z-40 transition-all duration-300 ease-in-out w-[84px] hover:w-[260px] group overflow-hidden">

      <div className="flex-1 flex flex-col min-w-[260px] overflow-y-auto overflow-x-hidden py-4">
        <nav className="flex flex-col gap-3 w-full my-auto">
          <SidebarItem href="/coach/dashboard" icon={<Home />} label="หน้าแรก" active={pathname === "/coach/dashboard"} />
          <SidebarItem href="/coach/schedule" icon={<Calendar />} label="ตารางงาน" active={pathname === "/coach/schedule"} />
          <SidebarItem href="/coach/availability" icon={<Clock />} label="เวลาว่าง" active={pathname === "/coach/availability"} />
          <SidebarItem href="/coach/evalution" icon={<ListTodo />} label="ประเมินผู้เรียน" active={pathname === "/coach/evalution"} />
          <SidebarItem href="/coach/detect" icon={<Users />} label="จำแนกผู้เรียน" active={pathname === "/coach/detect"} />
          <SidebarItem href="/coach/feedback" icon={<Star />} label="รีวิวของฉัน" active={pathname === "/coach/feedback"} />
          <SidebarItem href="/coach/payment" icon={<Wallet />} label="การเงิน" active={pathname === "/coach/payment"} />
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
