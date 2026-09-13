"use client";

import { useState } from "react";
import { X, Repeat, Loader2, AlertTriangle, PiggyBank, Trash2 } from "lucide-react";
import { extendEnrollment } from "@/services/enrollmentAPI";
import { formatThaiDate } from "@/components/course/expiryUtils";

function carryOverShare(remaining: number) {
  return Math.ceil(remaining / 2);
}

export interface ExtendTarget {
  id: number;
  status: string;
  expires_at: string | null;
  total_sessions: number;
  remaining_sessions: number;
  /** ใช้แสดงหัวโมดัลให้แอดมินรู้ว่ากำลังขยายให้ใคร คอร์สอะไร */
  studentName?: string;
  courseName?: string;
}

interface ExtendEnrollmentModalProps {
  enrollment: ExtendTarget | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ExtendEnrollmentModal({
  enrollment,
  onClose,
  onSuccess,
}: ExtendEnrollmentModalProps) {
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!enrollment) return null;

  const notStarted = !enrollment.expires_at;

  const notExpired = !notStarted && enrollment.status !== "expired";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const token = localStorage.getItem("token");
    if (!token) {
      setError("ไม่พบข้อมูลการยืนยันตัวตน กรุณาเข้าสู่ระบบใหม่");
      return;
    }

    try {
      setIsSaving(true);
      await extendEnrollment(enrollment.id, { reason: reason.trim() }, token);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ไม่สามารถทบครั้งคงเหลือเก็บไว้ได้");
    } finally {
      setIsSaving(false);
    }
  };

  const carriedSessions = carryOverShare(enrollment.remaining_sessions);
  const forfeitedSessions = enrollment.remaining_sessions - carriedSessions;

  const noSessions = enrollment.remaining_sessions === 0;

  const isValid = reason.trim().length >= 3 && !noSessions;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <Repeat className="h-5 w-5 text-[#CC0000]" />
              ขยายสิทธิ์เรียน
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {[enrollment.studentName, enrollment.courseName]
                .filter(Boolean)
                .join(" · ") || `การลงทะเบียน #${enrollment.id}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="ปิด"
            className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {notStarted || notExpired ? (
          <div className="px-6 py-8 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-orange-500" />
            <p className="text-sm font-semibold text-gray-800">
              {notStarted
                ? "การลงทะเบียนนี้ยังไม่เริ่มเรียน"
                : "ใบนี้ยังไม่หมดอายุ"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {notStarted
                ? "ต้องอนุมัติหรือยืนยันการชำระเงินก่อน จึงจะมีครั้งคงเหลือให้ทบ"
                : "ครั้งที่เหลือยังใช้เรียนได้ตามปกติ — ทบเก็บไว้ได้ก็ต่อเมื่อหมดอายุแล้ว"}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5">
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">วันหมดอายุปัจจุบัน</span>
                <span className="font-bold text-gray-900">
                  {formatThaiDate(enrollment.expires_at)}
                </span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-gray-500">จำนวนครั้งคงเหลือ</span>
                <span className="font-bold text-gray-900">
                  {enrollment.remaining_sessions} จาก {enrollment.total_sessions} ครั้ง
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
                ใบนี้หมดอายุแล้วและจะไม่ถูกเปิดกลับมา — สองค่าข้างบนคงไว้เป็นหลักฐาน
              </p>
            </div>


            <div className="mb-4 rounded-xl border border-[#CC0000]/20 bg-[#FFF7F7] p-3">
              <p className="text-sm font-bold text-gray-900">ระบบจะดำเนินการให้อัตโนมัติ</p>

              <div className="mt-2 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <PiggyBank className="h-4 w-4 shrink-0 text-[#CC0000]" />
                  <span className="text-gray-700">
                    ทบเก็บไว้ให้{enrollment.courseName ? `คอร์ส${enrollment.courseName}` : "คอร์สเดิม"}{" "}
                    <span className="font-bold">{carriedSessions}</span> ครั้ง
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="text-gray-700">
                    ริบ <span className="font-bold">{forfeitedSessions}</span> ครั้ง
                  </span>
                </div>
              </div>

              <p className="mt-2.5 border-t border-[#CC0000]/15 pt-2 text-xs leading-relaxed text-gray-500">
                ใบเดิมไม่ถูกแก้อะไรเลย — วันหมดอายุและเลข {enrollment.remaining_sessions} ครั้ง
                ยังอยู่ครบเป็นหลักฐาน (ใบที่หมดอายุแล้วเอาไปเรียนต่อไม่ได้อยู่แล้ว)
                <br />
                ครั้งที่ทบจะถูกบวกให้อัตโนมัติเมื่อกลับมาสมัคร{" "}
                <span className="font-semibold">
                  {enrollment.courseName ? `คอร์ส${enrollment.courseName}` : "คอร์สเดิม"}อีกครั้ง
                </span>{" "}
                จะเป็นแพ็กเกจไหนในคอร์สนี้ก็ได้ แต่เอาไปใช้กับคอร์สอื่นไม่ได้ ·
                มีอายุ 90 วัน ถ้าไม่สมัครต่อภายในกำหนดจะถูกริบตามไปด้วย
                <br />
                <span className="font-semibold">ใบหนึ่งทบได้ครั้งเดียว</span> — กดแล้วกดซ้ำไม่ได้
              </p>
            </div>

            {noSessions && (
              <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
                ใบนี้ไม่มีครั้งคงเหลือแล้ว จึงไม่มีอะไรให้ทบเก็บไว้
              </div>
            )}

            <div className="mb-5">
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                เหตุผล <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="เช่น นักเรียนป่วยเข้าโรงพยาบาล 2 สัปดาห์ ตกลงกับโค้ชแล้ว"
                className="h-24 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-[#CC0000]"
              />
              <p className="mt-1 text-xs text-gray-400">
                บันทึกเป็นหลักฐานถาวร แก้ไขภายหลังไม่ได้
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="flex-1 rounded-xl border border-gray-300 bg-white py-2.5 font-bold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={isSaving || !isValid}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#CC0000] py-2.5 font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                ยืนยันการทบ
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
