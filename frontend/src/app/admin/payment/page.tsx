"use client";

import React, { useState, useEffect, useMemo } from "react";
import { PlusCircle, ClipboardCheck, PieChart, Landmark, Receipt } from "lucide-react";
import { BackendUser, BillingDTO, BankAccount, Expense, Coach } from "./components/types";
import Toast from "@/components/Toast";
import BillingIssueForm from "./components/BillingIssueForm";
import VerifySlipsTab from "./components/VerifySlipsTab";
import FinancialSummaryTab from "./components/FinancialSummaryTab";
import BankAccountsTab from "./components/BankAccountsTab";
import ExpensesTab from "./components/ExpensesTab";
import EditBillingModal from "./components/EditBillingModal";
import {
  fetchCustomers,
  fetchBillings,
  fetchBankAccounts,
  fetchCoaches,
  fetchExpenses,
  updateBilling
} from "@/services/paymentAPI";

export default function FinancialPortal() {
  const [subTab, setSubTab] = useState<'issue' | 'slips' | 'summary' | 'banks' | 'expenses'>('issue');

  // Live API States
  const [students, setStudents] = useState<BackendUser[]>([]);
  const [billings, setBillings] = useState<BillingDTO[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // UI States
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Billing Edit States
  const [isEditBillingModalOpen, setIsEditBillingModalOpen] = useState<boolean>(false);
  const [editingBilling, setEditingBilling] = useState<BillingDTO | null>(null);

  const triggerToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Fetch live backend data
  const fetchData = async () => {
    const isFirstLoad = students.length === 0 && billings.length === 0;
    try {
      if (isFirstLoad) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setApiError(null);
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;

      // Fetch students, billings, bank accounts, coaches, and expenses in parallel
      const [studentsData, billingsData, bankAccountsData, coachesData, expensesData] = await Promise.all([
        fetchCustomers(token || ""),
        fetchBillings(token || ""),
        fetchBankAccounts(token || ""),
        fetchCoaches(token || ""),
        fetchExpenses(token || "")
      ]);

      setStudents(studentsData);
      setBillings(billingsData);
      setBankAccounts(bankAccountsData);
      setCoaches(coachesData);
      setExpenses(expensesData);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการดึงข้อมูล";
      setApiError(message);
      triggerToast(message, 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // The backend returns one row per (billing, invoice) pairing so VerifySlipsTab
  // can group slips by invoice. For every other view a billing should only ever
  // appear once, reflecting its most recent invoice attempt (highest invoice_id).
  const dedupedBillings = useMemo(() => {
    const byId = new Map<number, BillingDTO>();
    for (const b of billings) {
      const existing = byId.get(b.id);
      if (!existing || (b.invoice_id || 0) > (existing.invoice_id || 0)) {
        byId.set(b.id, b);
      }
    }
    return Array.from(byId.values());
  }, [billings]);

  // Count distinct invoices awaiting review (not billing rows — one invoice can bundle
  // several billings, and VerifySlipsTab groups by invoice_id, so the tab badge should
  // match that grouping instead of over/under-counting individual billing rows).
  const waitcheckInvoiceCount = useMemo(() => {
    const keys = new Set<string>();
    billings.forEach(b => {
      if (b.billingstatus === 'waitcheck') {
        keys.add(b.invoice_id ? `invoice-${b.invoice_id}` : `bill-${b.id}`);
      }
    });
    return keys.size;
  }, [billings]);

  // Save billing edits
  const handleSaveBillingEdit = async (
    billingId: number,
    form: { billingdescription: string; billingamount: string; billingdue_date: string; billingtype_id: string }
  ) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      await updateBilling(
        billingId,
        {
          billingdescription: form.billingdescription,
          billingamount: parseFloat(form.billingamount),
          billingdue_date: new Date(form.billingdue_date).toISOString(),
          billingtype_id: parseInt(form.billingtype_id)
        },
        token || ""
      );

      triggerToast("แก้ไขข้อมูลบิลสำเร็จเรียบร้อย");
      setIsEditBillingModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      triggerToast(err instanceof Error ? err.message : "แก้ไขข้อมูลบิลไม่สำเร็จ", 'error');
      throw err;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 font-sans text-slate-800">
      
      {/* Toast Messages */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header section */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <span>ระบบการจัดการธุรกรรมและการเงิน</span>
            {isRefreshing && (
              <span className="inline-flex items-center text-[10px] md:text-xs font-semibold text-slate-600 bg-slate-100/90 px-2.5 py-1 rounded-full border border-slate-200 shadow-xs select-none">
                <span className="relative flex h-2 w-2 mr-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                กำลังอัปเดตข้อมูล...
              </span>
            )}
          </h1>
          <p className="text-sm text-slate-500 mt-1">ออกใบแจ้งยอดผู้เรียน ตรวจสอบภาพสลิปยอดรับ และบันทึกค่าใช้จ่ายสถาบัน</p>
        </div>
      </div>

      {/* Sub-Navigation Bar */}
      <div className="bg-white border-b border-slate-200 rounded-xl mb-6 shadow-sm overflow-hidden">
        <div className="flex overflow-x-auto">
          {[
            { id: 'issue' as const, label: 'แจ้งค่าใช้จ่าย / ออกบิล', icon: PlusCircle },
            { id: 'slips' as const, label: 'ตรวจสอบสลิปแนบ', icon: ClipboardCheck, count: waitcheckInvoiceCount },
            { id: 'summary' as const, label: 'สรุปรายรับและการเงิน', icon: PieChart },
            { id: 'expenses' as const, label: 'บันทึกค่าใช้จ่ายสถาบัน', icon: Receipt },
            { id: 'banks' as const, label: 'บัญชีรับเงินสลับเปิดปิด', icon: Landmark }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = subTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id)}
                className={`flex items-center space-x-2 px-6 py-4 border-b-2 font-medium text-sm transition-all whitespace-nowrap ${
                  isActive
                    ? 'border-[#CD0D13] text-[#CD0D13] bg-rose-50/50 font-bold'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-55'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#CD0D13]' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="bg-[#CD0D13] text-white text-[10px] font-bold px-2 py-0.5 rounded-full ml-1 animate-pulse">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error display */}
      {apiError && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-xs font-semibold">
          {apiError}
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="bg-white/50 backdrop-blur-xs flex items-center justify-center p-12 rounded-2xl border border-slate-200">
          <div className="text-slate-500 font-bold text-xs animate-pulse">กำลังโหลดข้อมูลและสถิติการเงิน...</div>
        </div>
      )}

      {/* Main Tabs Container */}
      {!isLoading && (
        <div className="min-h-[500px]">
          {subTab === 'issue' && (
            <BillingIssueForm
              students={students}
              billings={dedupedBillings}
              onFetchData={fetchData}
              onTriggerToast={triggerToast}
              onOpenEditBilling={(b) => {
                setEditingBilling(b);
                setIsEditBillingModalOpen(true);
              }}
            />
          )}

          {subTab === 'slips' && (
            <VerifySlipsTab
              billings={billings}
              onFetchData={fetchData}
              onTriggerToast={triggerToast}
            />
          )}

          {subTab === 'summary' && (
            <FinancialSummaryTab
              billings={dedupedBillings}
              expenses={expenses}
            />
          )}

          {subTab === 'banks' && (
            <BankAccountsTab
              bankAccounts={bankAccounts}
              onFetchData={fetchData}
              onTriggerToast={triggerToast}
            />
          )}

          {subTab === 'expenses' && (
            <ExpensesTab
              coaches={coaches}
              expenses={expenses}
              onFetchData={fetchData}
              onTriggerToast={triggerToast}
            />
          )}
        </div>
      )}

      {/* Edit Billing Modal */}
      <EditBillingModal
        isOpen={isEditBillingModalOpen}
        onClose={() => setIsEditBillingModalOpen(false)}
        billing={editingBilling}
        onSave={handleSaveBillingEdit}
      />

    </div>
  );
}
