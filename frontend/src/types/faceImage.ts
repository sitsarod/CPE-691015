// รูปใบหน้าที่ใช้เช็คชื่อ — ต่อจากระบบความยินยอมใน types/consent.ts

/** ต้องตรงกับ models.FacePose ฝั่ง backend */
export type FacePose = "front" | "left" | "right";

/** pending → awaiting_review → ready คือเส้นทางปกติ · rejected ตกได้สองจังหวะ */
export type FaceImageStatus = "pending" | "awaiting_review" | "ready" | "rejected";

export interface FaceImage {
  id: number;
  customer_id: number;
  pose: FacePose;
  status: FaceImageStatus;
  embedding_model: string;
  quality_score: number;
  liveness_score: number;
  verified_by: number | null;
  verified_at: string | null;
  reject_reason: string;
  created_at: string;
  updated_at: string;
}

/** ลำดับท่าที่ให้ถ่ายบนหน้าจอ */
export const FACE_POSES: FacePose[] = ["front", "left", "right"];

export const POSE_LABEL: Record<FacePose, string> = {
  front: "หน้าตรง",
  left: "หันซ้ายเล็กน้อย",
  right: "หันขวาเล็กน้อย",
};

export const POSE_HINT: Record<FacePose, string> = {
  front: "มองตรงเข้ากล้อง ให้ใบหน้าอยู่กลางกรอบ",
  left: "หันหน้าไปทางซ้ายประมาณ 20 องศา ตายังมองกล้อง",
  right: "หันหน้าไปทางขวาประมาณ 20 องศา ตายังมองกล้อง",
};

/** รูปหนึ่งใบในมุมของแอดมิน — แนบชื่อเจ้าของมาด้วย (ตรงกับ dto.AdminFaceImageDTO) */
export interface AdminFaceImage {
  id: number;
  customer_id: number;
  nickname: string;
  member_code: string;
  pose: FacePose;
  status: FaceImageStatus;
  reject_reason: string;
  quality_score: number;
  liveness_score: number;
  verified_by: number | null;
  verified_at: string | null;
  created_at: string;
  /** รูปที่ถูกปฏิเสธจะถูกลบไฟล์ทิ้ง เหลือแต่แถว — อย่ายิงขอรูปที่ไม่มีอยู่ */
  has_file: boolean;
}

export const STATUS_LABEL: Record<FaceImageStatus, string> = {
  pending: "กำลังประมวลผล",
  awaiting_review: "รอเจ้าหน้าที่ตรวจสอบ",
  ready: "พร้อมใช้งาน",
  rejected: "ไม่ผ่านการตรวจสอบ",
};
