'use client';

import { useState } from "react";
import Button from "@/components/Button";
import OtpInput from "@/components/OtpInput";
import { verifyPasswordOTPAPI } from "@/services/passwordAPI";
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
    // ต้องครบ 6 หลักพอดี ให้ตรงกับที่ backend ออกให้ (dto มี binding:"len=6")
    if (!/^\d{6}$/.test(otp)) {
      setErrorMsg("กรุณากรอกรหัสยืนยัน 6 หลัก");
      return;
    }

    if (!userData.identifier) {
      setErrorMsg("ไม่พบข้อมูลบัญชี กรุณาเริ่มขั้นตอนใหม่");
      return;
    }

    setErrorMsg("");
    setIsLoading(true);

    try {
      // ส่ง identifier ที่ผู้ใช้พิมพ์เอง ไม่ใช่ค่า masked ที่ได้จาก /users/find
      // เพราะค่า masked ถูกปิดบังไปแล้ว ใช้ระบุตัวตนไม่ได้
      const resetToken = await verifyPasswordOTPAPI(userData.identifier, otp);

      onNext({ ...userData, resetToken });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-96px)] bg-white flex items-center justify-center p-4 md:p-8">
      <div className="bg-white w-full max-w-3xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">ยืนยัน OTP</h1>
        <p className="text-sm text-gray-500 mb-8">
          เราได้ส่งรหัส OTP ไปที่อีเมล <span className="font-semibold text-gray-800">{userData?.maskedEmail}</span> แล้ว
        </p>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col w-full gap-y-5 text-left">
          <div className="w-full flex flex-col items-center space-y-3">
            <label className="text-sm font-semibold text-gray-700 self-start">รหัส OTP</label>
            <OtpInput value={otp} onChange={setOtp} autoFocus disabled={isLoading} />
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