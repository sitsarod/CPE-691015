"use client";

import { ArrowRight, X } from "lucide-react";

interface WelcomeOnboardingModalProps {
  /** ชื่อที่ใช้ทักทาย (ชื่อเล่น/ชื่อจริง) — ว่างได้ */
  firstName?: string;
  /** กด "เลือกคอร์สเรียน" — พาไปหน้าสมัครคอร์ส */
  onStart: () => void;
  /** ปิดหน้าต่าง (ไว้ภายหลัง / กากบาท) */
  onClose: () => void;
}

/** ขั้นตอนการเริ่มเรียน (3 สเต็ป) */
const STEPS = [
  {
    title: "เลือกคอร์สที่เหมาะกับระดับของคุณ",
    desc: "ดูตารางเรียน โค้ช และจำนวนที่ว่างได้ก่อนตัดสินใจ",
  },
  {
    title: "ชำระเงินและแนบสลิป",
    desc: "โอนเข้าบัญชีสถาบัน แล้วแนบสลิปในหน้าการเงิน",
  },
  {
    title: "รอยืนยันจากสถาบันแล้วเข้าเรียน",
    desc: "ปกติไม่เกิน 1 วันทำการ มีแจ้งเตือนในระบบ",
  },
] as const;

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
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white p-7 shadow-2xl sm:p-9">
        {/* ปุ่มปิดมุมขวาบน */}
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>

        {/* ส่วนหัว */}
        <p className="text-xs font-bold uppercase tracking-wider text-[#CC0000]">
          ยินดีต้อนรับ
        </p>
        <h2 className="mt-3 text-2xl font-black leading-snug text-gray-900 sm:text-3xl">
          สวัสดี{greetingName ? ` คุณ${greetingName}` : ""}
          <br />
          บัญชีของคุณพร้อมใช้งานแล้ว
        </h2>
        <p className="mt-2 text-sm text-gray-500">อีกสามขั้นก็เริ่มเรียนได้</p>

        {/* ขั้นตอน */}
        <div className="mt-6 divide-y divide-gray-100 border-y border-gray-100">
          {STEPS.map((step, i) => (
            <div key={i} className="flex items-start gap-4 py-4">
              <span className="mt-0.5 text-sm font-black tabular-nums text-[#CC0000]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="text-sm font-bold text-gray-900">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-gray-500">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* ปุ่ม */}
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onStart}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#CC0000] px-6 py-3.5 text-sm font-black text-white shadow-md transition-all hover:bg-[#A30000] hover:shadow-lg"
          >
            เลือกคอร์สเรียน
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-6 py-3.5 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-800"
          >
            ไว้ภายหลัง
          </button>
        </div>
      </div>
    </div>
  );
}
