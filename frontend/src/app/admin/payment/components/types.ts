// ตรงกับ dto.UserMinDTO ฝั่ง backend (GET /admin/role)
//
// เดิม endpoint นี้คืน models.User ดิบ ทำให้ได้ ID ตัวใหญ่และ nickname ซ้อนอยู่ใน customer
// รวมถึง password hash ที่ติดมาด้วย ตอนนี้เปลี่ยนมาคืน DTO ที่แบนแล้วและไม่มี password
export interface BackendUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  nickname: string;
}

export interface BillingTypeDTO {
  id: number;
  billingtypename: string;
}

export interface UserMinDTO {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

export interface BillingDTO {
  id: number;
  billingdescription: string;
  billingamount: number;
  billingdue_date: string; // ISO String
  billingstatus: "unfunded" | "paid" | "waitcheck" | "overdue";
  billingtype_id: number;
  customer_id: number;
  customer?: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    nickname?: string;
  };
  billing_type?: {
    billingtypename: string;
  };
  slipurl?: string;
  invoice_id?: number;
  transactionid?: string;
  created_at: string;
}

export interface BankAccount {
  ID: number;
  bank_name: string;
  account_no: string;
  account_name: string;
  promptpay_id: string;
  is_active: boolean;
  auto_verify_enabled: boolean;
}

export interface Coach {
  id: number;
  nickname: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface Expense {
  id: number;
  expenseamount: number;
  expensetype: "coach_wages" | "coach_other" | "court_rental" | "equipment" | "advertising" | "other";
  expensedescription: string;
  expensedate: string; // ISO string
  coach_id?: number;
  coach?: Coach;
  receipturl: string;
  created_at: string;
}
