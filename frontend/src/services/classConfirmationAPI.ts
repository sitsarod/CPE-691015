import { apiFetch } from "@/services/apiClient";
import type {
  CancelClassInput,
  ClassHeadcount,
  ClassRoster,
  ConfirmClassInput,
  UpcomingClass,
} from "@/types/classConfirmation";

// [GET] คาบเรียนของตัวเองใน 7 วันข้างหน้า — อ้างตัวตนจาก JWT ไม่มี id ใน path
export async function fetchUpcomingClasses(): Promise<UpcomingClass[]> {
  const res = await apiFetch<{ data: UpcomingClass[] }>(
    "/class-confirmations/upcoming"
  );
  return res.data ?? [];
}

// [PUT] ยืนยันว่าจะมาเรียนคาบนั้น — ยิงซ้ำได้ผลเท่าเดิม
//
// 409 = เลยเที่ยงของวันที่เรียนแล้ว หรือคาบอยู่นอกช่วง 7 วัน
export async function confirmClass(
  input: ConfirmClassInput
): Promise<UpcomingClass> {
  const res = await apiFetch<{ message: string; data: UpcomingClass }>(
    "/class-confirmations",
    { method: "PUT", body: JSON.stringify(input) }
  );
  return res.data;
}

// [DELETE] ยกเลิกการยืนยัน — ยิงซ้ำได้ไม่ error
export async function cancelClassConfirmation(
  input: CancelClassInput
): Promise<UpcomingClass> {
  const res = await apiFetch<{ message: string; data: UpcomingClass }>(
    "/class-confirmations",
    { method: "DELETE", body: JSON.stringify(input) }
  );
  return res.data;
}

// [GET] ยอดคนที่ยืนยันจะมาเรียนวันนี้ (แอดมิน)
export async function fetchClassHeadcounts(): Promise<ClassHeadcount[]> {
  const res = await apiFetch<{ data: ClassHeadcount[] }>(
    "/admin/class-confirmations/headcount"
  );
  return res.data ?? [];
}

// [GET] รายชื่อนักเรียนของคาบหนึ่ง (แอดมิน)
// ระบุคาบด้วยแพ็กเกจ + วันที่ + เวลาเริ่ม ไม่ใช่ id เดี่ยว ๆ จึงส่งผ่าน query
export async function fetchClassRoster(
  packageId: number,
  classDate: string,
  startTime: string
): Promise<ClassRoster> {
  const qs = new URLSearchParams({
    package_id: String(packageId),
    date: classDate,
    start_time: startTime,
  });
  const res = await apiFetch<{ data: ClassRoster }>(
    `/admin/class-confirmations/roster?${qs}`
  );
  return res.data;
}
