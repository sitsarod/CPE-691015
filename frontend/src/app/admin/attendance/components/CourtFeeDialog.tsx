"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  title: string;
  confirmLabel: string;
  payerCount: number;
  notes?: string[];
  isSubmitting: boolean;
  onSubmit: (total: number) => void;
  // ปิดรอบโดยยังไม่ออกบิล — ไม่ส่งมาก็ไม่มีปุ่มนี้
  onSkip?: () => void;
  skipLabel?: string;
  onCancel: () => void;
}

// CourtFeeDialog ให้แอดมินกรอกค่าสนามรวมของคาบ แล้วโชว์ยอดหารก่อนออกบิลจริง
export default function CourtFeeDialog({
  title,
  confirmLabel,
  payerCount,
  notes = [],
  isSubmitting,
  onSubmit,
  onSkip,
  skipLabel = "ยังไม่ออกบิล",
  onCancel,
}: Props) {
  const [amount, setAmount] = useState("");

  const total = parseFloat(amount);
  const hasPayers = payerCount > 0;
  const isValid = Number.isFinite(total) && total > 0 && hasPayers;
  const perHead = isValid ? Math.ceil(total / payerCount) : 0;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>

        {notes.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-sm text-gray-600">
            {notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        )}

        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (isValid && !isSubmitting) onSubmit(total);
          }}
        >
          <label htmlFor="court-fee-total" className="text-sm font-medium text-gray-700">
            ค่าสนามรวมของคาบนี้ (บาท)
          </label>
          <input
            id="court-fee-total"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-gray-300 px-4 py-3 text-lg outline-none focus:border-gray-500"
          />
          <p className="mt-1.5 text-xs text-gray-500">รวมทุกสนามที่จองไว้สำหรับคาบนี้</p>

          {hasPayers ? (
            <div className="mt-4 space-y-1 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
              <p>หาร {payerCount} คน (มาเรียน + ยืนยันแล้วไม่มา)</p>
              <p className="text-base font-semibold text-gray-900">
                คนละ ฿{perHead.toLocaleString("th-TH")}
                <span className="ml-1 text-xs font-normal text-gray-500">(ปัดขึ้นเป็นบาท)</span>
              </p>
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
              รอบนี้ไม่มีคนมาเรียนหรือยืนยันไว้ จึงไม่มีใครต้องจ่ายค่าสนาม
            </p>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="min-h-11 rounded-xl border border-gray-300 px-4 font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
            >
              ยกเลิก
            </button>
            {onSkip && (
              <button
                type="button"
                onClick={onSkip}
                disabled={isSubmitting}
                className="min-h-11 rounded-xl border border-gray-300 px-4 font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
              >
                {skipLabel}
              </button>
            )}
            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gray-800 px-4 font-semibold text-white transition hover:bg-gray-900 disabled:opacity-60"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
