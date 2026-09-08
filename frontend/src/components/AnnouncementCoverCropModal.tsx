"use client";

import React, { useCallback, useRef, useState } from "react";
import { X, Check, Maximize2 } from "lucide-react";

interface Props {
  /** object URL ของรูปที่เลือก (ยังไม่อัปโหลด) */
  src: string;
  onCancel: () => void;
  /** คืนไฟล์รูปที่ครอบตัดแล้ว (jpeg) — สัดส่วนอิสระตามกรอบที่ผู้ใช้เลือก */
  onConfirm: (file: File) => void | Promise<void>;
}

// พื้นที่ทำงานสูงสุด — รูปจะถูกย่อให้พอดีในกรอบนี้โดยคงสัดส่วนต้นฉบับไว้
const MAX_W = 560;
const MAX_H = 440;
// ขนาดกรอบครอบขั้นต่ำ (พิกเซลบนหน้าจอทำงาน) กันครอบเล็กจนใช้ไม่ได้
const MIN_CROP = 40;
// จำกัดด้านที่ยาวที่สุดของไฟล์ผลลัพธ์ กันไฟล์ใหญ่เกินจำเป็น
const MAX_OUTPUT_LONG_SIDE = 2000;

type HandleId = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface Edges {
  l: number;
  t: number;
  r: number;
  b: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// Modal ครอบตัดรูปปกประกาศแบบ "สัดส่วนอิสระ" — ลาก/ปรับขนาดกรอบครอบได้เอง
// ค่าเริ่มต้นคือครอบเต็มทั้งภาพ (กดยืนยันได้ทันทีถ้าไม่ต้องการตัด)
export default function AnnouncementCoverCropModal({ src, onCancel, onConfirm }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  // ขนาดที่แสดงจริงของรูปบนหน้าจอทำงาน (คงสัดส่วนต้นฉบับ พอดีใน MAX_W x MAX_H)
  const [disp, setDisp] = useState({ w: 0, h: 0 });
  // กรอบครอบ (พิกัดบนหน้าจอทำงาน) — {x,y,w,h}
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [isBusy, setIsBusy] = useState(false);

  // สถานะการลาก: handle ที่จับอยู่ + ตำแหน่งเริ่ม + ขอบกรอบตอนเริ่มลาก
  const dragRef = useRef<{ handle: HandleId; startX: number; startY: number; edges: Edges } | null>(null);

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    setNatural({ w, h });
    // ย่อรูปให้พอดีพื้นที่ทำงานโดยคงสัดส่วน
    const scale = Math.min(MAX_W / w, MAX_H / h, 1);
    const dw = Math.round(w * scale);
    const dh = Math.round(h * scale);
    setDisp({ w: dw, h: dh });
    // เริ่มต้น = ครอบเต็มทั้งภาพ
    setCrop({ x: 0, y: 0, w: dw, h: dh });
  };

  const resetFull = useCallback(() => {
    setCrop({ x: 0, y: 0, w: disp.w, h: disp.h });
  }, [disp.w, disp.h]);

  const onPointerDown = (handle: HandleId) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      edges: { l: crop.x, t: crop.y, r: crop.x + crop.w, b: crop.y + crop.h },
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const s = d.edges;

    if (d.handle === "move") {
      const w = s.r - s.l;
      const h = s.b - s.t;
      const nx = clamp(s.l + dx, 0, disp.w - w);
      const ny = clamp(s.t + dy, 0, disp.h - h);
      setCrop({ x: nx, y: ny, w, h });
      return;
    }

    let { l, t, r, b } = s;
    if (d.handle.includes("n")) t = clamp(s.t + dy, 0, s.b - MIN_CROP);
    if (d.handle.includes("s")) b = clamp(s.b + dy, s.t + MIN_CROP, disp.h);
    if (d.handle.includes("w")) l = clamp(s.l + dx, 0, s.r - MIN_CROP);
    if (d.handle.includes("e")) r = clamp(s.r + dx, s.l + MIN_CROP, disp.w);
    setCrop({ x: l, y: t, w: r - l, h: b - t });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const handleConfirm = async () => {
    if (!imgRef.current || !natural.w || !disp.w) return;
    setIsBusy(true);
    try {
      // แปลงพิกัดกรอบครอบ (หน้าจอทำงาน) → พิกัดจริงบนรูปต้นฉบับ
      const scale = natural.w / disp.w; // สัดส่วนคงที่ ใช้ค่าเดียวกันทั้งแนวกว้าง/สูง
      const sx = crop.x * scale;
      const sy = crop.y * scale;
      const sw = crop.w * scale;
      const sh = crop.h * scale;

      // ย่อผลลัพธ์ถ้าด้านยาวเกินกำหนด (คงสัดส่วน)
      const outScale = Math.min(1, MAX_OUTPUT_LONG_SIDE / Math.max(sw, sh));
      const outW = Math.max(1, Math.round(sw * outScale));
      const outH = Math.max(1, Math.round(sh * outScale));

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("ไม่รองรับการ crop รูปบนเบราว์เซอร์นี้");
      ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, outW, outH);

      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
      if (!blob) throw new Error("แปลงรูปไม่สำเร็จ");
      const file = new File([blob], "cover.jpg", { type: "image/jpeg" });
      await onConfirm(file);
    } catch {
      setIsBusy(false);
    }
  };

  // ตำแหน่ง handle รอบกรอบครอบ (พิกัดสัมพัทธ์กับกรอบ)
  const handles: { id: HandleId; style: React.CSSProperties; cursor: string }[] = [
    { id: "nw", style: { left: -6, top: -6 }, cursor: "nwse-resize" },
    { id: "ne", style: { right: -6, top: -6 }, cursor: "nesw-resize" },
    { id: "sw", style: { left: -6, bottom: -6 }, cursor: "nesw-resize" },
    { id: "se", style: { right: -6, bottom: -6 }, cursor: "nwse-resize" },
    { id: "n", style: { left: "50%", top: -6, transform: "translateX(-50%)" }, cursor: "ns-resize" },
    { id: "s", style: { left: "50%", bottom: -6, transform: "translateX(-50%)" }, cursor: "ns-resize" },
    { id: "w", style: { top: "50%", left: -6, transform: "translateY(-50%)" }, cursor: "ew-resize" },
    { id: "e", style: { top: "50%", right: -6, transform: "translateY(-50%)" }, cursor: "ew-resize" },
  ];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={isBusy ? undefined : onCancel} />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-xl ring-1 ring-black/5 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">เลือกส่วนของรูปที่จะแสดง</h2>
          <button onClick={onCancel} disabled={isBusy} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg disabled:opacity-50" aria-label="ปิด">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col items-center gap-4">
          {/* พื้นที่ทำงาน — ขนาดเท่ารูปที่ย่อแล้ว (คงสัดส่วนต้นฉบับ) */}
          <div
            className="relative select-none touch-none rounded-xl overflow-hidden bg-gray-100 max-w-full"
            style={{ width: disp.w || MAX_W, height: disp.h || 300 }}
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
              className="absolute top-0 left-0 w-full h-full object-fill pointer-events-none"
            />

            {disp.w > 0 && (
              <>
                {/* พื้นที่นอกกรอบครอบถูกทำให้มืดลง (ใช้ box-shadow ครอบรอบ) */}
                <div
                  className="absolute border border-white/90 cursor-move"
                  style={{
                    left: crop.x,
                    top: crop.y,
                    width: crop.w,
                    height: crop.h,
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                  }}
                  onPointerDown={onPointerDown("move")}
                >
                  {/* เส้นตาราง 1/3 ช่วยจัดองค์ประกอบ */}
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute top-1/3 left-0 right-0 border-t border-white/30" />
                    <div className="absolute top-2/3 left-0 right-0 border-t border-white/30" />
                    <div className="absolute left-1/3 top-0 bottom-0 border-l border-white/30" />
                    <div className="absolute left-2/3 top-0 bottom-0 border-l border-white/30" />
                  </div>
                  {/* handle ปรับขนาด */}
                  {handles.map((h) => (
                    <div
                      key={h.id}
                      onPointerDown={onPointerDown(h.id)}
                      className="absolute w-3 h-3 bg-white rounded-sm ring-1 ring-black/30 shadow"
                      style={{ ...h.style, cursor: h.cursor }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="w-full flex items-center justify-between gap-3">
            <p className="text-xs text-gray-400">ลากกรอบเพื่อเลื่อน · ลากมุม/ขอบเพื่อปรับขนาด</p>
            <button
              type="button"
              onClick={resetFull}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" /> เต็มภาพ
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-100 bg-gray-50">
          <button onClick={onCancel} disabled={isBusy} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 cursor-pointer disabled:opacity-50">
            ยกเลิก
          </button>
          <button onClick={handleConfirm} disabled={isBusy || !natural.w} className="flex items-center gap-1.5 rounded-xl bg-[#CC0000] hover:bg-[#990000] px-5 py-2.5 text-sm font-bold text-white cursor-pointer disabled:opacity-60">
            <Check className="w-4 h-4" /> {isBusy ? "กำลังอัปโหลด..." : "ใช้รูปนี้"}
          </button>
        </div>
      </div>
    </div>
  );
}
