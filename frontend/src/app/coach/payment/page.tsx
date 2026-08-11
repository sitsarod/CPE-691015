"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  AlertCircle,
  Wallet,
  RefreshCw,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Hash,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Gift,
} from "lucide-react";

import { fetchMyCoachProfile, fetchCoachWages, fetchCoachSchedules } from "@/services/coachAPI";
import { CoachWageEntry, WorkScheduleItem } from "@/types/coach";

const MONTH_NAMES_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const MONTH_NAMES_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

interface MonthGroup {
  month: number; // 0-11
  total: number;
  count: number;
  entries: CoachWageEntry[];
}

interface YearGroup {
  year: number;
  total: number;
  count: number;
  months: MonthGroup[]; // length 12, index = month
}

export default function CoachPaymentPage() {
  const router = useRouter();

  const [coachId, setCoachId] = useState<number | null>(null);
  const [payRate, setPayRate] = useState(0);
  const [paymentType, setPaymentType] = useState<"per_session" | "monthly">("per_session");
  const [wages, setWages] = useState<CoachWageEntry[]>([]);
  const [schedules, setSchedules] = useState<WorkScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<"monthly" | "yearly">("monthly");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);

  const loadData = async (id?: number) => {
    try {
      setError(null);
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      let resolvedId = id;
      if (!resolvedId) {
        const myProfile = await fetchMyCoachProfile(token);
        resolvedId = myProfile.id;
        setCoachId(myProfile.id);
        setPayRate(myProfile.pay_rate);
        setPaymentType(myProfile.payment_type);
      }

      const [wagesData, schedulesData] = await Promise.all([
        fetchCoachWages(resolvedId, token),
        fetchCoachSchedules(resolvedId, token),
      ]);
      setWages(wagesData);
      setSchedules(schedulesData);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการดึงข้อมูล");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData(coachId || undefined);
  };

  // แยกค่าจ้างจากการสอน (coach_wages) ออกจากรายได้ส่วนอื่น (coach_other) ให้เหมือนฝั่งแอดมิน
  const wageEntries = useMemo(() => wages.filter((w) => w.expensetype !== "coach_other"), [wages]);
  const otherEntries = useMemo(() => wages.filter((w) => w.expensetype === "coach_other"), [wages]);

  const otherTotal = useMemo(() => otherEntries.reduce((s, w) => s + w.expenseamount, 0), [otherEntries]);
  const otherSorted = useMemo(
    () => [...otherEntries].sort((a, b) => (b.expensedate || "").localeCompare(a.expensedate || "")),
    [otherEntries]
  );

  const yearGroups: YearGroup[] = useMemo(() => {
    const map = new Map<number, YearGroup>();
    wageEntries.forEach((w) => {
      if (!w.expensedate) return;
      const d = new Date(w.expensedate);
      const year = d.getFullYear();
      const month = d.getMonth();
      if (!map.has(year)) {
        map.set(year, {
          year,
          total: 0,
          count: 0,
          months: Array.from({ length: 12 }, (_, m) => ({ month: m, total: 0, count: 0, entries: [] })),
        });
      }
      const yg = map.get(year)!;
      yg.total += w.expenseamount;
      yg.count += 1;
      yg.months[month].total += w.expenseamount;
      yg.months[month].count += 1;
      yg.months[month].entries.push(w);
    });
    return Array.from(map.values()).sort((a, b) => b.year - a.year);
  }, [wageEntries]);

  useEffect(() => {
    if (yearGroups.length > 0 && selectedYear === null) {
      const currentYear = new Date().getFullYear();
      const hasCurrent = yearGroups.some((y) => y.year === currentYear);
      setSelectedYear(hasCurrent ? currentYear : yearGroups[0].year);
    }
  }, [yearGroups, selectedYear]);

  const totalWages = useMemo(() => wageEntries.reduce((sum, w) => sum + w.expenseamount, 0), [wageEntries]);
  const totalCount = wageEntries.length;
  const avgPerPayment = totalCount > 0 ? totalWages / totalCount : 0;

  const now = new Date();
  const { currentMonthTotal, momDeltaPct } = useMemo(() => {
    const sumFor = (year: number, month: number) =>
      wageEntries
        .filter((w) => {
          if (!w.expensedate) return false;
          const d = new Date(w.expensedate);
          return d.getFullYear() === year && d.getMonth() === month;
        })
        .reduce((sum, w) => sum + w.expenseamount, 0);

    const thisMonth = sumFor(now.getFullYear(), now.getMonth());
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = sumFor(prevDate.getFullYear(), prevDate.getMonth());
    const delta = prevMonth > 0 ? ((thisMonth - prevMonth) / prevMonth) * 100 : null;
    return { currentMonthTotal: thisMonth, momDeltaPct: delta };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wageEntries]);

  const currentYearGroup = yearGroups.find((y) => y.year === selectedYear) || null;

  const maxMonthTotal = currentYearGroup ? Math.max(...currentYearGroup.months.map((m) => m.total), 0) : 0;

  const todayStr = now.toISOString().split("T")[0];

  // นับเฉพาะคาบสอนที่ผ่านไปแล้ว (ยังไม่นับคาบที่ยังไม่ถึงวันสอน) แยกตามปี-เดือน
  const sessionCountByYearMonth = useMemo(() => {
    const map = new Map<string, number>();
    schedules.forEach((s) => {
      if (!s.date || s.date >= todayStr) return;
      const d = new Date(s.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules]);

  const scheduleComparison = useMemo(() => {
    if (!currentYearGroup) return null;
    const rows = currentYearGroup.months.map((m) => {
      const sessionsDone = sessionCountByYearMonth.get(`${currentYearGroup.year}-${m.month}`) || 0;
      const expected = sessionsDone * payRate;
      return {
        month: m.month,
        sessionsDone,
        expected,
        actual: m.total,
        variance: m.total - expected,
      };
    });
    const totals = rows.reduce(
      (acc, r) => ({
        sessionsDone: acc.sessionsDone + r.sessionsDone,
        expected: acc.expected + r.expected,
        actual: acc.actual + r.actual,
        variance: acc.variance + r.variance,
      }),
      { sessionsDone: 0, expected: 0, actual: 0, variance: 0 }
    );
    return { rows, totals };
  }, [currentYearGroup, sessionCountByYearMonth, payRate]);

  const bestMonth = useMemo<MonthGroup | null>(() => {
    if (!currentYearGroup) return null;
    const withData = currentYearGroup.months.filter((m) => m.count > 0);
    if (withData.length === 0) return null;
    return withData.reduce((best, m) => (m.total > best.total ? m : best), withData[0]);
  }, [currentYearGroup]);

  const avgPerMonthThisYear = useMemo(() => {
    if (!currentYearGroup) return 0;
    const activeMonths = currentYearGroup.months.filter((m) => m.count > 0).length || 1;
    return currentYearGroup.total / activeMonths;
  }, [currentYearGroup]);

  if (isLoading) {
    return (
      <div className="w-full min-h-[60vh] flex flex-col items-center justify-center text-gray-500">
        <Loader2 className="w-12 h-12 animate-spin text-[#CC0000] mb-4" />
        <span className="text-sm font-semibold tracking-wide animate-pulse">กำลังโหลดข้อมูลการเงิน...</span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-150 pb-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Wallet className="w-8 h-8 text-[#CC0000]" />
            การเงินของฉัน
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            ประวัติค่าจ้างและรายได้อื่น ๆ ที่สถาบันบันทึกจ่ายให้คุณ
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-250 text-gray-700 hover:text-black py-2.5 px-4 rounded-xl text-sm font-bold transition-all border border-gray-200 cursor-pointer self-start md:self-auto disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-[#CC0000]" : ""}`} />
          {isRefreshing ? "กำลังอัปเดต..." : "อัปเดตข้อมูล"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold">เกิดข้อผิดพลาด</h4>
            <p className="text-sm mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {wageEntries.length === 0 && otherEntries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-20 text-center text-slate-400">
          <Wallet className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-xs">ยังไม่มีประวัติค่าจ้างในขณะนี้</p>
        </div>
      ) : (
        <>
          {wageEntries.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-16 text-center text-slate-400">
              <Wallet className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="text-sm font-semibold text-slate-500">ยังไม่มีข้อมูลเงินเดือน / ค่าจ้างการสอน</p>
              <p className="text-xs mt-1">เมื่อสถาบันบันทึกค่าจ้างการสอนให้ ระบบจะแสดงสรุปและกราฟรายได้ที่นี่</p>
            </div>
          ) : (
          <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-[#FFF0F0] text-[#CC0000] flex-shrink-0">
                <Wallet className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ค่าจ้างสะสมทั้งหมด</p>
                <p className="text-xl font-black text-slate-800 mt-0.5">฿{totalWages.toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-blue-50 text-blue-600 flex-shrink-0">
                <CalendarDays className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ยอดรวมปี {selectedYear ?? "-"}</p>
                <p className="text-xl font-black text-slate-800 mt-0.5">฿{(currentYearGroup?.total ?? 0).toLocaleString()}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">เฉลี่ย ฿{Math.round(avgPerMonthThisYear).toLocaleString()}/เดือน</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 flex-shrink-0">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ยอดเดือนนี้</p>
                <p className="text-xl font-black text-slate-800 mt-0.5">฿{currentMonthTotal.toLocaleString()}</p>
                {momDeltaPct !== null && (
                  <p className={`text-[10px] font-bold mt-0.5 flex items-center gap-1 ${momDeltaPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {momDeltaPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {momDeltaPct >= 0 ? "+" : ""}
                    {momDeltaPct.toFixed(1)}% จากเดือนก่อน
                  </p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-slate-100 text-slate-600 flex-shrink-0">
                <Hash className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">จำนวนครั้งที่ได้รับ</p>
                <p className="text-xl font-black text-slate-800 mt-0.5">{totalCount.toLocaleString()} ครั้ง</p>
                <p className="text-[10px] text-slate-400 mt-0.5">เฉลี่ย ฿{Math.round(avgPerPayment).toLocaleString()}/ครั้ง</p>
              </div>
            </div>
          </div>

          {/* View toggle + year selector */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1 self-start">
              {(["monthly", "yearly"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setViewMode(v)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === v ? "bg-[#CC0000] text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {v === "monthly" ? "รายเดือน" : "รายปี"}
                </button>
              ))}
            </div>

            {viewMode === "monthly" && yearGroups.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {yearGroups.map((yg) => (
                  <button
                    key={yg.year}
                    onClick={() => {
                      setSelectedYear(yg.year);
                      setExpandedMonth(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                      selectedYear === yg.year
                        ? "bg-slate-800 text-white border-slate-800"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {yg.year}
                  </button>
                ))}
              </div>
            )}
          </div>

          {viewMode === "monthly" && currentYearGroup ? (
            <>
              {/* Monthly bar chart */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="mb-6">
                  <h3 className="text-md font-bold text-slate-800">รายได้รายเดือน ปี {selectedYear}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {bestMonth
                      ? `เดือนที่รายได้สูงสุด: ${MONTH_NAMES_FULL[bestMonth.month]} (฿${bestMonth.total.toLocaleString()})`
                      : "ยังไม่มีข้อมูลในปีนี้"}
                  </p>
                </div>

                <div className="h-40 flex items-end gap-1.5 sm:gap-2">
                  {currentYearGroup.months.map((m) => {
                    const isCurrent = selectedYear === now.getFullYear() && m.month === now.getMonth();
                    const pct = maxMonthTotal > 0 ? (m.total / maxMonthTotal) * 100 : 0;
                    return (
                      <div key={m.month} className="flex-1 h-full flex flex-col items-center justify-end group relative">
                        <div className="absolute -top-2 -translate-y-full left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] rounded-lg px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                          <span className="font-bold">฿{m.total.toLocaleString()}</span>
                          <span className="text-slate-300"> · {MONTH_NAMES_FULL[m.month]}</span>
                        </div>
                        {m.total > 0 ? (
                          <div
                            style={{ height: `${Math.max(pct, 3)}%` }}
                            className="w-full max-w-[28px] rounded-t-md bg-[#CC0000] group-hover:brightness-110 transition-all duration-500"
                          />
                        ) : (
                          <div className="w-full max-w-[28px] h-[3px] rounded-t-md bg-slate-150" />
                        )}
                        <span className={`text-[10px] font-semibold mt-2 ${isCurrent ? "text-[#CC0000] font-black" : "text-slate-500"}`}>
                          {MONTH_NAMES_SHORT[m.month]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Schedule vs. actual wage comparison */}
              {/* ตารางนี้เทียบ "คาบสอน × ค่าจ้างต่อคาบ" กับรายได้จริง — มีความหมายเฉพาะโค้ชรายครั้งเท่านั้น
                  โค้ชรายเดือนได้รับเงินคงที่ไม่ผูกกับจำนวนคาบ จึงซ่อนตารางนี้ไป */}
              {paymentType !== "monthly" && scheduleComparison && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-slate-100 flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-amber-50 text-amber-600 flex-shrink-0">
                      <ClipboardList className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-md font-bold text-slate-800">เทียบกับรายได้ที่ควรได้จากตารางสอน</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        ประมาณการจากจำนวนคาบสอนที่ผ่านไปแล้ว × ค่าจ้างต่อคาบ (฿{payRate.toLocaleString()}/คาบ)
                        {payRate === 0 && " — ยังไม่ได้ตั้งค่าอัตราค่าจ้างต่อคาบในระบบ ตัวเลขนี้จึงยังไม่ถูกต้อง"}
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                          <th className="py-3 px-5">เดือน</th>
                          <th className="py-3 px-5">คาบที่สอนแล้ว</th>
                          <th className="py-3 px-5 text-right">รายได้ที่ควรได้</th>
                          <th className="py-3 px-5 text-right">ได้รับจริง</th>
                          <th className="py-3 px-5 text-right">ส่วนต่าง</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {scheduleComparison.rows.map((r) => {
                          const isEmpty = r.sessionsDone === 0 && r.actual === 0;
                          return (
                            <tr key={r.month} className={`text-xs ${isEmpty ? "text-slate-300" : ""}`}>
                              <td className="py-3 px-5 font-semibold text-slate-700">{MONTH_NAMES_FULL[r.month]}</td>
                              <td className="py-3 px-5 text-slate-600">{isEmpty ? "-" : `${r.sessionsDone} คาบ`}</td>
                              <td className="py-3 px-5 text-right text-slate-700">{isEmpty ? "-" : `฿${r.expected.toLocaleString()}`}</td>
                              <td className="py-3 px-5 text-right font-bold text-slate-900">{isEmpty ? "-" : `฿${r.actual.toLocaleString()}`}</td>
                              <td className={`py-3 px-5 text-right font-bold ${isEmpty ? "" : r.variance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                {isEmpty ? "-" : `${r.variance >= 0 ? "+" : ""}฿${r.variance.toLocaleString()}`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="text-xs bg-slate-50 border-t border-slate-200">
                          <td className="py-3 px-5 font-black text-slate-800">รวมทั้งปี</td>
                          <td className="py-3 px-5 font-bold text-slate-700">{scheduleComparison.totals.sessionsDone} คาบ</td>
                          <td className="py-3 px-5 text-right font-bold text-slate-700">
                            ฿{scheduleComparison.totals.expected.toLocaleString()}
                          </td>
                          <td className="py-3 px-5 text-right font-bold text-slate-900">
                            ฿{scheduleComparison.totals.actual.toLocaleString()}
                          </td>
                          <td className={`py-3 px-5 text-right font-black ${scheduleComparison.totals.variance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {scheduleComparison.totals.variance >= 0 ? "+" : ""}฿{scheduleComparison.totals.variance.toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Monthly breakdown table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100">
                  <h3 className="text-md font-bold text-slate-800">รายละเอียดรายเดือน</h3>
                  <p className="text-xs text-slate-500 mt-0.5">คลิกที่แถวเพื่อดูรายการค่าจ้างของเดือนนั้น</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                        <th className="py-3 px-5">เดือน</th>
                        <th className="py-3 px-5">จำนวนครั้ง</th>
                        <th className="py-3 px-5 text-right">ยอดรวม</th>
                        <th className="py-3 px-5 w-40">สัดส่วนต่อปี</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {currentYearGroup.months.map((m) => {
                        const hasData = m.count > 0;
                        const isExpanded = expandedMonth === m.month;
                        const pct = currentYearGroup.total > 0 ? (m.total / currentYearGroup.total) * 100 : 0;
                        return (
                          <React.Fragment key={m.month}>
                            <tr
                              onClick={() => hasData && setExpandedMonth(isExpanded ? null : m.month)}
                              className={`text-xs transition-colors ${hasData ? "cursor-pointer hover:bg-slate-50/50" : "text-slate-300"}`}
                            >
                              <td className="py-3 px-5 font-semibold text-slate-700">
                                <span className="flex items-center gap-1.5">
                                  {hasData ? (
                                    isExpanded ? (
                                      <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                                    ) : (
                                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                    )
                                  ) : (
                                    <span className="w-3.5 h-3.5" />
                                  )}
                                  {MONTH_NAMES_FULL[m.month]}
                                </span>
                              </td>
                              <td className="py-3 px-5 text-slate-600">{hasData ? `${m.count} ครั้ง` : "-"}</td>
                              <td className="py-3 px-5 text-right font-bold text-slate-900">
                                {hasData ? `฿${m.total.toLocaleString()}` : "-"}
                              </td>
                              <td className="py-3 px-5">
                                {hasData && (
                                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                    <div className="bg-[#CC0000] h-full rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                                  </div>
                                )}
                              </td>
                            </tr>
                            {isExpanded &&
                              m.entries.map((e) => (
                                <tr key={e.id} className="bg-slate-50/70 text-[11px]">
                                  <td className="py-2.5 px-5 pl-11 text-slate-500">{e.expensedate?.split("T")[0]}</td>
                                  <td className="py-2.5 px-5 text-slate-600" colSpan={2}>
                                    {e.expensedescription || "-"}
                                  </td>
                                  <td className="py-2.5 px-5 text-right font-semibold text-slate-700 whitespace-nowrap">
                                    ฿{e.expenseamount.toLocaleString()}
                                    {e.receipturl && (
                                      <a
                                        href={e.receipturl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="ml-2 text-[#CC0000] hover:underline font-bold"
                                      >
                                        ใบเสร็จ
                                      </a>
                                    )}
                                  </td>
                                </tr>
                              ))}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : viewMode === "yearly" ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <h3 className="text-md font-bold text-slate-800">สรุปรายได้รายปี</h3>
                <p className="text-xs text-slate-500 mt-0.5">ยอดรวมค่าจ้างแยกตามปี ทั้งหมด {yearGroups.length} ปี</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-3 px-5">ปี</th>
                      <th className="py-3 px-5">จำนวนครั้ง</th>
                      <th className="py-3 px-5 text-right">ยอดรวม</th>
                      <th className="py-3 px-5">เฉลี่ย/เดือน</th>
                      <th className="py-3 px-5 w-40">สัดส่วนต่อยอดรวม</th>
                      <th className="py-3 px-5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {yearGroups.map((yg) => {
                      const activeMonths = yg.months.filter((m) => m.count > 0).length || 1;
                      const pct = totalWages > 0 ? (yg.total / totalWages) * 100 : 0;
                      return (
                        <tr key={yg.year} className="text-xs hover:bg-slate-50/50 transition-colors">
                          <td className="py-3.5 px-5 font-black text-slate-800">{yg.year}</td>
                          <td className="py-3.5 px-5 text-slate-600">{yg.count} ครั้ง</td>
                          <td className="py-3.5 px-5 text-right font-bold text-slate-900">฿{yg.total.toLocaleString()}</td>
                          <td className="py-3.5 px-5 text-slate-600">฿{Math.round(yg.total / activeMonths).toLocaleString()}</td>
                          <td className="py-3.5 px-5">
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div className="bg-[#CC0000] h-full rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            <button
                              onClick={() => {
                                setSelectedYear(yg.year);
                                setViewMode("monthly");
                                setExpandedMonth(null);
                              }}
                              className="text-[#CC0000] hover:underline font-bold text-[11px] cursor-pointer"
                            >
                              ดูรายเดือน
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          </>
          )}

          {/* รายได้อื่น ๆ (coach_other) — แยกออกจากค่าจ้างการสอน */}
          {otherEntries.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-violet-50 text-violet-600 flex-shrink-0">
                  <Gift className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-md font-bold text-slate-800">รายได้อื่น ๆ</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    โบนัสหรือรายได้อื่นที่สถาบันจ่ายให้ นอกเหนือจากค่าจ้างการสอน · รวม {otherEntries.length} รายการ
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">รวมทั้งหมด</p>
                  <p className="text-lg font-black text-violet-600">฿{otherTotal.toLocaleString()}</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-3 px-5">วันที่</th>
                      <th className="py-3 px-5">รายละเอียด</th>
                      <th className="py-3 px-5 text-right">จำนวนเงิน</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {otherSorted.map((e) => (
                      <tr key={e.id} className="text-xs hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-5 text-slate-600 font-semibold whitespace-nowrap">{e.expensedate?.split("T")[0]}</td>
                        <td className="py-3 px-5 text-slate-600">{e.expensedescription || "-"}</td>
                        <td className="py-3 px-5 text-right font-bold text-slate-900 whitespace-nowrap">
                          ฿{e.expenseamount.toLocaleString()}
                          {e.receipturl && (
                            <a
                              href={e.receipturl}
                              target="_blank"
                              rel="noreferrer"
                              className="ml-2 text-[#CC0000] hover:underline font-bold"
                            >
                              ใบเสร็จ
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
