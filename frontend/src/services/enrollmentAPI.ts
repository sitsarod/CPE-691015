// frontend/src/services/enrollmentAPI.ts
import { 
  ApiResponse, 
  Enrollment, 
  Course, 
  CreateEnrollmentReq, 
  CreateEnrollmentRes, 
  UpdateEnrollmentReq 
} from "@/types/enrollment";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;


// [GET] ดึงข้อมูลคอร์สที่เปิดสอน (Public)
export async function fetchAvailableCourses(token?: string): Promise<Course[]> {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}/enrollments/courses`, {
    method: "GET",
    headers,
  });

  const resData: ApiResponse<Course[]> = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || resData.message || "ไม่สามารถดึงข้อมูลคอร์สแนะนำได้");
  }
  return resData.data || [];
}

// [GET] ดึงประวัติการลงทะเบียนของลูกค้า (Protected)
export async function fetchCustomerEnrollments(customerId: string | number, token: string): Promise<Enrollment[]> {
  const response = await fetch(`${BASE_URL}/enrollments/customer/${customerId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });

  const resData: ApiResponse<Enrollment[]> = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || resData.message || "ไม่สามารถดึงข้อมูลคอร์สเรียนได้");
  }
  return resData.data || [];
}

// [POST] ลูกค้ากดสมัครเรียน (Protected)
export async function enrollCourse(data: CreateEnrollmentReq, token: string): Promise<CreateEnrollmentRes> {
  const response = await fetch(`${BASE_URL}/enrollments/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(data)
  });

  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || resData.message || "ไม่สามารถสมัครเรียนได้");
  }
  return resData; // เส้นนี้ Backend ส่งกลับมาเป็น { message, data: { enrollment_id, billing_id } }
}

// [PATCH] แอดมินแก้ไขข้อมูลการลงทะเบียน เช่น ตัดโควตา หรือเปลี่ยนสถานะ (Protected)
export async function updateEnrollment(id: number, data: UpdateEnrollmentReq, token: string): Promise<Enrollment> {
  const response = await fetch(`${BASE_URL}/enrollments/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(data)
  });

  const resData: ApiResponse<Enrollment> = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || resData.message || "ไม่สามารถอัปเดตข้อมูลการลงทะเบียนได้");
  }
  return resData.data;
}

// [DELETE] ยกเลิกการลงทะเบียน (Protected)
export async function cancelEnrollment(id: number, token: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/enrollments/${id}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });

  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || resData.message || "ไม่สามารถยกเลิกการลงทะเบียนได้");
  }
  return resData.message;
}