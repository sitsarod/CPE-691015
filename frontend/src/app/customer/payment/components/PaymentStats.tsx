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
      <div className="grid grid-cols-3 divide-x divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white sm:hidden">
        {cards.map((c) => (
          <div key={c.key} className="flex flex-col items-center gap-1.5 px-1.5 py-4 text-center">
            <span className="text-[13px] font-bold leading-tight text-gray-600">{c.label}</span>
            <div className="flex items-baseline gap-0.5">
              <span className="text-xs font-bold text-gray-400">฿</span>
              <span className={`text-lg font-black leading-none tabular-nums ${c.amountClass}`}>
                {fmtAmount(c.amount)}
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
        ))}
      </div>

      {/* จอ tablet ขึ้นไป: การ์ดแบบเต็มรายละเอียด */}
      <div className="hidden gap-4 sm:grid sm:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.key}
              className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 hover:shadow-md sm:p-5"
            >
            {/* แถบ accent สี = เส้นข้างคอร์ต */}
            <span className={`absolute inset-y-0 left-0 w-1 ${c.accentBar}`} />

            {/* หัวการ์ด: จุดสถานะ + ป้ายกำกับ + ไอคอน */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                <span className="text-sm font-bold text-gray-600">{c.label}</span>
              </div>
              <Icon className={`h-5 w-5 ${c.iconClass}`} />
            </div>

            {/* ยอดเงิน */}
            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-base font-bold text-gray-400">฿</span>
              <span className={`text-2xl font-black leading-none tracking-tight sm:text-[28px] ${c.amountClass}`}>
                {fmtAmount(c.amount)}
              </span>
            </div>

            {/* ท้ายการ์ด: จำนวนรายการ + ป้ายเตือนเกินกำหนด */}
            <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
              <span className="text-xs text-gray-500">{c.note}</span>
              {c.badge && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-[#CC0000]">
                  {c.badge}
                </span>
              )}
            </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
