import React, { useState, useMemo, useCallback } from 'react';
import { Calendar, CheckCircle2, Receipt, TrendingUp, Wallet, AlertCircle, Clock, Search } from 'lucide-react';
import { BillingDTO, Expense } from './types';
import StatsCard from '@/components/StatsCard';

export interface FinancialSummaryTabProps {
  billings: BillingDTO[];
  expenses: Expense[];
}

export default function FinancialSummaryTab({
  billings,
  expenses
}: FinancialSummaryTabProps) {
  const [summaryTimeframe, setSummaryTimeframe] = useState<'today' | 'week' | 'month' | 'year' | 'custom'>('month');
  const [summaryStartDate, setSummaryStartDate] = useState('');
  const [summaryEndDate, setSummaryEndDate] = useState('');
  const [summaryFilterStatus, setSummaryFilterStatus] = useState<'all' | 'pending' | 'paid' | 'unpaid'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Helper to check if date is in selected timeframe
  const isDateInTimeframe = useCallback((dateStr: string) => {
    if (!dateStr) return false;
    const targetDate = new Date(dateStr);
    const targetTime = targetDate.getTime();
    const now = new Date();

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

    if (summaryTimeframe === 'today') {
      return targetTime >= startOfToday && targetTime <= endOfToday;
    }

    if (summaryTimeframe === 'week') {
      const tempNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const day = tempNow.getDay();
      const diff = tempNow.getDate() - day + (day === 0 ? -6 : 1);
      const startOfWeek = new Date(tempNow.setDate(diff));
      startOfWeek.setHours(0, 0, 0, 0);
      return targetTime >= startOfWeek.getTime() && targetTime <= endOfToday;
    }

    if (summaryTimeframe === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      startOfMonth.setHours(0, 0, 0, 0);
      return targetTime >= startOfMonth.getTime() && targetTime <= endOfToday;
    }

    if (summaryTimeframe === 'year') {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      startOfYear.setHours(0, 0, 0, 0);
      return targetTime >= startOfYear.getTime() && targetTime <= endOfToday;
    }

    if (summaryTimeframe === 'custom') {
      const start = summaryStartDate ? new Date(summaryStartDate) : null;
      if (start) start.setHours(0, 0, 0, 0);
      const end = summaryEndDate ? new Date(summaryEndDate) : null;
      if (end) end.setHours(23, 59, 59, 999);

      const startTime = start ? start.getTime() : 0;
      const endTime = end ? end.getTime() : Infinity;

      return targetTime >= startTime && targetTime <= endTime;
    }

    return true;
  }, [summaryTimeframe, summaryStartDate, summaryEndDate]);

  // Financial Stats
  const summaryStats = useMemo(() => {
    const tfBillings = billings.filter(b => isDateInTimeframe(b.created_at || b.billingdue_date));
    const tfExpenses = expenses.filter(e => isDateInTimeframe(e.expensedate));

    const totalPaid = tfBillings.filter(b => b.billingstatus === 'paid').reduce((sum, b) => sum + b.billingamount, 0);
    const totalPending = tfBillings.filter(b => b.billingstatus === 'waitcheck').reduce((sum, b) => sum + b.billingamount, 0);
    const totalInvoiced = tfBillings.reduce((sum, b) => sum + b.billingamount, 0);
    const totalUnpaid = tfBillings.filter(b => b.billingstatus === 'unfunded' || b.billingstatus === 'overdue').reduce((sum, b) => sum + b.billingamount, 0);

    const totalExpenses = tfExpenses.reduce((sum, e) => sum + e.expenseamount, 0);
    const netRevenue = totalPaid - totalExpenses;

    const coursesBreakdown: { [key: string]: number } = {};
    tfBillings.forEach(b => {
      const typeName = b.billing_type?.billingtypename || "อื่นๆ";
      coursesBreakdown[typeName] = (coursesBreakdown[typeName] || 0) + b.billingamount;
    });

    const expensesBreakdown: { [key: string]: number } = {
      coach_wages: 0,
      court_rental: 0,
      equipment: 0,
      advertising: 0,
      other: 0
    };
    tfExpenses.forEach(e => {
      expensesBreakdown[e.expensetype] = (expensesBreakdown[e.expensetype] || 0) + e.expenseamount;
    });

    return {
      totalPaid,
      totalPending,
      totalInvoiced,
      totalUnpaid,
      totalExpenses,
      netRevenue,
      coursesBreakdown,
      expensesBreakdown
    };
  }, [billings, expenses, isDateInTimeframe]);

  // Filtered billings for summary logs table
  const filteredSummaryLogs = useMemo(() => {
    return billings
      .filter(b => isDateInTimeframe(b.created_at || b.billingdue_date))
      .filter(b => {
        const studentName = `${b.customer?.firstName || ''} ${b.customer?.lastName || ''}`.toLowerCase();
        const desc = (b.billingdescription || '').toLowerCase();
        const typeName = (b.billing_type?.billingtypename || '').toLowerCase();
        const idStr = `bill-${b.id}`.toLowerCase();
        const query = searchTerm.toLowerCase();

        const matchesSearch = studentName.includes(query) || desc.includes(query) || typeName.includes(query) || idStr.includes(query);
        
        let matchesStatus = true;
        if (summaryFilterStatus !== 'all') {
          if (summaryFilterStatus === 'paid') {
            matchesStatus = b.billingstatus === 'paid';
          } else if (summaryFilterStatus === 'pending') {
            matchesStatus = b.billingstatus === 'waitcheck';
          } else if (summaryFilterStatus === 'unpaid') {
            matchesStatus = b.billingstatus === 'unfunded' || b.billingstatus === 'overdue';
          }
        }
        return matchesSearch && matchesStatus;
      });
  }, [billings, searchTerm, summaryFilterStatus, isDateInTimeframe]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Timeframe Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center space-x-2">
          <Calendar className="w-5 h-5 text-[#CD0D13]" />
          <div>
            <h4 className="font-bold text-slate-800 text-sm">ช่วงเวลาแสดงผลทางการเงิน</h4>
            <p className="text-[10px] text-slate-500">กรองข้อมูลรายรับ รายจ่าย และสถิติตามกรอบเวลา</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {[
            { id: 'today', label: 'วันนี้' },
            { id: 'week', label: 'สัปดาห์นี้' },
            { id: 'month', label: 'เดือนนี้' },
            { id: 'year', label: 'ปีนี้' },
            { id: 'custom', label: 'เลือกช่วงเวลาเอง' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setSummaryTimeframe(t.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                summaryTimeframe === t.id
                  ? 'bg-[#CD0D13] text-white shadow-md'
                  : 'bg-slate-50 border border-slate-250 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}

          {summaryTimeframe === 'custom' && (
            <div className="flex items-center space-x-2 border-l border-slate-200 pl-3">
              <input
                type="date"
                value={summaryStartDate}
                onChange={(e) => setSummaryStartDate(e.target.value)}
                className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#CD0D13] text-slate-805"
              />
              <span className="text-slate-400 text-xs">ถึง</span>
              <input
                type="date"
                value={summaryEndDate}
                onChange={(e) => setSummaryEndDate(e.target.value)}
                className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#CD0D13] text-slate-805"
              />
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards Grid (Using Reusable StatsCard) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <StatsCard
          title="รายรับที่ชำระเงินแล้ว"
          value={summaryStats.totalPaid}
          icon={CheckCircle2}
          colorScheme="emerald"
        />
        <StatsCard
          title="รายจ่ายของสถาบันรวม"
          value={summaryStats.totalExpenses}
          icon={Receipt}
          colorScheme="rose"
        />
        <StatsCard
          title="รายรับสุทธิ (กำไร/ขาดทุน)"
          value={summaryStats.netRevenue}
          icon={TrendingUp}
          colorScheme={summaryStats.netRevenue >= 0 ? 'emerald' : 'rose'}
        />
        <StatsCard
          title="ยอดเรียกเก็บทั้งหมด"
          value={summaryStats.totalInvoiced}
          icon={Wallet}
          colorScheme="blue"
        />
        <StatsCard
          title="ค้างยอดชำระ"
          value={summaryStats.totalUnpaid}
          icon={AlertCircle}
          colorScheme="amber"
        />
        <StatsCard
          title="รอการตรวจสอบสลิป"
          value={summaryStats.totalPending}
          icon={Clock}
          colorScheme="slate"
        />
      </div>

      {/* Split layout for Table and breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Invoices List Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-md font-bold text-slate-800">รายการใบเรียกเก็บเงินในช่วงเวลา</h3>
              <p className="text-xs text-slate-500 mt-0.5">กรองแสดงผลบิลและประวัติการเงินเฉพาะช่วงที่เลือก</p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative w-full sm:w-40">
                <input
                  type="text"
                  placeholder="ค้นหา..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-250 rounded-lg text-xs outline-none focus:bg-white focus:border-[#CD0D13] text-slate-800"
                />
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
              </div>

              <select
                value={summaryFilterStatus}
                onChange={(e: any) => setSummaryFilterStatus(e.target.value)}
                className="w-full sm:w-auto px-3 py-1.5 bg-slate-50 border border-slate-250 rounded-lg text-xs outline-none focus:bg-white text-slate-700"
              >
                <option value="all">สถานะ: ทั้งหมด</option>
                <option value="paid">ชำระแล้ว</option>
                <option value="pending">รอตรวจสอบ</option>
                <option value="unpaid">ค้างชำระ</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-5">รหัสบิล</th>
                  <th className="py-3 px-5">ชื่อผู้เรียน</th>
                  <th className="py-3 px-5">ประเภทค่าใช้จ่าย</th>
                  <th className="py-3 px-5">รายละเอียด</th>
                  <th className="py-3 px-5 text-right">ยอดรวม</th>
                  <th className="py-3 px-5">วันที่ครบกำหนด</th>
                  <th className="py-3 px-5">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredSummaryLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <p className="text-xs">ไม่พบข้อมูลใบเรียกเก็บเงินตามฟิลเตอร์</p>
                    </td>
                  </tr>
                ) : (
                  filteredSummaryLogs.map(b => (
                    <tr key={b.id} className="hover:bg-slate-50/50 text-xs transition-colors">
                      <td className="py-3.5 px-5 font-semibold text-slate-550">BILL-{b.id}</td>
                      <td className="py-3.5 px-5 font-bold text-slate-800">
                        {b.customer ? `${b.customer.firstName} ${b.customer.lastName}` : "ผู้เรียน"}
                      </td>
                      <td className="py-3.5 px-5 text-slate-600">{b.billing_type?.billingtypename || "ทั่วไป"}</td>
                      <td className="py-3.5 px-5 text-slate-505 text-slate-500 max-w-xs truncate" title={b.billingdescription}>
                        {b.billingdescription}
                      </td>
                      <td className="py-3.5 px-5 text-right font-bold text-slate-805 text-slate-800">
                        ฿{b.billingamount.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-5 text-slate-505 text-slate-500">{b.billingdue_date?.split('T')[0]}</td>
                      <td className="py-3.5 px-5">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          b.billingstatus === 'paid'
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                            : b.billingstatus === 'waitcheck'
                            ? 'bg-amber-50 text-amber-600 border border-amber-100'
                            : 'bg-rose-50 text-rose-600 border border-rose-100'
                        }`}>
                          {b.billingstatus === 'paid' ? 'ชำระแล้ว' : b.billingstatus === 'waitcheck' ? 'รอสลิป' : 'ค้างชำระ'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Course Income Breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <div className="mb-4 pb-3 border-b border-slate-100">
              <h3 className="text-md font-bold text-slate-800">รายรับแยกตามประเภท</h3>
              <p className="text-xs text-slate-500 mt-0.5">ยอดรวมสถิติบิลแบ่งตามประเภทค่าบริการ</p>
            </div>

            <div className="space-y-4">
              {Object.entries(summaryStats.coursesBreakdown).length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-xs">
                  ยังไม่มีสถิติยอดรายรับ
                </div>
              ) : (
                Object.entries(summaryStats.coursesBreakdown).map(([typeName, totalAmount]) => {
                  const totalInvoiced = summaryStats.totalInvoiced || 1;
                  const percentage = Math.round((totalAmount / totalInvoiced) * 100);
                  return (
                    <div key={typeName} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-slate-700 truncate max-w-[120px]" title={typeName}>
                          {typeName}
                        </span>
                        <span className="font-bold text-slate-900">
                          ฿{totalAmount.toLocaleString()} ({percentage}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-[#CD0D13] h-full rounded-full transition-all duration-1000"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Expense Breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <div className="mb-4 pb-3 border-b border-slate-100">
              <h3 className="text-md font-bold text-slate-800">รายจ่ายแยกตามประเภท</h3>
              <p className="text-xs text-slate-500 mt-0.5">ยอดรวมสถิติรายจ่ายแบ่งตามหมวดหมู่</p>
            </div>

            <div className="space-y-4">
              {Object.entries(summaryStats.expensesBreakdown).length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-xs">
                  ยังไม่มีสถิติยอดรายจ่าย
                </div>
              ) : (
                Object.entries(summaryStats.expensesBreakdown).map(([typeName, totalAmount]) => {
                  const totalExpenses = summaryStats.totalExpenses || 1;
                  const percentage = Math.round((totalAmount / totalExpenses) * 100);

                  let displayName = "อื่นๆ";
                  if (typeName === "coach_wages") displayName = "ค่าจ้างโค้ช";
                  else if (typeName === "court_rental") displayName = "ค่าเช่าสนาม";
                  else if (typeName === "equipment") displayName = "ค่าอุปกรณ์";
                  else if (typeName === "advertising") displayName = "ค่าโฆษณา";
                  else if (typeName === "other") displayName = "อื่นๆ";

                  return (
                    <div key={typeName} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-slate-700 truncate max-w-[120px]" title={displayName}>
                          {displayName}
                        </span>
                        <span className="font-bold text-slate-900">
                          ฿{totalAmount.toLocaleString()} ({percentage}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-rose-500 h-full rounded-full transition-all duration-1000"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
