// frontend/src/services/paymentAPI.ts
import { BackendUser, BillingDTO, BankAccount, Coach, Expense } from "@/app/admin/payment/components/types";
import { InvoiceDTO } from "@/app/customer/payment/components/types";
import {
  CreateBillingReq,
  UpdateBillingReq,
  CreateExpenseReq,
  BankAccountReq
} from "@/types/payment";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ;

// Fetch customers
export async function fetchCustomers(token: string): Promise<BackendUser[]> {
  const response = await fetch(`${BASE_URL}/users/role?role=customer`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ไม่สามารถดึงข้อมูลลูกค้าได้");
  }
  return resData.data || [];
}

// Fetch billings
export async function fetchBillings(token: string): Promise<BillingDTO[]> {
  const response = await fetch(`${BASE_URL}/billings/`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ไม่สามารถดึงข้อมูลบิลได้");
  }
  return resData.data || [];
}

// Fetch bank accounts (admin only - full list including inactive)
export async function fetchBankAccounts(token: string): Promise<BankAccount[]> {
  const response = await fetch(`${BASE_URL}/bank-accounts/`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ไม่สามารถดึงข้อมูลบัญชีธนาคารได้");
  }
  return resData.data || [];
}

// Fetch the active bank account(s) - any authenticated user (customers included)
export async function fetchActiveBankAccounts(token: string): Promise<BankAccount[]> {
  const response = await fetch(`${BASE_URL}/bank-accounts/active`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ไม่สามารถดึงข้อมูลบัญชีธนาคารได้");
  }
  return resData.data || [];
}

// Fetch coaches
export async function fetchCoaches(token: string): Promise<Coach[]> {
  const response = await fetch(`${BASE_URL}/coaches`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ไม่สามารถดึงข้อมูลโค้ชได้");
  }
  return resData.data || [];
}

// Fetch expenses
export async function fetchExpenses(token: string): Promise<Expense[]> {
  const response = await fetch(`${BASE_URL}/expenses/`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ไม่สามารถดึงข้อมูลค่าใช้จ่ายได้");
  }
  return resData.data || [];
}

// Create billing
export async function createBilling(payload: CreateBillingReq, token: string): Promise<{ message?: string; data: BillingDTO }> {
  const response = await fetch(`${BASE_URL}/billings/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ออกบิลไม่สำเร็จ");
  }
  return resData;
}

// Update billing
export async function updateBilling(billingId: number, payload: UpdateBillingReq, token: string): Promise<{ message?: string; data: BillingDTO }> {
  const response = await fetch(`${BASE_URL}/billings/${billingId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "แก้ไขข้อมูลบิลไม่สำเร็จ");
  }
  return resData;
}

// Create expense
export async function createExpense(payload: CreateExpenseReq, token: string): Promise<{ message?: string; data: Expense }> {
  const response = await fetch(`${BASE_URL}/expenses/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "บันทึกค่าใช้จ่ายไม่สำเร็จ");
  }
  return resData;
}

// Delete expense
export async function deleteExpense(id: number, token: string): Promise<{ message?: string }> {
  const response = await fetch(`${BASE_URL}/expenses/${id}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ลบค่าใช้จ่ายไม่สำเร็จ");
  }
  return resData;
}

// Toggle bank account
export async function toggleBankAccount(bankId: number, token: string): Promise<{ message?: string; data: BankAccount }> {
  const response = await fetch(`${BASE_URL}/bank-accounts/${bankId}/toggle`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "สลับเปิดปิดบัญชีธนาคารไม่สำเร็จ");
  }
  return resData;
}

// Delete bank account
export async function deleteBankAccount(bankId: number, token: string): Promise<{ message?: string }> {
  const response = await fetch(`${BASE_URL}/bank-accounts/${bankId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ลบบัญชีธนาคารไม่สำเร็จ");
  }
  return resData;
}

// Create bank account
export async function createBankAccount(payload: BankAccountReq, token: string): Promise<{ message?: string; data: BankAccount }> {
  const response = await fetch(`${BASE_URL}/bank-accounts/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "บันทึกบัญชีธนาคารไม่สำเร็จ");
  }
  return resData;
}

// Update bank account
export async function updateBankAccount(bankId: number, payload: BankAccountReq, token: string): Promise<{ message?: string; data: BankAccount }> {
  const response = await fetch(`${BASE_URL}/bank-accounts/${bankId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "บันทึกบัญชีธนาคารไม่สำเร็จ");
  }
  return resData;
}

// Approve/Confirm payment slip
export async function confirmSlip(invoiceId: number, token: string): Promise<{ message?: string; data?: BillingDTO }> {
  const response = await fetch(`${BASE_URL}/payments/invoices/${invoiceId}/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ยืนยันสลิปไม่สำเร็จ");
  }
  return resData;
}

// Reject payment slip
export async function rejectSlip(invoiceId: number, token: string): Promise<{ message?: string; data?: BillingDTO }> {
  const response = await fetch(`${BASE_URL}/payments/invoices/${invoiceId}/reject`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ปฏิเสธสลิปไม่สำเร็จ");
  }
  return resData;
}

// Fetch customer billings
export async function fetchCustomerBillings(customerId: string | number, token: string): Promise<BillingDTO[]> {
  const response = await fetch(`${BASE_URL}/billings/customer/${customerId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ไม่สามารถดึงข้อมูลบิลของลูกค้าได้");
  }
  return resData.data || [];
}

// Fetch customer invoices
export async function fetchCustomerInvoices(customerId: string | number, token: string): Promise<InvoiceDTO[]> {
  const response = await fetch(`${BASE_URL}/payments/invoices/customer/${customerId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ไม่สามารถดึงข้อมูลใบแจ้งหนี้ของลูกค้าได้");
  }
  return resData.data || [];
}

// Create invoice from multiple billings
export async function createInvoice(customerId: number, billingIds: number[], method: string, token: string): Promise<InvoiceDTO> {
  const response = await fetch(`${BASE_URL}/payments/invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      customer_id: customerId,
      billing_ids: billingIds,
      payment_method: method
    })
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "สร้างใบแจ้งหนี้ไม่สำเร็จ");
  }
  return resData.data || resData;
}

// Upload slip for invoice
export async function uploadSlip(invoiceId: number, slipUrl: string, token: string): Promise<InvoiceDTO> {
  const response = await fetch(`${BASE_URL}/payments/invoices/${invoiceId}/slip`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      slip_url: slipUrl
    })
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "อัปโหลดสลิปไม่สำเร็จ");
  }
  return resData.data || resData;
}

// Cancel invoice
export async function cancelInvoice(invoiceId: number, token: string): Promise<InvoiceDTO> {
  const response = await fetch(`${BASE_URL}/payments/invoices/${invoiceId}/cancel`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ยกเลิกใบแจ้งหนี้ไม่สำเร็จ");
  }
  return resData.data || resData;
}

