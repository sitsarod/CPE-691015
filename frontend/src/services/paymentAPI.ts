// frontend/src/services/paymentAPI.ts
import { BackendUser, BillingDTO, BankAccount, Coach, Expense } from "@/app/admin/payment/components/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

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

// Fetch bank accounts
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
export async function createBilling(payload: any, token: string): Promise<any> {
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
export async function updateBilling(billingId: number, payload: any, token: string): Promise<any> {
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
export async function createExpense(payload: any, token: string): Promise<any> {
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
export async function deleteExpense(id: number, token: string): Promise<any> {
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
export async function toggleBankAccount(bankId: number, token: string): Promise<any> {
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
export async function deleteBankAccount(bankId: number, token: string): Promise<any> {
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
export async function createBankAccount(payload: any, token: string): Promise<any> {
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
export async function updateBankAccount(bankId: number, payload: any, token: string): Promise<any> {
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
export async function confirmSlip(invoiceId: number, token: string): Promise<any> {
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
export async function rejectSlip(invoiceId: number, token: string): Promise<any> {
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
