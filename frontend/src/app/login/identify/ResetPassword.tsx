'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import InputField from "@/components/InputField";
import { resetPasswordAPI } from "@/services/passwordAPI";
import { IdentifyUserData, IdentifyNextHandler } from "@/types/identify";

/**
 * ขั้นตอนสุดท้ายของการกู้รหัสผ่าน — ตั้งรหัสใหม่
 *
 * มาถึงหน้านี้ได้ต่อเมื่อยืนยัน OTP ผ่านแล้ว และถือ resetToken อายุ 15 นาทีอยู่
 *
 * เกณฑ์ความยาวต้องตรงกับ services.ValidatePasswordStrength ฝั่ง backend
 * ถ้าไม่ตรง ผู้ใช้จะกดบันทึกแล้วเจอ error จากเซิร์ฟเวอร์โดยไม่รู้สาเหตุ
 */
interface ResetPasswordProps {
  userData: IdentifyUserData;
  onNext: IdentifyNextHandler;
  onBack: () => void;
}

export default function ResetPassword({ userData, onBack }: ResetPasswordProps) {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    // ⚠️ สองด่านนี้นับคนละหน่วย ให้ตรงกับ services.ValidatePasswordStrength
    //
    //   ขั้นต่ำ นับเป็นตัวอักษร — เป็นกติกาที่สื่อกับผู้ใช้
    //   เพดาน  นับเป็นไบต์     — เป็นข้อจำกัดจริงของ bcrypt (ไทย 1 ตัว = 3 ไบต์)
    //
    // ถ้าเช็คสองด่านด้วยหน่วยเดียวกัน จะมีช่วงที่หน้าเว็บปล่อยผ่าน
    // แล้วไปโดน backend ปฏิเสธ ผู้ใช้จะงงว่าทำตามที่บอกแล้วทำไมไม่ผ่าน
    if ([...password].length < 8) {
      setErrorMsg("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setErrorMsg("รหัสผ่านยาวเกินไป (ภาษาอังกฤษไม่เกิน 72 ตัว หรือภาษาไทยไม่เกิน 24 ตัว)");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    if (!userData.resetToken) {
      setErrorMsg("ไม่พบข้อมูลการยืนยันตัวตน กรุณาเริ่มขั้นตอนใหม่");
      return;
    }

    try {
      setIsSaving(true);
      await resetPasswordAPI(userData.resetToken, password);
      setDone(true);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "ไม่สามารถตั้งรหัสผ่านใหม่ได้");
    } finally {
      setIsSaving(false);
    }
  };

  if (done) {
    return (
      <div className="w-full min-h-[calc(100vh-96px)] bg-gray-50 flex items-center justify-center p-4 md:p-8">
        <div className="bg-white w-full max-w-lg p-8 md:p-12 rounded-3xl shadow-md text-center space-y-5">
          <h1 className="text-2xl font-bold text-gray-900">ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว</h1>
          <p className="text-sm text-gray-500">กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่ของท่าน</p>

          <Button variant="primary" type="button" onClick={() => router.push("/login")}>
            ไปหน้าเข้าสู่ระบบ
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[calc(100vh-96px)] bg-gray-50 flex items-center justify-center p-4 md:p-8">
      <div className="bg-white w-full max-w-lg p-8 md:p-12 rounded-3xl shadow-md">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">ตั้งรหัสผ่านใหม่</h1>
        <p className="text-sm text-gray-500 mb-8">
          {userData.maskedEmail ? `สำหรับบัญชี ${userData.maskedEmail}` : "กรุณาตั้งรหัสผ่านใหม่ของท่าน"}
        </p>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <InputField
            label="รหัสผ่านใหม่"
            name="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="อย่างน้อย 8 ตัวอักษร"
            autoComplete="new-password"
          />

          <InputField
            label="ยืนยันรหัสผ่านใหม่"
            name="confirm"
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="พิมพ์รหัสผ่านใหม่อีกครั้ง"
            autoComplete="new-password"
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button variant="outline" type="button" onClick={onBack} disabled={isSaving}>
              ย้อนกลับ
            </Button>
            <Button variant="primary" type="submit" disabled={isSaving}>
              {isSaving ? "กำลังบันทึก..." : "ตั้งรหัสผ่านใหม่"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
