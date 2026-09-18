// ประเภทข้อมูลของระบบประเมินผู้เรียนโดยโค้ช

/** นักเรียนที่โค้ชคนนี้ประเมินได้ (ลงทะเบียนเรียนกับโค้ชคนนี้อยู่จริง) */
export interface EvaluableStudent {
  customer_id: number;
  nickname: string;
  profile_picture?: string;
}

/** นักเรียนหนึ่งคน พร้อมจำนวนรูป/วิดีโอที่ถูกแท็กไว้ — ใช้แสดงลิสต์ "โฟลเดอร์เสมือน" หน้าแอดมิน */
export interface StudentMediaSummary {
  customer_id: number;
  nickname: string;
  profile_picture?: string;
  photo_count: number;
  video_count: number;
}

/** คอร์สที่โค้ชคนนี้มีตารางสอนอยู่จริง */
export interface EvaluableCourse {
  course_id: number;
  course_name: string;
}

export interface Evaluation {
  id: number;
  customer_id: number;
  coach_id: number;
  coach_name?: string;
  assessment: string;
  created_at: string;
}

export interface CreateEvaluationInput {
  customer_id: number;
  assessment: string;
}
