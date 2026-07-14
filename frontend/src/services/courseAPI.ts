// frontend/src/services/courseAPI.ts
import { 
  CourseDTO, 
  CreateCourseReq, 
  UpdateCourseReq, 
  CreatePackageReq, 
  UpdatePackageReq 
} from "@/types/course";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";



// [GET] ดึงคอร์สเรียนทั้งหมด (Public)
export async function fetchAllCourses(): Promise<CourseDTO[]> {
  const response = await fetch(`${BASE_URL}/courses/`, {
    method: "GET",
    headers: { "Content-Type": "application/json" }
  });

  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ไม่สามารถดึงข้อมูลคอร์สเรียนได้");
  }
  return resData.data || [];
}

// [GET] ดึงคอร์สเรียนตาม ID (Public)
export async function fetchCourseByID(id: number): Promise<CourseDTO> {
  const response = await fetch(`${BASE_URL}/courses/${id}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" }
  });

  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ไม่พบข้อมูลคอร์สเรียน");
  }
  return resData.data;
}

// [POST] สร้างคอร์สเรียนใหม่ (Protected)
export async function createCourse(courseData: CreateCourseReq, token: string): Promise<CourseDTO> {
  const response = await fetch(`${BASE_URL}/courses/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(courseData)
  });

  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ไม่สามารถสร้างคอร์สเรียนได้");
  }
  return resData.data;
}

// [PATCH] อัปเดตคอร์สเรียน (Protected)
export async function updateCourse(id: number, courseData: UpdateCourseReq, token: string): Promise<CourseDTO> {
  const response = await fetch(`${BASE_URL}/courses/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(courseData)
  });

  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ไม่สามารถอัปเดตข้อมูลคอร์สเรียนได้");
  }
  return resData.data;
}

// [DELETE] ลบคอร์สเรียน (Protected)
export async function deleteCourse(id: number, token: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/courses/${id}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });

  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ไม่สามารถลบข้อมูลคอร์สเรียนได้");
  }
  return resData.message;
}


// [POST] สร้างแพ็กเกจให้คอร์ส (Protected)
export async function createPackage(packageData: CreatePackageReq, token: string): Promise<CourseDTO> {
  const response = await fetch(`${BASE_URL}/packages/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(packageData)
  });

  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ไม่สามารถสร้างแพ็กเกจได้");
  }
  return resData.data;
}

// [PATCH] อัปเดตแพ็กเกจ (Protected)
export async function updatePackage(id: number, packageData: UpdatePackageReq, token: string): Promise<CourseDTO> {
  const response = await fetch(`${BASE_URL}/packages/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(packageData)
  });

  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ไม่สามารถอัปเดตข้อมูลแพ็กเกจได้");
  }
  return resData.data;
}

// [DELETE] ลบแพ็กเกจ (Protected)
export async function deletePackage(id: number, token: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/packages/${id}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });

  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ไม่สามารถลบแพ็กเกจได้");
  }
  return resData.message;
}