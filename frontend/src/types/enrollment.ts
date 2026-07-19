// frontend/src/types/enrollment.ts

export interface ApiResponse<T> {
  data: T;
  message?: string;
  error?: string;
}

export interface CourseInfo {
  ID?: number;
  id?: number;
  course_name: string;
}

export interface ScheduleInfo {
  id: number;
  package_id?: number;
  day_of_week: string;
  start_time: string;
  end_time: string;
}

export interface PackageInfo {
  ID?: number;
  id?: number;
  course_id?: number;
  price: number;
  sessions_count: number;
  hours_count?: number;
  course?: CourseInfo;
  schedules?: ScheduleInfo[];
  course_name?: string;
}

export interface Enrollment {
  ID?: number;
  id?: number;
  enrollment_date: string;
  total_sessions: number;
  remaining_sessions: number;
  is_schedule_unlocked: boolean;
  status: string;
  billing_id: number | null;
  package: PackageInfo;
}

export interface Course {
  ID?: number;
  id?: number;
  course_name: string;
  description: string;
  status: string;
  packages?: PackageInfo[];
}



export interface CreateEnrollmentReq {
  customer_id: number;
  package_id: number;
}

export interface CreateEnrollmentData {
  enrollment_id: number;
  billing_id: number | null;
}

export interface CreateEnrollmentRes {
  message: string;
  data: CreateEnrollmentData;
}

export interface UpdateEnrollmentReq {
  status?: string; // active, completed, cancelled
  remaining_sessions?: number;
}