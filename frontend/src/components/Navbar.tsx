"use client"; 

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function Navbar() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role"); 

    if (token) {
      setIsLoggedIn(true);
      setUserRole(role);
    }
  }, []);


  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    setIsLoggedIn(false);
    setUserRole(null);
    router.push("/"); 
    router.refresh();
  };

  //  ลอจิกเลือก URL หน้าจัดการตาม Role ของผู้ใช้
  const getDashboardLink = () => {
    switch (userRole) {
      case "admin":
        return "/admin/dashboard"; 
      case "coach":
        return "/coach/dashboard"; 
      case "customer":
        return "/customer/dashboard"; 
      default:
        return "/";
    }
  };

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
          <Link href="/#coaches" className="text-black hover:text-red-600 transition-colors">
            บุคลากร
          </Link>
          <Link href="/#courses" className="text-black hover:text-red-600 transition-colors">
            คอร์สเรียน
          </Link>
          <Link href="/#about" className="text-black hover:text-red-600 transition-colors">
            เกี่ยวกับฉัน
          </Link>

          {isLoggedIn && userRole === "admin" && (
            <>
              <Link href="/admin/manage-users" className="text-blue-600 hover:text-blue-800 transition-colors">
                จัดการผู้ใช้งาน
              </Link>
              <Link href="/admin/reports" className="text-blue-600 hover:text-blue-800 transition-colors">
                รายงานระบบ
              </Link>
            </>
          )}

          {isLoggedIn && userRole === "coach" && (
            <>
              <Link href="/coach/schedules" className="text-green-600 hover:text-green-800 transition-colors">
                ตารางสอนของฉัน
              </Link>
              <Link href="/coach/attendance" className="text-green-600 hover:text-green-800 transition-colors">
                เช็กชื่อนักเรียน
              </Link>
            </>
          )}

          {isLoggedIn && userRole === "customer" && (
            <>
              <Link href="/customer/my-courses" className="text-purple-600 hover:text-purple-800 transition-colors">
                คอร์สเรียนของฉัน
              </Link>
            </>
          )}

          {/* เส้นกั้นแนวตั้ง */}
          <div className="h-6 w-px bg-gray-400 mx-2"></div>

          {!isLoggedIn ? (
            <Link href="/auth/login" className="hover:text-red-600 transition-colors">
              เข้าสู่ระบบ
            </Link>
          ) : (
            <div className="flex items-center gap-6">
              
              
              <button 
                onClick={handleLogout}
                className="text-black hover:text-red-600 transition-colors"
              >
                ออกจากระบบ
              </button>
            </div>
          )}
        </div>

      </div>
    </nav>
  );
}