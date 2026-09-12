import React from "react";
import { AlertTriangle, Clock, CheckCircle2, type LucideIcon } from "lucide-react";

interface PaymentStatsProps {
  totalUnpaidAmount: number;
  unpaidCount: number;
  hasOverdue: boolean;
  totalProcessingAmount: number;
  processingCount: number;
  totalPaidAmount: number;
  paidCount: number;
}

// สกอร์บอร์ด: ยอดเงินเซ็ตด้วย mono + tabular-nums ให้อ่านเหมือนป้ายคะแนน
const fmtAmount = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// จอเล็กช่องแคบมาก: ตัดทศนิยมออก (สรุปยอด รายละเอียดเต็มอยู่ในลิสต์) เหลือบาทเต็มจำนวน
const fmtAmountInt = (n: number) => Math.round(n).toLocaleString("th-TH");

// เลือกขนาดฟอนต์ตามความยาวตัวเลข กันยอดเงินหลักล้านล้นขอบการ์ด
const mobileAmountSize = (len: number) =>
  len > 9 ? "text-sm" : len > 6 ? "text-base" : "text-lg";

interface StatCard {
  key: string;
  label: string;
  amount: number;
  amountClass: string;
  accentBar: string;
  dot: string;
  icon: LucideIcon;
  iconClass: string;
  note: string;
  badge: string | null;
}

export default function PaymentStats({
  totalUnpaidAmount,
  unpaidCount,
  hasOverdue,
  totalProcessingAmount,
  processingCount,
  totalPaidAmount,
  paidCount
}: PaymentStatsProps) {
  const cards: StatCard[] = [
    {
      key: "unpaid",
      label: "ยอดค้างชำระ",
      amount: totalUnpaidAmount,
      amountClass: "text-[#CC0000]",
      accentBar: "bg-[#CC0000]",
      dot: "bg-[#CC0000]",
      icon: AlertTriangle,
      iconClass: `text-[#CC0000] ${hasOverdue ? "animate-bounce" : ""}`,
      note: `${unpaidCount} รายการรอชำระ`,
      badge: hasOverdue ? "เกินกำหนด" : null
    },
    {
      key: "processing",
      label: "รอตรวจสอบ",
      amount: totalProcessingAmount,
      amountClass: "text-gray-900",
      accentBar: "bg-blue-500",
      dot: "bg-blue-500",
      icon: Clock,
      iconClass: "text-blue-500",
      note: `${processingCount} รายการกำลังตรวจสอบ`,
      badge: null
    },
    {
      key: "paid",
      label: "ชำระเงินสำเร็จ",
      amount: totalPaidAmount,
      amountClass: "text-emerald-600",
      accentBar: "bg-emerald-500",
      dot: "bg-emerald-500",
      icon: CheckCircle2,
      iconClass: "text-emerald-500",
      note: `${paidCount} รายการ`,
      badge: null
    }
  ];

  return (
    <>
      {/* จอเล็ก: ยุบเหลือการ์ดเดียว แบ่ง 3 ช่องแนวนอน ประหยัดพื้นที่ */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 overflow-hidden border border-gray-200 bg-white sm:hidden">
        {cards.map((c) => {
          const amt = fmtAmountInt(c.amount);
          return (
          <div key={c.key} className="flex min-w-0 flex-col items-center gap-1.5 px-1.5 py-4 text-center">
            <span className="text-[13px] font-bold leading-tight text-gray-600">{c.label}</span>
            <div className="flex min-w-0 items-baseline gap-0.5">
              <span className="text-xs font-bold text-gray-400">฿</span>
              <span className={`font-black leading-none tabular-nums ${mobileAmountSize(amt.length)} ${c.amountClass}`}>
                {amt}
              </span>
            </div>
            {c.badge ? (
              <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-[#CC0000]">
                {c.badge}
              </span>
            ) : (
              <span className="text-[10px] leading-tight text-gray-400">{c.note}</span>
            )}
          </div>
          );
        })}
      </div>

      {/* จอ tablet ขึ้นไป: แถบสถิติ 1px-gutter */}
      <div className="hidden gap-px border border-gray-200 bg-gray-200 sm:grid sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.key} className="flex flex-col gap-2 bg-white px-5 py-5">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 ${c.dot}`} />
              <span className="text-xs font-light text-gray-500">{c.label}</span>
            </div>
            <span className={`text-2xl font-semibold leading-none tabular-nums sm:text-3xl ${c.amountClass}`}>
              ฿{fmtAmount(c.amount)}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-light text-gray-400">{c.note}</span>
              {c.badge && (
                <span className="border border-red-200 px-2 py-0.5 text-[10px] font-medium text-[#CC0000]">
                  {c.badge}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
