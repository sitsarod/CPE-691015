"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, HelpCircle, X } from "lucide-react";

interface Props {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "danger" | "default";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "ตกลง",
  cancelText,
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // กด Esc = ยกเลิก ส่วนโฟกัสเริ่มต้นให้ไปที่ปุ่มปลอดภัยเสมอเมื่อเป็นการลบ
  // ไม่งั้นเคาะ Enter ค้างมาจากหน้าก่อนหน้าจะลบทันทีโดยไม่ได้ตั้งใจ
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    (cancelRef.current ?? confirmRef.current)?.focus();

    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const isDanger = tone === "danger";
  const Icon = isDanger ? AlertTriangle : HelpCircle;

  // ไม่มี title มาให้ = ใช้ย่อหน้าแรกของข้อความเป็นหัวเรื่อง ที่เหลือเป็นคำอธิบาย
  // ไม่งั้นคำถามจริงจะไปจมอยู่ในเนื้อความใต้หัวเรื่องกลาง ๆ อย่าง "ยืนยันการทำรายการ"
  const [firstLine, ...rest] = message.split(/\n\s*\n/);
  const heading = title ?? firstLine;
  const body = title ? message : rest.join("\n\n");

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-4"
      style={{
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingTop: "max(1rem, env(safe-area-inset-top))",
      }}
      onClick={busy ? undefined : onCancel}
    >
      <div className="animate-overlayIn absolute inset-0 bg-gray-900/40 backdrop-blur-[3px]" />
      <div
        className="animate-dialogIn relative flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl shadow-gray-900/20 ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={heading}
      >
        <button
          onClick={onCancel}
          disabled={busy}
          className="absolute right-2.5 top-2.5 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
          aria-label="ปิด"
        >
          <X className="h-4 w-4" />
        </button>

        {/* ข้อความยาวบนจอเตี้ย (มือถือแนวนอน) ต้องเลื่อนได้ ไม่งั้นปุ่มจะหลุดออกนอกจอ */}
        <div className="flex min-h-0 flex-1 gap-3.5 overflow-y-auto px-5 pb-5 pt-6 sm:gap-4 sm:px-6 sm:pb-6 sm:pt-7">
          <div
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ring-8 sm:h-12 sm:w-12 ${
              isDanger
                ? "bg-red-100 text-[#CC0000] ring-red-50"
                : "bg-rose-100 text-[#CD0D13] ring-rose-50"
            }`}
          >
            <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0 flex-1 pr-7 pt-0.5 sm:pr-4 sm:pt-1">
            <h3 className="text-base font-bold leading-snug text-gray-900 break-words sm:text-[17px]">
              {heading}
            </h3>
            {body && (
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-500 break-words">
                {body}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2.5 border-t border-gray-100 bg-gray-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          {cancelText && (
            <button
              ref={isDanger ? cancelRef : undefined}
              onClick={onCancel}
              disabled={busy}
              className="w-full rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-bold text-gray-600 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 active:scale-[0.97] disabled:opacity-40 sm:w-auto sm:py-2.5"
            >
              {cancelText}
            </button>
          )}
          {/* กันกดซ้ำ — การลบยิงสองครั้งได้ error ก้อนที่สองโดยไม่จำเป็น */}
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={busy}
            className={`w-full rounded-xl px-5 py-3 text-sm font-bold text-white shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.97] disabled:opacity-60 sm:w-auto sm:py-2.5 ${
              isDanger
                ? "bg-[#CC0000] hover:bg-[#AA0000] focus-visible:ring-[#CC0000]"
                : "bg-[#CD0D13] hover:bg-[#A30A0E] focus-visible:ring-[#CD0D13]"
            }`}
          >
            {busy ? "กำลังทำงาน..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
