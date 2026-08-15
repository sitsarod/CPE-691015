"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * ป็อปอัพดูรูป (lightbox) แสดงรูปเต็มจอในหน้าเดิม ไม่ต้องเปิดแท็บใหม่
 * - ส่ง url = null เพื่อปิด
 * - ปิดได้ด้วยการแตะพื้นหลัง, ปุ่ม X หรือกด Esc
 * - ล็อก scroll พื้นหลังตอนเปิด และคืนค่าเดิมตอนปิด (รองรับเปิดซ้อนบนโมดัลอื่น)
 */
export default function ImageLightbox({
  url,
  onClose,
  alt = "รูปภาพ",
}: {
  url: string | null;
  onClose: () => void;
  alt?: string;
}) {
  useEffect(() => {
    if (!url) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [url, onClose]);

  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="ปิด"
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        <X className="w-6 h-6" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
      />
    </div>
  );
}
