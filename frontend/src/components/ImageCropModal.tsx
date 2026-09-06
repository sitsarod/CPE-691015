"use client";

import React, { useRef, useState } from "react";
import { X, Check } from "lucide-react";

interface Props {
  /** object URL ของรูปที่เลือก */
  src: string;
  onCancel: () => void;
  /** คืนไฟล์รูปที่ crop แล้ว (jpeg) ตามอัตราส่วนที่กำหนด */
  onConfirm: (file: File) => void | Promise<void>;
  /** อัตราส่วนกรอบ (กว้าง/สูง) — 1 = จัตุรัส (avatar), 3/4 = แนวตั้ง (การ์ดหน้าแรก) */
  aspect?: number;
  /** รูปทรงมาส์ก: วงกลม (avatar) หรือ สี่เหลี่ยม */
  maskShape?: "circle" | "rect";
}

const AREA_W = 340; // พื้นที่แสดงรูป (px)
const AREA_H = 440;
const OUTPUT_LONG = 800; // ด้านยาวสุดของรูปผลลัพธ์
const MIN_BOX = 48; // ขนาดกรอบขั้นต่ำ (px บนจอ)

type Box = { x: number; y: number; w: number; h: number };
type Corner = "nw" | "ne" | "sw" | "se";
type Drag = { kind: "move" | Corner; sx: number; sy: number; box: Box };

