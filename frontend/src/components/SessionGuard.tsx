"use client";

import { useEffect } from "react";

// รายการ key ใน localStorage ที่เก็บข้อมูล session ของผู้ใช้ (ต้องล้างทั้งหมดตอน logout/หมดอายุ)
const SESSION_KEYS = [
  "token",
  "role",
  "user_id",
  "user_name",
  "user_email",
  "firstName",
  "lastName",
  "email",
  "qrImage",
];

function clearSession() {
  SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
}

// กันไม่ให้ patch window.fetch ซ้ำเมื่อ component re-render
let installed = false;

/**
 * SessionGuard ดัก response จาก backend ของเราทั่วทั้งแอป
 * ถ้าเจอ 401 (ตั๋วหมดอายุ/ไม่มีสิทธิ์) ทั้งที่ยังมี token อยู่ = session หมดอายุจริง
 * จะล้าง session แล้วเด้งไปหน้า login ทันที
 */
export default function SessionGuard() {
  useEffect(() => {
    if (installed) return;

    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await originalFetch(input, init);

      try {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
            ? input.href
            : input.url;

        const isOurApi = baseUrl !== "" && url.startsWith(baseUrl);
        const hasToken = !!localStorage.getItem("token");
        const notOnLogin = window.location.pathname !== "/login";

        // เด้งเฉพาะเมื่อ: เป็น API ของเรา + ได้ 401 + เคยมี token (session หมดอายุ) + ไม่ได้อยู่หน้า login อยู่แล้ว
        if (response.status === 401 && isOurApi && hasToken && notOnLogin) {
          clearSession();
          // ใช้ full navigation เพื่อล้าง state ทั้งหมดและกลับไปเริ่มที่หน้า login สะอาด ๆ
          // แนบ ?expired=1 เพื่อให้หน้า login แสดงข้อความว่าเซสชันหมดอายุ
          window.location.href = "/login?expired=1";
        }
      } catch {
        // ไม่ให้ logic ตรวจ session ไปกระทบการทำงานของ fetch เดิม
      }

      return response;
    };

    installed = true;
  }, []);

  return null;
}
