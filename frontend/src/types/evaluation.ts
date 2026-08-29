// ประเภทข้อมูลของระบบประเมินผู้เรียนโดยโค้ช

/** นักเรียนที่โค้ชคนนี้ประเมินได้ (ลงทะเบียนเรียนกับโค้ชคนนี้อยู่จริง) */
export interface EvaluableStudent {
  customer_id: number;
  nickname: string;
  profile_picture?: string;
}

export interface Evaluation {
  id: number;
  customer_id: number;
  coach_id: number;
  coach_name?: string;
  assessment: string;
  score: number;
  created_at: string;
}

export interface CreateEvaluationInput {
  customer_id: number;
  assessment: string;
  score: number;
}
