// ยืนยันการมาเรียนล่วงหน้า — โรงเรียนใช้จำนวนคนไปตัดสินใจจองสนาม

// ยืนยันแล้ว หรือยังไม่ตอบ เท่านั้น (pending = ไม่มีแถวในฐาน backend เติมให้)
export type ConfirmationStatus = "going" | "pending";

// class_date เป็น "YYYY-MM-DD" ไม่ใช่ timestamp — แปลงเป็น Date แล้วโซนเวลาอื่นจะเลื่อนวัน
export interface UpcomingClass {
  enrollment_id: number;
  package_id: number;
  course_name: string;

  class_date: string;
  day_of_week: string;
  start_time: string;
  end_time: string;

  status: ConfirmationStatus;

  // ใช้แสดงผลเท่านั้น สิทธิ์จริงตัดสินที่ backend
  confirm_deadline: string;
  is_open: boolean;
}

export interface ConfirmClassInput {
  enrollment_id: number;
  class_date: string;
  start_time: string;
  status: "going";
}

export interface CancelClassInput {
  enrollment_id: number;
  class_date: string;
  start_time: string;
}

// ยอดสรุปรายคาบที่แอดมินใช้ตัดสินใจจองสนาม
export interface ClassHeadcount {
  package_id: number;
  course_id: number;
  course_name: string;

  class_date: string;
  day_of_week: string;
  start_time: string;
  end_time: string;

  total: number;
  going: number;
  pending: number;

  // พ้นเส้นตายแล้ว ตัวเลขจะไม่เปลี่ยนอีก
  is_closed: boolean;
}

// ─── รายชื่อรายคาบ ───

export interface ClassRosterItem {
  enrollment_id: number;
  customer_id: number;
  nickname: string;
  full_name: string;
  phone_number?: string;

  status: ConfirmationStatus;
}

// backend แบ่งกลุ่มมาให้แล้ว หน้าเว็บไม่ต้องรู้กติกาว่าใครอยู่กลุ่มไหน
export interface ClassRoster {
  package_id: number;
  course_id: number;
  course_name: string;

  class_date: string;
  day_of_week: string;
  start_time: string;
  end_time: string;

  is_closed: boolean;

  going: ClassRosterItem[];
  pending: ClassRosterItem[];
}
