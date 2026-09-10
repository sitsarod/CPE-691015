import { useState, useMemo, useEffect } from 'react';
import { Search, AlertCircle, X, ChevronDown, ChevronUp, Banknote } from 'lucide-react';
import { BillingDTO } from './types';
import { confirmSlip, rejectSlip, createInvoice } from "@/services/paymentAPI";

export interface VerifySlipsTabProps {
  billings: BillingDTO[];
  onFetchData: () => void;
  onTriggerToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  // ฟิลเตอร์เริ่มต้น (ใช้ตอน deep-link มาจากแดชบอร์ด เช่น ?filter=unpaid)
  initialFilter?: 'all' | 'pending' | 'approved' | 'rejected' | 'unpaid';
}

export default function VerifySlipsTab({
  billings,
  onFetchData,
  onTriggerToast,
  initialFilter
}: VerifySlipsTabProps) {
  const [slipFilter, setSlipFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'unpaid'>(initialFilter ?? 'pending');
  const [slipSearchTerm, setSlipSearchTerm] = useState('');
  const [reviewBilling, setReviewBilling] = useState<(BillingDTO & { groupedBillings?: BillingDTO[] }) | null>(null);
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Record<number, boolean>>({});

  // Toggle card expansion
  const onToggleExpand = (id: number) => {
    setExpandedInvoiceIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Format date helper
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  // Filtered Slips (waitcheck status) for Tab 2 list
  const waitcheckBillings = useMemo(() => {
    return billings.filter(b => {
      let matchesStatus = false;
      if (slipFilter === 'all') {
        matchesStatus = b.billingstatus === 'waitcheck' || !!b.slipurl;
      } else if (slipFilter === 'pending') {
        matchesStatus = b.billingstatus === 'waitcheck';
      } else if (slipFilter === 'approved') {
        matchesStatus = b.billingstatus === 'paid';
      } else if (slipFilter === 'rejected') {
        matchesStatus = b.billingstatus === 'unfunded' && !!b.slipurl;
      } else if (slipFilter === 'unpaid') {
        matchesStatus = b.billingstatus === 'unfunded' || b.billingstatus === 'overdue';
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

  // Group billings by invoice_id to show them together
  const groupedWaitcheckBillings = useMemo(() => {
    const groups: Record<string, {
      invoiceId?: number;
      customer?: BillingDTO['customer'];
      customerId: number;
      billings: BillingDTO[];
      totalAmount: number;
      billingstatus: BillingDTO['billingstatus'];
      slipurl?: string;
      dueDate: string;
      createdAt: string;
    }> = {};

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
          slipurl: b.slipurl,
          dueDate: b.billingdue_date,
          createdAt: b.created_at,
        };
      }
      groups[key].billings.push(b);
      groups[key].totalAmount += b.billingamount;
    });

    return Object.values(groups).sort((a, b) => {
      // 1. Sort by invoiceId descending if both have it
      if (a.invoiceId && b.invoiceId) {
        return b.invoiceId - a.invoiceId;
      }
      // 2. If one or both lack invoiceId, fallback to sorting by creation time descending (newest first)
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });
  }, [waitcheckBillings]);

  // แบ่งหน้ารายการ 10 รายการ/หน้า (เหมือนตารางใบเรียกเก็บเงินในหน้าสรุปการเงิน)
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  // รีเซ็ตกลับหน้าแรกเมื่อฟิลเตอร์/คำค้นเปลี่ยน
  useEffect(() => {
    setPage(1);
  }, [slipFilter, slipSearchTerm]);
  const totalPages = Math.max(1, Math.ceil(groupedWaitcheckBillings.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedGroups = useMemo(
    () => groupedWaitcheckBillings.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [groupedWaitcheckBillings, safePage]
  );

  // Slip Approvals
  const handleApproveSlip = async (invoiceId: number) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      await confirmSlip(invoiceId, token || "");

      onTriggerToast('อนุมัติยอดเงินโอนเข้าเรียนเรียบร้อยแล้ว');
      setReviewBilling(null);
      onFetchData();
    } catch (err: unknown) {
      onTriggerToast(err instanceof Error ? err.message : 'อนุมัติสลิปไม่สำเร็จ', 'error');
    }
  };

  const handleRejectSlip = async (invoiceId: number) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      await rejectSlip(invoiceId, token || "");

      onTriggerToast('ปฏิเสธหลักฐานการแนบสลิปเรียบร้อยแล้ว');
      setReviewBilling(null);
      onFetchData();
    } catch (err: unknown) {
      onTriggerToast(err instanceof Error ? err.message : 'ปฏิเสธสลิปไม่สำเร็จ', 'error');
    }
  };

  // ลูกค้าจ่ายเงินสด: บิลค้างชำระที่ยังไม่มีใบแจ้งหนี้ จะสร้างใบแจ้งหนี้แบบ "cash" แล้วยืนยันให้เลย
  // ถ้ามีใบแจ้งหนี้อยู่แล้ว (เช่นสลิปเคยถูกปฏิเสธ) ให้ยืนยันใบเดิม
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const handleCashPayment = async (billing: BillingDTO & { groupedBillings?: BillingDTO[] }) => {
    if (!window.confirm(
      `ยืนยันว่าลูกค้าชำระด้วยเงินสด ยอด ฿${billing.billingamount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ใช่หรือไม่?`
    )) return;

    setCashSubmitting(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      let invoiceId = billing.invoice_id;
      if (!invoiceId) {
        const billingIds = billing.groupedBillings?.length
          ? billing.groupedBillings.map(b => b.id)
          : [billing.id];
        const invoice = await createInvoice(billing.customer_id, billingIds, 'cash', token || "");
        invoiceId = invoice.id;
      }
      await confirmSlip(invoiceId, token || "");

      onTriggerToast('บันทึกการชำระเงินสดเรียบร้อยแล้ว');
      setReviewBilling(null);
      onFetchData();
    } catch (err: unknown) {
      onTriggerToast(err instanceof Error ? err.message : 'บันทึกการชำระเงินสดไม่สำเร็จ', 'error');
    } finally {
      setCashSubmitting(false);
    }
  };

  return (
    <div className="border border-gray-200 bg-white animate-fadeIn">
     <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.05fr]">
      {/* คอลัมน์ซ้าย: ค้นหา + ตัวกรอง + รายการ */}
      <div className="min-w-0 lg:border-r lg:border-gray-200">
      <div className="p-6 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full xl:w-auto">
          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={slipSearchTerm}
              onChange={(e) => setSlipSearchTerm(e.target.value)}
              placeholder="ค้นหาชื่อผู้เรียน บิล หรือประเภท..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-gray-300 rounded-lg focus:bg-white focus:border-[#CD0D13] transition-all outline-none text-xs text-slate-800"
            />
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          </div>

          {/* Status Filter Tab Buttons — จอเล็ก: grid 2x2 (ไม่ต้องเลื่อน) · จอใหญ่: แถวเดียว */}
          <div className="grid grid-cols-2 gap-1 border border-gray-200 p-1 w-full sm:flex sm:flex-wrap sm:gap-1 sm:w-auto">
            {[
              { id: 'all' as const, label: 'ทั้งหมด (ส่งสลิป)' },
              { id: 'pending' as const, label: 'รอตรวจสอบ' },
              { id: 'approved' as const, label: 'อนุมัติแล้ว' },
              { id: 'rejected' as const, label: 'ปฏิเสธแล้ว' },
              { id: 'unpaid' as const, label: 'ค้างชำระ' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setSlipFilter(f.id)}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-[11px] font-semibold leading-tight transition-all whitespace-normal sm:whitespace-nowrap cursor-pointer text-center ${
                  slipFilter === f.id
                    ? 'bg-[#FFF0F0] text-[#CD0D13] font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Card List Area */}
      <div className="px-6 py-2">
        {groupedWaitcheckBillings.length === 0 ? (
          <div className="text-center py-16 border border-gray-200 bg-gray-50 flex flex-col items-center justify-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-800">ไม่มีรายการโอนเงินสลิป</h3>
            <p className="text-slate-500 text-xs max-w-xs">
              ไม่พบประวัติรายการโอนเงินสลิปที่ต้องอนุมัติในระบบ ณ ขณะนี้
            </p>
          </div>
        ) : (
          pagedGroups.map(group => {
            const isExpanded = !!expandedInvoiceIds[group.invoiceId || 0];
            const identifierText = group.invoiceId ? `ใบแจ้งหนี้ #${group.invoiceId}` : `บิล #BILL-${group.billings[0]?.id}`;
            const customerName = group.customer ? `${group.customer.firstName} ${group.customer.lastName}` : "ผู้เรียน";

            // Status styling based on billing status
            let statusBg = "bg-slate-100 text-slate-700 border-slate-200";
            let statusText = "ไม่ทราบสถานะ";
            if (group.billingstatus === 'paid') {
              statusBg = "bg-emerald-50 text-emerald-700 border-emerald-250";
              statusText = "อนุมัติแล้ว";
            } else if (group.billingstatus === 'waitcheck') {
              statusBg = "bg-amber-50 text-amber-700 border-amber-250";
              statusText = "รอตรวจสอบ";
            } else if (group.billingstatus === 'unfunded' || group.billingstatus === 'overdue') {
              statusBg = "bg-rose-50 text-rose-700 border-rose-250";
              // มีสลิปแนบมาแต่ไม่ผ่าน = "สลิปไม่ผ่าน" · ไม่มีสลิป = ยังค้างชำระ
              statusText = group.slipurl ? "สลิปไม่ผ่าน" : "ค้างชำระ";
            }

            return (
              <div key={group.invoiceId ? `inv-${group.invoiceId}` : `bill-${group.billings[0]?.id}`} className="relative border-b border-gray-100">
                {/* Row header — ชื่อผู้เรียนขึ้นก่อน + แถบสถานะซ้าย (ตามม็อก) */}
                <div
                  onClick={() => group.invoiceId && onToggleExpand(group.invoiceId)}
                  className="relative flex flex-col justify-between gap-4 py-4 pl-5 transition-colors hover:bg-slate-50/50 cursor-pointer md:flex-row md:items-center"
                >
                  <span className={`absolute inset-y-0 left-0 w-[3px] ${group.billingstatus === 'paid' ? 'bg-emerald-500' : group.billingstatus === 'waitcheck' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-[15px] font-medium text-slate-900">
                        {customerName}{group.customer?.nickname ? ` (${group.customer.nickname})` : ""}
                      </span>
                      <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${statusBg}`}>
                        {statusText}
                      </span>
                    </div>
                    <span className="mt-1 block text-xs text-slate-500">
                      {identifierText} · {group.billings.length} บิล · แจ้งชำระ {formatDate(group.createdAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-5 md:justify-end" onClick={e => e.stopPropagation()}>
                    <div className="text-left md:text-right">
                      <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400">ยอดเงินโอนรวม</span>
                      <span className="text-lg font-semibold tabular-nums text-slate-900">
                        ฿{group.totalAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const viewBilling = {
                            ...group.billings[0],
                            billingamount: group.totalAmount,
                            billingdescription: group.billings.map(b => b.billingdescription).join(" + "),
                            groupedBillings: group.billings
                          };
                          setReviewBilling(viewBilling);
                        }}
                        className="flex h-9 items-center rounded-lg bg-[#CD0D13] px-4 text-xs font-bold text-white transition-colors hover:bg-[#A30A0E] cursor-pointer"
                      >
                        ดูสลิป &amp; ตรวจสอบ
                      </button>

                      {group.invoiceId && (
                        <button
                          onClick={() => onToggleExpand(group.invoiceId!)}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded items detailing the billings */}
                {isExpanded && (
                  <div className="border-t border-slate-150 bg-slate-50/50 p-5 space-y-4">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">รายการบิลย่อยที่รวมอยู่ในใบแจ้งหนี้ ({group.billings.length})</h4>
                    <div className="space-y-2">
                      {group.billings.map((b) => (
                        <div key={`sub-bill-${b.id}`} className="flex items-center justify-between p-3.5 bg-white border border-gray-200">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400">BILL-{b.id} • {b.billing_type?.billingtypename || "ทั่วไป"}</span>
                            <h5 className="font-bold text-slate-800 text-sm mt-0.5">{b.billingdescription}</h5>
                            <span className="text-[10px] text-slate-500 block mt-0.5">
                              ครบกำหนด: {b.billingdue_date?.split('T')[0]}
                            </span>
                          </div>
                          <span className="font-bold text-slate-900 text-sm">
                            ฿{b.billingamount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination controls */}
      {groupedWaitcheckBillings.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-3 border-t border-slate-200 text-xs">
          <span className="text-slate-500">
            แสดง {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, groupedWaitcheckBillings.length)} จาก {groupedWaitcheckBillings.length} รายการ
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ก่อนหน้า
            </button>
            <span className="text-slate-600 font-semibold whitespace-nowrap">หน้า {safePage}/{totalPages}</span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}

      </div>{/* /คอลัมน์ซ้าย */}

      {/* คอลัมน์ขวา: รายละเอียดและผลตรวจสอบ (inline ตามดีไซน์) */}
      <div className="min-w-0">
        {!reviewBilling ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-slate-100 text-slate-300">
              <AlertCircle className="h-7 w-7" />
            </div>
            <p className="max-w-[240px] text-sm text-slate-400">
              เลือกใบแจ้งหนี้ทางซ้ายเพื่อดูรายละเอียดและตรวจสอบสลิป
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5 p-6">
            <div className="flex items-end justify-between gap-4 border-b border-gray-200 pb-4">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">รายละเอียดและผลตรวจสอบ</h2>
              <div className="flex items-center gap-3">
                <span className="whitespace-nowrap text-xs text-slate-500">
                  {reviewBilling.invoice_id ? `ใบแจ้งหนี้ #${reviewBilling.invoice_id}` : `BILL-${reviewBilling.id}`}
                </span>
                <button
                  onClick={() => setReviewBilling(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  aria-label="ปิด"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* หลักฐานสลิป */}
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">หลักฐานสลิปการโอนเงิน</span>
              {reviewBilling.slipurl ? (
                <div className="border border-gray-200 p-2">
                  <img
                    src={reviewBilling.slipurl}
                    alt="หลักฐานสลิปการโอนเงิน"
                    className="mx-auto h-auto max-h-[320px] w-auto object-contain"
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 border border-dashed border-gray-300 p-8 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <AlertCircle className="w-7 h-7" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-700">ยังไม่มีสลิปแนบ</h4>
                  <p className="text-xs leading-relaxed text-slate-500">
                    บิลนี้ยังไม่ได้ชำระเงิน หรือยังไม่มีการอัปโหลดสลิปโอนเงิน จึงยังไม่มีหลักฐานให้ตรวจสอบ
                  </p>
                </div>
              )}
            </div>

            {/* รายละเอียด (แถวเส้นคั่น) */}
            <div className="flex flex-col divide-y divide-gray-100 border-y border-gray-200">
              <div className="flex items-center justify-between gap-4 py-3">
                <span className="text-xs text-slate-500">ผู้เรียน</span>
                <span className="text-sm font-medium text-slate-900">
                  {reviewBilling.customer ? `${reviewBilling.customer.firstName} ${reviewBilling.customer.lastName}` : "ผู้เรียน"}
                  {reviewBilling.customer?.nickname ? ` (${reviewBilling.customer.nickname})` : ""}
                </span>
              </div>
              {(reviewBilling.groupedBillings ?? [reviewBilling]).map((b) => (
                <div key={b.invoice_id ? `bill-${b.id}-inv-${b.invoice_id}` : `bill-${b.id}`} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <span className="block text-[10px] font-bold text-slate-400">BILL-{b.id} • {b.billing_type?.billingtypename || "ทั่วไป"}</span>
                    <span className="block text-sm text-slate-800">{b.billingdescription}</span>
                    <span className="block text-[10px] text-slate-500">ครบกำหนด: {b.billingdue_date?.split('T')[0]}</span>
                  </div>
                  <span className="text-sm font-medium tabular-nums text-slate-800">฿{b.billingamount.toLocaleString()}</span>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-4 py-4">
                <span className="text-xs text-slate-500">ยอดเงินเรียกเก็บรวม</span>
                <span className="text-2xl font-semibold tabular-nums text-[#CD0D13]">฿{reviewBilling.billingamount.toLocaleString()}</span>
              </div>
            </div>

            {reviewBilling.transactionid && (
              <div className="flex items-center justify-between border border-gray-200 p-3 text-[11px] text-slate-500">
                <span className="font-bold">Transaction Reference ID</span>
                <code className="select-all rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-800">{reviewBilling.transactionid}</code>
              </div>
            )}

            {/* Actions */}
            {reviewBilling.billingstatus === 'waitcheck' && reviewBilling.invoice_id ? (
              <div className="flex gap-3">
                <button
                  onClick={() => handleRejectSlip(reviewBilling.invoice_id!)}
                  className="flex-1 rounded-lg border border-gray-300 py-3 text-sm font-bold text-slate-700 transition-colors hover:border-[#CD0D13] hover:text-[#CD0D13] cursor-pointer"
                >
                  ปฏิเสธสลิป
                </button>
                <button
                  onClick={() => handleApproveSlip(reviewBilling.invoice_id!)}
                  className="flex-[1.4] rounded-lg bg-[#CD0D13] py-3 text-sm font-bold text-white transition-colors hover:bg-[#A30A0E] cursor-pointer"
                >
                  อนุมัติยอดเงินโอน
                </button>
              </div>
            ) : (reviewBilling.billingstatus === 'unfunded' || reviewBilling.billingstatus === 'overdue') ? (
              <button
                onClick={() => handleCashPayment(reviewBilling)}
                disabled={cashSubmitting}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                <Banknote className="w-4 h-4" />
                {cashSubmitting ? 'กำลังบันทึก...' : 'ลูกค้าชำระแบบเงินสด'}
              </button>
            ) : null}
          </div>
        )}
      </div>
     </div>{/* /grid */}
    </div>
  );
}
