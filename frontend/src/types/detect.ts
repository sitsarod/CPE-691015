// ประเภทข้อมูลของระบบจำแนกผู้เรียนในรูป/วิดีโอที่โค้ชอัปโหลด (RawPhoto/RawVideo)

export interface UploadVideoResult {
  raw_video_id: number;
  video_url: string;
  student_ids: number[]; // นักเรียนที่ระบบตรวจจับได้เบื้องต้น (mock — สุ่มจากทุกคนที่ยินยอมเก็บใบหน้า)
}

/** นักเรียนที่ระบบเดาว่าอยู่ในรูป — ยังไม่ได้แท็กจริง ต้องให้โค้ชตรวจทานแล้วกดยืนยันก่อน */
export interface DetectedStudentSuggestion {
  customer_id: number;
  nickname: string;
  confidence: number; // เปอร์เซ็นต์ 0–100
}

export interface UploadPhotoPostResult {
  raw_photo_id: number;
  photo_url: string;
  /** จำนวนใบหน้าทั้งหมดที่เจอในรูป (รวมที่จับคู่กับนักเรียนไม่ได้) */
  face_count: number;
  students: DetectedStudentSuggestion[];
}

export interface AssignResult {
  student_ids: number[];
  skipped_no_consent: number[]; // ถูกข้ามเพราะยังไม่ได้ยินยอมเก็บข้อมูลใบหน้า
}
