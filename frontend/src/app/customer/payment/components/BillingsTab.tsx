import React, { useState, useMemo } from "react";
import { 
  Calendar,
  Clock,
  ExternalLink,
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

// สถานะบิล: แถบสี + ป้าย ให้ใช้ชุดเดียวกันทั้งหน้า
const STATUS_META: Record<string, { label: string; bar: string; chip: string; dot: string }> = {
  overdue:   { label: "เกินกำหนดชำระ",  bar: "bg-[#CC0000]",    chip: "border-red-200 bg-red-50 text-red-700",         dot: "bg-[#CC0000]" },
  unfunded:  { label: "ค้างชำระ",        bar: "bg-amber-400",    chip: "border-amber-200 bg-amber-50 text-amber-700",   dot: "bg-amber-400" },
  waitcheck: { label: "รอตรวจสอบ",       bar: "bg-blue-400",     chip: "border-blue-200 bg-blue-50 text-blue-700",      dot: "bg-blue-400" },
  paid:      { label: "ชำระเงินสำเร็จ",   bar: "bg-emerald-400",  chip: "border-emerald-200 bg-emerald-50 text-emerald-700", dot: "bg-emerald-400" }
};

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
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-[#CC0000] focus:border-[#CC0000] bg-gray-50/50"
          />
        </div>

        {/* Sort Dropdown */}
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-xs text-gray-500 font-bold whitespace-nowrap">เรียงลำดับ:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="border border-gray-200 bg-white rounded-xl text-xs py-1.5 px-3 focus:outline-none focus:ring-1 focus:ring-[#CC0000] text-gray-700 cursor-pointer"
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
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <h3 className="text-lg font-bold text-gray-800">
            {searchQuery ? "ไม่พบรายการบิลที่ค้นหา" : "ไม่มีบิลรอชำระเงิน"}
          </h3>
          <p className="max-w-xs text-sm text-gray-500">
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
            const meta = STATUS_META[b.billingstatus] ?? STATUS_META.unfunded;

            return (
              <div
                key={`billing-${b.id}`}
                onClick={() => isUnpaid && onSelectBilling(b.id)}
                className={`relative flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border bg-white p-5 pl-6 transition-all md:flex-row md:items-center ${
                  isUnpaid ? "cursor-pointer hover:border-gray-300 hover:shadow-md" : ""
                } ${isSelected ? "border-[#CC0000] ring-1 ring-[#CC0000]" : "border-gray-200"}`}
              >
                {/* แถบสถานะด้านซ้าย = เส้นข้างคอร์ต */}
                <span className={`absolute inset-y-0 left-0 w-1 ${meta.bar}`} />

                <div className="flex items-start gap-4">
                  {isUnpaid ? (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // Handled by outer div onClick
                      className="mt-1 h-4 w-4 flex-shrink-0 cursor-pointer rounded text-[#CC0000] focus:ring-[#CC0000]"
                    />
                  ) : (
                    <div className="mt-1 h-4 w-4 flex-shrink-0" />
                  )}
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-gray-400">BILL-{b.id}</span>
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                        {b.billing_type?.billingtypename || "อื่นๆ"}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${meta.chip}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                    </div>
                    <h3 className="mt-2 text-base font-bold text-gray-900">{b.billingdescription}</h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        เรียกเก็บ: {new Date(b.created_at).toLocaleDateString("th-TH")}
                      </span>
                      <span className={`flex items-center gap-1 font-semibold ${isOverdue ? "text-[#CC0000]" : ""}`}>
                        <Clock className="h-3.5 w-3.5" />
                        ครบกำหนด: {formatDueDate(b.billingdue_date)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-row items-center justify-between gap-2 border-t border-gray-100 pt-3 md:flex-col md:items-end md:justify-center md:border-t-0 md:pt-0">
                  <span className="text-xs text-gray-400 md:hidden">จำนวนเงิน</span>
                  <span className="text-xl font-black text-gray-900">
                    ฿{b.billingamount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </span>
                  {b.billingstatus === "paid" && b.slipurl && (
                    <a
                      href={b.slipurl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-0.5 text-[10px] font-bold text-[#CC0000] hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      ดูสลิปโอนเงิน <ExternalLink className="h-2.5 w-2.5" />
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
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200 py-4 px-6 md:px-12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 z-50 shadow-[0_-5px_15px_rgba(0,0,0,0.05)] animate-slideUp">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-[#FFF0F0] rounded-xl flex items-center justify-center text-[#CC0000]">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-gray-500">บิลที่เลือกชำระ: {selectedBillingIds.length} รายการ</span>
              <div className="mt-0.5 flex items-baseline gap-1.5">
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
              className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-black rounded-xl text-sm font-bold transition-all border border-gray-200 cursor-pointer"
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
