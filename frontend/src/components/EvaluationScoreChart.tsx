"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Evaluation } from "@/types/evaluation";

interface EvaluationScoreChartProps {
  evaluations: Evaluation[];
}

const HEIGHT = 180;
const PADDING = { top: 26, right: 12, bottom: 30, left: 34 };
const GRID_SCORES = [0, 50, 100];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

// แนวโน้มคะแนนของนักเรียนคนเดียวข้ามหลายครั้งที่ถูกประเมิน — ซีรีส์เดียวจึงไม่ต้องมี legend
// (ชื่อกราฟบอกอยู่แล้วว่าคือคะแนนอะไร) ใช้สีแดงของแบรนด์ (#CC0000) เป็นสีเส้นเดียว
//
// ⚠️ viewBox ต้องเท่ากับความกว้างจริงที่วัดได้ (ผ่าน ResizeObserver) ไม่ใช่ค่าคงที่แล้วปล่อยให้ CSS
// ย่อทั้งรูป เพราะถ้าย่อ ตัวหนังสือใน SVG จะเล็กตามไปด้วย (จอมือถือแคบ ~340px แต่ viewBox 640
// จะย่อเหลือ ~53% ทำให้ font-size 10 กลายเป็น ~5px มองไม่ออก) การวัดความกว้างจริงแล้วตั้ง viewBox
// ให้ตรงกัน ทำให้ 1 หน่วยใน SVG = 1px จริงบนจอเสมอ ไม่ว่าจอจะกว้างแค่ไหน
export default function EvaluationScoreChart({ evaluations }: EvaluationScoreChartProps) {
  const points = useMemo(
    () =>
      [...evaluations].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    [evaluations]
  );

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(320);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plotW = width - PADDING.left - PADDING.right;
  const plotH = HEIGHT - PADDING.top - PADDING.bottom;

  const xFor = (i: number) => PADDING.left + (points.length <= 1 ? 0 : (i / (points.length - 1)) * plotW);
  const yFor = (score: number) => PADDING.top + plotH - (score / 100) * plotH;

  const linePath =
    points.length > 1 ? points.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.score)}`).join(" ") : "";

  const nearestIndexToClientX = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    let best = Infinity;
    points.forEach((_, i) => {
      const d = Math.abs(xFor(i) - relX);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    return nearest;
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const idx = nearestIndexToClientX(e.clientX);
    if (idx !== null) setHoverIndex(idx);
  };

  const handleKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setHoverIndex((prev) => Math.min((prev ?? points.length - 1) + 1, points.length - 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setHoverIndex((prev) => Math.max((prev ?? points.length - 1) - 1, 0));
    }
  };

  // ต้องมีอย่างน้อย 2 จุดถึงจะเรียกว่า "แนวโน้ม" ได้ — จุดเดียวไม่มีอะไรให้ดูเป็นกราฟ
  if (points.length < 2) return null;

  const activeIndex = hoverIndex ?? points.length - 1;
  const activePoint = points[activeIndex];
  const latest = points[points.length - 1];

  return (
    <div ref={containerRef} className="rounded-2xl border border-gray-200 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-bold text-gray-900">แนวโน้มคะแนน</h4>
        <span className="text-xs text-gray-400">{points.length} ครั้ง</span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        style={{ width: "100%", height: HEIGHT }}
        className="touch-pan-y"
        tabIndex={0}
        role="img"
        aria-label={`แนวโน้มคะแนนจากการประเมิน ${points.length} ครั้ง คะแนนล่าสุด ${latest.score} จาก 100`}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
        onKeyDown={handleKeyDown}
      >
        {GRID_SCORES.map((g) => (
          <g key={g}>
            <line x1={PADDING.left} x2={width - PADDING.right} y1={yFor(g)} y2={yFor(g)} stroke="#e1e0d9" strokeWidth={1} />
            <text x={PADDING.left - 8} y={yFor(g)} textAnchor="end" dominantBaseline="middle" fontSize={13} fill="#6b7280">
              {g}
            </text>
          </g>
        ))}

        {hoverIndex !== null && (
          <line
            x1={xFor(hoverIndex)}
            x2={xFor(hoverIndex)}
            y1={PADDING.top}
            y2={HEIGHT - PADDING.bottom}
            stroke="#c3c2b7"
            strokeWidth={1}
          />
        )}

        <path d={linePath} fill="none" stroke="#CC0000" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

        {points.map((p, i) => (
          <circle
            key={p.id}
            cx={xFor(i)}
            cy={yFor(p.score)}
            r={i === activeIndex ? 6 : 5}
            fill="#CC0000"
            stroke="#ffffff"
            strokeWidth={2}
          />
        ))}

        {/* ค่าปลายเส้น (ครั้งล่าสุด) — label ตรงๆ แค่จุดนี้จุดเดียวตามหลัก "อย่าใส่เลขทุกจุด" */}
        <text
          x={xFor(points.length - 1)}
          y={Math.max(yFor(latest.score) - 12, 14)}
          textAnchor="end"
          fontSize={16}
          fontWeight={800}
          fill="#0b0b0b"
        >
          {latest.score}
        </text>

        <text x={xFor(0)} y={HEIGHT - 8} textAnchor="start" fontSize={12} fill="#6b7280">
          {fmtDate(points[0].created_at)}
        </text>
        <text x={xFor(points.length - 1)} y={HEIGHT - 8} textAnchor="end" fontSize={12} fill="#6b7280">
          {fmtDate(latest.created_at)}
        </text>
      </svg>

      {/* tooltip — ค่าเดียวกับที่โชว์ในการ์ดรายการด้านล่างอยู่แล้ว (ไม่มีอะไรถูกซ่อนไว้แค่ในกราฟ) */}
      <div className="mt-2 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5 text-sm">
        <span className="text-gray-500">{fmtDate(activePoint.created_at)}</span>
        <span className="font-bold text-gray-900">{activePoint.score}/100</span>
      </div>
    </div>
  );
}
