import React, { useState, useMemo } from 'react';
import { Search, AlertCircle, Eye, X, Check, ThumbsUp, ThumbsDown } from 'lucide-react';
import { BillingDTO } from './types';
import { confirmSlip, rejectSlip } from "@/services/paymentAPI";

export interface VerifySlipsTabProps {
  billings: BillingDTO[];
  onFetchData: () => void;
  onTriggerToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function VerifySlipsTab({
  billings,
  onFetchData,
  onTriggerToast
}: VerifySlipsTabProps) {
  const [slipFilter, setSlipFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [slipSearchTerm, setSlipSearchTerm] = useState('');
  const [reviewBilling, setReviewBilling] = useState<BillingDTO | null>(null);

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
      }

      const studentName = `${b.customer?.firstName || ''} ${b.customer?.lastName || ''}`.toLowerCase();
      const desc = (b.billingdescription || '').toLowerCase();
      const typeName = (b.billing_type?.billingtypename || '').toLowerCase();
      const idStr = `bill-${b.id}`.toLowerCase();
      const query = slipSearchTerm.toLowerCase();

      const matchesSearch = studentName.includes(query) || desc.includes(query) || typeName.includes(query) || idStr.includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [billings, slipFilter, slipSearchTerm]);

  // Slip Approvals
  const handleApproveSlip = async (invoiceId: number) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      await confirmSlip(invoiceId, token || "");

