"use client";

import { Check, Loader2, ScanFace, X } from "lucide-react";
import type { FaceLookup } from "@/types/attendance";

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
  candidate: FaceLookup;
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
  // ดึงออกมาก่อน จะได้ไม่ต้องเช็ค kind ซ้ำทุกบรรทัดใน JSX
  const isCoach = candidate.kind === "coach";
  const person = isCoach ? candidate.coach : candidate.student;

  const fullName = person.full_name.trim();
  const nickname = person.nickname;
  const name = fullName || nickname;

  // โค้ชไม่มีคอร์สและโควตา บอกแค่บทบาทแทน
  const subtitle = isCoach
    ? "โค้ชผู้สอน"
    : `${candidate.student.course_name} · เหลือ ${candidate.student.remaining_sessions} ครั้ง`;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="rounded-full bg-[#CC0000]/10 p-4">
            <ScanFace className="h-9 w-9 text-[#CC0000]" strokeWidth={1.5} />
          </div>

          <p className="mt-4 text-sm text-gray-500">ระบบคิดว่าเป็น</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {isCoach ? `โค้ช${nickname || name}` : nickname || name}
          </h2>
          {fullName && <p className="mt-1 text-base text-gray-500">{fullName}</p>}

          <p className="mt-3 text-sm text-gray-500">{subtitle}</p>

          {/* โชว์คะแนนให้แอดมินใช้ประกอบการตัดสินใจ ไม่ใช่ให้ระบบตัดสินแทน */}
          <p className="mt-2 text-xs text-gray-400">
            ความมั่นใจ {(person.confidence * 100).toFixed(0)}%
            {" · "}นำอันดับสอง {(person.margin * 100).toFixed(0)}%
          </p>

          {!person.can_check_in && person.reason && (
            <p className="mt-4 w-full rounded-xl bg-red-50 px-4 py-3 text-sm text-[#CC0000]">
              {person.reason}
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
            disabled={isSubmitting || !person.can_check_in}
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
