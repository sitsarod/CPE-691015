"use client";

import PersonalQRCard from "@/components/PersonalQRCard";

/**
 * หน้าแสดง QR ประจำตัวของผู้เรียน
 *
 * เดิมหน้านี้ประกอบรหัสเองจาก `QR_${email}` ที่อ่านจาก localStorage แล้วส่งไปให้
 * api.qrserver.com วาดรูปให้ ซึ่งมีปัญหาสองข้อ:
 *   1. รหัสไม่ได้อิงอีเมลอีกแล้ว (เปลี่ยนเป็นค่าสุ่ม) รูปที่ได้จึงสแกนไม่ผ่าน
 *   2. ส่งรหัสประจำตัวออกไปให้บริการภายนอก = ความลับหลุดออกนอกระบบ
 *
 * ตอนนี้ดึงทั้งรหัสและรูปจาก GET /api/me/qr ของเราเอง ไม่มีอะไรออกนอกระบบ
 */
export default function ViewQRPage() {
  return (
    <div className="w-full min-h-[calc(100vh-96px)] bg-white flex items-start justify-center p-4 md:p-8">
      <div className="w-full max-w-xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900">บัตรเช็กชื่อ</h1>
          <p className="text-sm md:text-base text-gray-500 font-medium">
            เปิดหน้าจอนี้ให้เครื่องสแกนหน้าสนาม หรือดาวน์โหลดเก็บไว้ในเครื่องก็ได้
          </p>
        </div>

        <PersonalQRCard />

        <div className="bg-orange-50 text-orange-700 px-6 py-4 rounded-xl text-sm font-semibold text-center">
          QR นี้เป็นของคุณคนเดียว อย่าถ่ายรูปส่งต่อให้เพื่อน
          เพราะคนที่ถือ QR นี้จะเช็กชื่อแทนคุณได้
        </div>
      </div>
    </div>
  );
}
