// ประเภทข้อมูลของระบบประเมินผู้เรียนโดยโค้ช

/** นักเรียนที่โค้ชคนนี้ประเมินได้ (ลงทะเบียนเรียนกับโค้ชคนนี้อยู่จริง) */
export interface EvaluableStudent {
  customer_id: number;
  nickname: string;
  profile_picture?: string;
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
