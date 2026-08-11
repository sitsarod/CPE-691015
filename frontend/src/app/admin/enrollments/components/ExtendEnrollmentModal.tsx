"use client";

import { useState } from "react";
import { X, CalendarPlus, Loader2, AlertTriangle } from "lucide-react";
import { extendEnrollment } from "@/services/enrollmentAPI";
import { formatThaiDate } from "@/components/course/expiryUtils";

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
  const [days, setDays] = useState<number | "">("");
  const [sessions, setSessions] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!enrollment) return null;

  // ใบที่ยังไม่เริ่มเรียนไม่มีนาฬิกาให้ยืด — backend จะปฏิเสธอยู่แล้ว
  // แต่ดักที่นี่ด้วยเพื่อไม่ให้แอดมินกรอกฟอร์มเสร็จแล้วค่อยเจอ error
  const notStarted = !enrollment.expires_at;

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
      await extendEnrollment(
        enrollment.id,
        {
          extend_days: days === "" ? 0 : Number(days),
          extend_sessions: sessions === "" ? 0 : Number(sessions),
          reason: reason.trim(),
        },
        token
      );
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ไม่สามารถขยายระยะเวลาได้");
    } finally {
      setIsSaving(false);
    }
  };

  const daysValue = days === "" ? 0 : Number(days);
  const sessionsValue = sessions === "" ? 0 : Number(sessions);

  const isValid =
    (daysValue > 0 || sessionsValue > 0) &&
    daysValue <= 366 &&
    sessionsValue <= 100 &&
    reason.trim().length >= 3;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <CalendarPlus className="h-5 w-5 text-[#CC0000]" />
              ขยายระยะเวลาเรียน
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

        {notStarted ? (
          <div className="px-6 py-8 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-orange-500" />
            <p className="text-sm font-semibold text-gray-800">
              การลงทะเบียนนี้ยังไม่เริ่มเรียน
            </p>
            <p className="mt-1 text-sm text-gray-500">
              จึงยังไม่มีวันหมดอายุให้ขยาย — ต้องอนุมัติหรือยืนยันการชำระเงินก่อน
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
              {/* บอกกติกาการนับให้ชัด เพราะสองกรณีให้ผลต่างกันและแอดมินคาดเดาเองไม่ได้ */}
              <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
                {enrollment.status === "expired"
                  ? "ใบนี้หมดอายุแล้ว ถ้าขยายเวลา ระบบจะนับวันใหม่จากวันนี้และเปิดสิทธิ์เรียนกลับมาให้"
                  : "ถ้าขยายเวลา ระบบจะนับต่อจากวันหมดอายุเดิม วันที่เหลืออยู่จะไม่หายไป"}
              </p>
            </div>


            <div className="mb-4 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  ขยายเวลา (วัน)
                </label>
                <input
                  type="number"
                  min={0}
                  max={366}
                  value={days}
                  onChange={(e) =>
                    setDays(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder="เว้นว่าง = ไม่ขยาย"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-[#CC0000]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  เพิ่มจำนวนครั้ง
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={sessions}
                  onChange={(e) =>
                    setSessions(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder="เว้นว่าง = ไม่เพิ่ม"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-[#CC0000]"
                />
              </div>
            </div>

            <p className="mb-4 -mt-2 text-xs text-gray-400">
              กรอกอย่างน้อยหนึ่งช่อง · การเพิ่มจำนวนครั้งจะเพิ่มทั้งโควตารวมและครั้งที่เหลือ
            </p>

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
                ยืนยันการขยาย
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
