"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Loader2, CalendarPlus, AlertTriangle, BookOpen } from "lucide-react";
import { fetchCustomerEnrollments } from "@/services/enrollmentAPI";
import type { Enrollment } from "@/types/enrollment";
import {
  describeExpiry,
  expiryBadgeClass,
  formatThaiDate,
} from "@/components/course/expiryUtils";
import CourseCover from "@/components/course/CourseCover";
import ExtendEnrollmentModal, {
  ExtendTarget,
} from "@/app/admin/enrollments/components/ExtendEnrollmentModal";

interface StudentEnrollmentsModalProps {
  /** users.id ของนักเรียน — null = ปิดโมดัล */
  userId: number | null;
  studentName: string;
  onClose: () => void;
  onChanged?: () => void;
}


export default function StudentEnrollmentsModal({
  userId,
  studentName,
  onClose,
  onChanged,
}: StudentEnrollmentsModalProps) {
  const [items, setItems] = useState<Enrollment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extending, setExtending] = useState<ExtendTarget | null>(null);

  const load = useCallback(async () => {
    if (userId == null) return;
    try {
      setIsLoading(true);
      setError(null);
      const token = localStorage.getItem("token") || "";
      setItems(await fetchCustomerEnrollments(userId, token));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ไม่สามารถดึงข้อมูลคอร์สได้");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId == null) {
      setItems([]);
      setError(null);
      return;
    }
    load();
  }, [userId, load]);

  if (userId == null) return null;

  // เรียงให้คนที่ต้องรีบจัดการอยู่บนสุด — ผ่อนผันก่อน แล้วค่อยกำลังเรียน แล้วที่เหลือ
  const sorted = [...items].sort((a, b) => {
    const rank = (e: Enrollment) => {
      if (e.grace_days_left !== null && e.grace_days_left > 0) return 0;
      if (e.status === "active") return 1;
      return 2;
    };
    return rank(a) - rank(b);
  });

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
          <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                <BookOpen className="h-5 w-5 text-[#CC0000]" />
                คอร์สเรียนของ {studentName}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                ขยายเวลาหรือเพิ่มจำนวนครั้งให้ได้จากที่นี่
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {isLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#CC0000]" />
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            ) : sorted.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-500">
                นักเรียนคนนี้ยังไม่มีคอร์สเรียน
              </p>
            ) : (
              <div className="space-y-3">
                {sorted.map((e) => {
                  const inGrace =
                    e.grace_days_left !== null && e.grace_days_left > 0;
                  const expiry = describeExpiry(
                    e.days_left,
                    e.status,
                    e.grace_days_left
                  );

                  return (
                    <div
                      key={`enroll-${e.id}`}
                      className={`rounded-xl border p-4 ${
                        inGrace ? "border-red-200 bg-red-50" : "border-gray-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <CourseCover
                          src={e.package?.course?.image_url}
                          alt={e.package?.course?.course_name ?? "คอร์ส"}
                          width={128}
                          height={128}
                          className="h-11 w-14 shrink-0 rounded-lg object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-gray-900">
                            {e.package?.course?.course_name ?? "ไม่ระบุคอร์ส"}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            แพ็กเกจ {e.package?.sessions_count ?? 0} ครั้ง ·
                            เหลือ {e.remaining_sessions} จาก {e.total_sessions} ครั้ง
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${expiryBadgeClass(
                            expiry.tone
                          )}`}
                        >
                          {expiry.label}
                        </span>
                      </div>

                      {e.expires_at && (
                        <p className="mt-2 text-xs text-gray-500">
                          หมดอายุ {formatThaiDate(e.expires_at)}
                        </p>
                      )}

                      {/* ขึ้นเตือนเฉพาะคนที่ยังทันช่วยได้ ไม่ใช่ทุกคนที่หมดอายุ */}
                      {inGrace && (
                        <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold leading-relaxed text-red-700">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          ยังเหลือ {e.remaining_sessions} ครั้งที่ใช้ไม่ทัน ·
                          ขยายให้ได้อีก {e.grace_days_left} วัน
                        </p>
                      )}

                      {/* ใบที่ยังไม่เริ่มเรียนไม่มีนาฬิกาให้ยืด จึงไม่ต้องมีปุ่ม */}
                      {e.expires_at && e.status !== "cancelled" && (
                        <button
                          type="button"
                          onClick={() =>
                            setExtending({
                              id: e.id,
                              status: e.status,
                              expires_at: e.expires_at,
                              total_sessions: e.total_sessions,
                              remaining_sessions: e.remaining_sessions,
                              studentName,
                              courseName: e.package?.course?.course_name,
                            })
                          }
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-bold text-gray-700 transition-colors hover:border-[#CC0000] hover:text-[#CC0000]"
                        >
                          <CalendarPlus className="h-4 w-4" />
                          ขยายสิทธิ์
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <ExtendEnrollmentModal
        enrollment={extending}
        onClose={() => setExtending(null)}
        onSuccess={() => {
          load();
          onChanged?.();
        }}
      />
    </>
  );
}
