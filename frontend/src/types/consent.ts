// ประเภทข้อมูลของระบบความยินยอมเก็บข้อมูลใบหน้า (PDPA)

export type FaceConsentStatusValue = "unknown" | "granted" | "declined" | "withdrawn";

/** การตัดสินใจที่ผู้ใช้ส่งได้จาก modal — การถอนความยินยอมใช้ DELETE แยกต่างหาก */
export type FaceConsentDecision = "granted" | "declined";

export interface FaceConsentStatus {
  status: FaceConsentStatusValue;
  policy_version: string;
  acted_at: string | null;
  /** true = ยังไม่เคยตอบ ต้องเด้ง modal ขอความยินยอม */
  needs_decision: boolean;
  can_use_face_check_in: boolean;
}

/** อ้างอิงมาตรากฎหมายที่รองรับข้อความในประกาศ */
export interface LegalReference {
  law: string;
  section: string;
  description: string;
}

/** ข้อมูลติดต่อผู้ควบคุมข้อมูลส่วนบุคคล — มาตรา 23(5) บังคับให้ต้องแจ้ง */
export interface DataControllerContact {
  name: string;
  address: string;
  email: string;
  phone: string;
}

/** เนื้อหาประกาศที่ดึงมาจาก backend — ไม่ฮาร์ดโค้ดไว้ฝั่งหน้าเว็บ
 *  เพราะเวอร์ชันของประกาศถูกบันทึกลงหลักฐานการยินยอมทุกแถว ต้องมาจากแหล่งเดียวกัน
 *
 *  แต่ละฟิลด์ผูกกับข้อกำหนดตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562:
 *    purposes → ม.23(1) · decline_notice → ม.23(2) · data_collected/retention → ม.23(3)
 *    disclosure → ม.23(4) · controller → ม.23(5) · rights → ม.23(6)
 *    withdrawal_notice → ม.19 วรรคหก
 *
 *  ⚠️ อย่าตัดฟิลด์ใดออกจากหน้าจอโดยไม่ตรวจก่อนว่าข้อกำหนดข้างต้นยังครบ */
export interface FaceConsentPolicy {
  version: string;
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
  controller: DataControllerContact;
  legal_references: LegalReference[];
}