      onTriggerToast('อนุมัติยอดเงินโอนเข้าเรียนเรียบร้อยแล้ว');
      setReviewBilling(null);
      onFetchData();
    } catch (err: any) {
      onTriggerToast(err.message, 'error');
    }
  };

  const handleRejectSlip = async (invoiceId: number) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      await rejectSlip(invoiceId, token || "");

      onTriggerToast('ปฏิเสธหลักฐานการแนบสลิปเรียบร้อยแล้ว');
      setReviewBilling(null);
      onFetchData();
    } catch (err: any) {
      onTriggerToast(err.message, 'error');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fadeIn">
      <div className="p-6 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">ตรวจสอบสลิปและโอนเงินเข้า</h3>
          <p className="text-xs text-slate-500 mt-0.5">กรุณาตรวจสอบความถูกต้องของสลิป ยอดโอน และรหัสอ้างอิงทุกครั้งก่อนกดยืนยัน</p>
        </div>

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

          {/* Status Filter Tab Buttons */}
          <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto max-w-full">
            {[
              { id: 'all', label: 'ทั้งหมด (ส่งสลิป)' },
              { id: 'pending', label: 'รอตรวจสอบ' },
              { id: 'approved', label: 'อนุมัติแล้ว' },
              { id: 'rejected', label: 'ปฏิเสธแล้ว' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setSlipFilter(f.id as any)}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap cursor-pointer text-center ${
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

      {/* Table Area */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider border-b border-slate-200">
              <th className="py-4 px-6">ผู้เรียน / รหัส</th>
              <th className="py-4 px-6">คำอธิบาย</th>
              <th className="py-4 px-6 text-right">ยอดเงินโอน</th>
              <th className="py-4 px-6">วันเวลาโอนกำหนด</th>
              <th className="py-4 px-6">ประเภท</th>
              <th className="py-4 px-6">สถานะสลิป</th>
              <th className="py-4 px-6 text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {waitcheckBillings.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">ไม่พบประวัติรายการโอนเงินสลิป</p>
                </td>
              </tr>
            ) : (
              waitcheckBillings.map(b => (
                <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 px-6">
                    <span className="text-sm font-bold text-slate-800 block">
                      {b.customer ? `${b.customer.firstName} ${b.customer.lastName}` : "ผู้เรียน"}
                    </span>
                    <span className="text-xs text-slate-500 block mt-0.5">ID: {b.customer_id}</span>
                  </td>
                  <td className="py-4 px-6">
                    <span className="text-sm text-slate-800 block font-medium truncate max-w-xs">{b.billingdescription}</span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <span className="text-sm font-bold text-slate-800 block">฿{b.billingamount.toLocaleString()}</span>
                  </td>
                  <td className="py-4 px-6">
                    <span className="text-sm text-slate-700 block">{b.billingdue_date?.split('T')[0]}</span>
                  </td>
                  <td className="py-4 px-6">
                    <span className="text-xs font-semibold text-slate-800 block">{b.billing_type?.billingtypename || "ทั่วไป"}</span>
                  </td>
                  <td className="py-4 px-6">
                    <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full ${
                      b.billingstatus === 'paid'
                        ? 'bg-emerald-55 bg-emerald-50 text-emerald-600 border border-emerald-100'
                        : b.billingstatus === 'waitcheck'
                        ? 'bg-amber-55 bg-amber-50 text-amber-600 border border-amber-100'
                        : 'bg-rose-55 bg-rose-50 text-rose-600 border border-rose-100'
                    }`}>
                      {b.billingstatus === 'paid' ? 'อนุมัติแล้ว' : b.billingstatus === 'waitcheck' ? 'รอตรวจสอบ' : 'สลิปไม่ผ่าน'}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-center">
                    <button
                      onClick={() => { setReviewBilling(b); }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3.5 py-1.5 rounded-lg text-xs transition-all flex items-center space-x-1 mx-auto border border-slate-250 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>ดูสลิป</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Slip Review Detail Modal */}
      {reviewBilling && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs transition-opacity duration-300">
          <div className="bg-white w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row max-h-[90vh] animate-fadeIn">
            
            {/* Left side: Slip mockup visualizer */}
            <div className="md:w-1/2 bg-slate-100 p-6 flex flex-col items-center justify-center border-r border-slate-200 overflow-y-auto">
              <span className="text-xs font-bold text-slate-400 mb-3 block">หลักฐานสลิปการโอนเงิน (Image)</span>
              
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
                <div className="w-full max-w-[280px] bg-[#f8f9fa] rounded-2xl shadow-xl border border-slate-200 overflow-hidden relative font-sans text-slate-800">
                  <div className="p-4 text-white text-center relative bg-[#00a859]">
                    <span className="text-[9px] uppercase font-semibold tracking-widest opacity-85">E-Slip Authentication</span>
                    <h4 className="text-base font-extrabold mt-1">โอนเงินสำเร็จ</h4>
                    <div className="absolute right-3 top-3 bg-white/20 p-1.5 rounded-full border border-white/20">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  </div>

                  <div className="p-5 space-y-4 text-xs">
                    <div className="text-center pb-3 border-b border-dashed border-slate-350">
                      <span className="text-[10px] text-slate-400 block font-semibold">จำนวนเงิน</span>
                      <span className="text-2xl font-black text-slate-800 block mt-1">
                        ฿{reviewBilling.billingamount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-400">จาก:</span>
                        <span className="font-bold text-slate-850">
                          {reviewBilling.customer ? `${reviewBilling.customer.firstName} ${reviewBilling.customer.lastName}` : "ผู้เรียน"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">ถึง:</span>
                        <span className="font-bold text-slate-855">บจก. คอร์สเซ็นเตอร์ ไทยแลนด์</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">คำอธิบาย:</span>
                        <span className="font-bold text-slate-855 text-right truncate max-w-[150px]" title={reviewBilling.billingdescription}>
                          {reviewBilling.billingdescription}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">วันครบกำหนด:</span>
                        <span className="font-bold text-slate-855">{reviewBilling.billingdue_date?.split('T')[0]}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">บิลอ้างอิง:</span>
                        <span className="font-bold text-slate-855">BILL-{reviewBilling.id}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200 text-center">
                      <span className="text-[9px] text-slate-400 block font-semibold">Verified with Database</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right side: Information and Actions */}
            <div className="md:w-1/2 p-6 flex flex-col justify-between overflow-y-auto">
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
                  <div className="flex justify-between">
                    <span className="text-slate-550">ชื่อนักเรียน:</span>
                    <span className="font-bold text-slate-850">
                      {reviewBilling.customer ? `${reviewBilling.customer.firstName} ${reviewBilling.customer.lastName}` : "ผู้เรียน"} (ID: {reviewBilling.customer_id})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-550">ประเภทค่าใช้จ่าย:</span>
                    <span className="font-semibold text-slate-855">{reviewBilling.billing_type?.billingtypename || "ทั่วไป"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-550">คำอธิบายรายละเอียด:</span>
                    <span className="font-semibold text-slate-855">{reviewBilling.billingdescription}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-550">ยอดเงินเรียกเก็บ:</span>
                    <span className="font-bold text-[#CD0D13] text-base">฿{reviewBilling.billingamount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-550">วันครบกำหนดชำระ:</span>
                    <span className="font-semibold text-slate-855">{reviewBilling.billingdue_date?.split('T')[0]}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-550">สถานะล่าสุด:</span>
                    <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                      reviewBilling.billingstatus === 'paid'
                        ? 'bg-emerald-50 text-emerald-600'
                        : reviewBilling.billingstatus === 'waitcheck'
                        ? 'bg-amber-50 text-amber-600'
                        : 'bg-rose-50 text-rose-600'
                    }`}>
                      {reviewBilling.billingstatus === 'paid' ? 'ชำระแล้ว' : reviewBilling.billingstatus === 'waitcheck' ? 'รอตรวจสอบสลิป' : 'ค้างชำระ'}
                    </span>
                  </div>
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
                      <ThumbsDown className="w-4 h-4" />
                      <span>ปฏิเสธสลิป</span>
                    </button>
                    <button
                      onClick={() => handleApproveSlip(reviewBilling.invoice_id!)}
                      className="flex-1 bg-[#CD0D13] hover:bg-[#A30A0E] text-white font-bold py-3 rounded-xl transition-all shadow-md shadow-red-200 flex items-center justify-center space-x-1.5 text-sm cursor-pointer"
                    >
                      <ThumbsUp className="w-4 h-4" />
                      <span>อนุมัติยอดเงินโอน</span>
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
