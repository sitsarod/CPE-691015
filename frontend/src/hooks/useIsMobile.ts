"use client";

import { useSyncExternalStore } from "react";

/**
 * บอกว่าตอนนี้หน้าจอแคบระดับมือถือหรือไม่
 *
 * ─── ทำไมไม่ใช้ useState + useEffect ───
 *
 * ขนาดหน้าจอเป็นค่าที่อยู่นอก React (เบราว์เซอร์เป็นเจ้าของ) React มี API
 * สำหรับกรณีนี้อยู่แล้วคือ useSyncExternalStore ซึ่งจัดการเรื่องการสมัครรับ
 * การเปลี่ยนแปลงและการเรนเดอร์ฝั่งเซิร์ฟเวอร์ให้ครบในตัว
 *
 * เขียนด้วย useState + useEffect ก็ได้ผลลัพธ์เหมือนกัน แต่จะเรนเดอร์สองรอบ
 * ทุกครั้งที่เข้าหน้า และ eslint จะฟ้องเรื่อง setState ใน effect ด้วย
 *
 * ─── ⚠️ ค่าตอนเรนเดอร์ฝั่งเซิร์ฟเวอร์ ───
 *
 * Next.js เรนเดอร์ HTML ที่เซิร์ฟเวอร์ก่อน ตอนนั้นยังไม่มีเบราว์เซอร์ จึงไม่มีทาง
 * รู้ขนาดจอ เราจึงตอบว่า "ไม่ใช่มือถือ" ไปก่อนเสมอ
 *
 * ถ้าเดาสุ่มหรือคืนค่าต่างจากรอบแรกฝั่งเบราว์เซอร์ จะเกิด hydration error
 * ซึ่งอาการคือหน้าเว็บกะพริบแล้วบางส่วนกดไม่ได้ ตามหาสาเหตุยากมาก
 *
 * ผลข้างเคียงที่ยอมรับ: คนเปิดด้วยมือถือจะเห็นหน้าจอคอมแวบหนึ่งก่อนสลับ
 * แลกกับความถูกต้องแล้วคุ้มกว่า
 *
 * 768px คือจุดตัด md ของ Tailwind ใช้ให้ตรงกันจะได้ไม่มีช่วงที่
 * โค้ดคิดว่าเป็นมือถือแต่ CSS คิดว่าเป็นคอม
 */
const MOBILE_QUERY = "(max-width: 767px)";

/**
 * ใช้ MediaQueryList ตัวเดียวร่วมกันทั้ง subscribe และ getSnapshot
 *
 * ⚠️ สร้างแบบ lazy ไม่ใช่ตอนโมดูลโหลด — ตอนเรนเดอร์ฝั่งเซิร์ฟเวอร์ยังไม่มี window
 * เลื่อนมาสร้างตอนถูกเรียกใช้ครั้งแรกจริง ๆ (ซึ่งเกิดขึ้นฝั่งเบราว์เซอร์เท่านั้น)
 */
let mql: MediaQueryList | null = null;
function getMql(): MediaQueryList {
  if (!mql) mql = window.matchMedia(MOBILE_QUERY);
  return mql;
}

function subscribe(onChange: () => void) {
  const m = getMql();
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getMql().matches,
    () => false, // ฝั่งเซิร์ฟเวอร์ตอบว่าไม่ใช่มือถือเสมอ
  );
}
