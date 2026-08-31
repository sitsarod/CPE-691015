import { useState, useMemo, useCallback, useEffect } from 'react';
import { CheckCircle2, Receipt, TrendingUp, Wallet, AlertCircle, Clock, Search, BarChart3, Image as ImageIcon } from 'lucide-react';
import { BillingDTO, Expense } from './types';
import StatsCard from '@/components/StatsCard';
import ImageLightbox from '@/components/ImageLightbox';
import { useHorizontalWheelScroll } from '@/hooks/useHorizontalWheelScroll';

const MONTH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// สีกราฟผ่านการตรวจ CVD แล้ว (validate_palette): รายรับ=เขียวเข้ม รายจ่าย=แดง
// ใช้เขียวเข้ม (emerald-600) คู่กับแดง (rose-500) ที่ต่างค่าความสว่างพอ จึงแยกออกได้แม้ตาบอดสี (ΔE 8.3)
// สอดคล้องกับการ์ดสถิติที่ใช้ emerald=รายรับ rose=รายจ่าย
const COLOR_INCOME = '#059669';
const COLOR_EXPENSE = '#f43f5e';

// สีประเภท (categorical) ตามลำดับคงที่จาก dataviz reference palette — ผ่าน validator แล้ว
// (worst adjacent CVD ΔE 9.1) สีผูกกับ "ประเภท" (entity) ไม่ใช่ตามขนาด และไม่วนซ้ำ
const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

// รายจ่าย: ผูกสี+ชื่อไทยตายตัวกับประเภท (สีเดิมเสมอไม่ว่าช่วงเวลาไหน)
const EXPENSE_META: Record<string, { label: string; color: string }> = {
  coach_wages:  { label: 'ค่าจ้างโค้ช',        color: CATEGORICAL[0] },
  court_rental: { label: 'ค่าเช่าสนาม',        color: CATEGORICAL[1] },
  equipment:    { label: 'ค่าอุปกรณ์',         color: CATEGORICAL[2] },
  advertising:  { label: 'ค่าโฆษณา',           color: CATEGORICAL[3] },
  other:        { label: 'อื่นๆ',              color: CATEGORICAL[4] },
  coach_other:  { label: 'รายได้อื่น (โค้ช)',  color: CATEGORICAL[5] },
};

interface DonutSlice { label: string; value: number; color: string }

