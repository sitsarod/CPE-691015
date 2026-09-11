// frontend/src/types/payment.ts

// ไม่มี admin_id — backend อ้างคนออกบิลจาก JWT ให้เอง (เดิมส่งจาก localStorage ซึ่งปลอมได้)
export interface CreateBillingReq {
  customer_ids: number[];
  billingtype_id: number;
  billingdescription: string;
  billingamount: number;
  billingdue_date: string;
}

export interface UpdateBillingReq {
  billingdescription: string;
  billingamount: number;
  billingdue_date: string;
  billingtype_id: number;
}

export interface CreateExpenseReq {
  expenseamount: number;
  expensetype: string;
  expensedescription: string;
  expensedate: string;
  receipturl: string;
  coach_id?: number;
}

// แก้ไขค่าใช้จ่าย — ส่งเฉพาะฟิลด์ที่ต้องการแก้
export interface UpdateExpenseReq {
  expenseamount?: number;
  expensetype?: string;
  expensedescription?: string;
  expensedate?: string;
  receipturl?: string;
  coach_id?: number | null;
}

export interface BankAccountReq {
  bank_name?: string;
  account_name?: string;
  account_no?: string;
  promptpay_id?: string;
  is_active?: boolean;
  auto_verify_enabled?: boolean;
}
