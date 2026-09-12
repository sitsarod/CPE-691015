// อัตราส่วนแนะนำจำนวนโค้ช: โค้ช 1 คนต่อนักเรียนกี่คน
//
// ⚠️ เป็นกฎทางธุรกิจของทั้งองค์กร ไม่ใช่ค่าของเครื่องใครเครื่องนั้น
//
// เดิมเก็บใน localStorage ผลคือแอดมินสองคนเห็นคำแนะนำจำนวนโค้ชไม่ตรงกัน
// แล้วเถียงกันว่าใครถูก และค่าหายทุกครั้งที่ล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนเครื่อง
//
// ตอนนี้เก็บที่ backend (ตาราง app_settings) — อ่านได้ทุกคนที่ล็อกอิน แก้ได้เฉพาะแอดมิน
// ค่าเริ่มต้นต้องตรงกับ services.DefaultStudentsPerCoach ฝั่ง Go

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export const DEFAULT_STUDENTS_PER_COACH = 6;

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/**
 * โหลดค่าที่ตั้งไว้จาก backend
 *
 * ไม่โยน error โดยตั้งใจ — เป็นค่า "แนะนำ" จำนวนโค้ช ไม่ใช่ค่าที่ตัดสินเรื่องเงิน
 * หรือสิทธิ์ หน้าจัดตารางไม่ควรพังทั้งหน้าเพราะอ่านค่านี้ไม่ได้ (backend ก็คืน
 * ค่าเริ่มต้นให้เองเมื่ออ่านไม่ได้ ด้วยเหตุผลเดียวกัน)
 */
export async function fetchStudentsPerCoach(token: string): Promise<number> {
  try {
    const res = await fetch(`${BASE_URL}/settings/coach-ratio`, {
      method: "GET",
      headers: authHeaders(token),
    });
    if (!res.ok) return DEFAULT_STUDENTS_PER_COACH;

    const data = await res.json();
    const v = Number(data?.students_per_coach);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_STUDENTS_PER_COACH;
  } catch {
    return DEFAULT_STUDENTS_PER_COACH;
  }
}

/**
 * บันทึกค่าใหม่ (admin เท่านั้น)
 *
 * โยน error เมื่อบันทึกไม่สำเร็จ ต่างจากตอนอ่าน — คนกดปุ่มต้องรู้ว่าค่าไม่ได้ถูกบันทึก
 * ไม่ใช่ปิดหน้าไปแล้วคิดว่าเปลี่ยนแล้ว
 */
export async function saveStudentsPerCoach(n: number, token: string): Promise<number> {
  const safe = Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_STUDENTS_PER_COACH;

  const res = await fetch(`${BASE_URL}/admin/settings/coach-ratio`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ students_per_coach: safe }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "ไม่สามารถบันทึกอัตราส่วนโค้ชได้");
  }

  const data = await res.json();
  const v = Number(data?.students_per_coach);
  return Number.isFinite(v) && v > 0 ? v : safe;
}

/** จำนวนโค้ชที่ควรมีจากจำนวนนักเรียนที่ยืนยันมาเรียน */
export function suggestedCoaches(going: number, perCoach: number): number {
  return going > 0 && perCoach > 0 ? Math.ceil(going / perCoach) : 0;
}
