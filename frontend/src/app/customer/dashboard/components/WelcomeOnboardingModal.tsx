"use client";

import { GraduationCap, Sparkles, ArrowRight, X } from "lucide-react";

interface WelcomeOnboardingModalProps {
  /** ชื่อที่ใช้ทักทาย (ชื่อเล่น/ชื่อจริง) — ว่างได้ */
  firstName?: string;
  /** กด "เลือกคอร์สเรียน" — พาไปหน้าสมัครคอร์ส */
  onStart: () => void;
  /** ปิดหน้าต่าง (ไว้ภายหลัง / กากบาท) */
  onClose: () => void;
}

/**
 * ป็อปอัพต้อนรับสำหรับลูกค้าที่ล็อกอินเข้ามาครั้งแรก
 *
 * เป้าหมายเดียวคือชวนให้ไปสมัครคอร์ส จึงมี CTA หลักปุ่มเดียวที่เด่นชัด
 * ส่วน "ไว้ภายหลัง" ให้ทางออกโดยไม่บังคับ
 */
export default function WelcomeOnboardingModal({
  firstName,
  onStart,
  onClose,
}: WelcomeOnboardingModalProps) {
  const greetingName = firstName?.trim();

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* ปุ่มปิดมุมขวาบน */}
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/20 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        {/* ส่วนหัวสีแบรนด์ */}
        <div className="relative bg-gradient-to-br from-[#CC0000] to-[#990000] px-6 pb-8 pt-10 text-center text-white">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <GraduationCap className="h-9 w-9" />
          </div>
          <div className="flex items-center justify-center gap-1.5 text-sm font-bold text-white/90">
            <Sparkles className="h-4 w-4" />
            ยินดีต้อนรับสู่ Koyama Badminton School
          </div>
          <h2 className="mt-2 text-2xl font-black leading-tight">
            สวัสดี{greetingName ? ` คุณ${greetingName}` : ""} 👋
          </h2>
        </div>

        {/* เนื้อหา */}
        <div className="px-6 py-6 text-center">
          <p className="text-sm leading-relaxed text-gray-600">
            บัญชีของคุณพร้อมใช้งานแล้ว! เริ่มต้นเส้นทางนักแบดของคุณได้เลย
            <br />
            เพียง <span className="font-bold text-gray-900">เลือกคอร์สเรียน</span> ที่เหมาะกับคุณ
            แล้วสมัครได้ทันที
          </p>

          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onStart}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#CC0000] px-6 py-3 text-sm font-black text-white shadow-md transition-all hover:bg-[#A30000] hover:shadow-lg"
            >
              เลือกคอร์สเรียน
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl px-6 py-2.5 text-sm font-bold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              ไว้ภายหลัง
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
