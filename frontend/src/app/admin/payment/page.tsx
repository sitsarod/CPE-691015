"use client";

import React, { useState, useEffect } from "react";
import { PlusCircle, ClipboardCheck, PieChart, Landmark, Receipt } from "lucide-react";
import { BackendUser, BillingDTO, BankAccount, Expense, Coach } from "./components/types";
import Toast from "@/components/Toast";
import BillingIssueForm from "./components/BillingIssueForm";
import VerifySlipsTab from "./components/VerifySlipsTab";
import FinancialSummaryTab from "./components/FinancialSummaryTab";
import BankAccountsTab from "./components/BankAccountsTab";
import ExpensesTab from "./components/ExpensesTab";
import EditBillingModal from "./components/EditBillingModal";

export default function FinancialPortal() {
  const [subTab, setSubTab] = useState<'issue' | 'slips' | 'summary' | 'banks' | 'expenses'>('issue');

  // Live API States
  const [students, setStudents] = useState<BackendUser[]>([]);
  const [billings, setBillings] = useState<BillingDTO[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
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
    try {
      setIsLoading(true);
      setApiError(null);
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      const headers: HeadersInit = {
        "Content-Type": "application/json"
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      // Fetch students, billings, bank accounts, coaches, and expenses in parallel
      const [studentsRes, billingsRes, bankAccountsRes, coachesRes, expensesRes] = await Promise.all([
        fetch("http://localhost:8000/api/users/role?role=customer", { headers }),
        fetch("http://localhost:8000/api/billings/", { headers }),
        fetch("http://localhost:8000/api/bank-accounts/", { headers }),
        fetch("http://localhost:8000/api/coaches", { headers }),
        fetch("http://localhost:8000/api/expenses", { headers })
      ]);

      if (!studentsRes.ok || !billingsRes.ok || !bankAccountsRes.ok || !coachesRes.ok || !expensesRes.ok) {
        throw new Error("ดึงข้อมูลจากเซิร์ฟเวอร์หลักไม่สำเร็จ กรุณาตรวจสอบการรันเซิร์ฟเวอร์ Backend");
      }

      const studentsData = await studentsRes.json();
      const billingsData = await billingsRes.json();
      const bankAccountsData = await bankAccountsRes.json();
      const coachesData = await coachesRes.json();
      const expensesData = await expensesRes.json();

      setStudents(studentsData.data || []);
      setBillings(billingsData.data || []);
      setBankAccounts(bankAccountsData.data || []);
      setCoaches(coachesData.data || []);
      setExpenses(expensesData.data || []);
    } catch (err: any) {
      console.error(err);
      setApiError(err.message);
      triggerToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Save billing edits
  const handleSaveBillingEdit = async (
    billingId: number,
    form: { billingdescription: string; billingamount: string; billingdue_date: string; billingtype_id: string }
  ) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      const response = await fetch(`http://localhost:8000/api/billings/${billingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          billingdescription: form.billingdescription,
          billingamount: parseFloat(form.billingamount),
          billingdue_date: new Date(form.billingdue_date).toISOString(),
          billingtype_id: parseInt(form.billingtype_id)
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "แก้ไขข้อมูลบิลไม่สำเร็จ");
      }

      triggerToast("แก้ไขข้อมูลบิลสำเร็จเรียบร้อย");
      setIsEditBillingModalOpen(false);
      fetchData();
    } catch (err: any) {
      triggerToast(err.message, 'error');
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
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">ระบบการจัดการธุรกรรมและการเงิน</h1>
        <p className="text-sm text-slate-500 mt-1">ออกใบแจ้งยอดผู้เรียน ตรวจสอบภาพสลิปยอดรับ และบันทึกค่าใช้จ่ายสถาบัน</p>
      </div>

      {/* Sub-Navigation Bar */}
      <div className="bg-white border-b border-slate-200 rounded-xl mb-6 shadow-sm overflow-hidden">
        <div className="flex overflow-x-auto">
          {[
            { id: 'issue', label: 'แจ้งค่าใช้จ่าย / ออกบิล', icon: PlusCircle },
            { id: 'slips', label: 'ตรวจสอบสลิปแนบ', icon: ClipboardCheck, count: billings.filter(b => b.billingstatus === 'waitcheck').length },
            { id: 'summary', label: 'สรุปรายรับและการเงิน', icon: PieChart },
            { id: 'expenses', label: 'บันทึกค่าใช้จ่ายสถาบัน', icon: Receipt },
            { id: 'banks', label: 'บัญชีรับเงินสลับเปิดปิด', icon: Landmark }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = subTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id as any)}
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
              billings={billings}
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
              billings={billings}
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
