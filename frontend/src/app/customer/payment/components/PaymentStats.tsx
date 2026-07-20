import React from "react";
import { Wallet, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";

interface PaymentStatsProps {
  totalUnpaidAmount: number;
  unpaidCount: number;
  hasOverdue: boolean;
  totalProcessingAmount: number;
  processingCount: number;
  totalPaidAmount: number;
  paidCount: number;
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
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Card 1: Total Unpaid (Gradient Red) */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#CD0D13] to-[#800000] text-white rounded-2xl p-6 shadow-md hover:shadow-lg transition-all group">
        <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-15">
          <Wallet className="w-40 h-40 group-hover:scale-110 transition-transform duration-300" />
        </div>
        <div className="flex justify-between items-start">
          <span className="text-xs font-extrabold tracking-wider uppercase bg-white/20 px-2.5 py-1 rounded-full backdrop-blur-sm">
            ยอดค้างชำระ (Pending Payment)
          </span>
          <AlertTriangle className="w-5 h-5 text-red-250 animate-bounce" />
        </div>
        <div className="mt-6">
          <span className="text-sm font-semibold opacity-85 block">ค่าบริการค้างชำระทั้งหมด</span>
          <span className="text-3xl font-black tracking-tight mt-1 block">
            ฿{totalUnpaidAmount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="mt-4 pt-4 border-t border-white/20 flex justify-between text-xs opacity-90">
          <span>บิลค้างชำระ: {unpaidCount} รายการ</span>
          {hasOverdue && (
            <span className="text-red-200 font-bold bg-white/10 px-1.5 py-0.5 rounded">
              มีรายการเกินกำหนดชำระ!
            </span>
          )}
        </div>
      </div>

      {/* Card 2: Wait Check (Soft Blue) */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start">
            <span className="text-xs font-extrabold tracking-wider uppercase bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full">
              รอตรวจสอบ (Processing)
            </span>
            <Clock className="w-5 h-5 text-blue-500 animate-pulse" />
          </div>
          <div className="mt-6">
            <span className="text-sm font-bold text-gray-500 block">กำลังตรวจสอบโดยแอดมิน</span>
            <span className="text-3xl font-black text-gray-900 tracking-tight mt-1 block">
              ฿{totalProcessingAmount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-150 text-xs text-gray-500">
          รายการรอยืนยัน: {processingCount} รายการ
        </div>
      </div>

      {/* Card 3: Paid (Soft Green) */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start">
            <span className="text-xs font-extrabold tracking-wider uppercase bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full">
              ชำระเงินสำเร็จ (Paid)
            </span>
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="mt-6">
            <span className="text-sm font-bold text-gray-500 block">ยอดรวมชำระเงินสำเร็จทั้งหมด</span>
            <span className="text-3xl font-black text-emerald-700 tracking-tight mt-1 block">
              ฿{totalPaidAmount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-150 text-xs text-gray-500">
          บิลชำระเงินสำเร็จ: {paidCount} รายการ
        </div>
      </div>
    </div>
  );
}
