// frontend/src/types/payment.ts

export interface CreateBillingReq {
  customer_ids: number[];
  admin_id: number;
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

export interface BankAccountReq {
  bank_name: string;
  account_name: string;
  account_no: string;
  is_active?: boolean;
}
