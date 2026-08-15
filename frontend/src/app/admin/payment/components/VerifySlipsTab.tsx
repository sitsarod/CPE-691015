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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fadeIn">
      <div className="p-6 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full xl:w-auto">
          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={slipSearchTerm}
              onChange={(e) => setSlipSearchTerm(e.target.value)}
              placeholder="ค้นหาชื่อผู้เรียน บิล หรือประเภท..."
              className="w-full pl-9 pr-4 py-2 bg-slate-55 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#CD0D13] transition-all outline-none text-xs text-slate-800"
            />
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          </div>

          {/* Status Filter Tab Buttons — จอเล็ก: grid 2x2 (ไม่ต้องเลื่อน) · จอใหญ่: แถวเดียว */}
          <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl w-full sm:flex sm:gap-0 sm:w-auto">
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
                    ? 'bg-white text-[#CD0D13] shadow-xs font-bold'
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
      <div className="p-6 space-y-4">
        {groupedWaitcheckBillings.length === 0 ? (
          <div className="text-center py-16 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col items-center justify-center space-y-3">
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
              <div key={group.invoiceId ? `inv-${group.invoiceId}` : `bill-${group.billings[0]?.id}`} className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden transition-all">
                {/* Invoice Card Header */}
                <div 
                  onClick={() => group.invoiceId && onToggleExpand(group.invoiceId)}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-slate-900 text-base">{identifierText}</span>
                      <span className="text-slate-300">|</span>
                      <span className="text-xs text-slate-500">{formatDate(group.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
                        ผู้เรียน: {customerName} {group.customer?.nickname ? `(${group.customer.nickname})` : ""}
                      </span>
                      <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${statusBg}`}>
                        {statusText}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-6" onClick={e => e.stopPropagation()}>
                    <div className="text-left md:text-right">
                      <span className="text-[10px] font-bold text-slate-450 block">ยอดเงินโอนรวม:</span>
                      <span className="text-lg font-black text-slate-950">
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
                        className="px-3.5 py-1.5 bg-[#CD0D13] hover:bg-[#A30A0E] text-white text-xs font-black rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-sm shadow-red-200"
                      >
                        ดูสลิป & ตรวจสอบ
                      </button>
                      
                      {group.invoiceId && (
                        <button
                          onClick={() => onToggleExpand(group.invoiceId!)}
                          className="p-1 text-slate-400 hover:text-slate-655 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
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
                        <div key={`sub-bill-${b.id}`} className="flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
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

      {/* Slip Review Detail Modal */}
      {reviewBilling && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs transition-opacity duration-300">
          <div className="bg-white w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row max-h-[90vh] animate-fadeIn">
            
            {/* Left side: Slip mockup visualizer */}
            <div className="md:w-1/2 bg-slate-100 p-6 flex flex-col items-center justify-center border-r border-slate-200 overflow-y-auto no-scrollbar">
              <span className="text-xs font-bold text-slate-400 mb-3 block">หลักฐานสลิปการโอนเงิน (Image)</span>
              <span className="text-xs font-bold text-slate-400 mb-3 block">สามารถเปิดแอปธนาคารและแสกน Qr code เพื่อตรวจสอบได้</span>
              
              {reviewBilling.slipurl ? (
                <div className="w-full max-w-[280px] bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-250 p-2">
                  <img
                    src={reviewBilling.slipurl}
                    alt="หลักฐานสลิปการโอนเงิน"
                    className="w-full h-auto object-contain rounded-xl max-h-[60vh]"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
              ) : (
                <div className="w-full max-w-[280px] bg-white rounded-2xl border border-dashed border-slate-300 p-8 flex flex-col items-center text-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                    <AlertCircle className="w-7 h-7" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-700">ยังไม่มีสลิปแนบ</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    บิลนี้ยังไม่ได้ชำระเงิน หรือยังไม่มีการอัปโหลดสลิปโอนเงิน จึงยังไม่มีหลักฐานให้ตรวจสอบ
                  </p>
                </div>
              )}
            </div>

            {/* Right side: Information and Actions */}
            <div className="md:w-1/2 p-6 flex flex-col justify-between overflow-y-auto no-scrollbar">
              <div>
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">รายละเอียดและผลตรวจสอบ</h3>
                    <p className="text-xs text-slate-500 mt-0.5">เลขที่อ้างอิงบิล: BILL-{reviewBilling.id}</p>
                  </div>
                  <button
                    onClick={() => { setReviewBilling(null); }}
                    className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {/* Details list */}
                <div className="space-y-4 text-sm border-b border-slate-200 pb-5">
                  <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-slate-550 text-xs font-semibold">ชื่อนักเรียน:</span>
                    <span className="font-extrabold text-slate-900">
                      {reviewBilling.customer ? `${reviewBilling.customer.firstName} ${reviewBilling.customer.lastName}` : "ผู้เรียน"}
                      {reviewBilling.customer?.nickname ? ` (${reviewBilling.customer.nickname})` : ""}
                    </span>
                  </div>

                  {/* Individual Billing Items list */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">รายการบิลในใบแจ้งหนี้ ({reviewBilling.groupedBillings?.length || 1})</span>
                    <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar pr-1">
                      {reviewBilling.groupedBillings ? (
                        reviewBilling.groupedBillings.map((b) => (
                          <div key={b.invoice_id ? `bill-${b.id}-inv-${b.invoice_id}` : `bill-${b.id}`} className="p-3 bg-slate-50 rounded-xl border border-slate-250 text-xs flex justify-between items-start gap-4">
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-bold text-slate-400">BILL-{b.id} • {b.billing_type?.billingtypename || "ทั่วไป"}</span>
                              <span className="font-bold text-slate-800 block">{b.billingdescription}</span>
                              <span className="text-[10px] text-slate-500 block">ครบกำหนด: {b.billingdue_date?.split('T')[0]}</span>
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-slate-800 text-xs">฿{b.billingamount.toLocaleString()}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 bg-slate-55 bg-slate-50 rounded-xl border border-slate-250 text-xs flex justify-between items-start gap-4">
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-bold text-slate-400">BILL-{reviewBilling.id} • {reviewBilling.billing_type?.billingtypename || "ทั่วไป"}</span>
                            <span className="font-bold text-slate-800 block">{reviewBilling.billingdescription}</span>
                            <span className="text-[10px] text-slate-500 block">ครบกำหนด: {reviewBilling.billingdue_date?.split('T')[0]}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-slate-800 text-xs">฿{reviewBilling.billingamount.toLocaleString()}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Summary Totals */}
                  <div className="pt-2 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-550 font-semibold">ยอดเงินเรียกเก็บรวม:</span>
                      <span className="font-extrabold text-[#CD0D13] text-lg">฿{reviewBilling.billingamount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-550 font-semibold">สถานะบิล:</span>
                      <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                        reviewBilling.billingstatus === 'paid'
                          ? 'bg-emerald-55 bg-emerald-50 text-emerald-600 border border-emerald-100'
                          : reviewBilling.billingstatus === 'waitcheck'
                          ? 'bg-amber-55 bg-amber-50 text-amber-600 border border-amber-100'
                          : 'bg-rose-55 bg-rose-50 text-rose-600 border border-rose-100'
                      }`}>
                        {reviewBilling.billingstatus === 'paid' ? 'ชำระแล้ว' : reviewBilling.billingstatus === 'waitcheck' ? 'รอตรวจสอบ' : 'ค้างชำระ'}
                      </span>
                    </div>
                  </div>

                  {reviewBilling.transactionid && (
                    <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-150 p-3 rounded-xl flex items-center justify-between">
                      <span className="font-bold">Transaction Reference ID:</span>
                      <code className="font-mono text-slate-800 select-all bg-slate-100 px-1.5 py-0.5 rounded">{reviewBilling.transactionid}</code>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal footer actions */}
              <div className="mt-6 pt-4 border-t border-slate-200">
                {reviewBilling.billingstatus === 'waitcheck' && reviewBilling.invoice_id ? (
                  <div className="flex space-x-3">
                    <button
                      onClick={() => handleRejectSlip(reviewBilling.invoice_id!)}
                      className="flex-1 bg-slate-100 hover:bg-rose-50 hover:text-[#CD0D13] hover:border-red-250 text-slate-700 font-bold py-3 rounded-xl border border-slate-300 transition-all flex items-center justify-center space-x-1.5 text-sm cursor-pointer"
                    >
                      <span>ปฏิเสธสลิป</span>
                    </button>
                    <button
                      onClick={() => handleApproveSlip(reviewBilling.invoice_id!)}
                      className="flex-1 bg-[#CD0D13] hover:bg-[#A30A0E] text-white font-bold py-3 rounded-xl transition-all shadow-md shadow-red-200 flex items-center justify-center space-x-1.5 text-sm cursor-pointer"
                    >
                      <span>อนุมัติยอดเงินโอน</span>
                    </button>
                  </div>
                ) : (reviewBilling.billingstatus === 'unfunded' || reviewBilling.billingstatus === 'overdue') ? (
                  <div className="space-y-3">
                    <button
                      onClick={() => handleCashPayment(reviewBilling)}
                      disabled={cashSubmitting}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all shadow-md shadow-emerald-200 flex items-center justify-center gap-1.5 text-sm cursor-pointer"
                    >
                      <Banknote className="w-4 h-4" />
                      <span>{cashSubmitting ? 'กำลังบันทึก...' : 'ลูกค้าชำระแบบเงินสด'}</span>
                    </button>
                    <button
                      onClick={() => { setReviewBilling(null); }}
                      className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl border border-slate-300 text-sm transition-all cursor-pointer"
                    >
                      ปิดหน้าต่าง
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setReviewBilling(null); }}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl border border-slate-300 text-sm transition-all cursor-pointer"
                  >
                    ปิดหน้าต่าง
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
