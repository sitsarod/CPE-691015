// frontend/src/services/enrollmentAPI.ts
import {
  ApiResponse,
  Enrollment,
  AdminEnrollment,
  EnrollmentReview,
  CreateEnrollmentReq,
  CreateEnrollmentRes,
  UpdateEnrollmentReq,
  ExtendEnrollmentReq,
  ExtendEnrollmentRes,
  EnrollmentExtension
} from "@/types/enrollment";
import { CourseDTO } from "@/types/course";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;


// [GET] ดึงข้อมูลคอร์สที่เปิดสอน (Public)
//
// คืน CourseDTO ตัวเดียวกับ /courses เพราะ backend ใช้ mapper ตัวเดียวกันแล้ว
// (services/course_mapper.go) จึงรับประกันว่าโครงสร้างเหมือนกันทุกฟิลด์
export async function fetchAvailableCourses(token?: string): Promise<CourseDTO[]> {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}/enrollments/courses`, {
    method: "GET",
    headers,
  });

  const resData: ApiResponse<CourseDTO[]> = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || resData.message || "ไม่สามารถดึงข้อมูลคอร์สแนะนำได้");
  }
  return resData.data || [];
}

// [GET] ดึงประวัติการลงทะเบียนของลูกค้า (Protected)
export async function fetchCustomerEnrollments(customerId: string | number, token: string): Promise<Enrollment[]> {
  const cleanToken = token.trim().replace(/[\r\n]/g, '');
  const response = await fetch(`${BASE_URL}/enrollments/customer/${customerId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cleanToken}`
    }
  });

  const resData: ApiResponse<Enrollment[]> = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || resData.message || "ไม่สามารถดึงข้อมูลคอร์สเรียนได้");
  }
  return resData.data || [];
}

// [GET] ดึงประวัติการลงทะเบียนทั้งหมด (สำหรับแอดมิน)
export async function fetchAllEnrollments(token: string): Promise<AdminEnrollment[]> {
  const cleanToken = (token || "").trim().replace(/[\r\n]/g, '');
  const response = await fetch(`${BASE_URL}/enrollments/`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cleanToken}`
    }
  });

  const resData: ApiResponse<AdminEnrollment[]> = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || resData.message || "ไม่สามารถดึงข้อมูลได้");
  }
  return resData.data || [];
}

// [GET] ดึงข้อมูลผู้สมัครแบบละเอียดสำหรับตรวจสอบก่อนอนุมัติ (แอดมิน)
//
// แยกเป็นคนละ endpoint กับรายการทั้งหมดโดยตั้งใจ — ข้อมูลชุดนี้ต้อง query เพิ่มหลายรอบ
// จึงเรียกเฉพาะตอนแอดมินกดเปิดดูจริง ไม่ใช่โหลดมาพร้อมทั้งตาราง
export async function fetchEnrollmentReview(id: number, token: string): Promise<EnrollmentReview> {
  const cleanToken = (token || "").trim().replace(/[\r\n]/g, '');
  const response = await fetch(`${BASE_URL}/admin/enrollments/${id}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cleanToken}`
    }
  });

  const resData: ApiResponse<EnrollmentReview> = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || resData.message || "ไม่สามารถดึงข้อมูลผู้สมัครได้");
  }
  return resData.data;
}

// [POST] แอดมินขยายระยะเวลาเรียนให้นักเรียนรายบุคคล (adminOnly)
export async function extendEnrollment(
  id: number,
  data: ExtendEnrollmentReq,
  token: string
): Promise<ExtendEnrollmentRes> {
  const cleanToken = (token || "").trim().replace(/[\r\n]/g, '');
  const response = await fetch(`${BASE_URL}/admin/enrollments/${id}/extend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cleanToken}`
    },
    body: JSON.stringify(data)
  });

  const resData: ApiResponse<ExtendEnrollmentRes> = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || resData.message || "ไม่สามารถขยายระยะเวลาได้");
  }
  return resData.data;
}

