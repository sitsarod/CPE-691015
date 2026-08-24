'use client';

import { useState } from "react";
import Button from "@/components/Button";
import { requestPasswordOTPAPI } from "@/services/passwordAPI";
import { IdentifyUserData, IdentifyNextHandler } from "@/types/identify";

interface SelectVerificationProps {
  userData: IdentifyUserData;
  onNext: IdentifyNextHandler;
  onBack: () => void;
}

export default function SelectVerification({ userData, onNext, onBack }: SelectVerificationProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleConfirm = async () => {
    setIsLoading(true);
    setErrorMsg("");

    if (!userData.identifier) {
      setErrorMsg("ไม่พบข้อมูลบัญชี กรุณาเริ่มขั้นตอนใหม่");
      setIsLoading(false);
      return;
    }

    try {
      // ⚠️ เส้นนี้ตอบสำเร็จเสมอ แม้ไม่มีบัญชีนั้นในระบบ (เป็นพฤติกรรมที่ตั้งใจ)
      // หน้าเว็บจึงเดินหน้าต่อได้เลย ไม่ต้องเช็คว่าเจอบัญชีไหม
      await requestPasswordOTPAPI(userData.identifier);

      onNext(userData);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-96px)] bg-gray-50 flex items-center justify-center p-4 md:p-8">
      <div className="bg-white w-full max-w-3xl p-8 md:p-12 rounded-3xl shadow-md">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">เลือกบัญชีของคุณ</h1>
        <p className="text-sm text-gray-500 mb-8">โปรไฟล์นี้ตรงกับอีเมลหรือหมายเลขโทรศัพท์มือถือที่คุณป้อน</p>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-medium">
            {errorMsg}
          </div>
        )}

        {/*
          การ์ดยืนยันบัญชี

          แสดงเฉพาะอีเมล/เบอร์ที่ปิดบังแล้ว พอให้เจ้าของดูออกว่าใช่บัญชีตัวเอง
          ตั้งใจไม่โชว์ชื่อจริง ชื่อเล่น และรูปโปรไฟล์ เพราะหน้านี้เข้าถึงได้
          โดยไม่ต้องล็อกอิน ใครกรอกเบอร์คนอื่นก็เห็นข้อมูลเขาได้ทันที
        */}
        <div className="p-5 bg-gray-50 border border-gray-200 rounded-2xl mb-8">
          <p className="text-xs text-gray-500 mb-1">พบบัญชีที่ตรงกับข้อมูลนี้</p>
          <p className="text-base font-bold text-gray-900">{userData?.maskedEmail}</p>
          {userData?.maskedPhone && (
            <p className="text-sm text-gray-500 mt-0.5">{userData.maskedPhone}</p>
          )}
        </div>

        {/* ปุ่มควบคุม */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <Button variant="outline" type="button" onClick={onBack} disabled={isLoading}>
            ไม่ใช่บัญชีของฉัน
          </Button>
          <Button variant="primary" type="button" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? "กำลังส่ง OTP..." : "ใช่ ดำเนินการต่อ"}
          </Button>
        </div>

      </div>
    </div>
  );
}