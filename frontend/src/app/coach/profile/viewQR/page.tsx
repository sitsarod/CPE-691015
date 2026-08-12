"use client";

import PersonalQRCard from "@/components/PersonalQRCard";

/**
 * หน้าแสดง QR ประจำตัวของโค้ช (ใช้เช็กชื่อเข้างาน)
 *
 * ใช้ PersonalQRCard ตัวเดียวกับฝั่งผู้เรียน เพราะ GET /api/me/qr
 * แยกบทบาทให้เองจาก JWT อยู่แล้ว — component ไม่ต้องรู้ว่ากำลังแสดงของใคร
 */
export default function CoachViewQRPage() {
  return (
    <div className="w-full min-h-[calc(100vh-96px)] bg-white flex items-start justify-center p-4 md:p-8">
      <div className="w-full max-w-xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900">บัตรเช็กชื่อเข้างาน</h1>
          <p className="text-sm md:text-base text-gray-500 font-medium">
            เปิดหน้าจอนี้ให้เครื่องสแกน หรือดาวน์โหลดเก็บไว้ในเครื่องก็ได้
          </p>
        </div>

        <PersonalQRCard />

        <div className="bg-orange-50 text-orange-700 px-6 py-4 rounded-xl text-sm font-semibold text-center">
          QR นี้เป็นของคุณคนเดียว อย่าถ่ายรูปส่งต่อให้ใคร
          เพราะคนที่ถือ QR นี้จะเช็กชื่อเข้างานแทนคุณได้
        </div>
      </div>
    </div>
  );
}
