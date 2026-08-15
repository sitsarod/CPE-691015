"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  AlertCircle,
  Wallet,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Gift,
  UserCircle,
  Pencil,
  ChevronRight,
  X,
} from "lucide-react";

import { fetchMyCoachProfile, fetchCoachWages, fetchCoachSchedules } from "@/services/coachAPI";
import { CoachWageEntry, WorkScheduleItem } from "@/types/coach";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import ImageLightbox from "@/components/ImageLightbox";

const MONTH_NAMES_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const MONTH_NAMES_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

// วันที่แบบไทยย่อ เช่น 13 ส.ค. 2569 (พ.ศ.)
const formatThaiDate = (iso?: string) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getDate()} ${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
};

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
  const [avatarUrl, setAvatarUrl] = useState("");
  const [wages, setWages] = useState<CoachWageEntry[]>([]);
  const [schedules, setSchedules] = useState<WorkScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ป้องกันการดึงข้อมูลซ้อน + กันยิงถี่เกินไปตอน refetch-on-focus
  const isFetchingRef = useRef(false);
  const lastFetchRef = useRef(0);

  // เลื่อนแนวนอนด้วยล้อ/ลากเมาส์สำหรับการ์ดสถิติ (swipe) และตารางที่กว้างเกินจอบนมือถือ
  const statsScrollRef = useHorizontalWheelScroll<HTMLDivElement>();
  const scheduleTableRef = useHorizontalWheelScroll<HTMLDivElement>();
  const monthlyTableRef = useHorizontalWheelScroll<HTMLDivElement>();
  const yearlyTableRef = useHorizontalWheelScroll<HTMLDivElement>();
  const otherTableRef = useHorizontalWheelScroll<HTMLDivElement>();

  const [viewMode, setViewMode] = useState<"monthly" | "yearly">("monthly");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);

  // มือถือ: เลือกเดือนของรายการธุรกรรม (key = "YYYY-M")
  const [selectedTxMonth, setSelectedTxMonth] = useState<string>("");

  // มือถือ: รายการที่กดดูรายละเอียด (bottom sheet)
  const [selectedTx, setSelectedTx] = useState<CoachWageEntry | null>(null);
  // รูปใบเสร็จที่เปิดดูแบบป็อปอัพ (lightbox) — ใช้ร่วมกันทั้งมือถือและตารางเดสก์ท็อป
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  useEffect(() => {
    document.body.style.overflow = selectedTx ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedTx]);

  // ชื่อโค้ชสำหรับการ์ดบัญชี (มือถือ) — อ่านจาก localStorage เหมือนหน้าอื่น ๆ
  const [userName, setUserName] = useState("โค้ช");
  useEffect(() => {
    const fullName = [localStorage.getItem("firstName"), localStorage.getItem("lastName")]
      .filter(Boolean)
      .join(" ");
    if (fullName) setUserName(fullName);
  }, []);

  // background = true คือ refetch เงียบ ๆ (โชว์ pill) · false คือโหลดครั้งแรก (โชว์ overlay)
  const loadData = async (id?: number, background = false) => {
    if (isFetchingRef.current) return; // มีการดึงข้อมูลค้างอยู่แล้ว ข้ามไป
    isFetchingRef.current = true;
    try {
      if (background) setIsRefreshing(true);
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
        setAvatarUrl(myProfile.profile_picture || "");
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
      isFetchingRef.current = false;
      lastFetchRef.current = Date.now();
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch อัตโนมัติเมื่อผู้ใช้กลับมาโฟกัสหน้าต่าง/แท็บอีกครั้ง
  // ดึงเงียบ ๆ ไม่โชว์ overlay และ throttle 10 วินาทีเพื่อลดภาระ server
  useEffect(() => {
    const REFETCH_THROTTLE_MS = 10_000;
    const maybeRefetch = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchRef.current < REFETCH_THROTTLE_MS) return;
      loadData(coachId || undefined, true);
    };
    window.addEventListener("focus", maybeRefetch);
    document.addEventListener("visibilitychange", maybeRefetch);
    return () => {
      window.removeEventListener("focus", maybeRefetch);
      document.removeEventListener("visibilitychange", maybeRefetch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachId]);

  // แยกค่าจ้างจากการสอน (coach_wages) ออกจากรายได้ส่วนอื่น (coach_other) ให้เหมือนฝั่งแอดมิน
  const wageEntries = useMemo(() => wages.filter((w) => w.expensetype !== "coach_other"), [wages]);
  const otherEntries = useMemo(() => wages.filter((w) => w.expensetype === "coach_other"), [wages]);

  const otherTotal = useMemo(() => otherEntries.reduce((s, w) => s + w.expenseamount, 0), [otherEntries]);
  const otherSorted = useMemo(
    () => [...otherEntries].sort((a, b) => (b.expensedate || "").localeCompare(a.expensedate || "")),
    [otherEntries]
  );

  // ---- มือถือ: รายการธุรกรรม (ค่าจ้าง + รายได้อื่น) แยกตามเดือน ----
  // เดือนที่มีรายการทั้งหมด เรียงใหม่→เก่า (key = "YYYY-M")
  const availableTxMonths = useMemo(() => {
    const set = new Set<string>();
    wages.forEach((w) => {
      if (!w.expensedate) return;
      const d = new Date(w.expensedate);
      set.add(`${d.getFullYear()}-${d.getMonth()}`);
    });
    return Array.from(set).sort((a, b) => {
      const [ay, am] = a.split("-").map(Number);
      const [by, bm] = b.split("-").map(Number);
      return by * 12 + bm - (ay * 12 + am);
    });
  }, [wages]);

  // รายการของเดือนที่เลือก เรียงใหม่→เก่า
  const monthTransactions = useMemo(() => {
    return wages
      .filter((w) => {
        if (!w.expensedate) return false;
        const d = new Date(w.expensedate);
        return `${d.getFullYear()}-${d.getMonth()}` === selectedTxMonth;
      })
      .sort((a, b) => (b.expensedate || "").localeCompare(a.expensedate || ""));
  }, [wages, selectedTxMonth]);

  // จัดกลุ่มรายการตามวัน พร้อมยอดรวมของวันนั้น (สำหรับหัวข้อวันที่ในลิสต์มือถือ)
  const groupedTransactions = useMemo(() => {
    const map = new Map<string, { key: string; label: string; total: number; items: CoachWageEntry[] }>();
    monthTransactions.forEach((e) => {
      const key = e.expensedate ? e.expensedate.split("T")[0] : "unknown";
      if (!map.has(key)) map.set(key, { key, label: formatThaiDate(e.expensedate), total: 0, items: [] });
      const g = map.get(key)!;
      g.total += e.expenseamount;
      g.items.push(e);
    });
    return Array.from(map.values()); // monthTransactions เรียงใหม่→เก่าอยู่แล้ว ลำดับกลุ่มจึงถูกต้อง
  }, [monthTransactions]);

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

  // ตั้งค่าเดือนธุรกรรมเริ่มต้นเป็นเดือนล่าสุดที่มีรายการ (และแก้ให้ถูกเมื่อข้อมูลเปลี่ยน)
  useEffect(() => {
    if (availableTxMonths.length > 0 && !availableTxMonths.includes(selectedTxMonth)) {
      setSelectedTxMonth(availableTxMonths[0]);
    }
  }, [availableTxMonths, selectedTxMonth]);

  const totalWages = useMemo(() => wageEntries.reduce((sum, w) => sum + w.expenseamount, 0), [wageEntries]);

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

  // มือถือ: รายได้รวม (ค่าจ้าง + โบนัส) ของเดือนปัจจุบัน และของปีปัจจุบัน
  const { receivedThisMonth, receivedThisYear } = useMemo(() => {
    let month = 0;
    let year = 0;
    wages.forEach((w) => {
      if (!w.expensedate) return;
      const d = new Date(w.expensedate);
      if (d.getFullYear() !== now.getFullYear()) return;
      year += w.expenseamount;
      if (d.getMonth() === now.getMonth()) month += w.expenseamount;
    });
    return { receivedThisMonth: month, receivedThisYear: year };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wages]);

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
    <div className="max-w-5xl mx-auto space-y-6 animate-fadeIn">
      {/* แถบสถานะตอน refetch เบื้องหลัง — ลอยใต้ topbar ไม่บังเนื้อหา */}
      {isRefreshing && (
        <div className="fixed left-1/2 top-[104px] z-30 -translate-x-1/2 animate-fadeIn">
          <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-4 py-1.5 text-xs font-bold text-gray-600 shadow-md backdrop-blur">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#CC0000]" />
            กำลังอัปเดตข้อมูล...
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold">เกิดข้อผิดพลาด</h4>
            <p className="text-sm mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ===================== มือถือ (< md): มุมมองแบบสมุดบัญชี ===================== */}
      <div className="md:hidden space-y-4">
        {/* การ์ดบัญชี — สีขาวกรอบแดง แก้ไขข้อมูลบัญชีตัวเองได้ */}
        <div className="rounded-3xl bg-white border-2 border-[#CC0000] p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#FFF0F0] text-[#CC0000] flex items-center justify-center flex-shrink-0 overflow-hidden">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={userName} className="w-full h-full object-cover" />
              ) : (
                <UserCircle className="w-8 h-8" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{userName}</p>
              <p className="text-[11px] text-slate-400 truncate">
                {paymentType === "monthly" ? "โค้ช · รายเดือน" : "โค้ช · รายคาบ"}
              </p>
            </div>
            <Link
              href="/coach/profile"
              aria-label="แก้ไขข้อมูลบัญชี"
              className="p-2 rounded-full text-[#CC0000] hover:bg-[#FFF0F0] transition-colors flex-shrink-0"
            >
              <Pencil className="w-4 h-4" />
            </Link>
          </div>

          <div className="mt-5 space-y-2">
            <div className="flex items-end justify-between gap-3">
              <span className="text-xs text-slate-500">ยอดเงินที่ได้รับเดือนนี้</span>
              <span className="text-2xl font-black text-[#CC0000] tabular-nums">฿{receivedThisMonth.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <span className="text-xs text-slate-500">ยอดเงินที่ได้รับปีนี้</span>
              <span className="text-sm font-bold text-slate-700 tabular-nums">
                ฿{receivedThisYear.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* เลือกเดือนรายการธุรกรรม */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">เลือกเดือนรายการธุรกรรม</label>
          <div className="relative">
            <select
              value={selectedTxMonth}
              onChange={(e) => setSelectedTxMonth(e.target.value)}
              disabled={availableTxMonths.length === 0}
              className="w-full appearance-none bg-white border border-slate-200 rounded-xl shadow-sm pl-4 pr-10 py-3 text-sm font-bold text-slate-800 outline-none focus:border-[#CC0000] focus:ring-2 focus:ring-red-100 disabled:text-slate-400"
            >
              {availableTxMonths.length === 0 ? (
                <option value="">— ยังไม่มีรายการ —</option>
              ) : (
                availableTxMonths.map((k) => {
                  const [y, mo] = k.split("-").map(Number);
                  return (
                    <option key={k} value={k}>
                      {MONTH_NAMES_FULL[mo]} {y + 543}
                    </option>
                  );
                })
              )}
            </select>
            <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* รายการธุรกรรมของเดือนที่เลือก — จัดกลุ่มตามวัน (หัวข้อวันที่ + ยอดรวมของวัน) */}
        <div className="space-y-4">
          {groupedTransactions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-12 text-center text-slate-400">
              <Wallet className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-xs">ไม่มีรายการในเดือนนี้</p>
            </div>
          ) : (
            groupedTransactions.map((group) => (
              <div key={group.key} className="space-y-2">
                {/* หัวข้อวัน: วันที่มุมซ้าย + ยอดรวมของวันนั้นมุมขวา */}
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-slate-500">{group.label}</span>
                  <span className="text-xs font-bold text-emerald-600 tabular-nums">
                    +฿{group.total.toLocaleString()}
                  </span>
                </div>

                {group.items.map((e) => {
                  const isBonus = e.expensetype === "coach_other";
                  return (
                    <button
                      type="button"
                      key={e.id}
                      onClick={() => setSelectedTx(e)}
                      aria-label="ดูรายละเอียดรายการ"
                      className="w-full text-left bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3.5 flex items-center justify-between gap-3 hover:border-[#CC0000]/40 hover:bg-slate-50/60 active:scale-[0.99] transition-all"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">
                          {e.expensedescription || (isBonus ? "รายได้อื่น ๆ" : "ค่าจ้างการสอน")}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {isBonus ? "โบนัส / รายได้อื่น ๆ" : "ค่าจ้างการสอน"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-black text-emerald-600 tabular-nums whitespace-nowrap">
                            +฿{e.expenseamount.toLocaleString()}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Bottom sheet: รายละเอียดรายการที่กดเลือก */}
        {selectedTx && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-200" onClick={() => setSelectedTx(null)} />
            <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-5 pb-8 shadow-2xl animate-in slide-in-from-bottom duration-200">
              <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200" />

              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <h3 className="text-lg font-black text-slate-800">รายละเอียดรายการ</h3>
                  <p className="text-xs text-slate-400 mt-0.5">รหัสรายการ #{selectedTx.id}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTx(null)}
                  aria-label="ปิด"
                  className="p-2 -mr-2 rounded-full text-slate-400 hover:bg-slate-100 transition-colors flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500 flex-shrink-0">จำนวนเงินที่ได้รับ</dt>
                  <dd className="font-semibold text-slate-800 text-right tabular-nums">
                    ฿{selectedTx.expenseamount.toLocaleString()}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500 flex-shrink-0">ประเภท</dt>
                  <dd className="font-semibold text-slate-800 text-right">
                    {selectedTx.expensetype === "coach_other" ? "โบนัส / รายได้อื่น ๆ" : "ค่าจ้างการสอน"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500 flex-shrink-0">วันที่ทำรายการ</dt>
                  <dd className="font-semibold text-slate-800 text-right">{formatThaiDate(selectedTx.expensedate)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500 flex-shrink-0">รายละเอียด</dt>
                  <dd className="font-semibold text-slate-800 text-right">{selectedTx.expensedescription || "-"}</dd>
                </div>
                {selectedTx.created_at && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500 flex-shrink-0">บันทึกเมื่อ</dt>
                    <dd className="font-semibold text-slate-800 text-right">{formatThaiDate(selectedTx.created_at)}</dd>
                  </div>
                )}
              </dl>

              {selectedTx.receipturl && (
                <button
                  type="button"
                  onClick={() => setReceiptUrl(selectedTx.receipturl)}
                  className="mt-5 flex items-center justify-center gap-2 w-full rounded-xl bg-[#CC0000] text-white font-bold py-3 text-sm hover:bg-[#A30000] transition-colors"
                >
                  ดูใบเสร็จ
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===================== เดสก์ท็อป (md+): สรุป / กราฟ / ตารางแบบเต็ม ===================== */}
      <div className="hidden md:block space-y-6">
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
          {/* Stats — จอเล็ก: เลื่อนแนวนอน (swipe) · จอใหญ่: grid */}
          <div
            ref={statsScrollRef}
            className="flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory [&>*]:min-w-[78%] [&>*]:snap-center sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-4 sm:overflow-visible sm:snap-none sm:[&>*]:min-w-0"
          >
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4 hover:shadow-md hover:border-slate-300 transition-all">
              <div className="p-3 rounded-xl bg-[#FFF0F0] text-[#CC0000] flex-shrink-0">
                <Wallet className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ค่าจ้างสะสมทั้งหมด</p>
                <p className="text-xl font-black text-slate-800 mt-0.5">฿{totalWages.toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4 hover:shadow-md hover:border-slate-300 transition-all">
              <div className="p-3 rounded-xl bg-blue-50 text-blue-600 flex-shrink-0">
                <CalendarDays className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ยอดรวมปี {selectedYear ?? "-"}</p>
                <p className="text-xl font-black text-slate-800 mt-0.5">฿{(currentYearGroup?.total ?? 0).toLocaleString()}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">เฉลี่ย ฿{Math.round(avgPerMonthThisYear).toLocaleString()}/เดือน</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4 hover:shadow-md hover:border-slate-300 transition-all">
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

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4 hover:shadow-md hover:border-slate-300 transition-all">
              <div className="p-3 rounded-xl bg-violet-50 text-violet-600 flex-shrink-0">
                <Gift className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">โบนัส / รายได้อื่น ๆ</p>
                <p className="text-xl font-black text-slate-800 mt-0.5">฿{otherTotal.toLocaleString()}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">รวม {otherEntries.length} รายการ</p>
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
              {/* Monthly bar chart — ซ่อนบนมือถือ (แท่งแคบ + tooltip อาศัย hover) ดูข้อมูลได้จากตารางด้านล่างแทน */}
              <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
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
                  <div ref={scheduleTableRef} className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                          <th className="py-3 px-4 sm:px-5">เดือน</th>
                          <th className="py-3 px-4 sm:px-5 hidden sm:table-cell">คาบที่สอนแล้ว</th>
                          <th className="py-3 px-4 sm:px-5 text-right hidden sm:table-cell">รายได้ที่ควรได้</th>
                          <th className="py-3 px-4 sm:px-5 text-right">ได้รับจริง</th>
                          <th className="py-3 px-4 sm:px-5 text-right">ส่วนต่าง</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {scheduleComparison.rows.map((r) => {
                          const isEmpty = r.sessionsDone === 0 && r.actual === 0;
                          return (
                            <tr key={r.month} className={`text-xs ${isEmpty ? "text-slate-300" : ""}`}>
                              <td className="py-3 px-4 sm:px-5 font-semibold text-slate-700 whitespace-nowrap">{MONTH_NAMES_FULL[r.month]}</td>
                              <td className="py-3 px-4 sm:px-5 text-slate-600 hidden sm:table-cell">{isEmpty ? "-" : `${r.sessionsDone} คาบ`}</td>
                              <td className="py-3 px-4 sm:px-5 text-right text-slate-700 hidden sm:table-cell">{isEmpty ? "-" : `฿${r.expected.toLocaleString()}`}</td>
                              <td className="py-3 px-4 sm:px-5 text-right font-bold text-slate-900 whitespace-nowrap">{isEmpty ? "-" : `฿${r.actual.toLocaleString()}`}</td>
                              <td className={`py-3 px-4 sm:px-5 text-right font-bold whitespace-nowrap ${isEmpty ? "" : r.variance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                {isEmpty ? "-" : `${r.variance >= 0 ? "+" : ""}฿${r.variance.toLocaleString()}`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="text-xs bg-slate-50 border-t border-slate-200">
                          <td className="py-3 px-4 sm:px-5 font-black text-slate-800 whitespace-nowrap">รวมทั้งปี</td>
                          <td className="py-3 px-4 sm:px-5 font-bold text-slate-700 hidden sm:table-cell">{scheduleComparison.totals.sessionsDone} คาบ</td>
                          <td className="py-3 px-4 sm:px-5 text-right font-bold text-slate-700 hidden sm:table-cell">
                            ฿{scheduleComparison.totals.expected.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 sm:px-5 text-right font-bold text-slate-900 whitespace-nowrap">
                            ฿{scheduleComparison.totals.actual.toLocaleString()}
                          </td>
                          <td className={`py-3 px-4 sm:px-5 text-right font-black whitespace-nowrap ${scheduleComparison.totals.variance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
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
                <div ref={monthlyTableRef} className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                        <th className="py-3 px-5">เดือน</th>
                        <th className="py-3 px-5 whitespace-nowrap">จำนวนครั้ง</th>
                        <th className="py-3 px-5 text-right">ยอดรวม</th>
                        <th className="py-3 px-5 text-right whitespace-nowrap">เปอร์เซ็นต์</th>
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
                              <td className="py-3 px-5 text-right font-semibold text-slate-600 whitespace-nowrap">
                                {hasData ? `${pct.toFixed(1)}%` : "-"}
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
                                      <button
                                        type="button"
                                        onClick={() => setReceiptUrl(e.receipturl)}
                                        className="ml-2 text-[#CC0000] hover:underline font-bold cursor-pointer"
                                      >
                                        ใบเสร็จ
                                      </button>
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
              <div ref={yearlyTableRef} className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-3 px-5">ปี</th>
                      <th className="py-3 px-5 whitespace-nowrap">จำนวนครั้ง</th>
                      <th className="py-3 px-5 text-right">ยอดรวม</th>
                      <th className="py-3 px-5 whitespace-nowrap hidden sm:table-cell">เฉลี่ย/เดือน</th>
                      <th className="py-3 px-5 w-40 hidden sm:table-cell">สัดส่วนต่อยอดรวม</th>
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
                          <td className="py-3.5 px-5 text-slate-600 whitespace-nowrap">{yg.count} ครั้ง</td>
                          <td className="py-3.5 px-5 text-right font-bold text-slate-900 whitespace-nowrap">฿{yg.total.toLocaleString()}</td>
                          <td className="py-3.5 px-5 text-slate-600 whitespace-nowrap hidden sm:table-cell">฿{Math.round(yg.total / activeMonths).toLocaleString()}</td>
                          <td className="py-3.5 px-5 hidden sm:table-cell">
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
              <div ref={otherTableRef} className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-3 px-5 whitespace-nowrap">วันที่</th>
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
                            <button
                              type="button"
                              onClick={() => setReceiptUrl(e.receipturl)}
                              className="ml-2 text-[#CC0000] hover:underline font-bold cursor-pointer"
                            >
                              ใบเสร็จ
                            </button>
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

      {/* ป็อปอัพดูรูปใบเสร็จ — ใช้ได้ทั้งมือถือและเดสก์ท็อป */}
      <ImageLightbox url={receiptUrl} onClose={() => setReceiptUrl(null)} alt="ใบเสร็จ" />
    </div>
  );
}
