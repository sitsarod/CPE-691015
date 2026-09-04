"use client";

import { Check, Loader2, ScanFace, X } from "lucide-react";
import type { FaceScanResult } from "@/types/attendance";

/**
 * การ์ดยืนยันตัวตนหลังระบบทายว่าเป็นใคร
 *
 * ⚠️ ขั้นนี้ตัดออกไม่ได้ ต่างจาก QR ที่ auto check-in ทันที
 *
 * การยื่น QR คือการกระทำที่ตั้งใจยืนยันตัวตนอยู่ในตัว แต่การเดินผ่านกล้องไม่ใช่
 * และ face recognition ไม่มีทางแม่น 100% ผลของการจับผิดคนคือเด็กคนหนึ่งถูกหัก
 * โควตาที่จ่ายเงินมา ส่วนอีกคนได้เรียนฟรี ซึ่งย้อนกลับยาก — คนต้องเป็นด่านสุดท้ายเสมอ
 */
interface Props {
  candidate: FaceScanResult;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function FaceConfirmCard({
  candidate,
  isSubmitting,
  onConfirm,
  onCancel,
}: Props) {
  const name = candidate.full_name.trim() || candidate.nickname;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="rounded-full bg-[#CC0000]/10 p-4">
            <ScanFace className="h-9 w-9 text-[#CC0000]" strokeWidth={1.5} />
          </div>

          <p className="mt-4 text-sm text-gray-500">ระบบคิดว่าเป็น</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {candidate.nickname || name}
          </h2>
          {candidate.full_name.trim() && (
            <p className="mt-1 text-base text-gray-500">{candidate.full_name.trim()}</p>
          )}

          <p className="mt-3 text-sm text-gray-500">
            {candidate.course_name} · เหลือ {candidate.remaining_sessions} ครั้ง
          </p>

          {/* โชว์คะแนนให้แอดมินใช้ประกอบการตัดสินใจ ไม่ใช่ให้ระบบตัดสินแทน */}
          <p className="mt-2 text-xs text-gray-400">
            ความมั่นใจ {(candidate.confidence * 100).toFixed(0)}%
            {" · "}นำอันดับสอง {(candidate.margin * 100).toFixed(0)}%
          </p>

          {!candidate.can_check_in && candidate.reason && (
            <p className="mt-4 w-full rounded-xl bg-red-50 px-4 py-3 text-sm text-[#CC0000]">
              {candidate.reason}
            </p>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-gray-100 text-lg font-semibold text-gray-600 transition hover:bg-gray-200 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
            ไม่ใช่
          </button>
          <button
            onClick={onConfirm}
            disabled={isSubmitting || !candidate.can_check_in}
            className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#CC0000] text-lg font-bold text-white shadow-lg shadow-[#CC0000]/20 transition hover:bg-[#A30A0E] disabled:opacity-40"
          >
            {isSubmitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Check className="h-5 w-5" />
            )}
            ใช่ เช็คชื่อเลย
          </button>
        </div>
      </div>
    </div>
  );
}
