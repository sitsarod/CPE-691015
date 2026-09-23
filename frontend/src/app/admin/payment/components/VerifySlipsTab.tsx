import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { BillingDTO } from './types';
import { confirmSlip, confirmCashPayment, rejectSlip, createInvoice } from "@/services/paymentAPI";

import { useConfirm } from "@/components/ConfirmProvider";
export interface VerifySlipsTabProps {
  billings: BillingDTO[];
  onFetchData: () => void;
  onTriggerToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  // ฟิลเตอร์เริ่มต้น (ใช้ตอน deep-link มาจากแดชบอร์ด เช่น ?filter=unpaid)
  initialFilter?: 'all' | 'pending' | 'approved' | 'rejected' | 'unpaid';
}

// กลุ่มหนึ่ง = หนึ่งใบแจ้งหนี้ (invoice) สร้างจากข้อมูล billings ที่มีอยู่ ไม่มี endpoint ใหม่
interface InvoiceGroup {
  invoiceId?: number;
  customer?: BillingDTO['customer'];
  customerId: number;
  billings: BillingDTO[];
  totalAmount: number;
  billingstatus: BillingDTO['billingstatus'];
  paymentMethod?: BillingDTO['paymentmethod'];
  slipurl?: string;
  transactionid?: string;
  slipokChecked?: boolean;
  slipokPassed?: boolean;
  slipokMessage?: string;
  receivingBankName?: string;
  receivingAccountNo?: string;
  confirmedBy?: BillingDTO['confirmed_by'];
  admin?: BillingDTO['admin'];
  updatedBy?: BillingDTO['updated_by'];
  dueDate: string;
  createdAt: string;
  paidAt?: string;
}

const groupKey = (g: InvoiceGroup) => g.invoiceId ? `invoice-${g.invoiceId}` : `bill-${g.billings[0]?.id}`;

