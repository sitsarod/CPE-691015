"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Wallet, ClipboardList, UserRoundCheck, MessageSquareMore, Megaphone, BookUser, User,Users , UserCircle, Book, ListChecks } from "lucide-react";

export default function CustomerSidebar() {
  const pathname = usePathname();
  
  const [userName, setUserName] = useState("กำลังโหลด...");
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const storedName = localStorage.getItem("user_name");
    const storedEmail = localStorage.getItem("user_email");

    if (storedName) setUserName(storedName);
    if (storedEmail) setUserEmail(storedEmail);
  }, []);

  return (
    <aside className="fixed top-24 left-0 h-[calc(100vh-96px)] bg-white flex flex-col border-r border-gray-200 z-40 transition-all duration-300 ease-in-out w-[84px] hover:w-[260px] group overflow-hidden">
      
      <div className="flex-1 flex flex-col justify-center min-w-[260px] overflow-x-hidden">
        <nav className="flex flex-col gap-3 w-full">
          <SidebarItem href="/admin/dashboard" icon={<Home />} label="หน้าแรก" active={pathname === "/admin/dashboard"} />
          <SidebarItem href="/admin/payment" icon={<Wallet />} label="การเงิน" active={pathname === "/admin/payment"} />
          <SidebarItem href="/admin/courses" icon={<ClipboardList />} label="จัดการข้อมูลคอร์ส" active={pathname === "/admin/courses"} />
          <SidebarItem href="/admin/attendance" icon={<UserRoundCheck />} label="เช็คชื่อ" active={pathname === "/admin/attendance"} />
          <SidebarItem href="/admin/feedback" icon={<MessageSquareMore />} label="คำติชม" active={pathname === "/admin/feedback"} />
          <SidebarItem href="/admin/announcements" icon={<Megaphone />} label="ประกาศข่าวสาร" active={pathname === "/admin/announcements"} />
          <SidebarItem href="/admin/studentmanagement" icon={<Users />} label="จัดการข้อมูลนักเรียน" active={pathname === "/admin/studentmanagement"} />
          <SidebarItem href="/admin/coachmanagement" icon={<User />} label="จัดการข้อมูลโค้ช" active={pathname === "/admin/coachmanagement"} />
          <SidebarItem href="/admin/usermanagement" icon={<BookUser />} label="จัดการข้อมูลผู้ใช้งาน" active={pathname === "/admin/usermanagement"} />
          <SidebarItem href="/admin/enrollments" icon={<Book />} label="การลงทะเบียนเรียน" active={pathname === "/admin/enrollments"} />
          <SidebarItem href="/admin/quiz-manager" icon={<ListChecks />} label="ระบบคัดกรองคอร์ส" active={pathname === "/admin/quiz-manager"} />

        </nav>
      </div>

      <div className="border-t border-gray-200 flex items-center gap-4 flex-shrink-0 min-w-[260px] cursor-pointer hover:bg-gray-50 px-[22px] py-6">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 flex-shrink-0 bg-gray-100">
          <UserCircle className="w-8 h-8" />
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
          <p className="text-[15px] font-bold text-gray-800 leading-tight truncate w-[160px]">{userName}</p>
          <p className="text-[12px] text-gray-500 mt-0.5 truncate w-[160px]">{userEmail}</p>
        </div>
      </div>

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