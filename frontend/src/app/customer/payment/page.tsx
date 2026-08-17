"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Loader2
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
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"billings" | "invoices">("billings");
  const [selectedBillingIds, setSelectedBillingIds] = useState<number[]>([]);

  // เปิดแท็บตาม query param เมื่อ deep-link มาจากการแจ้งเตือน เช่น /customer/payment?tab=invoices
  useEffect(() => {
    if (typeof window === "undefined") return;
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "billings" || tab === "invoices") setActiveTab(tab);
  }, []);
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

  // ป้องกันการดึงข้อมูลซ้อน + กันยิงถี่เกินไปตอน refetch-on-focus
  const isFetchingRef = useRef(false);
  const lastFetchRef = useRef(0);

  // Main Loader
  // background = true คือ refetch เงียบ ๆ (ไม่โชว์ skeleton) จะโชว์แถบสถานะด้านบนแทน
  const loadData = async (background = false) => {
    if (isFetchingRef.current) return; // มีการดึงข้อมูลค้างอยู่แล้ว ข้ามไป
    isFetchingRef.current = true;
    if (background) setIsRefetching(true);
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
      setIsRefetching(false);
      isFetchingRef.current = false;
      lastFetchRef.current = Date.now();
    }
  };

  // โหลดข้อมูลครั้งแรก
  useEffect(() => {
    setIsLoading(true);
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Refetch อัตโนมัติเมื่อผู้ใช้กลับมาโฟกัสหน้าต่าง/แท็บอีกครั้ง (แทนปุ่มรีเฟรช)
  // ดึงเงียบ ๆ ไม่โชว์ skeleton และ throttle 10 วินาทีเพื่อลดภาระ server
  useEffect(() => {
    const REFETCH_THROTTLE_MS = 10_000;
    const maybeRefetch = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchRef.current < REFETCH_THROTTLE_MS) return;
      loadData(true);
    };
    window.addEventListener("focus", maybeRefetch);
    document.addEventListener("visibilitychange", maybeRefetch);
    return () => {
      window.removeEventListener("focus", maybeRefetch);
      document.removeEventListener("visibilitychange", maybeRefetch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div className="mx-auto max-w-7xl space-y-6 sm:space-y-8 animate-fadeIn">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* แถบสถานะตอน refetch เบื้องหลัง — ลอยใต้ topbar ไม่บังเนื้อหา */}
      {isRefetching && (
        <div className="fixed left-1/2 top-[104px] z-30 -translate-x-1/2 animate-fadeIn">
          <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-4 py-1.5 text-xs font-bold text-gray-600 shadow-md backdrop-blur">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#CC0000]" />
            กำลังอัปเดตข้อมูล...
          </div>
        </div>
      )}

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
      <div className="flex gap-4 sm:gap-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("billings")}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-3 pt-1 text-xs font-bold transition-all sm:flex-none sm:justify-start sm:gap-2 sm:text-sm ${
            activeTab === "billings"
              ? "border-[#CC0000] text-[#CC0000]"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
        >
          <span className="sm:hidden">บิลเรียกเก็บเงิน</span>
          <span className="hidden sm:inline">รายการบิลเรียกเก็บเงิน</span>
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
          className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-3 pt-1 text-xs font-bold transition-all sm:flex-none sm:justify-start sm:gap-2 sm:text-sm ${
            activeTab === "invoices"
              ? "border-[#CC0000] text-[#CC0000]"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
        >
          <span className="sm:hidden">ใบแจ้งหนี้</span>
          <span className="hidden sm:inline">ประวัติใบแจ้งหนี้</span>
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