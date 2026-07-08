// types/enrollment.ts

export interface CourseInfo {
  id: number;
  course_name: string; 
}

export interface PackageInfo {
  id: number;
  course_id: number;
  price: number;
  sessions_count: number;
  course?: CourseInfo; 
}

export interface ScheduleInfo {
  id: number;
  day_of_week: string;
  start_time: string;
  end_time: string;
}

export interface Enrollment {
  ID: number; 
  enrollment_date: string;
  total_sessions: number;
  remaining_sessions: number;
  is_schedule_unlocked: boolean;
  status: string;
  billing_id: number | null;
  package: PackageInfo;
  weekly_schedules: ScheduleInfo[];
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
  error?: string;
}

export interface Course {
  ID: number;
  course_name: string;
  description: string;
  status: string;
  Packages?: PackageInfo[]; 
  packages?: PackageInfo[];
}