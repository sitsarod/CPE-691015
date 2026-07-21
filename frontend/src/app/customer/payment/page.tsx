"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Wallet, 
  RefreshCw, 
  AlertCircle, 
  Loader2, 
  FileText, 
  Calendar 
} from "lucide-react";

import { 
  fetchCustomerBillings, 
  fetchCustomerInvoices, 
  createInvoice, 
  uploadSlip, 
  cancelInvoice,
  fetchBankAccounts
} from "@/services/paymentAPI";
import Toast from "@/components/Toast";

// Clean separated components and types
import { BillingDTO, InvoiceDTO, BankAccount } from "./components/types";
import PaymentStats from "./components/PaymentStats";
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
        fetchBankAccounts(token)
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
    return (
      <div className="w-full min-h-[60vh] flex flex-col items-center justify-center text-gray-500">
        <Loader2 className="w-12 h-12 animate-spin text-[#CC0000] mb-4" />
        <span className="text-sm font-semibold tracking-wide animate-pulse">กำลังโหลดข้อมูลการเงิน...</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-150 pb-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Wallet className="w-8 h-8 text-[#CC0000]" />
            หน้าชำระเงินและประวัติการเงิน
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            จัดการค่าใช้จ่ายและตรวจสอบประวัติการชำระเงินของคุณได้ที่นี่
          </p>
        </div>
        <button 
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-250 text-gray-700 hover:text-black py-2.5 px-4 rounded-xl text-sm font-bold transition-all border border-gray-200 cursor-pointer self-start md:self-auto disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-[#CC0000]" : ""}`} />
          {isRefreshing ? "กำลังอัปเดต..." : "อัปเดตข้อมูล"}
        </button>
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
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("billings")}
          className={`py-4 px-6 font-bold text-base border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "billings"
              ? "border-[#CC0000] text-[#CC0000]"
              : "border-transparent text-gray-550 hover:text-gray-950"
          }`}
        >
          <FileText className="w-4 h-4" />
          รายการบิลเรียกเก็บเงิน ({billings.length})
        </button>
        <button
          onClick={() => setActiveTab("invoices")}
          className={`py-4 px-6 font-bold text-base border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "invoices"
              ? "border-[#CC0000] text-[#CC0000]"
              : "border-transparent text-gray-550 hover:text-gray-950"
          }`}
        >
          <Calendar className="w-4 h-4" />
          ประวัติใบชำระเงิน / ใบแจ้งหนี้ ({invoices.length})
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