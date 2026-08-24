"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import type { AttendanceStatus } from "@/types/attendance";
import { STATUS_LABEL } from "@/types/attendance";

const OPTIONS: AttendanceStatus[] = ["present", "absent", "leave"];

// อธิบายผลต่อโควตาให้แอดมินเห็นก่อนกด
//
// การแก้สถานะมีผลกับเงินจริง — leave ไม่หักโควตา ส่วน present/absent หัก
// แอดมินที่ไม่รู้กติกานี้จะกดเปลี่ยนไปมาแล้วสงสัยว่าทำไมเลขคงเหลือขยับ
const QUOTA_NOTE: Record<AttendanceStatus, string> = {
  present: "หักโควตา 1 ครั้ง",
  absent: "หักโควตา 1 ครั้ง",
  leave: "ไม่หักโควตา — ถ้าเดิมหักไว้จะคืนให้ 1 ครั้ง",
};

interface Props {
  studentName: string;
  currentStatus: AttendanceStatus;
  currentRemarks?: string;
  isSubmitting: boolean;
  onSubmit: (status: AttendanceStatus, remarks: string) => void;
  onClose: () => void;
}

export default function EditStatusModal({
  studentName,
  currentStatus,
  currentRemarks,
  isSubmitting,
  onSubmit,
  onClose,
}: Props) {
  const [status, setStatus] = useState<AttendanceStatus>(currentStatus);
  const [remarks, setRemarks] = useState(currentRemarks ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">แก้สถานะการเข้าเรียน</h3>
            <p className="mt-0.5 text-gray-500">{studentName}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-2">
          {OPTIONS.map((opt) => (
            <label
              key={opt}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition ${
                status === opt
                  ? "border-[#CC0000] bg-[#FFF0F0]"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <input
                type="radio"
                name="status"
                checked={status === opt}
                onChange={() => setStatus(opt)}
                className="mt-1"
              />
              <div>
                <p className="font-medium text-gray-900">{STATUS_LABEL[opt]}</p>
                <p className="text-sm text-gray-500">{QUOTA_NOTE[opt]}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="mt-5">
          <label className="block text-sm font-medium text-gray-700">
            หมายเหตุ
          </label>
          {/* บันทึกว่าแจ้งลาทางไหนและเมื่อไหร่ — การแจ้งลาเกิดนอกระบบ (โทร/ไลน์)
              ถ้าไม่จดไว้ ทีหลังจะไม่มีหลักฐานว่าทำไมคนนี้ได้โควตาคืน */}
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="เช่น ผู้ปกครองโทรแจ้งลาเมื่อ 10:30 วันเดียวกัน"
            className="mt-1 w-full rounded-xl border border-gray-300 p-3 text-gray-900 outline-none transition focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20"
          />
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-11 flex-1 rounded-xl border border-gray-300 py-3 font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={() => onSubmit(status, remarks)}
            disabled={isSubmitting}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#CC0000] py-3 font-semibold text-white transition hover:bg-[#A30A0E] disabled:opacity-60"
          >
            {isSubmitting && <Loader2 className="h-5 w-5 animate-spin" />}
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}