// Modal crop: แสดงรูปทั้งใบ + กรอบครอปที่ "ลากเลื่อน/ปรับขนาดได้" (ล็อกอัตราส่วน) มืดนอกกรอบ
export default function ImageCropModal({ src, onCancel, onConfirm, aspect = 1, maskShape = "circle" }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [disp, setDisp] = useState({ w: 0, h: 0, offX: 0, offY: 0 }); // ขนาด/ตำแหน่งรูปที่แสดงในพื้นที่ (จัดกึ่งกลาง)
  const [box, setBox] = useState<Box>({ x: 0, y: 0, w: 0, h: 0 });
  const [isBusy, setIsBusy] = useState(false);
  const drag = useRef<Drag | null>(null);

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    setNatural({ w, h });
    const scale = Math.min(AREA_W / w, AREA_H / h);
    const dw = w * scale;
    const dh = h * scale;
    const offX = (AREA_W - dw) / 2;
    const offY = (AREA_H - dh) / 2;
    setDisp({ w: dw, h: dh, offX, offY });

    // กรอบเริ่มต้น: อัตราส่วนที่กำหนด ใหญ่สุดเท่าที่พอดีในรูป แล้วย่อลงนิดให้เห็นว่าปรับได้
    let bw = dw;
    let bh = bw / aspect;
    if (bh > dh) {
      bh = dh;
      bw = bh * aspect;
    }
    bw *= 0.86;
    bh *= 0.86;
    setBox({ x: offX + (dw - bw) / 2, y: offY + (dh - bh) / 2, w: bw, h: bh });
  };

  const pos = (e: React.PointerEvent) => {
    const r = areaRef.current!.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };

  const startDrag = (e: React.PointerEvent, kind: Drag["kind"]) => {
    e.stopPropagation();
    areaRef.current?.setPointerCapture(e.pointerId);
    const { px, py } = pos(e);
    drag.current = { kind, sx: px, sy: py, box };
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const { px, py } = pos(e);
    const { kind, sx, sy, box: start } = drag.current;
    const L = disp.offX;
    const T = disp.offY;
    const R = disp.offX + disp.w;
    const B = disp.offY + disp.h;

    if (kind === "move") {
      const x = Math.min(R - start.w, Math.max(L, start.x + (px - sx)));
      const y = Math.min(B - start.h, Math.max(T, start.y + (py - sy)));
      setBox({ ...start, x, y });
      return;
    }

    // resize — ยึดมุมตรงข้ามไว้ ล็อกอัตราส่วน
    const goingRight = kind === "se" || kind === "ne";
    const goingDown = kind === "se" || kind === "sw";
    const anchorX = goingRight ? start.x : start.x + start.w;
    const anchorY = goingDown ? start.y : start.y + start.h;
    const spaceX = goingRight ? R - anchorX : anchorX - L;
    const spaceY = goingDown ? B - anchorY : anchorY - T;
    const maxW = Math.min(spaceX, spaceY * aspect);
    let w = Math.max(MIN_BOX, Math.min(Math.abs(px - anchorX), maxW));
    let h = w / aspect;
    if (h < MIN_BOX / aspect) {
      h = MIN_BOX / aspect;
      w = h * aspect;
    }
    const x = goingRight ? anchorX : anchorX - w;
    const y = goingDown ? anchorY : anchorY - h;
    setBox({ x, y, w, h });
  };

  const endDrag = () => {
    drag.current = null;
  };

  const handleConfirm = async () => {
    if (!imgRef.current || !natural.w || !disp.w) return;
    setIsBusy(true);
    try {
      const s = natural.w / disp.w; // สเกล จอ → รูปต้นฉบับ
      const srcX = (box.x - disp.offX) * s;
      const srcY = (box.y - disp.offY) * s;
      const srcW = box.w * s;
      const srcH = box.h * s;

      const outW = Math.round(aspect >= 1 ? OUTPUT_LONG : OUTPUT_LONG * aspect);
      const outH = Math.round(aspect >= 1 ? OUTPUT_LONG / aspect : OUTPUT_LONG);
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("ไม่รองรับการ crop รูปบนเบราว์เซอร์นี้");
      ctx.drawImage(imgRef.current, srcX, srcY, srcW, srcH, 0, 0, outW, outH);

      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
      if (!blob) throw new Error("แปลงรูปไม่สำเร็จ");
      await onConfirm(new File([blob], "crop.jpg", { type: "image/jpeg" }));
    } catch {
      setIsBusy(false);
    }
  };

  const round = maskShape === "circle";
  const corners: { c: Corner; cls: string }[] = [
    { c: "nw", cls: "left-0 top-0 border-l-2 border-t-2 rounded-tl" },
    { c: "ne", cls: "right-0 top-0 border-r-2 border-t-2 rounded-tr" },
    { c: "sw", cls: "left-0 bottom-0 border-l-2 border-b-2 rounded-bl" },
    { c: "se", cls: "right-0 bottom-0 border-r-2 border-b-2 rounded-br" },
  ];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={isBusy ? undefined : onCancel} />
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <h2 className="text-base font-bold text-gray-900">เลือกส่วนของรูป</h2>
          <button onClick={onCancel} disabled={isBusy} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-50" aria-label="ปิด">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-3 p-5">
          {/* พื้นที่รูป + กรอบครอป */}
          <div
            ref={areaRef}
            className="relative touch-none select-none overflow-hidden rounded-xl bg-neutral-900"
            style={{ width: AREA_W, height: AREA_H }}
            onPointerMove={onMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt="ครอปรูป"
              onLoad={onImgLoad}
              draggable={false}
              className="pointer-events-none absolute"
              style={{ left: disp.offX, top: disp.offY, width: disp.w, height: disp.h }}
            />

            {/* กรอบครอป — มืดนอกกรอบด้วยเงา, ลากตัวกรอบเพื่อเลื่อน */}
            {box.w > 0 && (
              <div
                onPointerDown={(e) => startDrag(e, "move")}
                className={`absolute cursor-move ${round ? "rounded-full" : "rounded"}`}
                style={{
                  left: box.x,
                  top: box.y,
                  width: box.w,
                  height: box.h,
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                  outline: "2px solid rgba(255,255,255,0.95)",
                }}
              >
                {/* ที่จับมุม (bracket) */}
                {corners.map(({ c, cls }) => (
                  <span
                    key={c}
                    onPointerDown={(e) => startDrag(e, c)}
                    className={`absolute h-6 w-6 border-white ${cls} ${
                      c === "nw" || c === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          <p className="text-center text-xs text-gray-400">ลากกรอบเพื่อเลื่อน · ลากที่มุมเพื่อย่อ/ขยาย (สัดส่วนคงที่)</p>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 p-4">
          <button onClick={onCancel} disabled={isBusy} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            ยกเลิก
          </button>
          <button onClick={handleConfirm} disabled={isBusy || !box.w} className="flex items-center gap-1.5 rounded-xl bg-[#CD0D13] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#A30A0E] disabled:opacity-60">
            <Check className="h-4 w-4" /> {isBusy ? "กำลังอัปโหลด..." : "ใช้รูปนี้"}
          </button>
        </div>
      </div>
    </div>
  );
}
