import React from "react";

/* ---------- หัวข้อหมวดแบบ editorial (ชื่อไทย + meta + ช่องขวา + เส้นคั่นล่าง) ---------- */
export function SectionHeader({
  title,
  meta,
  right,
}: {
  title: string;
  meta?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4 border-b border-gray-200 pb-4">
      <div className="flex min-w-0 items-baseline gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-gray-900 sm:text-xl">{title}</h2>
        {meta && (
          <span className="whitespace-nowrap text-[13px] font-light text-gray-500">{meta}</span>
        )}
      </div>
      {right && <div className="flex-none">{right}</div>}
    </div>
  );
}
