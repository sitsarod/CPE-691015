import React, { useState } from "react";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import { InvoiceDTO } from "./types";
import ImageLightbox from "@/components/ImageLightbox";

interface InvoicesTabProps {
  invoices: InvoiceDTO[];
  expandedInvoiceIds: Record<number, boolean>;
  onToggleExpand: (id: number) => void;
  onPayExistingInvoice: (invoice: InvoiceDTO) => void;
  onCancelInvoice: (id: number) => void;
}

export default function InvoicesTab({
  invoices,
  expandedInvoiceIds,
  onToggleExpand,
  onPayExistingInvoice,
  onCancelInvoice
}: InvoicesTabProps) {
  // สลิปที่เปิดดูแบบป็อปอัพ (ไม่เปิดแท็บใหม่)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

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

  const formatDueDate = (dateStr: string) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  return (
    <div className="space-y-4">
      {invoices.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-2xl flex flex-col items-center justify-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center">
            <FileText className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-gray-800">ไม่มีประวัติการชำระเงิน</h3>
          <p className="text-gray-500 text-sm max-w-xs">
            คุณยังไม่มีการสร้างใบแจ้งหนี้หรือทำรายการชำระเงินในระบบ ณ ขณะนี้
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {invoices.map((inv) => {
            const isExpanded = !!expandedInvoiceIds[inv.id];
            
            // An older invoice (rejected/cancelled/pending) is stale once its billing
            // has already been settled through a different, newer invoice.
            const isSuperseded = inv.invoicestatus !== "success" &&
              inv.paymentitems.some(item => item.billing?.billingstatus === "paid");

            // If a newer (higher-id), non-cancelled invoice already covers the same billing(s),
            // resubmitting a slip against this older rejected invoice would just create a duplicate
            // payment attempt for a bill that's already being handled elsewhere.
            const hasNewerInvoiceForSameBilling = invoices.some(other =>
              other.id > inv.id &&
              other.invoicestatus !== "cancelled" &&
              other.paymentitems.some(otherItem =>
                inv.paymentitems.some(item => item.billing_id === otherItem.billing_id)
              )
            );

            // Derive client-side status based on whether a slip has been uploaded
            // Backend keeps status as "pending" for invoices that have slips but are not yet approved/rejected by admin
            const invoiceStatus = isSuperseded
              ? "superseded"
              : (inv.invoicestatus === "pending" && inv.slipurl) ? "waitcheck" : inv.invoicestatus;

            // Status Color Setup
            let statusBg = "bg-gray-100 text-gray-700 border-gray-200";
            let statusText = "ไม่ทราบสถานะ";
            if (invoiceStatus === "superseded") {
              statusBg = "bg-emerald-50 text-emerald-700 border-emerald-200";
              statusText = "ชำระเงินแล้ว (ผ่านใบแจ้งหนี้อื่น)";
            } else if (invoiceStatus === "pending") {
              statusBg = "bg-amber-50 text-amber-700 border-amber-200";
              statusText = "รอแนบสลิป";
            } else if (invoiceStatus === "waitcheck") {
              statusBg = "bg-blue-50 text-blue-700 border-blue-200";
              statusText = "รอตรวจสอบ";
            } else if (invoiceStatus === "success") {
              statusBg = "bg-emerald-50 text-emerald-700 border-emerald-200";
              statusText = "ชำระเงินสำเร็จ";
            } else if (invoiceStatus === "rejected") {
              statusBg = "bg-rose-50 text-rose-700 border-rose-200";
              statusText = "สลิปไม่ถูกต้อง (ถูกปฏิเสธ)";
            } else if (invoiceStatus === "cancelled") {
              statusBg = "bg-gray-100 text-gray-600 border-gray-200";
              statusText = "ยกเลิกแล้ว";
            }

            // แถบ accent ด้านซ้ายของการ์ด ให้โทนเดียวกับป้ายสถานะ
            const statusBar =
              ({
                superseded: "bg-emerald-400",
                success: "bg-emerald-400",
                waitcheck: "bg-blue-400",
                pending: "bg-amber-400",
                rejected: "bg-rose-400",
                cancelled: "bg-gray-300"
              } as Record<string, string>)[invoiceStatus] ?? "bg-gray-300";

            return (
              <div key={`invoice-${inv.id}`} className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all">
                {/* แถบสถานะด้านซ้าย */}
                <span className={`absolute inset-y-0 left-0 w-1 ${statusBar}`} />
                {/* Invoice Card Header */}
                <div
                  onClick={() => onToggleExpand(inv.id)}
                  className="flex cursor-pointer flex-col justify-between gap-4 p-5 pl-6 transition-colors hover:bg-gray-50 md:flex-row md:items-center"
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base font-black text-gray-900">ใบแจ้งหนี้ #{inv.id}</span>
                      <span className="text-gray-300">|</span>
                      <span className="text-xs text-gray-500">{formatDate(inv.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold ${statusBg}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusBar}`} />
                        {statusText}
                      </span>
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                        ช่องทาง: {inv.paymentmethod === "qr" ? "PromptPay QR" : inv.paymentmethod === "bank_transfer" ? "โอนเงินธนาคาร" : inv.paymentmethod}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-3 sm:gap-6">
                    <div className="text-left md:text-right">
                      <span className="block text-[10px] font-bold text-gray-400">ยอดเงินรวม:</span>
                      <span className="text-lg font-black text-gray-900">
                        ฿{inv.invoicetotalamount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                      {invoiceStatus === "pending" && (
                        <>
                          <button
                            onClick={() => onPayExistingInvoice(inv)}
                            className="px-3.5 py-1.5 bg-[#CC0000] hover:bg-[#A30000] text-white text-xs font-black rounded-lg transition-all cursor-pointer"
                          >
                            แนบหลักฐานสลิป
                          </button>
                          <button
                            onClick={() => onCancelInvoice(inv.id)}
                            className="px-2.5 py-1.5 border border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-500 hover:text-black text-xs font-bold rounded-lg transition-all cursor-pointer"
                          >
                            ยกเลิก
                          </button>
                        </>
                      )}
                      
                      {invoiceStatus === "waitcheck" && (
                        <>
                          <button
                            onClick={() => onPayExistingInvoice(inv)}
                            className="px-3.5 py-1.5 border border-[#CC0000] hover:bg-[#FFF0F0] text-[#CC0000] text-xs font-bold rounded-lg transition-all cursor-pointer"
                          >
                            แก้ไข/เปลี่ยนรูปสลิป
                          </button>
                        </>
                      )}

                      {invoiceStatus === "rejected" && !hasNewerInvoiceForSameBilling && (
                        <>
                          <button
                            onClick={() => onPayExistingInvoice(inv)}
                            className="px-3.5 py-1.5 bg-[#CC0000] hover:bg-[#A30000] text-white text-xs font-black rounded-lg transition-all cursor-pointer"
                          >
                            ส่งหลักฐานสลิปใหม่
                          </button>
                        </>
                      )}

                      {(invoiceStatus === "waitcheck" || invoiceStatus === "success" || invoiceStatus === "rejected") && inv.slipurl && (
                        <button
                          type="button"
                          onClick={() => setReceiptUrl(inv.slipurl)}
                          className="px-3.5 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-600 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                        >
                          ดูรูปสลิปเดิม
                        </button>
                      )}
                      <button
                        onClick={() => onToggleExpand(inv.id)}
                        aria-label={isExpanded ? "ย่อรายละเอียด" : "ดูรายละเอียด"}
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition-all hover:border-gray-300 hover:text-gray-600"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Items */}
                {isExpanded && (
                  <div className="border-t border-gray-200 bg-gray-50/50 p-5 space-y-4">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">รายการที่รวมชำระ ({inv.paymentitems.length})</h4>
                    <div className="space-y-2">
                      {inv.paymentitems.map((item, idx) => (
                        <div key={`inv-item-${item.id || idx}`} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3.5">
                          <div>
                            <span className="text-[10px] font-bold text-gray-400">BILL-{item.billing_id}</span>
                            <h5 className="mt-0.5 text-sm font-bold text-gray-800">{item.billing?.billingdescription || "รายการเก็บเงินย่อย"}</h5>
                            {item.billing?.billingdue_date && (
                              <span className="mt-0.5 block text-[10px] text-gray-500">
                                ครบกำหนด: {formatDueDate(item.billing.billingdue_date)}
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-bold text-gray-900">
                            ฿{item.billing?.billingamount?.toLocaleString("th-TH", { minimumFractionDigits: 2 }) || "-"}
                          </span>
                        </div>
                      ))}
                    </div>
                    {inv.transactionid && (
                      <div className="text-[11px] text-gray-500 bg-white border border-gray-200 p-3 rounded-xl flex items-center justify-between">
                        <span className="font-bold">Transaction Reference ID:</span>
                        <code className="font-mono text-gray-800 select-all bg-gray-100 px-1.5 py-0.5 rounded">{inv.transactionid}</code>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ป็อปอัพดูรูปสลิป — ไม่เปิดแท็บใหม่ */}
      <ImageLightbox url={receiptUrl} onClose={() => setReceiptUrl(null)} alt="สลิปโอนเงิน" />
    </div>
  );
}
