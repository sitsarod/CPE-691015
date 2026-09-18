import type { Metadata } from "next";
import { Kanit } from "next/font/google";
import "./globals.css";
import Navbar from "../components/Navbar";

// ฟอนต์ Kanit สำหรับดีไซน์หน้าแรกแบบ editorial (ดีไซน์ 2b) — ผูกไว้กับ CSS variable
// ให้เรียกใช้เฉพาะจุดที่ต้องการผ่าน var(--font-kanit) โดยไม่เปลี่ยนฟอนต์เริ่มต้นของทั้งแอป
const kanit = Kanit({
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-kanit",
  display: "swap",
});

import ChatWidget from "../components/ChatWidget";

import SessionGuard from "../components/SessionGuard";

import ToastProvider from "../components/ToastProvider";

import ConfirmProvider from "../components/ConfirmProvider";


export const metadata: Metadata = {
  title: "ระบบบริหารจัดการสถานฝึกสอนแบดมินตัน",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${kanit.variable} scroll-smooth`} data-scroll-behavior="smooth">
      <body className="min-h-screen flex flex-col bg-[#F3F4F6] font-sans">
        <ToastProvider>
          <ConfirmProvider>
            <SessionGuard />
            <Navbar />

            <main className="w-full flex-1 block clear-both">
              {children}
            </main>

            {/* Global Floating Chat Widget */}
            <ChatWidget />
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
