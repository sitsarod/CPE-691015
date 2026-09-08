import { useEffect, useRef } from "react";

/**
 * ตั้ง interval ที่ทำงานเฉพาะตอนแท็บนี้ "มองเห็นได้" (document.visibilityState === 'visible')
 *
 * ปัญหาที่แก้: ระบบแชท/แจ้งเตือนเดิม poll เซิร์ฟเวอร์ทุกไม่กี่วินาทีด้วย setInterval ธรรมดา
 * ซึ่งยังทำงานต่อเนื่องแม้ผู้ใช้จะย่อหน้าต่าง/สลับไปแท็บอื่น/ปล่อยเครื่องทิ้งไว้เฉยๆ พอ deploy จริง
 * ที่มีผู้ใช้เปิดค้างไว้จำนวนมาก ทำให้ backend โดนยิง request รัวๆ ตลอดเวลาโดยไม่มีใครใช้งานจริง
 *
 * hook นี้จะ:
 * - หยุด interval ทันทีเมื่อแท็บถูกซ่อน (document.hidden) — ไม่ยิง request ตอนไม่มีใครดูอยู่
 * - รีเฟรชข้อมูลทันที 1 ครั้งเมื่อกลับมาเปิดแท็บอีกครั้ง แล้วค่อยเริ่ม interval ใหม่ กันข้อมูลค้างเก่า
 *
 * @param callback ฟังก์ชันที่จะเรียกทุก delayMs (ไม่ต้อง memoize เอง — hook เก็บ ref ล่าสุดให้)
 * @param delayMs ความถี่ในการเรียก (มิลลิวินาที)
 * @param enabled false = ปิดการ poll ทั้งหมดชั่วคราว (เช่น ยังไม่มีห้องแชทที่ active ให้ poll)
 */
export function useVisibleInterval(callback: () => void, delayMs: number, enabled: boolean = true) {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    if (!enabled) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (intervalId) return;
      intervalId = setInterval(() => savedCallback.current(), delayMs);
    };
    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        savedCallback.current(); // กลับมาเปิดแท็บ — รีเฟรชทันทีก่อนเริ่ม poll ต่อ
        start();
      }
    };

    if (typeof document !== "undefined" && !document.hidden) start();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [delayMs, enabled]);
}
