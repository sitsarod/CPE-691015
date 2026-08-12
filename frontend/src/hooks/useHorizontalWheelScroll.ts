import { useEffect, useRef } from "react";

/**
 * ทำให้ container ที่ overflow แนวนอน เลื่อนได้หลายทาง แม้ซ่อน scrollbar:
 *  1) ลากด้วยเมาส์ (คลิกค้างแล้วลากซ้าย/ขวา) — drag to scroll
 *  2) ล้อเมาส์แนวตั้ง → เลื่อนแนวนอน
 *  (touchpad ปัดแนวนอนได้อยู่แล้วตามปกติ)
 *
 * - ทำงานเฉพาะเมื่อ container มี overflow แนวนอนจริง ๆ
 * - ล้อเมาส์: ถ้าสุดขอบแล้วปล่อยให้หน้าเว็บเลื่อนต่อ; ใช้ listener แบบ non-passive เพื่อ preventDefault ได้
 * - การลาก: มี threshold กันคลิกปกติ และกดคลิกที่โดนลาก (เช่นปุ่ม/ลิงก์) จะถูกยกเลิกไม่ให้ทำงานผิด
 */
export function useHorizontalWheelScroll<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const hasOverflow = () => el.scrollWidth > el.clientWidth;

    /* ---------- ล้อเมาส์แนวตั้ง → เลื่อนแนวนอน ---------- */
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || !hasOverflow()) return;
      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return; // สุดขอบ → ปล่อยหน้าเลื่อนต่อ
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };

    /* ---------- ลากด้วยเมาส์ → เลื่อนแนวนอน ---------- */
    let isDown = false;
    let dragged = false;
    let startX = 0;
    let startScroll = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.pointerType !== "mouse" || !hasOverflow()) return;
      isDown = true;
      dragged = false;
      startX = e.clientX;
      startScroll = el.scrollLeft;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      if (!dragged && Math.abs(dx) > 3) {
        dragged = true;
        el.style.userSelect = "none";
        el.style.cursor = "grabbing";
      }
      if (dragged) {
        el.scrollLeft = startScroll - dx;
        e.preventDefault();
      }
    };

    const endDrag = () => {
      if (!isDown) return;
      isDown = false;
      el.style.userSelect = "";
      el.style.cursor = "";
    };

    // ถ้าเพิ่งลาก ให้ยกเลิก click ที่ตามมา (กันไปโดนปุ่ม/ลิงก์ข้างใน)
    const onClickCapture = (e: MouseEvent) => {
      if (dragged) {
        e.preventDefault();
        e.stopPropagation();
        dragged = false;
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    el.addEventListener("click", onClickCapture, true);

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      el.removeEventListener("click", onClickCapture, true);
    };
  }, []);

  return ref;
}