// กราฟโดนัท + legend — ใช้ร่วมทั้งรายรับและรายจ่าย
// legend โชว์ค่าเป๊ะ (relief rule: บาง slot contrast < 3:1 จึงต้องมี label กำกับ)
function DonutBreakdown({ slices, total, centerValue }: { slices: DonutSlice[]; total: number; centerValue: string }) {
  const size = 132;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          {/* ราง (track) */}
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f0ec" strokeWidth={stroke} />
          {slices.map((s, i) => {
            const frac = total > 0 ? s.value / total : 0;
            const len = Math.max(frac * C - 2, 0); // เว้นช่อง 2px ระหว่างชิ้น (surface gap)
            const seg = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
              >
                <title>{`${s.label}: ฿${s.value.toLocaleString()} (${total > 0 ? Math.round(frac * 100) : 0}%)`}</title>
              </circle>
            );
            offset += frac * C;
            return seg;
          })}
        </svg>
        {/* ยอดรวมตรงกลาง */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[9px] font-semibold text-slate-400">รวม</span>
          <span className="text-sm font-black text-slate-800">{centerValue}</span>
        </div>
      </div>

      {/* legend — จุดสีบอกประเภท, ข้อความเป็นสีหมึก (ไม่ใช้สีซีรีส์กับตัวอักษร) */}
      <ul className="flex-1 w-full space-y-2">
        {slices.map((s, i) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <li key={i} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="flex-1 truncate text-slate-700" title={s.label}>{s.label}</span>
              <span className="shrink-0 font-bold text-slate-900 tabular-nums">฿{s.value.toLocaleString()}</span>
              <span className="w-9 shrink-0 text-right text-slate-400 tabular-nums">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface FinancialSummaryTabProps {
  billings: BillingDTO[];
  expenses: Expense[];
}

export default function FinancialSummaryTab({
  billings,
  expenses
}: FinancialSummaryTabProps) {
  const [summaryTimeframe, setSummaryTimeframe] = useState<'today' | 'week' | 'month' | 'year' | 'custom'>('today');
  const [summaryStartDate, setSummaryStartDate] = useState('');
  const [summaryEndDate, setSummaryEndDate] = useState('');
  const [summaryFilterStatus, setSummaryFilterStatus] = useState<'all' | 'pending' | 'paid' | 'unpaid'>('unpaid');
  const [searchTerm, setSearchTerm] = useState('');
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null); // สลิปที่กำลังเปิดดูใน lightbox
  const statsScrollRef = useHorizontalWheelScroll<HTMLDivElement>();
  const tableScrollRef = useHorizontalWheelScroll<HTMLDivElement>();

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
      const amt = b.billingamount;
      // ยอดเรียกเก็บ/ค้าง/รอตรวจ = อิงวันที่ออกบิล (created_at)
      const createdIn = isDateInTimeframe(b.created_at || b.billingdue_date);

      if (b.billingstatus === 'paid') {
        // รายรับที่จ่ายจริง = อิงวันที่ชำระเงิน (paid_at) ไม่ใช่วันที่ออกบิล
        // เช่น ออกบิลวันที่ 1 แต่ลูกค้าจ่ายวันที่ 2 → ยอดต้องนับเป็นของวันที่ 2
        if (isDateInTimeframe(b.paid_at || b.created_at || b.billingdue_date)) {
          totalPaid += amt;
          // รายรับแยกตามประเภท = เฉพาะบิลที่ชำระแล้วจริง (ไม่นับที่ยังค้าง/รอตรวจ)
          const typeName = b.billing_type?.billingtypename || "อื่นๆ";
          coursesBreakdown[typeName] = (coursesBreakdown[typeName] || 0) + amt;
        }
      }
      else if (b.billingstatus === 'waitcheck') { if (createdIn) totalPending += amt; }
      else if (b.billingstatus === 'unfunded' || b.billingstatus === 'overdue') { if (createdIn) totalUnpaid += amt; }

      // ยอดเรียกเก็บทั้งหมดในช่วงเวลา = ทุกบิลที่ออกในช่วงนั้น (ทุกสถานะ)
      if (createdIn) totalInvoiced += amt;
    }

    let totalExpenses = 0;
    // เริ่มเป็นออบเจ็กต์ว่าง (เหมือนรายรับ) เติมเฉพาะประเภทที่มีรายจ่ายจริงในช่วงเวลานั้น
    // ถ้าไม่ตั้งไว้แบบนี้ จะมี 5 คีย์ = 0 ตลอด ทำให้แสดงแท่ง 0% ตลอดและไม่เคยขึ้น empty-state
    const expensesBreakdown: { [key: string]: number } = {};
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

  // ชิ้นโดนัทรายจ่าย: สีตายตัวตามประเภท เรียงมาก→น้อย
  const expenseSlices = useMemo<DonutSlice[]>(() =>
    Object.entries(summaryStats.expensesBreakdown)
      .filter(([, v]) => v > 0)
      .map(([type, value]) => ({
        label: EXPENSE_META[type]?.label || 'อื่นๆ',
        value,
        color: EXPENSE_META[type]?.color || CATEGORICAL[7],
      }))
      .sort((a, b) => b.value - a.value),
    [summaryStats.expensesBreakdown]
  );

  // ชิ้นโดนัทรายรับ: ประเภทเป็นชื่อ dynamic → ไล่สลอตสีตามชื่อที่เรียงคงที่ (ประเภทเดิมได้สีเดิม)
  const incomeSlices = useMemo<DonutSlice[]>(() => {
    const entries = Object.entries(summaryStats.coursesBreakdown).filter(([, v]) => v > 0);
    const order = new Map(entries.map(([n]) => n).sort().map((n, i) => [n, i]));
    return entries
      .map(([name, value]) => ({
        label: name,
        value,
        color: CATEGORICAL[(order.get(name) ?? 7) % CATEGORICAL.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [summaryStats.coursesBreakdown]);

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
      // จัดรายรับเข้าเดือนตามวันที่ชำระเงินจริง (paid_at)
      const ds = b.paid_at || b.created_at || b.billingdue_date;
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 sm:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {[
            { id: 'today' as const, label: 'วันนี้' },
            { id: 'week' as const, label: 'สัปดาห์นี้' },
            { id: 'month' as const, label: 'เดือนนี้' },
            { id: 'year' as const, label: 'ปีนี้' },
            { id: 'custom' as const, label: 'เลือก' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setSummaryTimeframe(t.id)}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                summaryTimeframe === t.id
                  ? 'bg-[#CD0D13] text-white shadow-md'
                  : 'bg-slate-50 border border-slate-250 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}

          {summaryTimeframe === 'custom' && (
            <div className="flex items-center space-x-2 border-slate-200 sm:border-l sm:pl-3">
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

      {/* Stats Cards — จอเล็ก: เลื่อนแนวนอน (swipe) เริ่มจากใบสุดท้าย · จอใหญ่: grid ลำดับปกติ */}
      <div ref={statsScrollRef} className="flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory [&>*]:min-w-[85%] [&>*]:snap-center sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-5 sm:overflow-visible sm:snap-none sm:[&>*]:min-w-0">
        {[
          { title: "รายรับที่ชำระเงินแล้ว", value: summaryStats.totalPaid, icon: CheckCircle2, colorScheme: 'emerald' as const, order: 'order-6' },
          { title: "รายจ่ายของสถาบันรวม", value: summaryStats.totalExpenses, icon: Receipt, colorScheme: 'rose' as const, order: 'order-5' },
          { title: "รายรับสุทธิ (กำไร/ขาดทุน)", value: summaryStats.netRevenue, icon: TrendingUp, colorScheme: summaryStats.netRevenue >= 0 ? 'emerald' as const : 'rose' as const, order: 'order-4' },
          { title: "ยอดเรียกเก็บทั้งหมด", value: summaryStats.totalInvoiced, icon: Wallet, colorScheme: 'blue' as const, order: 'order-3' },
          { title: "ค้างยอดชำระ", value: summaryStats.totalUnpaid, icon: AlertCircle, colorScheme: 'amber' as const, order: 'order-2' },
          { title: "รอการตรวจสอบ", value: summaryStats.totalPending, icon: Clock, colorScheme: 'slate' as const, order: 'order-1' }
        ].map((c) => (
          <div key={c.title} className={`${c.order} sm:order-none`}>
            <StatsCard title={c.title} value={c.value} icon={c.icon} colorScheme={c.colorScheme} />
          </div>
        ))}
      </div>

      {/* Monthly income vs expense trend chart — ซ่อนบนมือถือ (อาศัย hover + แท่งแคบ) */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 flex-shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-md font-bold text-slate-800">แนวโน้มรายรับ–รายจ่าย 6 เดือนล่าสุด</h3>
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

        {/* Plot — เว้น headroom 20% เหนือแท่งสูงสุด ไม่ให้ชนขอบบน */}
        {(() => {
          const chartMax = monthlyTrend.max * 1.2;
          return (
            <>
              <div className="relative h-56">
                {/* เส้นกริดอ้างอิง (4 ระดับ) วางหลังแท่ง */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} className="w-full border-t border-dashed border-slate-100" />
                  ))}
                </div>

                {/* แท่ง */}
                <div className="relative h-full flex items-end gap-3 sm:gap-5">
                  {monthlyTrend.buckets.map(b => {
                    const incPct = (b.income / chartMax) * 100;
                    const expPct = (b.expense / chartMax) * 100;
                    const net = b.income - b.expense;
                    return (
                      <div key={`${b.year}-${b.month}`} className="relative flex-1 h-full flex items-end justify-center gap-1.5 group/bar">
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
                          className="w-[46%] max-w-[34px] rounded-t-md transition-all duration-500 group-hover/bar:brightness-110"
                          style={{ height: `${Math.max(incPct, b.income > 0 ? 2 : 0)}%`, backgroundColor: COLOR_INCOME }}
                        />
                        <div
                          className="w-[46%] max-w-[34px] rounded-t-md transition-all duration-500 group-hover/bar:brightness-110"
                          style={{ height: `${Math.max(expPct, b.expense > 0 ? 2 : 0)}%`, backgroundColor: COLOR_EXPENSE }}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* เส้นฐาน */}
                <div className="absolute inset-x-0 bottom-0 border-t border-slate-200" />
              </div>

              {/* ป้ายเดือน — แถวล่าง เรียงตรงแนวแท่ง */}
              <div className="flex gap-3 sm:gap-5 mt-2.5">
                {monthlyTrend.buckets.map(b => {
                  const isCurrent = b.year === new Date().getFullYear() && b.month === new Date().getMonth();
                  return (
                    <span
                      key={`${b.year}-${b.month}`}
                      className={`flex-1 text-center text-[11px] ${isCurrent ? 'text-blue-600 font-black' : 'text-slate-500 font-semibold'}`}
                    >
                      {MONTH_SHORT[b.month]}
                    </span>
                  );
                })}
              </div>
            </>
          );
        })()}

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

      {/* ตารางบิลกว้างเต็ม แล้วแยกส่วนแยกประเภทลงไปข้างล่าง */}
      <div className="space-y-6">
        {/* Invoices List Table — จอเล็ก: แสดงเฉพาะคอลัมน์สำคัญ (ผู้เรียน/ยอด/ครบกำหนด) · จอใหญ่: ครบทุกคอลัมน์ */}
        <div className="flex bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-col">
          <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-md font-bold text-slate-800">รายการใบเรียกเก็บเงินในช่วงเวลา</h3>
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

          <div ref={tableScrollRef} className="overflow-x-auto no-scrollbar flex-1">
            <table className="w-full md:min-w-[720px] text-left border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-4 whitespace-nowrap hidden md:table-cell">รหัสบิล</th>
                  <th className="py-3 px-4 whitespace-nowrap">ชื่อผู้เรียน</th>
                  <th className="py-3 px-4 whitespace-nowrap hidden md:table-cell">ประเภทค่าใช้จ่าย</th>
                  <th className="py-3 px-4 whitespace-nowrap hidden md:table-cell">รายละเอียด</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">ยอดรวม</th>
                  <th className="py-3 px-4 whitespace-nowrap">วันที่ครบกำหนด</th>
                  <th className="py-3 px-4 whitespace-nowrap hidden md:table-cell">สถานะ</th>
                  <th className="py-3 px-4 whitespace-nowrap text-center">สลิป</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSummaryLogs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <p className="text-xs">ไม่พบข้อมูลใบเรียกเก็บเงินตามฟิลเตอร์</p>
                    </td>
                  </tr>
                ) : (
                  pagedLogs.map(b => (
                    <tr key={b.invoice_id ? `bill-${b.id}-inv-${b.invoice_id}` : `bill-${b.id}`} className="odd:bg-white even:bg-slate-50/40 hover:bg-slate-100/60 text-xs transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-slate-500 whitespace-nowrap tabular-nums hidden md:table-cell">BILL-{b.id}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-800 whitespace-nowrap">
                        {b.customer ? `${b.customer.firstName} ${b.customer.lastName}` : "ผู้เรียน"}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap hidden md:table-cell">{b.billing_type?.billingtypename || "ทั่วไป"}</td>
                      <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate hidden md:table-cell" title={b.billingdescription}>
                        {b.billingdescription}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-800 whitespace-nowrap tabular-nums">
                        ฿{b.billingamount.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">{b.billingdue_date?.split('T')[0]}</td>
                      <td className="py-3.5 px-4 hidden md:table-cell">
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
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {b.slipurl ? (
                          <button
                            type="button"
                            onClick={() => setReceiptUrl(b.slipurl!)}
                            className="inline-flex items-center gap-1 text-[#CD0D13] hover:text-[#A30A0E] font-semibold cursor-pointer"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            ดูรูป
                          </button>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
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

        {/* แยกตามประเภท — 2 คอลัมน์บนจอใหญ่ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Course Income Breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <div className="mb-4 pb-3 border-b border-slate-100">
              <h3 className="text-md font-bold text-slate-800">รายรับแยกตามประเภท</h3>
            </div>

            <div>
              {incomeSlices.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-xs">
                  ยังไม่มีสถิติยอดรายรับ
                </div>
              ) : (
                <DonutBreakdown
                  slices={incomeSlices}
                  total={summaryStats.totalPaid}
                  centerValue={`฿${summaryStats.totalPaid.toLocaleString()}`}
                />
              )}
            </div>
          </div>
        </div>

        {/* Expense Breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <div className="mb-4 pb-3 border-b border-slate-100">
              <h3 className="text-md font-bold text-slate-800">รายจ่ายแยกตามประเภท</h3>
            </div>

            <div>
              {expenseSlices.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-xs">
                  ยังไม่มีสถิติยอดรายจ่าย
                </div>
              ) : (
                <DonutBreakdown
                  slices={expenseSlices}
                  total={summaryStats.totalExpenses}
                  centerValue={`฿${summaryStats.totalExpenses.toLocaleString()}`}
                />
              )}
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* ป็อปอัพดูสลิป */}
      <ImageLightbox url={receiptUrl} onClose={() => setReceiptUrl(null)} alt="สลิปการโอนเงิน" />
    </div>
  );
}
