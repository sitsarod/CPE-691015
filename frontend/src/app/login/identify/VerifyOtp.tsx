'use client';

import { useState } from "react";
import Button from "@/components/Button";
import { IdentifyUserData, IdentifyNextHandler } from "@/types/identify";

interface VerifyOtpProps {
  userData: IdentifyUserData;
  onNext: IdentifyNextHandler;
  onBack: () => void;
}

export default function VerifyOtp({ userData, onNext, onBack }: VerifyOtpProps) {
  const [otp, setOtp] = useState("");
  const [errorMsg, setErrorMsg] = useState(""); 
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length < 4) {
      setErrorMsg("กรุณากรอกรหัส OTP ให้ถูกต้อง");
      return;
    }

    setErrorMsg("");
    setIsLoading(true);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL;

      // 🌟 ยิง API ตรวจสอบรหัส OTP
      const response = await fetch(`${baseUrl}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userData?.email,
          otp: otp,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "รหัส OTP ไม่ถูกต้องหรือหมดอายุ");
      }

      // OTP ถูกต้อง! ผ่านไปยังขั้นตอนตั้งรหัสผ่านใหม่ (Reset Password)
      onNext({ ...userData, resetToken: data.resetToken });

    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-96px)] bg-gray-50 flex items-center justify-center p-4 md:p-8">
      <div className="bg-white w-full max-w-3xl p-8 md:p-12 rounded-3xl shadow-md">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">ยืนยัน OTP</h1>
        <p className="text-sm text-gray-500 mb-8">
          เราได้ส่งรหัส OTP ไปที่อีเมล <span className="font-semibold text-gray-800">{userData?.email}</span> แล้ว
        </p>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col w-full gap-y-5 text-left">
          <div className="w-full flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">รหัส OTP</label>
            <input 
              type="text" 
              maxLength={6}
              placeholder="ป้อนรหัส OTP 6 หลัก" 
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base text-center font-mono tracking-widest text-xl" 
            />
          </div>

          <div className="flex justify-between items-center space-x-3 w-full mt-6 pt-4 border-t border-gray-100">
            <Button variant="outline" type="button" onClick={onBack} disabled={isLoading}>
              ย้อนกลับ
            </Button>
            <Button variant="primary" type="submit" disabled={isLoading}>
              {isLoading ? "กำลังตรวจสอบ..." : "ดำเนินการต่อ"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}