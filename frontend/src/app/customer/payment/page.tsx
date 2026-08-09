"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  AlertCircle,
  FileText,
  Calendar
} from "lucide-react";

import { 
  fetchCustomerBillings, 
  fetchCustomerInvoices, 
  createInvoice, 
  uploadSlip,
  cancelInvoice,
  fetchActiveBankAccounts
} from "@/services/paymentAPI";
import Toast from "@/components/Toast";

// Clean separated components and types
import { BillingDTO, InvoiceDTO, BankAccount } from "./components/types";
import PaymentStats from "./components/PaymentStats";
import PaymentSkeleton from "./components/PaymentSkeleton";
import BillingsTab from "./components/BillingsTab";
import InvoicesTab from "./components/InvoicesTab";
import CheckoutModal from "./components/CheckoutModal";

export default function CustomerPaymentPage() {
  const router = useRouter();
  
  // Data States
  const [billings, setBillings] = useState<BillingDTO[]>([]);
  const [invoices, setInvoices] = useState<InvoiceDTO[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  
  // UI Control States
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"billings" | "invoices">("billings");
  const [selectedBillingIds, setSelectedBillingIds] = useState<number[]>([]);
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Record<number, boolean>>({});

  // Checkout Modal Context States
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState<"create" | "existing">("create");
  const [checkoutAmount, setCheckoutAmount] = useState<number>(0);
  const [checkoutBillingIds, setCheckoutBillingIds] = useState<number[]>([]);
  const [checkoutInvoiceId, setCheckoutInvoiceId] = useState<number | null>(null);
  
  // Slip Uploader States
  const [uploadedSlipUrl, setUploadedSlipUrl] = useState<string>("");
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const triggerToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Main Loader
  const loadData = async () => {
    try {
      setError(null);
      const token = localStorage.getItem("token");
      const customerId = localStorage.getItem("customer_id") || localStorage.getItem("user_id");

      if (!token || !customerId) {
        router.push("/login");
        return;
      }

      const [billingsData, invoicesData, bankAccountsData] = await Promise.all([
        fetchCustomerBillings(customerId, token),
        fetchCustomerInvoices(customerId, token),
        fetchActiveBankAccounts(token)
      ]);

      setBillings(billingsData);
      setInvoices(invoicesData);
      setBankAccounts(bankAccountsData);
    } catch (err: unknown) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการดึงข้อมูลการเงิน";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    loadData();
  }, [router]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  // ---------------- Billings Selection Logic ----------------
  const handleSelectBilling = (id: number) => {
    setSelectedBillingIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllUnpaid = () => {
    const unpaidBillings = billings.filter(b => b.billingstatus === "unfunded" || b.billingstatus === "overdue");
    if (selectedBillingIds.length === unpaidBillings.length) {
      setSelectedBillingIds([]);
    } else {
      setSelectedBillingIds(unpaidBillings.map(b => b.id));
    }
  };

  const handleClearSelection = () => {
    setSelectedBillingIds([]);
  };

  // ---------------- Checkout Dialog Logic ----------------
  const handleInitiatePaymentForSelected = () => {
    if (selectedBillingIds.length === 0) return;
    
    const selectedItems = billings.filter(b => selectedBillingIds.includes(b.id));
    const total = selectedItems.reduce((sum, item) => sum + item.billingamount, 0);

    setCheckoutAmount(total);
    setCheckoutBillingIds(selectedBillingIds);
    setCheckoutInvoiceId(null);
    setCheckoutMode("create");
    setUploadedSlipUrl("");
    setIsCheckoutOpen(true);
  };

  const handlePayExistingInvoice = (invoice: InvoiceDTO) => {
    setCheckoutAmount(invoice.invoicetotalamount);
    setCheckoutBillingIds(invoice.paymentitems.map(item => item.billing_id));
    setCheckoutInvoiceId(invoice.id);
    setCheckoutMode("existing");
    setUploadedSlipUrl(invoice.slipurl || "");
    setIsCheckoutOpen(true);
  };

  const handleSubmitCheckout = async (method: "qr" | "bank_transfer") => {
    if (!uploadedSlipUrl) {
      triggerToast("กรุณาอัปโหลดรูปภาพสลิปหลักฐานการโอนเงิน", "error");
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const token = localStorage.getItem("token") || "";
      const customerIdStr = localStorage.getItem("customer_id") || localStorage.getItem("user_id") || "0";
      const customerId = parseInt(customerIdStr);

      let invoiceId = checkoutInvoiceId;

      if (checkoutMode === "create") {
        const newInvoice = await createInvoice(customerId, checkoutBillingIds, method, token);
        invoiceId = newInvoice.id;
      }

      if (!invoiceId) {
        throw new Error("ไม่พบข้อมูลใบแจ้งหนี้");
      }

      await uploadSlip(invoiceId, uploadedSlipUrl, token);

      triggerToast("แจ้งชำระเงินเรียบร้อยแล้ว! กำลังรอแอดมินตรวจสอบ", "success");
      setIsCheckoutOpen(false);
      setSelectedBillingIds([]);
      loadData();
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการแจ้งชำระเงิน";
      triggerToast(msg, "error");
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // ---------------- Invoice Cancellation Logic ----------------
  const handleCancelInvoice = async (invoiceId: number) => {
    if (!window.confirm("คุณต้องการยกเลิกใบแจ้งหนี้นี้ใช่หรือไม่? เมื่อยกเลิกแล้ว บิลย่อยที่รวมอยู่ในใบแจ้งหนี้นี้จะกลับมาค้างชำระเหมือนเดิม")) {
      return;
    }

    try {
      const token = localStorage.getItem("token") || "";
      await cancelInvoice(invoiceId, token);
      triggerToast("ยกเลิกใบแจ้งหนี้เรียบร้อยแล้ว", "success");
      loadData();
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการยกเลิกใบแจ้งหนี้";
      triggerToast(msg, "error");
    }
  };

  const toggleInvoiceExpand = (id: number) => {
    setExpandedInvoiceIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // ---------------- Statistics Calculations ----------------
  const unpaidBillings = billings.filter(b => b.billingstatus === "unfunded" || b.billingstatus === "overdue");
  const totalUnpaidAmount = unpaidBillings.reduce((sum, item) => sum + item.billingamount, 0);
  const hasOverdue = unpaidBillings.some(b => b.billingstatus === "overdue");

  const processingBillings = billings.filter(b => b.billingstatus === "waitcheck");
  const totalProcessingAmount = processingBillings.reduce((sum, item) => sum + item.billingamount, 0);

  const paidBillings = billings.filter(b => b.billingstatus === "paid");
  const totalPaidAmount = paidBillings.reduce((sum, item) => sum + item.billingamount, 0);

  if (isLoading) {
    return <PaymentSkeleton />;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header Section */}
      <div>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#CC0000]">
              <span className="h-px w-7 bg-[#CC0000]" />
              <span className="text-xs font-black uppercase tracking-[0.25em]">การเงินของฉัน</span>
            </div>
            <h1 className="mt-2.5 text-3xl md:text-4xl font-black tracking-tight text-gray-900">
              ชำระเงิน <span className="font-light text-gray-300">/</span> ประวัติการเงิน
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              จัดการค่าใช้จ่ายและตรวจสอบสถานะการชำระเงินของคุณได้ที่นี่
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="group flex items-center justify-center gap-2 self-start rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-600 transition-all hover:border-[#CC0000]/30 hover:text-[#CC0000] disabled:opacity-50 md:self-auto"
          >
            <RefreshCw className={`h-4 w-4 transition-colors ${isRefreshing ? "animate-spin text-[#CC0000]" : "text-gray-400 group-hover:text-[#CC0000]"}`} />
            {isRefreshing ? "กำลังอัปเดต..." : "อัปเดตข้อมูล"}
          </button>
        </div>
        <div className="mt-6 h-px bg-gray-200" />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold">เกิดข้อผิดพลาด</h4>
            <p className="text-sm mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Statistics Overview Cards */}
      <PaymentStats
        totalUnpaidAmount={totalUnpaidAmount}
        unpaidCount={unpaidBillings.length}
        hasOverdue={hasOverdue}
        totalProcessingAmount={totalProcessingAmount}
        processingCount={processingBillings.length}
        totalPaidAmount={totalPaidAmount}
        paidCount={paidBillings.length}
      />

      {/* Tab Selector */}
      <div className="flex gap-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("billings")}
          className={`flex cursor-pointer items-center gap-2 border-b-2 px-1 pb-3 pt-1 text-sm font-bold transition-all ${
            activeTab === "billings"
              ? "border-[#CC0000] text-[#CC0000]"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
        >
          <FileText className="h-4 w-4" />
          รายการบิลเรียกเก็บเงิน
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums transition-colors ${
              activeTab === "billings" ? "bg-[#FFF0F0] text-[#CC0000]" : "bg-gray-100 text-gray-500"
            }`}
          >
            {billings.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("invoices")}
          className={`flex cursor-pointer items-center gap-2 border-b-2 px-1 pb-3 pt-1 text-sm font-bold transition-all ${
            activeTab === "invoices"
              ? "border-[#CC0000] text-[#CC0000]"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
        >
          <Calendar className="h-4 w-4" />
          ประวัติใบแจ้งหนี้
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums transition-colors ${
              activeTab === "invoices" ? "bg-[#FFF0F0] text-[#CC0000]" : "bg-gray-100 text-gray-500"
            }`}
          >
            {invoices.length}
          </span>
        </button>
      </div>

      {/* Tab Panel Renderings */}
      {activeTab === "billings" ? (
        <BillingsTab
          billings={billings}
          selectedBillingIds={selectedBillingIds}
          onSelectBilling={handleSelectBilling}
          onSelectAllUnpaid={handleSelectAllUnpaid}
          onClearSelection={handleClearSelection}
          onInitiatePayment={handleInitiatePaymentForSelected}
        />
      ) : (
        <InvoicesTab
          invoices={invoices}
          expandedInvoiceIds={expandedInvoiceIds}
          onToggleExpand={toggleInvoiceExpand}
          onPayExistingInvoice={handlePayExistingInvoice}
          onCancelInvoice={handleCancelInvoice}
        />
      )}

      {/* Checkout Dialog Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        mode={checkoutMode}
        invoiceId={checkoutInvoiceId}
        billingIds={checkoutBillingIds}
        amount={checkoutAmount}
        bankAccounts={bankAccounts}
        uploadedSlipUrl={uploadedSlipUrl}
        onUploadSuccess={(url) => setUploadedSlipUrl(url)}
        onSubmitCheckout={handleSubmitCheckout}
        isSubmittingPayment={isSubmittingPayment}
        triggerToast={triggerToast}
      />
    </div>
  );
}