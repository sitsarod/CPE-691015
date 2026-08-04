// frontend/src/services/consentAPI.ts
import { apiFetch } from "@/services/apiClient";
import {
  FaceConsentStatus,
  FaceConsentPolicy,
  FaceConsentDecision,
} from "@/types/consent";

// [GET] ดึงเนื้อหาประกาศการเก็บข้อมูลใบหน้าฉบับปัจจุบัน (public — ไม่ต้องล็อกอิน)
export async function fetchFaceConsentPolicy(): Promise<FaceConsentPolicy> {
  const res = await apiFetch<{ data: FaceConsentPolicy }>("/consents/face/policy");
  return res.data;
}

// [GET] ดึงสถานะความยินยอมของผู้ใช้ที่ล็อกอินอยู่
export async function fetchMyFaceConsent(): Promise<FaceConsentStatus> {
  const res = await apiFetch<{ data: FaceConsentStatus }>("/consents/face/me");
  return res.data;
}

// [POST] บันทึกการยินยอม / ปฏิเสธ
//
// ไม่ต้องส่ง customer_id หรือ policy_version — backend ดึงตัวตนจาก JWT
// และกำหนดเวอร์ชันประกาศเองเพื่อไม่ให้หลักฐานการยินยอมถูกปลอมจากฝั่ง client
export async function recordFaceConsent(
  action: FaceConsentDecision
): Promise<FaceConsentStatus> {
  const res = await apiFetch<{ message: string; data: FaceConsentStatus }>(
    "/consents/face",
    {
      method: "POST",
      body: JSON.stringify({ action }),
    }
  );
  return res.data;
}

// [DELETE] ถอนความยินยอม (ระบบจะลบข้อมูลใบหน้าที่เก็บไว้ทั้งหมด)
export async function withdrawFaceConsent(): Promise<FaceConsentStatus> {
  const res = await apiFetch<{ message: string; data: FaceConsentStatus }>(
    "/consents/face",
    { method: "DELETE" }
  );
  return res.data;
}
