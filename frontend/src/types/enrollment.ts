// frontend/src/types/enrollment.ts

export interface ApiResponse<T> {
  data: T;
  message?: string;
  error?: string;
}

export interface ScheduleInfo {
  id: number;
  package_id?: number;
  day_of_week: string;
  start_time: string;
  end_time: string;
}


export interface EnrollmentCourseInfo {
  id: number;
  course_name: string;
}

export interface EnrollmentPackageInfo {
  id: number;
  sessions_count: number;
  hours_count: number;
  price: number;
  schedules: ScheduleInfo[];
  course: EnrollmentCourseInfo | null;
}

export interface Enrollment {
  id: number;
  enrollment_date: string;
  total_sessions: number;
  remaining_sessions: number;
  attended_sessions: number;
  status: string;
  billing_id: number | null;
  package: EnrollmentPackageInfo | null;

  started_at: string | null;
  expires_at: string | null;
  days_left: number | null;
  is_overdue: boolean;
}



export interface AdminEnrollmentCustomer {
  first_name: string;
  last_name: string;
  email: string;
  nickname: string;
}

export interface AdminEnrollmentCourse {
  id: number;
  course_name: string;
}

export interface AdminEnrollmentPackage {
  id: number;
  sessions_count: number;
  price: number;
  course: AdminEnrollmentCourse | null;
}

export interface AdminEnrollment {
  id: number;
  enrollment_date: string;
  total_sessions: number;
  remaining_sessions: number;
  status: string;
  billing_id: number | null;
  started_at: string | null;
  expires_at: string | null;
  days_left: number | null;
  is_overdue: boolean;
  customer: AdminEnrollmentCustomer | null;
  package: AdminEnrollmentPackage | null;
}



export interface ReviewEnrollmentInfo {
  id: number;
  status: string;
  enrollment_date: string;
  total_sessions: number;
  remaining_sessions: number;
  billing_id: number | null;
  /** จำนวนวันที่คำขอนี้รออยู่ */
  waiting_days: number;
  started_at: string | null;
  expires_at: string | null;
  days_left: number | null;
}

export interface ReviewCustomerInfo {
  /** users.id — ค่าที่ API ทุกเส้นรับ-ส่ง */
  user_id: number;
  /** customers.id — ⚠️ ห้ามเอาไปยิง API ที่ต้องการ users.id */
  customer_id: number;
  first_name: string;
  last_name: string;
  nickname: string;
  email: string;
  phone: string;
  birth_date: string | null;
  age: number | null;
  gender: string;
  parent_email: string;
  parent_phone: string;
  status: string;
  face_consent_status: string;
  member_since: string;
}

export interface ReviewPackageInfo {
  id: number;
  course_id: number;
  course_name: string;
  course_status: string;
  sessions_count: number;
  hours_count: number;
  price: number;
  duration_days: number;
  max_seats: number;
  active_count: number;
  /** คำขอที่ยังรออนุมัติ (รวมใบนี้) */
  pending_count: number;
  seats_left: number;
  would_exceed_if_all_approved: boolean;
  schedules: ScheduleInfo[];
}

export interface ReviewFinanceInfo {
  unpaid_count: number;
  unpaid_amount: number;
  overdue_count: number;
  overdue_amount: number;
  waitcheck_count: number;
  waitcheck_amount: number;
  paid_count: number;
  paid_amount: number;
}

export interface ReviewOtherEnrollment {
  id: number;
  course_name: string;
  sessions_count: number;
  remaining_sessions: number;
  status: string;
  enrollment_date: string;
}

export interface EnrollmentReview {
  enrollment: ReviewEnrollmentInfo;
  customer: ReviewCustomerInfo;
  package: ReviewPackageInfo;
  finance: ReviewFinanceInfo;
  other_enrollments: ReviewOtherEnrollment[];
}

export interface FormattedEnrollment {
  id: number;
  courseName: string;
  sessionsCount: number;
  totalSessions: number;
  remainingSessions: number;
  attendedSessions: number;
  status: string;
  schedules: ScheduleInfo[];
  unifiedTime: string;
}

// หมายเหตุ: เดิมมี interface Course / PackageInfo / CourseInfo อยู่ที่ไฟล์นี้
// ซึ่งซ้ำซ้อนกับ CourseDTO ใน types/course.ts และมีฟิลด์ ID/id ทั้งคู่เพราะไม่แน่ใจว่า
// backend ส่งอะไรมา ตอนนี้ backend คืน DTO ที่มี json tag ชัดเจนแล้ว จึงลบทิ้ง
// และให้ทุกที่ใช้ CourseDTO จาก @/types/course แหล่งเดียว


export interface ExtendEnrollmentReq {
  extend_days: number;
  reason: string;
}

export interface EnrollmentExtension {
  id: number;
  enrollment_id: number;
  extend_days: number;
  reason: string;
  previous_expires_at: string | null;
  new_expires_at: string | null;
  extended_by_user_id: number;
  extended_at: string;
}

export interface ExtendEnrollmentRes {
  enrollment_id: number;
  status: string;
  expires_at: string | null;
  days_left: number | null;
  extension: EnrollmentExtension;
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