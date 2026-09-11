"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { PlusCircle, ClipboardCheck, PieChart, Landmark, Receipt, Loader2, ChevronDown } from "lucide-react";
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
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";

export default function FinancialPortal() {
  const [subTab, setSubTab] = useState<'issue' | 'slips' | 'summary' | 'banks' | 'expenses'>('issue');
  // ฟิลเตอร์เริ่มต้นของแท็บตรวจสอบสลิป เมื่อ deep-link มาจากที่อื่น (เช่นแดชบอร์ด)
  const [initialSlipFilter, setInitialSlipFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'unpaid' | undefined>(undefined);
  const tabRowRef = useHorizontalWheelScroll<HTMLDivElement>();

  // เปิดแท็บ/ฟิลเตอร์ตาม query param ตอนเข้าหน้า เช่น /admin/payment?tab=slips&filter=unpaid
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && ['issue', 'slips', 'summary', 'banks', 'expenses'].includes(tab)) {
      setSubTab(tab as 'issue' | 'slips' | 'summary' | 'banks' | 'expenses');
    }
    const filter = params.get('filter');
    if (filter && ['all', 'pending', 'approved', 'rejected', 'unpaid'].includes(filter)) {
      setInitialSlipFilter(filter as 'all' | 'pending' | 'approved' | 'rejected' | 'unpaid');
    }
  }, []);

  // เปลี่ยนแท็บ + เขียน ?tab= ลง URL ด้วย history API เพื่อให้รีเฟรชแล้วยังอยู่แท็บเดิม
  // (ไม่ใช้ Next router เพราะไม่ต้องการ navigation/scroll — แค่บันทึกสถานะไว้ใน URL)
  const changeTab = (id: typeof subTab) => {
    setSubTab(id);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', id);
      window.history.replaceState(null, '', url.toString());
    }
  };

  // แสดง skeleton สั้น ๆ ทุกครั้งที่สลับแท็บ เพื่อให้รู้สึกลื่นและรู้ว่ากำลังโหลดเนื้อหาแท็บใหม่
  const [tabLoading, setTabLoading] = useState(false);
  useEffect(() => {
    setTabLoading(true);
    const t = setTimeout(() => setTabLoading(false), 400);
    return () => clearTimeout(t);
  }, [subTab]);

  // Live API States
  const [students, setStudents] = useState<BackendUser[]>([]);
  const [billings, setBillings] = useState<BillingDTO[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // ป้องกันการดึงข้อมูลซ้อน + กันยิงถี่เกินไปตอน refetch-on-focus
  const isFetchingRef = useRef(false);
  const lastFetchRef = useRef(0);

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
  // background = true คือ refetch เงียบ ๆ (โชว์ pill) · false คือโหลดครั้งแรก (โชว์ overlay)
  const fetchData = async (background = false) => {
    if (isFetchingRef.current) return; // มีการดึงข้อมูลค้างอยู่แล้ว ข้ามไป
    isFetchingRef.current = true;
    try {
      if (background) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
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
      isFetchingRef.current = false;
      lastFetchRef.current = Date.now();
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch อัตโนมัติเมื่อผู้ใช้กลับมาโฟกัสหน้าต่าง/แท็บอีกครั้ง
  // ดึงเงียบ ๆ ไม่โชว์ overlay และ throttle 10 วินาทีเพื่อลดภาระ server
  useEffect(() => {
    const REFETCH_THROTTLE_MS = 10_000;
    const maybeRefetch = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchRef.current < REFETCH_THROTTLE_MS) return;
      fetchData(true);
    };
    window.addEventListener("focus", maybeRefetch);
    document.addEventListener("visibilitychange", maybeRefetch);
    return () => {
      window.removeEventListener("focus", maybeRefetch);
      document.removeEventListener("visibilitychange", maybeRefetch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      fetchData(true);
    } catch (err: unknown) {
      triggerToast(err instanceof Error ? err.message : "แก้ไขข้อมูลบิลไม่สำเร็จ", 'error');
      throw err;
    }
  };

  const subTabs = [
    { id: 'issue' as const, label: 'แจ้งค่าใช้จ่าย / ออกบิล', icon: PlusCircle },
    { id: 'slips' as const, label: 'ตรวจสอบสลิปแนบ', icon: ClipboardCheck, count: waitcheckInvoiceCount },
    { id: 'summary' as const, label: 'สรุปรายรับและการเงิน', icon: PieChart },
    { id: 'expenses' as const, label: 'บันทึกค่าใช้จ่ายสถาบัน', icon: Receipt },
    { id: 'banks' as const, label: 'บัญชีรับเงินสลับเปิดปิด', icon: Landmark }
  ];

  return (
    <div className="mx-auto max-w-7xl font-sans text-slate-800">
      
      {/* Toast Messages */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* header (editorial) */}
      <div className="mb-6 border-b border-gray-200 pb-6">
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-slate-900">การเงิน</h1>
        <p className="mt-1.5 text-[13px] font-light text-slate-500">
          ศูนย์การเงิน · ตรวจสลิป ออกบิล สรุปรายรับ-รายจ่าย และจัดการบัญชีรับเงิน
        </p>
      </div>

      {/* แถบสถานะตอน refetch เบื้องหลัง — ลอยใต้ topbar ไม่บังเนื้อหา */}
      {isRefreshing && (
        <div className="fixed left-1/2 top-[104px] z-30 -translate-x-1/2 animate-fadeIn">
          <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-4 py-1.5 text-xs font-bold text-gray-600 shadow-md backdrop-blur">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#CC0000]" />
            กำลังอัปเดตข้อมูล...
          </div>
        </div>
      )}

      {/* Sub-Navigation — จอเล็ก: dropdown · จอใหญ่: แถวแท็บ */}
      {/* Mobile dropdown */}
      <div className="sm:hidden mb-6">
        <div className="relative">
          <select
            value={subTab}
            onChange={(e) => changeTab(e.target.value as typeof subTab)}
            className="w-full appearance-none bg-white border border-slate-200 rounded-xl shadow-sm pl-4 pr-10 py-3 text-sm font-bold text-[#CD0D13] outline-none focus:border-[#CD0D13] focus:ring-2 focus:ring-red-100"
          >
            {subTabs.map((tab) => (
              <option key={tab.id} value={tab.id} className="text-slate-800 font-medium">
                {tab.label}
                {tab.count !== undefined && tab.count > 0 ? ` (${tab.count})` : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Desktop tab row */}
      <div className="hidden sm:block border-b border-gray-200 mb-6 overflow-hidden">
        <div ref={tabRowRef} className="flex overflow-x-auto no-scrollbar">
          {subTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = subTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => changeTab(tab.id)}
                className={`flex items-center space-x-2 px-6 py-4 border-b-2 font-medium text-sm transition-all whitespace-nowrap ${
                  isActive
                    ? 'border-[#CD0D13] text-[#CD0D13] bg-rose-50/50 font-bold'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-55'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#CD0D13]' : 'text-slate-400'}`} />
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

      {/* Loading Skeleton (โหลดครั้งแรก) — ใช้โครงเดียวกับตอนสลับแท็บ ไม่ให้หน้ากระโดด */}
      {isLoading && (
        <div className="min-h-[500px]">
          <TabSkeleton tab={subTab} />
        </div>
      )}

      {/* Main Tabs Container */}
      {!isLoading && (
        <div className="min-h-[500px]">
          {tabLoading ? (
            <TabSkeleton tab={subTab} />
          ) : (
          <>
          {subTab === 'issue' && (
            <BillingIssueForm
              students={students}
              billings={dedupedBillings}
              onFetchData={() => fetchData(true)}
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
              onFetchData={() => fetchData(true)}
              onTriggerToast={triggerToast}
              initialFilter={initialSlipFilter}
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
              onFetchData={() => fetchData(true)}
              onTriggerToast={triggerToast}
            />
          )}

          {subTab === 'expenses' && (
            <ExpensesTab
              coaches={coaches}
              expenses={expenses}
              onFetchData={() => fetchData(true)}
              onTriggerToast={triggerToast}
            />
          )}
          </>
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

// Skeleton เฉพาะทางของแต่ละแท็บ — ล้อ layout จริงของแท็บนั้น ๆ ไม่ให้หน้ากระโดด
function TabSkeleton({ tab }: { tab: 'issue' | 'slips' | 'summary' | 'banks' | 'expenses' }) {
  const skeletons = {
    issue: <IssueSkeleton />,
    slips: <SlipsSkeleton />,
    summary: <SummarySkeleton />,
    expenses: <ExpensesSkeleton />,
    banks: <BanksSkeleton />,
  };
  return (
    <div className="animate-pulse" aria-hidden="true">
      {skeletons[tab]}
    </div>
  );
}

const CARD = "border border-gray-200 bg-white";

// แจ้งค่าใช้จ่าย/ออกบิล — ฟอร์มใหญ่ (2 คอลัมน์) + คอลัมน์รายการด้านข้าง
function IssueSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className={`lg:col-span-2 ${CARD} p-6 space-y-5`}>
        <div className="flex gap-1.5 bg-slate-100 p-1.5 rounded-xl max-w-md">
          <div className="h-8 flex-1 rounded-lg bg-white" />
          <div className="h-8 flex-1 rounded-lg bg-slate-200/60" />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-24 rounded bg-slate-100" />
            <div className="h-10 w-full rounded-xl bg-slate-100" />
          </div>
        ))}
        <div className="h-11 w-full rounded-xl bg-slate-200" />
      </div>
      <div className={`${CARD} p-6 space-y-4 self-start`}>
        <div className="h-4 w-32 rounded bg-slate-200" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 border-b border-slate-50 pb-3">
            <div className="h-3 w-3/4 rounded bg-slate-100" />
            <div className="h-3 w-1/2 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ตรวจสอบสลิป — การ์ดเดียว: หัว (ค้นหา + ฟิลเตอร์) + รายการสลิป
function SlipsSkeleton() {
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row gap-4">
        <div className="h-9 w-full sm:w-64 rounded-xl bg-slate-100" />
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-7 w-16 rounded-lg bg-slate-200/60" />)}
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 p-5">
            <div className="h-12 w-12 rounded-xl bg-slate-100 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-40 rounded bg-slate-200" />
              <div className="h-3 w-56 max-w-full rounded bg-slate-100" />
            </div>
            <div className="h-6 w-20 rounded-lg bg-slate-100 shrink-0 hidden sm:block" />
            <div className="h-8 w-24 rounded-lg bg-slate-200 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

// สรุปการเงิน — ฟิลเตอร์ + การ์ดสถิติ + กราฟแนวโน้ม + รายรับ/รายจ่ายแยกประเภท
function SummarySkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-9 w-20 rounded-xl bg-slate-100" />)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${CARD} p-6 flex items-center gap-4`}>
            <div className="h-12 w-12 rounded-xl bg-slate-100 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-2/3 rounded bg-slate-100" />
              <div className="h-5 w-1/2 rounded bg-slate-200" />
            </div>
          </div>
        ))}
      </div>
      <div className={`${CARD} p-6`}>
        <div className="mb-6 h-4 w-40 rounded bg-slate-200" />
        <div className="flex h-40 items-end gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex-1 rounded-t-md bg-slate-100" style={{ height: `${30 + ((i * 23) % 60)}%` }} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[0, 1].map((c) => (
          <div key={c} className={`${CARD} p-6 space-y-4`}>
            <div className="h-4 w-40 rounded bg-slate-200" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex justify-between">
                  <div className="h-3 w-20 rounded bg-slate-100" />
                  <div className="h-3 w-16 rounded bg-slate-100" />
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// บันทึกค่าใช้จ่าย — ฟอร์ม (1 คอลัมน์) + ตาราง (2 คอลัมน์)
function ExpensesSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className={`${CARD} p-6 space-y-4 self-start`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-24 rounded bg-slate-100" />
            <div className="h-10 w-full rounded-xl bg-slate-100" />
          </div>
        ))}
        <div className="h-11 w-full rounded-xl bg-slate-200" />
      </div>
      <div className={`lg:col-span-2 ${CARD} overflow-hidden self-start`}>
        <div className="p-6 border-b border-slate-200">
          <div className="h-4 w-48 rounded bg-slate-200" />
        </div>
        <div className="divide-y divide-slate-100">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
              <div className="h-3 w-20 rounded bg-slate-100" />
              <div className="h-3 flex-1 rounded bg-slate-100" />
              <div className="h-3 w-16 rounded bg-slate-100" />
              <div className="h-6 w-6 rounded-full bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// บัญชีรับเงิน — กริดการ์ดบัญชี
function BanksSkeleton() {
  return (
    <div className={`${CARD} p-6`}>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-3xl border border-slate-200 p-6 space-y-4">
            <div className="flex justify-between">
              <div className="h-5 w-28 rounded bg-slate-200" />
              <div className="h-5 w-16 rounded-full bg-slate-100" />
            </div>
            <div className="rounded-2xl bg-slate-50 p-5 space-y-3">
              <div className="h-3 w-16 rounded bg-slate-100" />
              <div className="h-5 w-40 rounded bg-slate-200" />
              <div className="h-3 w-16 rounded bg-slate-100" />
              <div className="h-5 w-32 rounded bg-slate-200" />
            </div>
            <div className="h-9 w-full rounded-xl bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