export default function VerifySlipsTab({
  billings,
  onFetchData,
  onTriggerToast,
  initialFilter
}: VerifySlipsTabProps) {
  const confirmAction = useConfirm();
  const [slipFilter, setSlipFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'unpaid'>(initialFilter ?? 'pending');
  const [slipSearchTerm, setSlipSearchTerm] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);
  const [submitting, setSubmitting] = useState<'approve' | 'reject' | 'cash' | null>(null);
  const [slipImgError, setSlipImgError] = useState(false);
  const [imgReloadToken, setImgReloadToken] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const advanceRef = useRef(false);

  // ── ฟอร์แมตช่วย ─────────────────────────────────────────────
  const fmtBaht = (n: number) => `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("th-TH", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
  };
  const formatDateOnly = (dateStr?: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
  };

  // แถวที่ตรงกับตัวกรอง + คำค้น (logic เดิม — ไม่แตะ)
  const waitcheckBillings = useMemo(() => {
    return billings.filter(b => {
      let matchesStatus = false;
      if (slipFilter === 'all') {
        // "ทั้งหมด" = ทุกรายการจริง ๆ — รวมค้างชำระ (unfunded/overdue ไม่มีสลิป) และ
        // จ่ายเงินสด (paid ไม่มีสลิป) ด้วย ไม่ใช่แค่รายการที่มีสลิป/รอตรวจ
        // (backend ตัดใบแจ้งหนี้ที่ยกเลิกทิ้งไปแล้ว จึงเหลือแต่สถานะที่ควรแสดง)
        matchesStatus = true;
      } else if (slipFilter === 'pending') {
        matchesStatus = b.billingstatus === 'waitcheck';
      } else if (slipFilter === 'approved') {
        matchesStatus = b.billingstatus === 'paid';
      } else if (slipFilter === 'rejected') {
        matchesStatus = b.billingstatus === 'unfunded' && !!b.slipurl;
      } else if (slipFilter === 'unpaid') {
        // ค้างชำระ = ยังไม่เคยแนบสลิปเลย — กันบิลที่ถูก "ปฏิเสธ" (unfunded + มีสลิป) ปนเข้ามา
        // เพราะบิลที่ถูกปฏิเสธก็ถูกคืนสถานะเป็น unfunded เหมือนกัน แต่ยังมี slipurl ติดอยู่
        matchesStatus = (b.billingstatus === 'unfunded' || b.billingstatus === 'overdue') && !b.slipurl;
      }

      const studentName = `${b.customer?.firstName || ''} ${b.customer?.lastName || ''}`.toLowerCase();
      const desc = (b.billingdescription || '').toLowerCase();
      const typeName = (b.billing_type?.billingtypename || '').toLowerCase();
      const idStr = `bill-${b.id}`.toLowerCase();
      const invoiceIdStr = b.invoice_id ? `invoice-${b.invoice_id}`.toLowerCase() : '';
      const invoiceIdNumStr = b.invoice_id ? `#${b.invoice_id}`.toLowerCase() : '';
      const query = slipSearchTerm.toLowerCase();

      const matchesSearch = studentName.includes(query) ||
                            desc.includes(query) ||
                            typeName.includes(query) ||
                            idStr.includes(query) ||
                            invoiceIdStr.includes(query) ||
                            invoiceIdNumStr.includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [billings, slipFilter, slipSearchTerm]);

  // จัดกลุ่มตาม invoice_id (logic เดิม — ไม่แตะ)
  const groupedWaitcheckBillings = useMemo<InvoiceGroup[]>(() => {
    const groups: Record<string, InvoiceGroup> = {};

    waitcheckBillings.forEach(b => {
      const key = b.invoice_id ? `invoice-${b.invoice_id}` : `bill-${b.id}`;
      if (!groups[key]) {
        groups[key] = {
          invoiceId: b.invoice_id,
          customer: b.customer,
          customerId: b.customer_id,
          billings: [],
          totalAmount: 0,
          billingstatus: b.billingstatus,
          paymentMethod: b.paymentmethod,
          slipurl: b.slipurl,
          transactionid: b.transactionid,
          slipokChecked: b.slipok_checked,
          slipokPassed: b.slipok_passed,
          slipokMessage: b.slipok_message,
          receivingBankName: b.receiving_bank_name,
          receivingAccountNo: b.receiving_account_no,
          confirmedBy: b.confirmed_by,
          admin: b.admin,
          updatedBy: b.updated_by,
          dueDate: b.billingdue_date,
          createdAt: b.created_at,
          paidAt: b.paid_at,
        };
      }
      groups[key].billings.push(b);
      groups[key].totalAmount += b.billingamount;
    });

    return Object.values(groups).sort((a, b) => {
      if (a.invoiceId && b.invoiceId) return b.invoiceId - a.invoiceId;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [waitcheckBillings]);

  // แบ่งหน้ารายการ 10 รายการ/หน้า (logic เดิม)
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [slipFilter, slipSearchTerm]);
  const totalPages = Math.max(1, Math.ceil(groupedWaitcheckBillings.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedGroups = useMemo(
    () => groupedWaitcheckBillings.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [groupedWaitcheckBillings, safePage]
  );

  // กลุ่มที่ถูกเลือกอยู่ (คำนวณสดจากข้อมูลล่าสุด เพื่อให้ auto-advance หลัง refetch ทำงานได้)
  const selectedGroup = useMemo(
    () => groupedWaitcheckBillings.find(g => groupKey(g) === selectedKey) ?? null,
    [groupedWaitcheckBillings, selectedKey]
  );

  // รีเซ็ตสถานะรูปทุกครั้งที่เปลี่ยนรายการที่เลือก
  useEffect(() => { setSlipImgError(false); setImgReloadToken(0); setLightboxOpen(false); }, [selectedKey]);

  // หลังตัดสินเสร็จ + refetch → เลื่อนไปรายการรอตรวจถัดไปอัตโนมัติ ถ้าหมดให้ขึ้น empty "ครบทุกรายการ"
  useEffect(() => {
    if (!advanceRef.current) return;
    advanceRef.current = false;
    const next = groupedWaitcheckBillings[0];
    if (next) {
      setSelectedKey(groupKey(next));
      setAllDone(false);
    } else {
      setSelectedKey(null);
      setAllDone(true);
    }
  }, [groupedWaitcheckBillings]);

  const selectGroup = (g: InvoiceGroup) => { setSelectedKey(groupKey(g)); setAllDone(false); };

  // ── การตัดสิน (API เดิมทั้งหมด) ─────────────────────────────
  const handleApproveSlip = async (invoiceId: number) => {
    setSubmitting('approve');
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      await confirmSlip(invoiceId, token || "");
      onTriggerToast('อนุมัติยอดเงินโอนเข้าเรียนเรียบร้อยแล้ว');
      advanceRef.current = true;
      onFetchData();
    } catch (err: unknown) {
      onTriggerToast(err instanceof Error ? err.message : 'อนุมัติสลิปไม่สำเร็จ', 'error');
    } finally {
      setSubmitting(null);
    }
  };

  const handleRejectSlip = async (invoiceId: number, reason: string) => {
    setSubmitting('reject');
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      await rejectSlip(invoiceId, reason, token || "");
      onTriggerToast('ปฏิเสธหลักฐานการแนบสลิปเรียบร้อยแล้ว');
      advanceRef.current = true;
      onFetchData();
    } catch (err: unknown) {
      onTriggerToast(err instanceof Error ? err.message : 'ปฏิเสธสลิปไม่สำเร็จ', 'error');
    } finally {
      setSubmitting(null);
    }
  };

  // ปฏิเสธต้องถามเหตุผลก่อนเสมอ (ห้ามปฏิเสธทันที) — ใช้ prompt เดิมของ browser
  const requestReject = (invoiceId: number) => {
    const reason = window.prompt('ระบุเหตุผลการปฏิเสธสลิป (ผู้เรียนจะได้รับแจ้งเหตุผลนี้)');
    if (reason === null) return;                       // กดยกเลิก
    if (!reason.trim()) {
      onTriggerToast('กรุณาระบุเหตุผลการปฏิเสธก่อน', 'error');
      return;
    }
    handleRejectSlip(invoiceId, reason.trim());
  };

  // ลูกค้าจ่ายเงินสด (logic เดิม)
  const handleCashPayment = async (group: InvoiceGroup) => {
    if (!(await confirmAction(
      `ยืนยันว่าลูกค้าชำระด้วยเงินสด ยอด ${fmtBaht(group.totalAmount)} ใช่หรือไม่?`
    ))) return;

    setSubmitting('cash');
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      let invoiceId = group.invoiceId;
      if (!invoiceId) {
        const billingIds = group.billings.map(b => b.id);
        const invoice = await createInvoice(group.customerId, billingIds, 'cash', token || "");
        invoiceId = invoice.id;
      }
      // ต้องใช้ confirm-cash ไม่ใช่ confirm ธรรมดา — ใบที่ลูกค้าสร้างไว้ด้วย QR แล้วแนบสลิป
      // จะยังเป็น method=qr อยู่ ถ้ายืนยันด้วย confirmSlip เฉย ๆ ใบจะโชว์ว่าจ่าย PromptPay QR
      await confirmCashPayment(invoiceId, token || "");
      onTriggerToast('บันทึกการชำระเงินสดเรียบร้อยแล้ว');
      advanceRef.current = true;
      onFetchData();
    } catch (err: unknown) {
      onTriggerToast(err instanceof Error ? err.message : 'บันทึกการชำระเงินสดไม่สำเร็จ', 'error');
    } finally {
      setSubmitting(null);
    }
  };

  // ── สี/ข้อความตามสถานะของแถว (ธีมเดิม) ─────────────────────
  const statusMeta = (g: InvoiceGroup) => {
    if (g.billingstatus === 'paid') {
      return { bar: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'อนุมัติแล้ว' };
    }
    if (g.billingstatus === 'waitcheck') {
      return { bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 border-amber-200', label: 'รอตรวจสอบ' };
    }
    if ((g.billingstatus === 'unfunded' || g.billingstatus === 'overdue') && g.slipurl) {
      return { bar: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700 border-rose-200', label: 'ปฏิเสธแล้ว' };
    }
    return { bar: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600 border-slate-200', label: 'ค้างชำระ' };
  };

  const metaLine = (g: InvoiceGroup) => {
    const id = g.invoiceId ? `ใบแจ้งหนี้ #${g.invoiceId}` : `บิล #BILL-${g.billings[0]?.id}`;
    const base = `${id} · ${g.billings.length} บิล`;
    if (g.billingstatus === 'paid') {
      const who = g.confirmedBy ? `${g.confirmedBy.firstName} ${g.confirmedBy.lastName}` : 'ระบบอัตโนมัติ';
      return `${base} · อนุมัติเมื่อ ${formatDateOnly(g.paidAt || g.createdAt)} โดย ${who}`;
    }
    return `${base} · แจ้งชำระ ${formatDateTime(g.createdAt)}`;
  };

  // ปุ่มตัวกรอง — mobile ตัด "ทั้งหมด" ออก (เหลือ 4)
  const filters: { id: typeof slipFilter; label: string; mobile: boolean }[] = [
    { id: 'all', label: 'ทั้งหมด', mobile: false },
    { id: 'pending', label: 'รอตรวจสอบ', mobile: true },
    { id: 'approved', label: 'อนุมัติแล้ว', mobile: true },
    { id: 'rejected', label: 'ปฏิเสธแล้ว', mobile: true },
    { id: 'unpaid', label: 'ค้างชำระ', mobile: true },
  ];

  const isSubmitting = submitting !== null;

  return (
    <div className="border border-gray-200 bg-white animate-fadeIn">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.05fr]">

        {/* ───────────── คอลัมน์ซ้าย: คิวรายการ ───────────── */}
        <div className="min-w-0 p-6 lg:border-r lg:border-gray-200">
          {/* 1) ช่องค้นหา */}
          <div className="relative">
            <input
              type="text"
              value={slipSearchTerm}
              onChange={(e) => setSlipSearchTerm(e.target.value)}
              placeholder="ค้นหาชื่อผู้เรียน บิล หรือประเภท..."
              className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 text-xs text-slate-800 outline-none transition-all focus:border-[#CD0D13]"
            />
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>

          {/* 2) ตัวกรองสถานะ */}
          <div className="mt-4 flex gap-1 border border-gray-200 p-1">
            {filters.map(f => {
              const active = slipFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setSlipFilter(f.id)}
                  className={`flex-1 rounded-lg px-1.5 py-2 text-[11px] leading-tight transition-all ${f.mobile ? '' : 'hidden sm:block'} ${
                    active
                      ? 'bg-[#FFF0F0] font-bold text-[#CD0D13]'
                      : 'font-medium text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* 3) ลิสต์ — หนึ่งแถว = หนึ่งใบแจ้งหนี้ */}
          <div className="mt-2">
            {groupedWaitcheckBillings.length === 0 ? (
              // empty ตามตัวกรอง (คงตัวกรอง + ช่องค้นหาไว้ให้เห็น)
              <div className="mt-4 flex min-h-[160px] items-center justify-center border border-gray-200 bg-gray-50 px-4 text-center">
                <p className="text-xs text-slate-500">ไม่มีรายการในสถานะนี้</p>
              </div>
            ) : (
              pagedGroups.map((group, idx) => {
                const meta = statusMeta(group);
                const isSelected = groupKey(group) === selectedKey;
                const isLast = idx === pagedGroups.length - 1;
                const isApproved = group.billingstatus === 'paid';
                const isClosed = group.billingstatus !== 'waitcheck';

                return (
                  <div
                    key={groupKey(group)}
                    className={`relative flex flex-col gap-3 py-[18px] pl-4 md:flex-row md:items-center md:gap-[18px] ${isLast ? 'border-b border-gray-200' : 'border-b border-gray-100'} ${isSelected ? 'bg-rose-50/40' : ''}`}
                  >
                    {/* แถบสีสถานะซ้าย */}
                    <span className={`absolute left-0 top-1/2 h-14 w-[3px] -translate-y-1/2 ${meta.bar}`} />

                    {/* กลาง */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-[15px] font-medium text-slate-900">
                          {group.customer ? `${group.customer.firstName} ${group.customer.lastName}` : "ผู้เรียน"}
                          {group.customer?.nickname ? ` (${group.customer.nickname})` : ""}
                        </span>
                        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${meta.chip}`}>
                          {meta.label}
                        </span>
                      </div>
                      <span className="mt-1 block text-xs text-slate-500">
                        {metaLine(group)}
                      </span>
                    </div>

                    {/* ขวา: ยอด + ปุ่ม */}
                    <div className="flex items-center justify-between gap-4 md:justify-end">
                      <div className="text-left md:text-right">
                        <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400">ยอดเงินโอนรวม</span>
                        <span className={`text-[17px] font-semibold tabular-nums ${isClosed ? 'text-slate-400' : 'text-slate-900'}`}>
                          {fmtBaht(group.totalAmount)}
                        </span>
                      </div>
                      <button
                        onClick={() => selectGroup(group)}
                        className={`flex h-[38px] shrink-0 items-center whitespace-nowrap rounded-lg px-4 text-xs font-bold transition-colors ${
                          isSelected
                            ? 'bg-[#CD0D13] text-white hover:bg-[#A30A0E]'
                            : 'border border-gray-300 text-slate-700 hover:border-[#CD0D13] hover:text-[#CD0D13]'
                        }`}
                      >
                        {isApproved ? 'ดูสลิป' : 'ดูสลิป & ตรวจสอบ'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination (logic เดิม) */}
          {groupedWaitcheckBillings.length > 0 && (
            <div className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-3 text-xs sm:flex-row">
              <span className="text-slate-500">
                แสดง {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, groupedWaitcheckBillings.length)} จาก {groupedWaitcheckBillings.length} รายการ
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  title={safePage <= 1 ? 'อยู่หน้าแรกแล้ว' : 'หน้าก่อนหน้า'}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ก่อนหน้า
                </button>
                <span className="whitespace-nowrap font-semibold text-slate-600">หน้า {safePage}/{totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  title={safePage >= totalPages ? 'อยู่หน้าสุดท้ายแล้ว' : 'หน้าถัดไป'}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}
        </div>{/* /คอลัมน์ซ้าย */}

        {/* ───────────── คอลัมน์ขวา: แผงตรวจสอบ ─────────────
            desktop: อยู่ในกริด · mobile: เปิดเต็มจอเมื่อเลือกรายการ */}
        <div
          className={`min-w-0 ${
            selectedGroup
              ? 'fixed inset-0 z-50 flex min-h-screen flex-col overflow-y-auto bg-white lg:static lg:z-auto lg:min-h-0 lg:overflow-visible'
              : 'hidden lg:block'
          }`}
        >
          {!selectedGroup ? (
            // ยังไม่เลือกอะไร (desktop) / ตรวจครบทุกรายการแล้ว
            <div className="flex min-h-[420px] items-center justify-center p-6 text-center">
              <p className="max-w-[260px] text-sm text-slate-400">
                {allDone ? 'ตรวจสลิปครบทุกรายการแล้ว' : 'เลือกใบแจ้งหนี้จากรายการด้านซ้ายเพื่อตรวจสอบสลิป'}
              </p>
            </div>
          ) : (
            <div className="mx-auto flex min-h-full w-full max-w-xl flex-1 flex-col gap-5 p-6 pb-[calc(24px+env(safe-area-inset-bottom))] lg:max-w-none lg:pb-6">
              {/* 1) หัวแผง */}
              <div className="flex items-end justify-between gap-4 border-b border-gray-200 pb-4">
                <h2 className="text-xl font-semibold tracking-tight text-slate-900">รายละเอียดและผลตรวจสอบ</h2>
                <div className="flex items-center gap-3">
                  <span className="whitespace-nowrap text-xs text-slate-500">
                    {selectedGroup.invoiceId ? `ใบแจ้งหนี้ #${selectedGroup.invoiceId}` : `BILL-${selectedGroup.billings[0]?.id}`}
                  </span>
                  <button
                    onClick={() => setSelectedKey(null)}
                    className="cursor-pointer p-1 text-slate-400 transition-colors hover:text-slate-600"
                    aria-label="ปิด"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* 2) รูปสลิป */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">หลักฐานสลิปการโอนเงิน</span>
                {selectedGroup.slipurl && !slipImgError ? (
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    title="กดเพื่อดูสลิปขนาดเต็ม"
                    className="flex h-[300px] w-full cursor-zoom-in items-center justify-center border border-gray-200 p-2 sm:h-[460px]"
                  >
                    <img
                      key={imgReloadToken}
                      src={selectedGroup.slipurl}
                      alt="หลักฐานสลิปการโอนเงิน"
                      className="mx-auto max-h-full w-auto object-contain"
                      onError={() => setSlipImgError(true)}
                    />
                  </button>
                ) : selectedGroup.slipurl && slipImgError ? (
                  // สลิปโหลดไม่ขึ้น
                  <div className="flex h-[200px] w-full flex-col items-center justify-center gap-2 border border-rose-300 bg-rose-50/60 text-center sm:h-[460px]">
                    <p className="text-sm font-semibold text-rose-600">โหลดรูปสลิปไม่สำเร็จ</p>
                    <button
                      type="button"
                      onClick={() => { setSlipImgError(false); setImgReloadToken(t => t + 1); }}
                      className="text-xs font-semibold text-[#CD0D13] underline underline-offset-2"
                    >
                      ลองใหม่
                    </button>
                  </div>
                ) : (
                  // ไม่มีสลิปแนบ
                  <div className="flex h-[200px] w-full items-center justify-center border border-dashed border-gray-300 text-center sm:h-[460px]">
                    <p className="text-sm text-slate-500">ยังไม่มีการอัปโหลดสลิปสำหรับรายการนี้</p>
                  </div>
                )}
                <span className="text-[11.5px] text-slate-500">
                  กดที่รูปเพื่อดูขนาดเต็ม · สามารถเปิดแอปธนาคารและสแกน QR code บนสลิปเพื่อตรวจสอบได้
                </span>
              </div>

              {/* Lightbox — ดูสลิปขนาดเต็มในหน้าเดียวกัน (ไม่เปิดแท็บใหม่) */}
              {lightboxOpen && selectedGroup.slipurl && (
                <div
                  className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
                  onClick={() => setLightboxOpen(false)}
                  role="dialog"
                  aria-modal="true"
                >
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(false)}
                    className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
                    aria-label="ปิด"
                  >
                    <X className="h-6 w-6" />
                  </button>
                  <img
                    src={selectedGroup.slipurl}
                    alt="หลักฐานสลิปการโอนเงิน (ขนาดเต็ม)"
                    className="max-h-[90vh] max-w-[92vw] object-contain"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}

              {/* 3) ตารางรายละเอียด */}
              <div className="flex flex-col divide-y divide-gray-100 border-y border-gray-200">
                <div className="flex items-center justify-between gap-4 py-[13px]">
                  <span className="text-xs text-slate-500">ผู้เรียน</span>
                  <span className="text-right text-[13.5px] font-medium text-slate-900">
                    {selectedGroup.customer ? `${selectedGroup.customer.firstName} ${selectedGroup.customer.lastName}` : "ผู้เรียน"}
                    {selectedGroup.customer?.nickname ? ` (${selectedGroup.customer.nickname})` : ""}
                  </span>
                </div>

                {/* ช่องทางชำระเงิน — ขึ้นป้ายเขียว "เงินสด" ให้ชัดเมื่อเป็นการรับเงินสด */}
                <div className="flex items-center justify-between gap-4 py-[13px]">
                  <span className="text-xs text-slate-500">ช่องทางชำระเงิน</span>
                  {selectedGroup.paymentMethod === 'cash' ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      เงินสด
                    </span>
                  ) : (
                    <span className="text-right text-[13.5px] text-slate-800">โอนเงินผ่านธนาคาร</span>
                  )}
                </div>

                {/* รายละเอียดบิล — หลายบิลแตกเป็นลิสต์ย่อย */}
                <div className="flex items-start justify-between gap-4 py-[13px]">
                  <span className="shrink-0 text-xs text-slate-500">รายละเอียดบิล</span>
                  <div className="flex min-w-0 flex-col items-end gap-1.5">
                    {selectedGroup.billings.map(b => (
                      <div key={`bill-${b.id}`} className="flex w-full items-start justify-end gap-4 text-right">
                        <span className="text-[13.5px] text-slate-800">{b.billingdescription}</span>
                        {selectedGroup.billings.length > 1 && (
                          <span className="shrink-0 text-[13.5px] tabular-nums text-slate-500">{fmtBaht(b.billingamount)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 py-[13px]">
                  <span className="text-xs text-slate-500">ประเภทค่าใช้จ่าย</span>
                  <span className="text-right text-[13.5px] text-slate-800">
                    {Array.from(new Set(selectedGroup.billings.map(b => b.billing_type?.billingtypename).filter(Boolean))).join(' · ') || '-'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4 py-[13px]">
                  <span className="text-xs text-slate-500">ครบกำหนดชำระ</span>
                  <span className="text-right text-[13.5px] tabular-nums text-slate-800">{formatDateOnly(selectedGroup.dueDate)}</span>
                </div>

                {/* ผู้ออกบิล + ผู้แก้ไขล่าสุด (audit) */}
                {(selectedGroup.admin || selectedGroup.updatedBy) && (
                  <div className="flex items-start justify-between gap-4 py-[13px]">
                    <span className="shrink-0 text-xs text-slate-500">ผู้ออกบิล</span>
                    <div className="flex flex-col items-end text-right">
                      <span className="text-[13.5px] text-slate-800">
                        {selectedGroup.admin ? `${selectedGroup.admin.firstName} ${selectedGroup.admin.lastName}` : '-'}
                      </span>
                      {selectedGroup.updatedBy && (
                        <span className="text-[11px] text-slate-400">
                          แก้ไขล่าสุดโดย {selectedGroup.updatedBy.firstName} {selectedGroup.updatedBy.lastName}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-start justify-between gap-4 py-[13px]">
                  <span className="shrink-0 text-xs text-slate-500">บัญชีที่โอนเข้า</span>
                  <div className="flex flex-col items-end text-right">
                    <span className="text-[13.5px] text-slate-800">
                      {selectedGroup.receivingBankName
                        ? `${selectedGroup.receivingBankName}${selectedGroup.receivingAccountNo ? ` · ${selectedGroup.receivingAccountNo}` : ''}`
                        : (selectedGroup.slipurl ? 'โอนผ่านธนาคาร / PromptPay' : '-')}
                    </span>
                    {selectedGroup.transactionid && (
                      <span className="text-[11px] tabular-nums text-slate-400">อ้างอิง: {selectedGroup.transactionid}</span>
                    )}
                  </div>
                </div>

                {/* ผู้อนุมัติ — แสดงเมื่อบิลอนุมัติแล้ว */}
                {selectedGroup.billingstatus === 'paid' && (
                  <div className="flex items-start justify-between gap-4 py-[13px]">
                    <span className="shrink-0 text-xs text-slate-500">ผู้อนุมัติ</span>
                    <div className="flex flex-col items-end text-right">
                      <span className="text-[13.5px] font-medium text-slate-900">
                        {selectedGroup.confirmedBy
                          ? `${selectedGroup.confirmedBy.firstName} ${selectedGroup.confirmedBy.lastName}`
                          : 'ระบบอัตโนมัติ (SlipOK)'}
                      </span>
                      <span className="text-[11px] tabular-nums text-slate-400">
                        อนุมัติเมื่อ {formatDateOnly(selectedGroup.paidAt || selectedGroup.createdAt)}
                      </span>
                    </div>
                  </div>
                )}

                {/* แถวยอดรวม */}
                <div className="flex items-baseline justify-between gap-4 py-4">
                  <span className="text-xs text-slate-500">ยอดเงินเรียกเก็บรวม</span>
                  <span className="text-2xl font-semibold tabular-nums text-[#CD0D13]">{fmtBaht(selectedGroup.totalAmount)}</span>
                </div>
              </div>

              {/* 4) ผลตรวจสลิปอัตโนมัติ (SlipOK) — 3 กรณีตามข้อมูลจริงจาก backend */}
              {!selectedGroup.slipokChecked ? (
                // ยังไม่เคยตรวจ (บัญชีไม่ได้เปิด auto-verify)
                <div className="flex items-start gap-3 border border-gray-200 bg-slate-50 px-4 py-3.5">
                  <span className="mt-[6px] block h-2 w-2 shrink-0 rounded-full bg-slate-400" />
                  <p className="text-[12.5px] leading-relaxed text-slate-600">
                    สลิปนี้ไม่ได้เปิดตรวจสลิปอัตโนมัติ กรุณาตรวจด้วยตนเอง
                  </p>
                </div>
              ) : selectedGroup.slipokPassed ? (
                // ตรวจผ่าน
                <div className="flex items-start gap-3 border border-emerald-200 bg-emerald-50/60 px-4 py-3.5">
                  <span className="mt-[6px] block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <p className="text-[12.5px] leading-relaxed text-slate-600">
                    ตรวจสลิปอัตโนมัติ (SlipOK): {selectedGroup.slipokMessage || 'ยอดและเวลาโอนตรงกับบิล'}
                  </p>
                </div>
              ) : (
                // ตรวจแล้วไม่ผ่าน
                <div className="flex items-start gap-3 border border-rose-300 bg-rose-50/60 px-4 py-3.5">
                  <span className="mt-[6px] block h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                  <p className="text-[12.5px] leading-relaxed text-slate-600">
                    ตรวจสลิปอัตโนมัติ (SlipOK) ไม่ผ่าน{selectedGroup.slipokMessage ? `: ${selectedGroup.slipokMessage}` : ' — กรุณาตรวจด้วยตนเอง'}
                  </p>
                </div>
              )}

              {/* 5) ปุ่มตัดสิน — ชิดล่างสุด */}
              <div className="mt-auto pt-2">
                {selectedGroup.billingstatus === 'waitcheck' && selectedGroup.invoiceId ? (
                  <>
                    <div className="flex gap-3">
                      <button
                        onClick={() => requestReject(selectedGroup.invoiceId!)}
                        disabled={isSubmitting}
                        className="h-[50px] flex-1 rounded-lg border border-gray-300 text-sm font-bold text-slate-700 transition-colors hover:border-[#CD0D13] hover:text-[#CD0D13] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {submitting === 'reject' ? 'กำลังปฏิเสธ…' : 'ปฏิเสธสลิป'}
                      </button>
                      <button
                        onClick={() => handleApproveSlip(selectedGroup.invoiceId!)}
                        disabled={isSubmitting}
                        className="h-[50px] flex-[1.4] rounded-lg bg-[#CD0D13] text-[14.5px] font-bold text-white transition-colors hover:bg-[#A30A0E] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {submitting === 'approve' ? 'กำลังอนุมัติ…' : 'อนุมัติยอดเงินโอน'}
                      </button>
                    </div>
                    <p className="mt-3 text-[11.5px] text-slate-500">
                      หรือ
                      <button
                        type="button"
                        onClick={() => handleCashPayment(selectedGroup)}
                        disabled={isSubmitting}
                        className="mx-1 font-semibold text-emerald-700 underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {submitting === 'cash' ? 'กำลังบันทึก…' : 'ยืนยันว่าลูกค้าชำระด้วยเงินสด'}
                      </button>
                      — ระบบจะสร้างใบแจ้งหนี้และปิดบิลให้
                    </p>
                  </>
                ) : (selectedGroup.billingstatus === 'unfunded' || selectedGroup.billingstatus === 'overdue') ? (
                  <p className="text-[11.5px] text-slate-500">
                    รายการนี้ยังไม่ได้ชำระ —
                    <button
                      type="button"
                      onClick={() => handleCashPayment(selectedGroup)}
                      disabled={isSubmitting}
                      className="mx-1 font-semibold text-emerald-700 underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting === 'cash' ? 'กำลังบันทึก…' : 'ยืนยันว่าลูกค้าชำระด้วยเงินสด'}
                    </button>
                    ระบบจะสร้างใบแจ้งหนี้และปิดบิลให้
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>{/* /คอลัมน์ขวา */}
      </div>
    </div>
  );
}
