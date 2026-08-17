"use client";

import { useEffect, useState } from "react";
import { Loader2, UserCheck, X, AlertTriangle } from "lucide-react";
import type { ScanResult } from "@/types/attendance";


const AUTO_CANCEL_SECONDS = 20;

interface Props {
  scan: ScanResult;
  isSubmitting: boolean;
  onConfirm: () => void;
  onReject: () => void;
}

export default function ConfirmIdentityDialog({
  scan,
  isSubmitting,
  onConfirm,
  onReject,
}: Props) {
  const [secondsLeft, setSecondsLeft] = useState(AUTO_CANCEL_SECONDS);

  // นับถอยหลังแล้วยกเลิกเอง — หยุดนับตอนกำลังส่งข้อมูล
  // ไม่งั้นจะยกเลิกกลางทางระหว่างที่ backend บันทึกอยู่ แล้วผลลัพธ์หายไปเฉย ๆ
  useEffect(() => {
    if (isSubmitting) return;

    if (secondsLeft <= 0) {
      onReject();
      return;
    }

    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, isSubmitting, onReject]);

  const displayName = scan.full_name.trim() || scan.nickname || "ไม่ทราบชื่อ";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl">
        <p className="text-center text-lg text-gray-500">ใช่คุณหรือไม่?</p>

        {/* ชื่อต้องตัวใหญ่พอให้นักเรียนที่ยืนห่างจากจอครึ่งเมตรอ่านออกทันที */}
        <p className="mt-2 text-center text-4xl font-bold leading-tight text-gray-900">
          {displayName}
        </p>
        {scan.nickname && scan.full_name.trim() && (
          <p className="mt-1 text-center text-xl text-gray-500">({scan.nickname})</p>
        )}

        <div className="mt-6 space-y-1 rounded-xl bg-gray-50 p-4 text-center">
          <p className="text-gray-600">{scan.course_name || "ไม่ทราบคอร์ส"}</p>
          <p className="text-gray-900">
            เหลือ{" "}
            <span className="text-2xl font-bold">{scan.remaining_sessions}</span>
            {" / "}
            {scan.total_sessions} ครั้ง
          </p>
        </div>

        {scan.can_check_in ? (
          <>
            <div className="mt-6 flex gap-3">
              <button
                onClick={onReject}
                disabled={isSubmitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-gray-300 py-5 text-xl font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                <X className="h-6 w-6" />
                ไม่ใช่
              </button>

              {/* disabled ทันทีที่กด — กดรัวสองครั้งจะยิง check-in สองรอบ
                  รอบที่สองจะถูก unique index ปฏิเสธ แต่แอดมินจะเห็นข้อความ error
                  ทั้งที่การเช็คชื่อสำเร็จไปแล้ว ซึ่งทำให้สับสนหน้างาน */}
              <button
                onClick={onConfirm}
                disabled={isSubmitting}
                className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-green-600 py-5 text-xl font-bold text-white transition hover:bg-green-700 disabled:opacity-60"
              >
                {isSubmitting ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <UserCheck className="h-6 w-6" />
                )}
                {isSubmitting ? "กำลังบันทึก..." : "ใช่ ยืนยัน"}
              </button>
            </div>

            {!isSubmitting && (
              <p className="mt-3 text-center text-sm text-gray-400">
                ยกเลิกเองใน {secondsLeft} วินาที
              </p>
            )}
          </>
        ) : (
          <>
            <div className="mt-6 flex items-start gap-3 rounded-xl bg-red-50 p-4">
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-red-600" />
              <p className="text-lg font-medium text-red-700">
                {scan.reason || "ไม่สามารถเช็คชื่อได้"}
              </p>
            </div>

            <button
              onClick={onReject}
              className="mt-6 w-full rounded-xl bg-gray-800 py-4 text-xl font-semibold text-white transition hover:bg-gray-900"
            >
              ปิด
            </button>
          </>
        )}
      </div>
    </div>
  );
}
