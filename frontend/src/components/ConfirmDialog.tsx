"use client";

import { AlertTriangle, X } from "lucide-react";

interface Props {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "danger" | "default";
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
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  const isDanger = tone === "danger";

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-4 p-6">
          <div
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${
              isDanger ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            {title && <h3 className="text-base font-bold text-gray-900">{title}</h3>}
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-gray-600">{message}</p>
          </div>
          <button
            onClick={onCancel}
            className="p-1 text-gray-400 transition-colors hover:text-gray-600"
            aria-label="ปิด"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
          {cancelText && (
            <button
              onClick={onCancel}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-50"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors ${
              isDanger ? "bg-[#CC0000] hover:bg-[#990000]" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
