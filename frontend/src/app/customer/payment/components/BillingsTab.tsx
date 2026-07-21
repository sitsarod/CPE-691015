import React, { useState, useMemo } from "react";
import { 
  Calendar, 
  Clock, 
  ExternalLink, 
  FileText, 
  CheckCircle2, 
  Search, 
  SlidersHorizontal,
  Wallet,
  ArrowUpRight
} from "lucide-react";
import { BillingDTO } from "./types";

interface BillingsTabProps {
  billings: BillingDTO[];
  selectedBillingIds: number[];
  onSelectBilling: (id: number) => void;
  onSelectAllUnpaid: () => void;
  onClearSelection: () => void;
  onInitiatePayment: () => void;
}

type SortOption = "default" | "date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "due_asc";

export default function BillingsTab({
  billings,
  selectedBillingIds,
  onSelectBilling,
  onSelectAllUnpaid,
  onClearSelection,
  onInitiatePayment
}: BillingsTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("default");

  // Get only unpaid/overdue billings for checking select all state
  const unpaidBillings = useMemo(() => {
    return billings.filter(b => b.billingstatus === "unfunded" || b.billingstatus === "overdue");
  }, [billings]);

  // Handle Search & Sort calculations
  const processedBillings = useMemo(() => {
    let result = [...billings];

    // 1. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        b =>
          b.billingdescription.toLowerCase().includes(q) ||
          (b.billing_type?.billingtypename && b.billing_type.billingtypename.toLowerCase().includes(q))
      );
    }

    // 2. Sort Filter
    if (sortBy === "default") {
      // Default sort order: overdue first, then unfunded, waitcheck, paid
      const order = { overdue: 0, unfunded: 1, waitcheck: 2, paid: 3 };
      result.sort((a, b) => (order[a.billingstatus] ?? 4) - (order[b.billingstatus] ?? 4));
    } else if (sortBy === "date_desc") {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === "date_asc") {
      result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (sortBy === "amount_desc") {
      result.sort((a, b) => b.billingamount - a.billingamount);
    } else if (sortBy === "amount_asc") {
      result.sort((a, b) => a.billingamount - b.billingamount);
    } else if (sortBy === "due_asc") {
      result.sort((a, b) => new Date(a.billingdue_date).getTime() - new Date(b.billingdue_date).getTime());
    }

    return result;
  }, [billings, searchQuery, sortBy]);

  // Date format helpers
  const formatDueDate = (dateStr: string) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  // Calculate selected billings total
  const selectedBillingsTotal = useMemo(() => {
    return billings
      .filter(b => selectedBillingIds.includes(b.id))
      .reduce((sum, b) => sum + b.billingamount, 0);
  }, [billings, selectedBillingIds]);

  return (
    <div className="space-y-5">
      {/* Search & Sort Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 border border-gray-200 rounded-2xl shadow-sm">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ค้นหาตามรายละเอียด หรือประเภทบิล..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-250 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-[#CC0000] focus:border-[#CC0000] bg-gray-50/50"
          />
        </div>

        {/* Sort Dropdown */}
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-xs text-gray-500 font-bold whitespace-nowrap">เรียงลำดับ:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="border border-gray-250 bg-white rounded-xl text-xs py-1.5 px-3 focus:outline-none focus:ring-1 focus:ring-[#CC0000] text-gray-700 cursor-pointer"
          >
            <option value="default">สถานะ (เกินกำหนด & ค้างชำระขึ้นก่อน)</option>
            <option value="date_desc">วันที่บันทึก: ล่าสุดก่อน</option>
            <option value="date_asc">วันที่บันทึก: เก่าสุดก่อน</option>
            <option value="amount_desc">ยอดเงิน: สูง - ต่ำ</option>
            <option value="amount_asc">ยอดเงิน: ต่ำ - สูง</option>
            <option value="due_asc">วันกำหนดชำระ: ใกล้ที่สุดก่อน</option>
          </select>
        </div>
      </div>

      {/* Select All Section */}
      <div className="flex items-center justify-between bg-gray-50 p-4 rounded-xl border border-gray-200">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="select-all-billings"
            className="w-4 h-4 text-[#CC0000] rounded focus:ring-[#CC0000] cursor-pointer"
            checked={unpaidBillings.length > 0 && selectedBillingIds.length === unpaidBillings.length}
            onChange={onSelectAllUnpaid}
            disabled={unpaidBillings.length === 0}
          />
          <label htmlFor="select-all-billings" className="text-sm font-bold text-gray-700 cursor-pointer select-none">
            เลือกบิลค้างชำระทั้งหมด ({unpaidBillings.length} ใบ)
          </label>
        </div>
        <span className="text-xs text-gray-500 font-medium hidden sm:inline">
          *เลือกหลายบิลเพื่อสร้างการชำระเงินรวมครั้งเดียวได้
        </span>
      </div>

      {/* Billings List */}
      {processedBillings.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-2xl flex flex-col items-center justify-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h3 className="text-lg font-bold text-gray-800">
            {searchQuery ? "ไม่พบรายการบิลที่ค้นหา" : "ไม่มีบิลรอชำระเงิน"}
          </h3>
          <p className="text-gray-500 text-sm max-w-xs">
            {searchQuery 
              ? "กรุณาลองเปลี่ยนคำค้นหาใหม่อีกครั้ง" 
              : "คุณชำระบิลเรียกเก็บเงินครบถ้วนทุกรายการแล้ว ยอดคงเหลือในบัญชีของคุณเรียบร้อยดี"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {processedBillings.map((b) => {
            const isSelected = selectedBillingIds.includes(b.id);
            const isUnpaid = b.billingstatus === "unfunded" || b.billingstatus === "overdue";
            const isOverdue = b.billingstatus === "overdue";
            const isWaitCheck = b.billingstatus === "waitcheck";
            
            return (
              <div 
                key={`billing-${b.id}`}
                onClick={() => isUnpaid && onSelectBilling(b.id)}
                className={`flex flex-col md:flex-row md:items-center justify-between p-5 border rounded-2xl transition-all bg-white relative ${
                  isUnpaid ? "cursor-pointer hover:border-gray-350" : ""
                } ${isSelected ? "border-[#CC0000] ring-1 ring-[#CC0000]" : "border-gray-200"}`}
              >
                <div className="flex items-start gap-4">
                  {isUnpaid ? (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // Handled by outer div onClick
                      className="w-4 h-4 text-[#CC0000] rounded focus:ring-[#CC0000] cursor-pointer mt-1 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-4 h-4 mt-1 flex-shrink-0" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400">BILL-{b.id}</span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-500 font-semibold bg-gray-100 px-2 py-0.5 rounded">
                        {b.billing_type?.billingtypename || "อื่นๆ"}
                      </span>
                      
                      {/* Badges */}
                      {isOverdue && (
                        <span className="text-[10px] font-extrabold bg-red-100 text-red-700 px-2 py-0.5 rounded-full border border-red-200">
                          เกินกำหนดชำระ
                        </span>
                      )}
                      {b.billingstatus === "unfunded" && (
                        <span className="text-[10px] font-extrabold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                          ค้างชำระ
                        </span>
                      )}
                      {isWaitCheck && (
                        <span className="text-[10px] font-extrabold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
                          รอตรวจสอบ
                        </span>
                      )}
                      {b.billingstatus === "paid" && (
                        <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                          ชำระเงินสำเร็จ
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-gray-900 mt-2 text-base">{b.billingdescription}</h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        วันที่เรียกเก็บ: {new Date(b.created_at).toLocaleDateString("th-TH")}
                      </span>
                      <span className={`flex items-center gap-1 font-semibold ${isOverdue ? "text-red-600" : ""}`}>
                        <Clock className="w-3.5 h-3.5" />
                        ครบกำหนด: {formatDueDate(b.billingdue_date)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-2 mt-4 md:mt-0 border-t md:border-t-0 border-gray-150 pt-3 md:pt-0">
                  <span className="text-xs text-gray-450 block md:hidden">จำนวนเงิน:</span>
                  <span className="text-xl font-black text-gray-900">
                    ฿{b.billingamount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </span>
                  {b.billingstatus === "paid" && b.slipurl && (
                    <a 
                      href={b.slipurl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-[10px] font-bold text-[#CC0000] hover:underline flex items-center gap-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      ดูสลิปโอนเงิน <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sticky checkout bar */}
      {selectedBillingIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-250 py-4 px-6 md:px-12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 z-50 shadow-[0_-5px_15px_rgba(0,0,0,0.05)] animate-slideUp">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-[#FFF0F0] rounded-xl flex items-center justify-center text-[#CC0000]">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-gray-500">บิลที่เลือกชำระ: {selectedBillingIds.length} รายการ</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xs font-medium text-gray-600">ยอดรวมทั้งหมด:</span>
                <span className="text-xl font-black text-[#CC0000]">
                  ฿{selectedBillingsTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClearSelection}
              className="px-4 py-2.5 bg-gray-100 hover:bg-gray-255 text-gray-700 hover:text-black rounded-xl text-sm font-bold transition-all border border-gray-250 cursor-pointer"
            >
              ยกเลิกการเลือก
            </button>
            <button
              onClick={onInitiatePayment}
              className="px-6 py-2.5 bg-[#CC0000] hover:bg-[#A30000] text-white rounded-xl text-sm font-black transition-all flex items-center gap-2 shadow-md hover:shadow-lg cursor-pointer"
            >
              ชำระเงินที่เลือก
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
