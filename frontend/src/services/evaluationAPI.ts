// frontend/src/services/evaluationAPI.ts
import { apiFetch } from "@/services/apiClient";
import type { CreateEvaluationInput, EvaluableCourse, EvaluableStudent, Evaluation } from "@/types/evaluation";

// [GET] รายชื่อนักเรียนที่ลงทะเบียนเรียนกับโค้ชที่ล็อกอินอยู่ (เฉพาะ role coach)
// courseId ไม่ใส่ = รวมทุกคอร์สเหมือนเดิม ใส่มา = กรองเฉพาะนักเรียนของคอร์สนั้น
export async function fetchMyStudents(courseId?: number): Promise<EvaluableStudent[]> {
  const qs = courseId != null ? `?course_id=${courseId}` : "";
  const res = await apiFetch<{ data: EvaluableStudent[] }>(`/evaluations/students${qs}`);
  return res.data ?? [];
}

// [GET] รายชื่อคอร์สที่โค้ชที่ล็อกอินอยู่มีตารางสอนอยู่จริง (เฉพาะ role coach)
export async function fetchMyCourses(): Promise<EvaluableCourse[]> {
  const res = await apiFetch<{ data: EvaluableCourse[] }>("/evaluations/courses");
  return res.data ?? [];
}

// [GET] ประวัติการประเมินทั้งหมดที่โค้ชที่ล็อกอินอยู่เคยให้ไว้ (ทุกนักเรียน)
export async function fetchMyGivenEvaluations(): Promise<Evaluation[]> {
  const res = await apiFetch<{ data: Evaluation[] }>("/evaluations/me/given");
  return res.data ?? [];
}

// [GET] ประวัติการประเมินของตัวเอง (สำหรับนักเรียนที่ล็อกอินอยู่)
export async function fetchMyEvaluations(): Promise<Evaluation[]> {
  const res = await apiFetch<{ data: Evaluation[] }>("/evaluations/me");
  return res.data ?? [];
}

// [GET] ประวัติการประเมินของนักเรียนคนหนึ่ง (โค้ชดูได้เฉพาะนักเรียนของตัวเอง)
export async function fetchStudentEvaluations(customerId: number): Promise<Evaluation[]> {
  const res = await apiFetch<{ data: Evaluation[] }>(`/evaluations/student/${customerId}`);
  return res.data ?? [];
}

// [POST] บันทึกการประเมินนักเรียน (เฉพาะ role coach)
export async function createEvaluation(input: CreateEvaluationInput): Promise<Evaluation> {
  const res = await apiFetch<{ message: string; data: Evaluation }>("/evaluations", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}
