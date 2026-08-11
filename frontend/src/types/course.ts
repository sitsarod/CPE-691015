// frontend/src/types/course.ts

export interface ApiResponse<T> {
  data: T;
  message?: string;
  error?: string;
}

export interface CourseUserDTO {
  firstname: string;
  lastname: string;
  email: string;
}

export interface PackageScheduleInfoDTO {
  day_of_week: string;
  start_time: string;
  end_time: string;
}

export interface CoursePackageDTO {
  id: number;
  sessions_count: number;
  hours_count: number;
  max_seats?: number;
  current_enrollments?: number;
  price: number;
  duration_days?: number;
  schedules: PackageScheduleInfoDTO[];
}

export interface CourseDTO {
  id: number;
  course_name: string;
  description: string;
  status: string;
  /** สิ่งที่จะได้เรียนรู้ — backend คืนเป็น [] เสมอ ไม่เคยเป็น null */
  learning_outcomes: string[];
  user?: CourseUserDTO;
  packages: CoursePackageDTO[];
}



export interface CreateCourseReq {
  course_name: string;
  description: string;
  status: string;
  learning_outcomes?: string[];
  // เจ้าของคอร์สถูกกำหนดจาก JWT ที่ backend (C2) — ไม่ส่ง user_id จาก client อีกต่อไป
}

export interface UpdateCourseReq {
  course_name?: string;
  description?: string;
  status?: string;
  learning_outcomes?: string[];
}

export interface CreatePackageReq {
  course_id: number;
  sessions_count: number;
  hours_count: number;
  max_seats: number;
  price: number;
  duration_days?: number;
  schedules: PackageScheduleInfoDTO[];
}

export interface UpdatePackageReq {
  sessions_count?: number;
  hours_count?: number;
  max_seats?: number;
  price?: number;
  duration_days?: number;
  schedules?: PackageScheduleInfoDTO[];
}

export interface ScheduleFormInput {
  id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
}

export interface PackageFormInput {
  id: string;
  isNew?: boolean;
  sessions_count: number | "";
  hours_count: number | "";
  max_seats: number | "";
  price: number | "";
  duration_days: number | "";
  schedules: ScheduleFormInput[];
}