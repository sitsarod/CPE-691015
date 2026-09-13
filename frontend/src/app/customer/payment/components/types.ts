import { BillingDTO, BankAccount } from "@/app/admin/payment/components/types";

export interface PaymentItemDTO {
  id: number;
  invoice_id: number;
  billing_id: number;
  billing?: BillingDTO;
}

export interface InvoiceDTO {
  id: number;
  invoicetotalamount: number;
  invoicestatus: "pending" | "success" | "rejected" | "expired" | "cancelled" | "waitcheck";
  transactionid: string;
  slipurl: string;
  paymentmethod: "qr" | "bank_transfer" | "credit_card" | "cash";
  customer_id: number;
  paymentitems: PaymentItemDTO[];
  created_at: string;

  // เหตุผล/เวลาที่แอดมินปฏิเสธสลิป — มีค่าเฉพาะใบสถานะ rejected
  reject_reason?: string;
  rejected_at?: string;
}

export type { BillingDTO, BankAccount };
