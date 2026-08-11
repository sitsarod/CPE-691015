import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Calendar, CheckCircle2, Receipt, TrendingUp, Wallet, AlertCircle, Clock, Search, BarChart3 } from 'lucide-react';
import { BillingDTO, Expense } from './types';
import StatsCard from '@/components/StatsCard';

const MONTH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// สีกราฟผ่านการตรวจ CVD แล้ว (validate_palette): รายรับ=เขียวเข้ม รายจ่าย=แดง
// ใช้เขียวเข้ม (emerald-600) คู่กับแดง (rose-500) ที่ต่างค่าความสว่างพอ จึงแยกออกได้แม้ตาบอดสี (ΔE 8.3)
// สอดคล้องกับการ์ดสถิติที่ใช้ emerald=รายรับ rose=รายจ่าย
const COLOR_INCOME = '#059669';
const COLOR_EXPENSE = '#f43f5e';

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

  // คำนวณขอบเขตช่วงเวลา [start, end] ครั้งเดียวต่อการเปลี่ยนตัวกรอง
  // (เดิมคำนวณใหม่ต่อบิลทุกใบ) แล้วให้การเช็คเหลือแค่เทียบตัวเลข
  const timeframeWindow = useMemo(() => {
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

    if (summaryTimeframe === 'today') {
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      return { start: startOfToday, end: endOfToday };
    }
    if (summaryTimeframe === 'week') {
      const tempNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const day = tempNow.getDay();
      const diff = tempNow.getDate() - day + (day === 0 ? -6 : 1);
      const startOfWeek = new Date(tempNow.setDate(diff));
      startOfWeek.setHours(0, 0, 0, 0);
      return { start: startOfWeek.getTime(), end: endOfToday };
    }
    if (summaryTimeframe === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      startOfMonth.setHours(0, 0, 0, 0);
      return { start: startOfMonth.getTime(), end: endOfToday };
    }
    if (summaryTimeframe === 'year') {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      startOfYear.setHours(0, 0, 0, 0);
      return { start: startOfYear.getTime(), end: endOfToday };
    }
    if (summaryTimeframe === 'custom') {
      const start = summaryStartDate ? new Date(summaryStartDate) : null;
      if (start) start.setHours(0, 0, 0, 0);
      const end = summaryEndDate ? new Date(summaryEndDate) : null;
      if (end) end.setHours(23, 59, 59, 999);
      return { start: start ? start.getTime() : 0, end: end ? end.getTime() : Infinity };
    }
    return { start: -Infinity, end: Infinity };
  }, [summaryTimeframe, summaryStartDate, summaryEndDate]);

  // Helper to check if date is in selected timeframe
  const isDateInTimeframe = useCallback((dateStr: string) => {
    if (!dateStr) return false;
    const t = new Date(dateStr).getTime();
    return t >= timeframeWindow.start && t <= timeframeWindow.end;
  }, [timeframeWindow]);

  // Financial Stats — วนข้อมูลรอบเดียวสะสมทุกยอดพร้อมกัน (single pass)
  const summaryStats = useMemo(() => {
    let totalPaid = 0;
    let totalPending = 0;
    let totalInvoiced = 0;
    let totalUnpaid = 0;
    const coursesBreakdown: { [key: string]: number } = {};

    for (const b of billings) {
      if (!isDateInTimeframe(b.created_at || b.billingdue_date)) continue;
      const amt = b.billingamount;
      totalInvoiced += amt;
      if (b.billingstatus === 'paid') totalPaid += amt;
      else if (b.billingstatus === 'waitcheck') totalPending += amt;
      else if (b.billingstatus === 'unfunded' || b.billingstatus === 'overdue') totalUnpaid += amt;

      const typeName = b.billing_type?.billingtypename || "อื่นๆ";
      coursesBreakdown[typeName] = (coursesBreakdown[typeName] || 0) + amt;
    }

    let totalExpenses = 0;
    const expensesBreakdown: { [key: string]: number } = {
      coach_wages: 0,
      court_rental: 0,
      equipment: 0,
      advertising: 0,
      other: 0
    };
    for (const e of expenses) {
      if (!isDateInTimeframe(e.expensedate)) continue;
      totalExpenses += e.expenseamount;
      expensesBreakdown[e.expensetype] = (expensesBreakdown[e.expensetype] || 0) + e.expenseamount;
    }

    const netRevenue = totalPaid - totalExpenses;

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

  // แนวโน้มรายรับ (บิลที่ชำระแล้ว) เทียบรายจ่าย ย้อนหลัง 6 เดือน — ไม่ผูกกับตัวกรองช่วงเวลาด้านบน
  const monthlyTrend = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { year: d.getFullYear(), month: d.getMonth(), income: 0, expense: 0 };
    });
    const indexOf = (y: number, m: number) => buckets.findIndex(b => b.year === y && b.month === m);

    billings.forEach(b => {
      if (b.billingstatus !== 'paid') return;
      const ds = b.created_at || b.billingdue_date;
      if (!ds) return;
      const d = new Date(ds);
      const i = indexOf(d.getFullYear(), d.getMonth());
      if (i >= 0) buckets[i].income += b.billingamount;
    });
    expenses.forEach(e => {
      if (!e.expensedate) return;
      const d = new Date(e.expensedate);
      const i = indexOf(d.getFullYear(), d.getMonth());
      if (i >= 0) buckets[i].expense += e.expenseamount;
    });

    const max = Math.max(...buckets.flatMap(b => [b.income, b.expense]), 1);
    const totalIncome = buckets.reduce((s, b) => s + b.income, 0);
    const totalExpense = buckets.reduce((s, b) => s + b.expense, 0);
    return { buckets, max, totalIncome, totalExpense, net: totalIncome - totalExpense };
  }, [billings, expenses]);

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

  // แบ่งหน้าตารางรายการบิล 10 รายการ/หน้า (ลดภาระการเรนเดอร์เมื่อบิลเยอะ)
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  // รีเซ็ตกลับหน้าแรกเมื่อฟิลเตอร์/ช่วงเวลา/คำค้นเปลี่ยน
  useEffect(() => {
    setPage(1);
  }, [searchTerm, summaryFilterStatus, summaryTimeframe, summaryStartDate, summaryEndDate]);
  const totalPages = Math.max(1, Math.ceil(filteredSummaryLogs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedLogs = useMemo(
    () => filteredSummaryLogs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredSummaryLogs, safePage]
  );

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
            { id: 'today' as const, label: 'วันนี้' },
            { id: 'week' as const, label: 'สัปดาห์นี้' },
            { id: 'month' as const, label: 'เดือนนี้' },
            { id: 'year' as const, label: 'ปีนี้' },
            { id: 'custom' as const, label: 'เลือกช่วงเวลาเอง' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setSummaryTimeframe(t.id)}
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
          title="รอการตรวจสอบ"
          value={summaryStats.totalPending}
          icon={Clock}
          colorScheme="slate"
        />
      </div>

      {/* Monthly income vs expense trend chart */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 flex-shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-md font-bold text-slate-800">แนวโน้มรายรับ–รายจ่าย 6 เดือนล่าสุด</h3>
              <p className="text-xs text-slate-500 mt-0.5">เทียบรายรับที่ชำระแล้วกับรายจ่ายของสถาบันในแต่ละเดือน</p>
            </div>
          </div>
          {/* Legend */}
          <div className="flex items-center gap-4 self-start sm:self-center">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLOR_INCOME }} />
              <span className="text-xs font-semibold text-slate-600">รายรับ</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLOR_EXPENSE }} />
              <span className="text-xs font-semibold text-slate-600">รายจ่าย</span>
            </div>
          </div>
        </div>

        {/* Plot */}
        <div className="h-56 flex items-end gap-2 sm:gap-4">
          {monthlyTrend.buckets.map(b => {
            const incPct = (b.income / monthlyTrend.max) * 100;
            const expPct = (b.expense / monthlyTrend.max) * 100;
            const net = b.income - b.expense;
            const isCurrent = b.year === new Date().getFullYear() && b.month === new Date().getMonth();
            return (
              <div key={`${b.year}-${b.month}`} className="flex-1 h-full flex flex-col items-center justify-end group/bar">
                <div className="relative flex-1 w-full flex items-end justify-center gap-1.5 min-h-0">
                  {/* Tooltip */}
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full z-10 opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none bg-slate-800 text-white rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
                    <div className="text-[10px] font-bold mb-1 text-slate-300">{MONTH_SHORT[b.month]} {b.year + 543}</div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: COLOR_INCOME }} />
                      รายรับ <span className="font-bold ml-auto">฿{b.income.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                      <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: COLOR_EXPENSE }} />
                      รายจ่าย <span className="font-bold ml-auto">฿{b.expense.toLocaleString()}</span>
                    </div>
                    <div className={`text-[10px] mt-1 pt-1 border-t border-white/20 font-bold ${net >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      สุทธิ {net >= 0 ? '+' : ''}฿{net.toLocaleString()}
                    </div>
                  </div>

                  <div
                    className="w-[42%] max-w-[24px] rounded-t-md transition-all duration-500 group-hover/bar:brightness-110"
                    style={{ height: `${Math.max(incPct, b.income > 0 ? 2 : 0)}%`, backgroundColor: COLOR_INCOME }}
                  />
                  <div
                    className="w-[42%] max-w-[24px] rounded-t-md transition-all duration-500 group-hover/bar:brightness-110"
                    style={{ height: `${Math.max(expPct, b.expense > 0 ? 2 : 0)}%`, backgroundColor: COLOR_EXPENSE }}
                  />
                </div>
                <span className={`text-[10px] font-semibold mt-2 pt-2 border-t w-full text-center ${isCurrent ? 'text-blue-600 font-black border-slate-200' : 'text-slate-500 border-slate-100'}`}>
                  {MONTH_SHORT[b.month]}
                </span>
              </div>
            );
          })}
        </div>

        {/* Window totals */}
        <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-slate-100">
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">รายรับรวม 6 เดือน</p>
            <p className="text-sm font-black mt-0.5" style={{ color: COLOR_INCOME }}>฿{monthlyTrend.totalIncome.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">รายจ่ายรวม 6 เดือน</p>
            <p className="text-sm font-black mt-0.5" style={{ color: COLOR_EXPENSE }}>฿{monthlyTrend.totalExpense.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">คงเหลือสุทธิ</p>
            <p className={`text-sm font-black mt-0.5 ${monthlyTrend.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {monthlyTrend.net >= 0 ? '+' : ''}฿{monthlyTrend.net.toLocaleString()}
            </p>
          </div>
        </div>
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
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:bg-white focus:border-[#CD0D13] text-slate-800"
                />
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
              </div>

              <select
                value={summaryFilterStatus}
                onChange={(e) => setSummaryFilterStatus(e.target.value as 'all' | 'pending' | 'paid' | 'unpaid')}
                className="w-full sm:w-auto px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:bg-white text-slate-700"
              >
                <option value="all">สถานะ: ทั้งหมด</option>
                <option value="paid">ชำระแล้ว</option>
                <option value="pending">รอตรวจสอบ</option>
                <option value="unpaid">ค้างชำระ</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full min-w-[720px] text-left border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-4 whitespace-nowrap">รหัสบิล</th>
                  <th className="py-3 px-4 whitespace-nowrap">ชื่อผู้เรียน</th>
                  <th className="py-3 px-4 whitespace-nowrap">ประเภทค่าใช้จ่าย</th>
                  <th className="py-3 px-4 whitespace-nowrap">รายละเอียด</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">ยอดรวม</th>
                  <th className="py-3 px-4 whitespace-nowrap">วันที่ครบกำหนด</th>
                  <th className="py-3 px-4 whitespace-nowrap">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSummaryLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <p className="text-xs">ไม่พบข้อมูลใบเรียกเก็บเงินตามฟิลเตอร์</p>
                    </td>
                  </tr>
                ) : (
                  pagedLogs.map(b => (
                    <tr key={b.invoice_id ? `bill-${b.id}-inv-${b.invoice_id}` : `bill-${b.id}`} className="odd:bg-white even:bg-slate-50/40 hover:bg-slate-100/60 text-xs transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-slate-500 whitespace-nowrap tabular-nums">BILL-{b.id}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-800 whitespace-nowrap">
                        {b.customer ? `${b.customer.firstName} ${b.customer.lastName}` : "ผู้เรียน"}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">{b.billing_type?.billingtypename || "ทั่วไป"}</td>
                      <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate" title={b.billingdescription}>
                        {b.billingdescription}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-800 whitespace-nowrap tabular-nums">
                        ฿{b.billingamount.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">{b.billingdue_date?.split('T')[0]}</td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-block whitespace-nowrap text-[9px] font-bold px-2.5 py-1 rounded-full ${
                          b.billingstatus === 'paid'
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                            : b.billingstatus === 'waitcheck'
                            ? 'bg-amber-50 text-amber-600 border border-amber-100'
                            : 'bg-rose-50 text-rose-600 border border-rose-100'
                        }`}>
                          {b.billingstatus === 'paid' ? 'ชำระแล้ว' : b.billingstatus === 'waitcheck' ? 'รอตรวจสอบ' : 'ค้างชำระ'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          {filteredSummaryLogs.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-slate-200 text-xs">
              <span className="text-slate-500">
                แสดง {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredSummaryLogs.length)} จาก {filteredSummaryLogs.length} รายการ
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
