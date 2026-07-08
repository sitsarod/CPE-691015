// services/enrollmentAPI.ts
import { ApiResponse, Enrollment, Course } from "@/types/enrollment";

const BASE_URL = "http://localhost:8000/api";

export async function fetchCustomerEnrollments(customerId: string, token: string): Promise<Enrollment[]> {
  const response = await fetch(`${BASE_URL}/enrollments/customer/${customerId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error("ไม่สามารถดึงข้อมูลคอร์สเรียนได้");
  }

  const resData: ApiResponse<Enrollment[]> = await response.json();
  return resData.data || [];
}

export async function fetchAvailableCourses(token: string): Promise<Course[]> {
  const response = await fetch(`${BASE_URL}/enrollments/courses`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error("ไม่สามารถดึงข้อมูลคอร์สแนะนำได้");
  }

  const resData: ApiResponse<Course[]> = await response.json();
  return resData.data || [];
}