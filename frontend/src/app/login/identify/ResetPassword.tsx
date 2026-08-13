'use client';

import { IdentifyUserData, IdentifyNextHandler } from "@/types/identify";

/**
 * ⚠️ ยังไม่ได้เขียนจริง — เป็นโครงเปล่ารอทำ
 *
 * ขั้นตอน "ตั้งรหัสผ่านใหม่" ยังใช้งานไม่ได้ เพราะฝั่ง backend ยังไม่มี
 * endpoint reset-password และ route ของ OTP ก็ถูกปิดไว้ก่อน
 * (ดูคอมเมนต์ใน routes.go)
 *
 * ตอนทำจริงต้องมีครบชุด:
 *   1. ตาราง password_reset_otps (เก็บ hash ของ OTP + เวลาหมดอายุ + จำนวนครั้งที่ผิด)
 *   2. SendOTP สุ่มเลขจริงด้วย crypto/rand แล้วส่งอีเมลผ่าน SMTP
 *   3. VerifyOTP เทียบ hash + เช็คหมดอายุ แล้วออก reset token อายุสั้น
 *   4. endpoint reset-password ที่รับ reset token + รหัสผ่านใหม่
 *   5. หน้านี้ (ช่องกรอกรหัสใหม่ + ยืนยัน + ตรวจความยาว 8-72 ให้ตรงกับ backend)
 */
interface ResetPasswordProps {
  userData: IdentifyUserData;
  onNext: IdentifyNextHandler;
  onBack: () => void;
}

export default function ResetPassword({ userData, onNext, onBack }: ResetPasswordProps) {
  return (
    <div className="w-full min-h-[calc(100vh-96px)] bg-gray-50 flex items-center justify-center p-4 md:p-8">
      <div className="bg-white w-full max-w-lg p-8 md:p-12 rounded-3xl shadow-md text-center space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">ตั้งรหัสผ่านใหม่</h1>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 text-left">
          ขณะนี้ระบบตั้งรหัสผ่านใหม่ยังไม่เปิดให้บริการ
          หากลืมรหัสผ่านกรุณาติดต่อผู้ดูแลระบบเพื่อขอความช่วยเหลือ
        </div>

        {userData?.maskedEmail && (
          <p className="text-xs text-gray-500">บัญชี: {userData.maskedEmail}</p>
        )}

        <div className="flex justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            ย้อนกลับ
          </button>
          <button
            type="button"
            onClick={() => onNext()}
            className="rounded-lg bg-[#E63946] px-5 py-2 text-sm font-bold text-white hover:bg-[#d62839]"
          >
            เสร็จสิ้น
          </button>
        </div>
      </div>
    </div>
  );
}
