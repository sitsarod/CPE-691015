// frontend/src/types/coach.ts

// ตัวเลือกระดับฝีมือโค้ช (specialization) เรียงจากต่ำไปสูง
export const COACH_LEVEL_OPTIONS = [
  { label: "N", value: "N" },
  { label: "P", value: "P" },
  { label: "S-", value: "S-" },
  { label: "S", value: "S" },
  { label: "S+", value: "S+" },
];

// ตัวเลือกใบรับรองผู้ฝึกสอน (coach_license) เรียงจากต่ำไปสูง
export const COACH_LICENSE_OPTIONS = [
  { label: "License C", value: "License C" },
  { label: "License B", value: "License B" },
  { label: "License A", value: "License A" },
];

// ประเภทการจ่ายเงินของโค้ช — เลือกได้อย่างใดอย่างหนึ่งเท่านั้น (ไม่กรอกทั้งสองแบบพร้อมกัน)
export type CoachPaymentType = "per_session" | "monthly";

export const COACH_PAYMENT_TYPE_OPTIONS: { label: string; value: CoachPaymentType }[] = [
  { label: "รายครั้ง", value: "per_session" },
  { label: "รายเดือน", value: "monthly" },
];

export interface CoachProfile {
  id: number;
  user_id: number;
  first_name: string;
  last_name: string;
  email: string;
  nickname: string;
  phone: string;
  lineId?: string;
  facebook?: string;
  uid: string;
  address: string;
  birth_date: string;
  specialization: string;
  coach_license: string;
  profile_picture: string;
  bank_account: string;
  payment_info: string;
  payment_type: CoachPaymentType;
  pay_rate: number;
}

export interface AvailabilitySlot {
  ID?: number;
  day_of_week: string;
  start_time: string;
  end_time: string;
}

export interface WorkScheduleItem {
  ID: number;
  date: string;
  start_time: string;
  end_time: string;
  description: string;
  court_number: string;
  coach_id: number;
  course_id: number;
  course?: {
    course_name: string;
  };
}

export interface CoachWageEntry {
  id: number;
  expenseamount: number;
  expensetype: string;
  expensedescription: string;
  expensedate: string;
  receipturl: string;
  created_at: string;
}
