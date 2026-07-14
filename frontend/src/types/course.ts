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
  price: number;
  schedules: PackageScheduleInfoDTO[];
}

export interface CourseDTO {
  id: number;
  course_name: string;
  description: string;
  status: string;
  user?: CourseUserDTO;
  packages: CoursePackageDTO[];
}



export interface CreateCourseReq {
  course_name: string;
  description: string;
  status: string;
  user_id: number;
}

export interface UpdateCourseReq {
  course_name?: string;
  description?: string;
  status?: string;
}

export interface CreatePackageReq {
  course_id: number;
  sessions_count: number;
  hours_count: number;
  price: number;
  schedules: PackageScheduleInfoDTO[];
}

export interface UpdatePackageReq {
  sessions_count?: number;
  hours_count?: number;
  price?: number;
  schedules?: PackageScheduleInfoDTO[];
}