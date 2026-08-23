"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, ZoomIn, Check } from "lucide-react";

interface Props {
  /** object URL ของรูปที่เลือก */
  src: string;
  onCancel: () => void;
  /** คืนไฟล์รูปสี่เหลี่ยมจัตุรัสที่ crop แล้ว (jpeg) */
  onConfirm: (file: File) => void | Promise<void>;
}

const VIEWPORT = 288; // ขนาดกรอบดูตัวอย่าง (px)
const OUTPUT = 400; // ขนาดรูปผลลัพธ์ (px)

// Modal สำหรับ crop รูปเป็นสี่เหลี่ยมจัตุรัส (สำหรับ avatar) — เลื่อน/ซูมแล้วยืนยัน
export default function ImageCropModal({ src, onCancel, onConfirm }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // ตำแหน่งมุมบนซ้ายของรูปเทียบกับกรอบ
  const [isBusy, setIsBusy] = useState(false);
  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  // baseScale = สเกลขั้นต่ำให้รูป "cover" กรอบสี่เหลี่ยม
  const baseScale = natural.w && natural.h ? VIEWPORT / Math.min(natural.w, natural.h) : 1;
  const displayScale = baseScale * zoom;
  const dispW = natural.w * displayScale;
  const dispH = natural.h * displayScale;

  // clamp ให้รูปคลุมกรอบเสมอ (ไม่โผล่ขอบขาว)
  const clamp = useCallback(
    (x: number, y: number) => ({
      x: Math.min(0, Math.max(VIEWPORT - dispW, x)),
      y: Math.min(0, Math.max(VIEWPORT - dispH, y)),
    }),
    [dispW, dispH]
  );

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    setNatural({ w, h });
    const bScale = VIEWPORT / Math.min(w, h);
    // จัดกึ่งกลางตอนเริ่ม
    setOffset({ x: (VIEWPORT - w * bScale) / 2, y: (VIEWPORT - h * bScale) / 2 });
  };

  // re-clamp เมื่อ zoom เปลี่ยน
  useEffect(() => {
    setOffset((prev) => {
      const cx = Math.min(0, Math.max(VIEWPORT - dispW, prev.x));
      const cy = Math.min(0, Math.max(VIEWPORT - dispH, prev.y));
      return { x: cx, y: cy };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    setOffset(clamp(drag.current.ox + dx, drag.current.oy + dy));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const handleConfirm = async () => {
    if (!imgRef.current || !natural.w) return;
    setIsBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("ไม่รองรับการ crop รูปบนเบราว์เซอร์นี้");

      // แปลงพื้นที่ที่มองเห็นในกรอบ → พิกัดบนรูปต้นฉบับ
      const sx = -offset.x / displayScale;
      const sy = -offset.y / displayScale;
      const sSize = VIEWPORT / displayScale;
      ctx.drawImage(imgRef.current, sx, sy, sSize, sSize, 0, 0, OUTPUT, OUTPUT);

      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
      if (!blob) throw new Error("แปลงรูปไม่สำเร็จ");
      const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
      await onConfirm(file);
    } catch {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={isBusy ? undefined : onCancel} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl ring-1 ring-black/5 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">ปรับตำแหน่งรูปโปรไฟล์</h2>
          <button onClick={onCancel} disabled={isBusy} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg disabled:opacity-50" aria-label="ปิด">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col items-center gap-4">
          {/* กรอบ crop สี่เหลี่ยม + มาส์กวงกลมให้เห็นทรง avatar */}
          <div
            className="relative overflow-hidden bg-gray-100 rounded-xl touch-none cursor-grab active:cursor-grabbing select-none"
            style={{ width: VIEWPORT, height: VIEWPORT }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt="ครอปรูป"
              onLoad={onImgLoad}
              draggable={false}
              className="absolute top-0 left-0 max-w-none pointer-events-none"
              style={{ width: dispW, height: dispH, transform: `translate(${offset.x}px, ${offset.y}px)` }}
            />
            {/* วงกลมบอกกรอบ avatar */}
            <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-black/10">
              <div className="absolute inset-0 m-auto rounded-full ring-[9999px] ring-black/30" />
            </div>
          </div>

          {/* ซูม */}
          <div className="w-full flex items-center gap-3">
            <ZoomIn className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-[#CD0D13] cursor-pointer"
            />
          </div>
          <p className="text-xs text-gray-400 text-center">ลากเพื่อเลื่อน · เลื่อนแถบเพื่อซูม</p>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-100 bg-gray-50">
          <button onClick={onCancel} disabled={isBusy} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 cursor-pointer disabled:opacity-50">
            ยกเลิก
          </button>
          <button onClick={handleConfirm} disabled={isBusy || !natural.w} className="flex items-center gap-1.5 rounded-xl bg-[#CD0D13] hover:bg-[#A30A0E] px-5 py-2.5 text-sm font-bold text-white cursor-pointer disabled:opacity-60">
            <Check className="w-4 h-4" /> {isBusy ? "กำลังอัปโหลด..." : "ใช้รูปนี้"}
          </button>
        </div>
      </div>
    </div>
  );
}
