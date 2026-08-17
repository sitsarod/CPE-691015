"use client";

import { useEffect } from "react";

// รายการ key ใน localStorage ที่เก็บข้อมูล session ของผู้ใช้ (ต้องล้างทั้งหมดตอน logout/หมดอายุ)
const SESSION_KEYS = [
  "token",
  "refresh_token",
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

// single-flight: ถ้ามีหลาย request โดน 401 พร้อมกัน ให้ยิง refresh แค่ครั้งเดียว
// แล้วทุก request รอ promise เดียวกัน (กันยิง /auth/refresh ซ้อนกันหลายรอบ)
let refreshPromise: Promise<boolean> | null = null;

/**
 * SessionGuard ดัก response จาก backend ของเราทั่วทั้งแอป
 * ถ้าเจอ 401 (access token หมดอายุ) จะลองใช้ refresh token ขอ token ใหม่ก่อน
 * - ถ้า refresh สำเร็จ → ยิง request เดิมซ้ำด้วย token ใหม่แบบเนียน ๆ (ผู้ใช้ไม่รู้สึก)
 * - ถ้า refresh ไม่ได้ (หมดอายุ/ไม่มี) → ล้าง session แล้วเด้งไปหน้า login
 *
 * ⚠️ กติกาที่ backend ต้องทำตาม: ตอบ 401 ได้เฉพาะเรื่อง "token ใช้ไม่ได้" เท่านั้น
 *
 * เพราะไฟล์นี้ตีความ 401 ทุกตัวว่า session ตาย แล้วเด้งผู้ใช้ออก ถ้า endpoint ไหน
 * ตอบ 401 ด้วยเหตุผลอื่น (เช่น กรอกรหัสผ่านยืนยันผิด) ผู้ใช้จะถูกล็อกเอาต์
 * ทั้งที่ token ยังดีอยู่ — เคยเกิดมาแล้วกับ PATCH /coaches/:id/bank
 *
 * เหตุผลอื่นให้ใช้ 403 พร้อมข้อความอธิบาย
 */
export default function SessionGuard() {
  useEffect(() => {
    if (installed) return;

    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
    const originalFetch = window.fetch.bind(window);
    const refreshUrl = `${baseUrl}/auth/refresh`;

    // ยิง /auth/refresh ผ่าน originalFetch (เลี่ยง fetch ที่ถูก patch ไว้ กัน loop)
    // คืน true ถ้าได้ token ชุดใหม่และเก็บลง localStorage เรียบร้อย
    async function tryRefresh(): Promise<boolean> {
      const refreshToken = localStorage.getItem("refresh_token");
      if (!refreshToken) return false;

      try {
        const res = await originalFetch(refreshUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;

        const data = (await res.json()) as { token?: string; refreshToken?: string };
        if (!data.token) return false;

        localStorage.setItem("token", data.token);
        if (data.refreshToken) localStorage.setItem("refresh_token", data.refreshToken);
        return true;
      } catch {
        return false;
      }
    }

    // แนบ Authorization header ตัวใหม่ลงบน init เดิม แล้วยิง request ซ้ำ
    function replayWithNewToken(
      input: RequestInfo | URL,
      init: RequestInit | undefined,
      token: string
    ): Promise<Response> {
      const headers = new Headers(init?.headers ?? {});
      headers.set("Authorization", `Bearer ${token}`);
      return originalFetch(input, { ...init, headers });
    }

    function handleExpired() {
      clearSession();
      // full navigation เพื่อล้าง state ทั้งหมด + แนบ ?expired=1 ให้หน้า login แจ้งเตือน
      window.location.href = "/login?expired=1";
    }

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
        const isRefreshCall = url.startsWith(refreshUrl);
        const hasToken = !!localStorage.getItem("token");
        const notOnLogin = window.location.pathname !== "/login";

        // สนใจเฉพาะ: API ของเรา + ได้ 401 + เคยมี token + ไม่ได้อยู่หน้า login + ไม่ใช่ตัว refresh เอง
        if (response.status === 401 && isOurApi && hasToken && notOnLogin && !isRefreshCall) {
          // ยิง refresh แบบ single-flight
          if (!refreshPromise) {
            refreshPromise = tryRefresh().finally(() => {
              refreshPromise = null;
            });
          }
          const refreshed = await refreshPromise;

          if (refreshed) {
            const newToken = localStorage.getItem("token");
            if (newToken) {
              // ยิง request เดิมซ้ำด้วย token ใหม่ แล้วคืน response ของรอบใหม่แทน
              const retried = await replayWithNewToken(input, init, newToken);
              // ถ้ายัง 401 อีก แสดงว่าต่ออายุไม่ช่วย → เด้งออก
              if (retried.status === 401) {
                handleExpired();
              }
              return retried;
            }
          }

          // refresh ไม่สำเร็จ = session หมดอายุจริง
          handleExpired();
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
