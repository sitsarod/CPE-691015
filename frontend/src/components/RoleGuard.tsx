"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// หน้าแรกของแต่ละ role ใช้เด้งกลับเมื่อ role ไม่ตรงกับหน้าที่พยายามเข้า
const HOME_BY_ROLE: Record<string, string> = {
  admin: "/admin/dashboard",
  coach: "/coach/dashboard",
  customer: "/customer/dashboard",
};

/**
 * RoleGuard ป้องกันการเข้าถึงหน้าโดยตรงผ่าน URL ข้าม role
 * (เช่น coach เปลี่ยน path จาก /coach/... เป็น /admin/... เอง)
 *
 * ตรวจ token + role จาก localStorage ฝั่ง client:
 *  - ไม่มี token           -> เด้งไปหน้า login
 *  - role ไม่อยู่ใน allow  -> เด้งกลับหน้าแรกของ role ตัวเอง
 * ระหว่างตรวจสอบจะไม่ render children เพื่อไม่ให้ UI ของหน้าที่หวงห้าม
 * แว้บขึ้นมาก่อนถูกเด้งออก
 *
 * หมายเหตุ: นี่เป็นการป้องกันฝั่ง UI เท่านั้น ความปลอดภัยจริงอยู่ที่ backend
 * (middlewares.RequireRole) ซึ่งบังคับสิทธิ์ในทุก API แล้ว
 */
export default function RoleGuard({
  allow,
  children,
}: {
  allow: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role") ?? "";

    if (!token) {
      router.replace("/login");
      return;
    }

    if (!allow.includes(role)) {
      router.replace(HOME_BY_ROLE[role] ?? "/login");
      return;
    }

    setAuthorized(true);
  }, [allow, router]);

  if (!authorized) return null;

  return <>{children}</>;
}
