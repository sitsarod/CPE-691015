import type { EnrollmentTermsSection } from "./enrollment";

export type LegalDocumentKey = "face_consent" | "enrollment_terms";

// ส่วนของประกาศเก็บข้อมูลใบหน้าที่แอดมินแก้ได้ (ข้อมูลติดต่อมาจากหัวข้อข้อมูลติดต่อ)
export interface FaceConsentContent {
  title: string;
  summary: string;
  data_collected: string[];
  purposes: string[];
  not_used_for: string[];
  disclosure: string[];
  retention: string;
  rights: string[];
  decline_notice: string;
  withdrawal_notice: string;
}

export interface EnrollmentTermsContent {
  title: string;
  sections: EnrollmentTermsSection[];
}

export interface LegalDocument {
  key: LegalDocumentKey;
  version: string;
  // เพิ่มทุกครั้งที่บันทึก ส่วน version เปลี่ยนเฉพาะตอนแก้สาระ
  revision: number;
  updated_at: string;
  content: FaceConsentContent | EnrollmentTermsContent;
}
