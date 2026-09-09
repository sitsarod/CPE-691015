// ประเภทข้อมูลของระบบจำแนกผู้เรียนในรูป/วิดีโอที่โค้ชอัปโหลด (RawPhoto/RawVideo)

/** นักเรียนที่ระบบเดาว่าอยู่ในรูป/วิดีโอ — ยังไม่ได้แท็กจริง ต้องให้โค้ชตรวจทานแล้วกดยืนยันก่อน */
export interface DetectedStudentSuggestion {
  customer_id: number;
  nickname: string;
  confidence: number; // เปอร์เซ็นต์ 0–100
  /** กรอบใบหน้า [x1, y1, x2, y2] เป็นพิกเซล — ของรูปต้นฉบับ (ฝั่งรูป) หรือของ frame_image
   * ด้านล่าง (ฝั่งวิดีโอ — สเกลตามรูปที่ย่อแล้ว ไม่ใช่เฟรมต้นฉบับ) ไม่มีถ้าจับคู่ไม่ได้ตำแหน่งใบหน้า */
  bbox?: [number, number, number, number];
  /** เฟรมวิดีโอที่ย่อขนาดแล้ว (JPEG base64 ไม่มี data URL prefix) ที่แมตช์คนนี้ได้ — มีเฉพาะวิดีโอ
   * (รูปไม่ต้องใช้ เพราะหน้าเว็บมีไฟล์ต้นฉบับอยู่แล้ว) วาดกรอบทับด้วย bbox ข้างบนได้เหมือนฝั่งรูป */
  frame_image?: string;
}

export interface UploadPhotoPostResult {
  raw_photo_id: number;
  photo_url: string;
  /** จำนวนใบหน้าทั้งหมดที่เจอในรูป (รวมที่จับคู่กับนักเรียนไม่ได้) */
  face_count: number;
  students: DetectedStudentSuggestion[];
}

export interface UploadVideoResult {
  raw_video_id: number;
  video_url: string;
  /** จำนวนใบหน้าทั้งหมดที่เจอจากทุกเฟรมที่สุ่มตรวจ — คนเดิมโผล่หลายเฟรมนับซ้ำได้ จึงมากกว่า
   * จำนวนคนจริงในคลิปได้ (ไม่ใช่บั๊ก — ดูคอมเมนต์ฝั่ง backend ที่ DetectStudentsInVideo) */
  face_count: number;
  students: DetectedStudentSuggestion[];
}

export interface AssignResult {
  student_ids: number[];
  skipped_no_consent: number[] | null; // ถูกข้ามเพราะยังไม่ได้ยินยอมเก็บข้อมูลใบหน้า (null ถ้าไม่มีใครถูกข้าม)
}
