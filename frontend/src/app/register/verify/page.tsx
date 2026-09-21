"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/Button";
import OtpInput from "@/components/OtpInput";
import { verifyRegistrationOTPAPI, resendRegistrationOTPAPI } from "@/services/authAPI";
import { saveSession } from "@/services/session";

const RESEND_COOLDOWN_SECONDS = 60;

// ห่อด้วย Suspense เพราะข้างในใช้ useSearchParams — Next.js บังคับให้มีขอบเขต
// Suspense ครอบ ไม่งั้นจะเตือนตอน build (ดูแบบเดียวกันที่ login/page.tsx)
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [otp, setOtp] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const [cooldown, setCooldown] = useState(0);

  // นับถอยหลังปุ่ม "ส่งรหัสอีกครั้ง" กันกดรัว ๆ ยิง OTP ใหม่ทับของเดิมถี่เกินไป
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!email) {
      setErrorMsg("ไม่พบอีเมลที่จะยืนยัน กรุณาสมัครสมาชิกใหม่อีกครั้ง");
      return;
    }
    if (otp.length !== 6) {
      setErrorMsg("กรุณากรอกรหัสยืนยัน 6 หลัก");
      return;
    }

    setIsVerifying(true);
    try {
      const data = await verifyRegistrationOTPAPI({ email, otp });
      saveSession(data);
      router.push("/customer/dashboard");
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "ยืนยันรหัสไม่สำเร็จ");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!email || cooldown > 0) return;
    setErrorMsg("");
    setResendMsg("");
    setIsResending(true);
    try {
      await resendRegistrationOTPAPI({ email });
      setResendMsg("ส่งรหัสยืนยันใหม่แล้ว กรุณาตรวจสอบอีเมล");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "ขอรหัสใหม่ไม่สำเร็จ");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-96px)] bg-white flex items-center justify-center p-4 md:p-8">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">ยืนยันอีเมล</h2>
          <p className="text-gray-500">
            กรอกรหัสยืนยัน 6 หลักที่ส่งไปที่ {email || "อีเมลของคุณ"}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm text-center">
            {errorMsg}
          </div>
        )}
        {resendMsg && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm text-center">
            {resendMsg}
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-6">
          <div className="flex flex-col items-center space-y-3">
            <label className="self-start text-sm font-semibold text-gray-700">รหัสยืนยัน 6 หลัก</label>
            <OtpInput value={otp} onChange={setOtp} autoFocus disabled={isVerifying} />
          </div>

          <Button variant="primary" type="submit" disabled={isVerifying}>
            {isVerifying ? "กำลังยืนยัน..." : "ยืนยันอีเมล"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>ไม่ได้รับรหัส?</p>
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending || cooldown > 0}
            className="text-red-600 hover:underline font-medium disabled:text-gray-400 disabled:no-underline"
          >
            {cooldown > 0 ? `ส่งรหัสใหม่ได้อีกครั้งใน ${cooldown} วินาที` : isResending ? "กำลังส่ง..." : "ส่งรหัสอีกครั้ง"}
          </button>
        </div>
      </div>
    </div>
  );
}
