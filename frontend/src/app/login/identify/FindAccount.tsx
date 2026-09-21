"use client";

import { useState } from "react";
import Button from "@/components/Button";
import { IdentifyNextHandler } from "@/types/identify";

interface FindAccountProps {
  onNext: IdentifyNextHandler;
}

export default function FindAccount({ onNext }: FindAccountProps) {
  const [identifier, setIdentifier] = useState(""); // สำหรับเก็บ Email หรือ Phone
  const [errorMsg, setErrorMsg] = useState(""); 
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier) {
      setErrorMsg("กรุณากรอกอีเมลหรือหมายเลขโทรศัพท์");
      return;
    }

    setErrorMsg("");
    setIsLoading(true);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL;
      

      const response = await fetch(`${baseUrl}/users/find`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ identifier }), 
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "ไม่พบบัญชีผู้ใช้นี้ในระบบ");
      }

      // ค้นหาเจอแล้ว ส่งต่อไปหน้ายืนยันบัญชี
      //
      // ⚠️ ต้องแนบ identifier ที่ผู้ใช้พิมพ์เองไปด้วยเสมอ
      //
      // data.user มีแต่ค่าที่ปิดบังแล้ว (k*******v@gmail.com) ซึ่งเอาไประบุตัวตน
      // กับ backend ไม่ได้ ขั้นตอนขอ OTP และยืนยัน OTP ต้องใช้ค่าเต็มที่พิมพ์มา
      // ถ้าลืมบรรทัดนี้ หน้าถัดไปจะขึ้นว่า "ไม่พบข้อมูลบัญชี" ทั้งที่ค้นหาเจอแล้ว
      onNext({ ...data.user, identifier: identifier.trim() });

    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-96px)] bg-white flex items-center justify-center p-4 md:p-8">
      <div className="bg-white w-full max-w-3xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">ค้นหาบัญชีของคุณ</h1>
        <p className="text-sm text-gray-500 mb-8">ป้อนอีเมลหรือหมายเลขโทรศัพท์ของคุณเพื่อค้นหาบัญชี</p>

        {/* แสดงข้อความแจ้งเตือนถ้าไม่พบบัญชี */}
        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col w-full gap-y-5 text-left">
          <div className="w-full flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">อีเมลหรือหมายเลขโทรศัพท์</label>
            <input 
              type="text" 
              placeholder="ระบุอีเมลหรือหมายเลขโทรศัพท์" 
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base" 
            />
          </div>

          <div className="flex justify-end space-x-3 w-full mt-6 pt-4 border-t border-gray-100">
            <Button variant="primary" type="submit" disabled={isLoading}>
              {isLoading ? "กำลังค้นหา..." : "ดำเนินการต่อ"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}