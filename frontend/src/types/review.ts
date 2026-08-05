// ระบบรีวิว/ให้คะแนนคอร์สและโค้ช จากลูกค้าที่ลงทะเบียนเรียน

export interface ReviewCustomer {
  id: number;
  nickname: string;
  firstName: string;
  lastName: string;
}

export interface ReviewCourse {
  id: number;
  course_name: string;
}

export interface ReviewCoach {
  id: number;
  nickname: string;
}

export interface Review {
  id: number;
  customer_id: number;
  customer: ReviewCustomer | null;
  course_id: number | null;
  course: ReviewCourse | null;
  coach_id: number | null;
  coach: ReviewCoach | null;
  rating: number; // 1-5
  comment: string;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateReviewReq {
  rating?: number;
  comment?: string;
}

export interface CreateReviewReq {
  course_id?: number;
  coach_id?: number;
  rating: number;
  comment: string;
}

// โค้ชที่สอนในคอร์ส (สำหรับให้ลูกค้าเลือกรีวิวโค้ช)
export interface CourseCoach {
  id: number;
  nickname: string;
  specialization: string;
  profile_picture: string;
}
