// frontend/src/services/personalQrAPI.ts
import { apiFetch } from "@/services/apiClient";

/** ข้อมูล QR ประจำตัว (ตรงกับ dto.PersonalQRResponse ฝั่ง backend) */
export interface PersonalQR {
  /** รหัสดิบที่ฝังอยู่ใน QR เช่น "QR_Kj3nP..." */
  code: string;
  /** รูป PNG แบบ data URL ใส่ใน <img src> ได้เลย */
  qrImage: string;
  /** ชื่อ-นามสกุล ใช้พิมพ์กำกับบนการ์ดตอนดาวน์โหลด */
  displayName: string;
  nickname: string;
  /** "customer" หรือ "coach" */
  role: string;
}

interface Wrapped<T> {
  data: T;
}

/**
 * [GET] ดึง QR ประจำตัวของผู้ใช้ที่ล็อกอินอยู่
 *
 * ดึงสดจากเซิร์ฟเวอร์ทุกครั้ง ไม่พึ่ง localStorage — ล้าง cache หรือเปลี่ยนเครื่อง
 * ก็ยังเห็น QR ได้โดยไม่ต้อง logout/login ใหม่
 *
 * เซิร์ฟเวอร์อ้างตัวตนจาก JWT อย่างเดียว จึงดึงของคนอื่นไม่ได้
 * แอดมินเรียกแล้วจะได้ 404 เพราะไม่มี QR ประจำตัว
 */
export async function getMyQRAPI(): Promise<PersonalQR> {
  const res = await apiFetch<Wrapped<PersonalQR>>("/me/qr", { method: "GET" });
  return res.data;
}
