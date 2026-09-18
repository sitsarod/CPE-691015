"use client";

import { useRef } from "react";

interface TabItem<T extends string> {
  key: T;
  label: string;
}

interface AdminTabsProps<T extends string> {
  tabs: TabItem<T>[];
  active: T;
  onChange: (key: T) => void;
}

/** ระยะลากขั้นต่ำ (px) ก่อนจะนับว่าเป็นการปัดเปลี่ยนแท็บ ไม่ใช่แค่คลิกมือสั่น */
const SWIPE_THRESHOLD_PX = 40;

/**
 * แถบแท็บมาตรฐานของหน้าแอดมิน — ใช้ร่วมกันได้ทุกหน้าที่ต้องสลับมุมมองแบบนี้
 *
 * สลับแท็บได้สามทาง: คลิก/แตะที่แท็บตรง ๆ, ลากเมาส์/ปัดนิ้วซ้ายขวาบนแถบแท็บ,
 * หรือกดลูกศรซ้าย/ขวาตอนโฟกัสอยู่ที่แท็บ (ตามแพทเทิร์น ARIA tablist มาตรฐาน
 * จึงได้ roving tabindex — Tab คีย์กระโดดเข้าแท็บที่เลือกอยู่ช่องเดียว ไม่ต้องไล่ทีละปุ่ม)
 */
export function AdminTabs<T extends string>({ tabs, active, onChange }: AdminTabsProps<T>) {
  const dragStartX = useRef<number | null>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const activeIndex = tabs.findIndex((t) => t.key === active);

  const goTo = (index: number, focus = false) => {
    const clamped = Math.max(0, Math.min(tabs.length - 1, index));
    const next = tabs[clamped];
    onChange(next.key);
    if (focus) btnRefs.current[next.key]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(activeIndex + 1, true);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(activeIndex - 1, true);
    } else if (e.key === "Home") {
      e.preventDefault();
      goTo(0, true);
    } else if (e.key === "End") {
      e.preventDefault();
      goTo(tabs.length - 1, true);
    }
  };

  // ปัด/ลากบนแถบแท็บเพื่อสลับไปแท็บถัดไป-ก่อนหน้า — ใช้ Pointer Events
  // เพราะรองรับทั้งเมาส์และนิ้วสัมผัสด้วยโค้ดชุดเดียว ไม่ต้องแยก touch/mouse
  const handlePointerDown = (e: React.PointerEvent) => {
    dragStartX.current = e.clientX;
  };

  const endDrag = (e: React.PointerEvent) => {
    if (dragStartX.current == null) return;
    const delta = e.clientX - dragStartX.current;
    dragStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    // ลากไปทางซ้าย (delta ติดลบ) = ไปแท็บถัดไป, ลากไปทางขวา = ย้อนกลับ
    goTo(delta < 0 ? activeIndex + 1 : activeIndex - 1);
  };

  return (
    <div
      role="tablist"
      className="mb-4 flex touch-pan-y select-none gap-1 overflow-x-auto border-b border-gray-200"
      onPointerDown={handlePointerDown}
      onPointerUp={endDrag}
      onPointerCancel={() => { dragStartX.current = null; }}
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          ref={(el) => { btnRefs.current[t.key] = el; }}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          tabIndex={active === t.key ? 0 : -1}
          onClick={() => onChange(t.key)}
          onKeyDown={handleKeyDown}
          className={`whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 ${
            active === t.key
              ? "border-[#E63946] text-[#E63946]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