// [GET] ประวัติการขยายเวลาของการลงทะเบียนใบหนึ่ง (adminOnly)
export async function fetchEnrollmentExtensions(
  id: number,
  token: string
): Promise<EnrollmentExtension[]> {
  const cleanToken = (token || "").trim().replace(/[\r\n]/g, '');
  const response = await fetch(`${BASE_URL}/admin/enrollments/${id}/extensions`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cleanToken}`
    }
  });

  const resData: ApiResponse<EnrollmentExtension[]> = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || resData.message || "ไม่สามารถดึงประวัติการขยายเวลาได้");
  }
  return resData.data ?? [];
}

// [POST] ลูกค้ากดสมัครเรียน (Protected)
export async function enrollCourse(data: CreateEnrollmentReq, token: string): Promise<CreateEnrollmentRes> {
  const cleanToken = (token || "").trim().replace(/[\r\n]/g, '');
  const response = await fetch(`${BASE_URL}/enrollments/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cleanToken}`
    },
    body: JSON.stringify(data)
  });

  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || resData.message || "ไม่สามารถสมัครเรียนได้");
  }
  return resData; // เส้นนี้ Backend ส่งกลับมาเป็น { message, data: { enrollment_id, billing_id } }
}

// [PATCH] แอดมินปฏิเสธคำขอสมัครพร้อมเหตุผล (Admin)
//
// เหตุผลถูกส่งต่อไปหานักเรียน จึงบังคับ 3–500 ตัวอักษร · เฉพาะใบ pending ไม่งั้นได้ 409
export async function rejectEnrollment(id: number, reason: string, token: string): Promise<void> {
  const cleanToken = (token || "").trim().replace(/[\r\n]/g, '');
  const response = await fetch(`${BASE_URL}/admin/enrollments/${id}/reject`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cleanToken}`
    },
    body: JSON.stringify({ reason })
  });

  if (!response.ok) {
    const resData = await response.json().catch(() => null);
    throw new Error(
      resData?.error ||
        resData?.message ||
        `ไม่สามารถปฏิเสธคำขอได้ (HTTP ${response.status})`
    );
  }
}

// [PATCH] นักเรียนถอนใบสมัครของตัวเอง (Protected)
//
// เฉพาะใบ pending ไม่งั้นได้ 409 · ตัวตนคนถอนมาจาก JWT ไม่ใช่ id ใน path
export async function cancelMyEnrollment(id: number, token: string): Promise<void> {
  const cleanToken = (token || "").trim().replace(/[\r\n]/g, '');
  const response = await fetch(`${BASE_URL}/enrollments/${id}/cancel`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cleanToken}`
    }
  });

  if (!response.ok) {
    // แนบ status code เมื่อ body ไม่ใช่ JSON ของเรา — เช่น 404 text ล้วนของ Gin
    // ที่แปลว่า route ยังไม่มีในเซิร์ฟเวอร์ที่รันอยู่ ไม่ใช่ตรรกะการยกเลิกผิด
    const resData = await response.json().catch(() => null);
    throw new Error(
      resData?.error ||
        resData?.message ||
        `ไม่สามารถยกเลิกใบสมัครได้ (HTTP ${response.status})`
    );
  }
}

// [PATCH] แอดมินแก้ไขข้อมูลการลงทะเบียน เช่น ตัดโควตา หรือเปลี่ยนสถานะ (Protected)
export async function updateEnrollment(id: number, data: UpdateEnrollmentReq, token: string): Promise<Enrollment> {
  const cleanToken = token.trim().replace(/[\r\n]/g, '');
  const response = await fetch(`${BASE_URL}/enrollments/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cleanToken}`
    },
    body: JSON.stringify(data)
  });

  const resData: ApiResponse<Enrollment> = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || resData.message || "ไม่สามารถอัปเดตข้อมูลการลงทะเบียนได้");
  }
  return resData.data;
}

// [PATCH] อนุมัติการลงทะเบียนและสร้างบิล
export async function approveEnrollment(id: number, token: string): Promise<Enrollment> {
  const cleanToken = token.trim().replace(/[\r\n]/g, '');
  const response = await fetch(`${BASE_URL}/enrollments/${id}/approve`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cleanToken}`
    }
  });

  const resData: ApiResponse<Enrollment> = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || resData.message || "ไม่สามารถอนุมัติได้");
  }
  return resData.data;
}

// [DELETE] ยกเลิกการลงทะเบียน (Protected)
export async function cancelEnrollment(id: number, token: string): Promise<string> {
  const cleanToken = token.trim().replace(/[\r\n]/g, '');
  const response = await fetch(`${BASE_URL}/enrollments/${id}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${cleanToken}`
    }
  });

  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || resData.message || "ไม่สามารถยกเลิกการลงทะเบียนได้");
  }
  return resData.message;
}