"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import CoachBankAccountCard from "@/components/settings/CoachBankAccountCard";
import {
  Loader2,
  AlertCircle,
  Wallet,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  Gift,
  UserCircle,
  Pencil,
  ChevronRight,
  X,
  FileText,
} from "lucide-react";

import { fetchMyCoachProfile, fetchCoachWages, fetchCoachTaughtSessionDates } from "@/services/coachAPI";
import { CoachWageEntry } from "@/types/coach";
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

// จัดกลุ่มรายการตามวัน (ใหม่→เก่า) พร้อมยอดรวมรายวัน — ใช้สไตล์สมุดบัญชีเดียวกับมุมมองมือถือ
const groupEntriesByDay = (entries: CoachWageEntry[]) => {
  const map = new Map<string, { key: string; label: string; total: number; items: CoachWageEntry[] }>();
  [...entries]
    .sort((a, b) => (b.expensedate || "").localeCompare(a.expensedate || ""))
    .forEach((e) => {
      const key = e.expensedate ? e.expensedate.split("T")[0] : "unknown";
      if (!map.has(key)) map.set(key, { key, label: formatThaiDate(e.expensedate), total: 0, items: [] });
      const g = map.get(key)!;
      g.total += e.expenseamount;
      g.items.push(e);
    });
  return Array.from(map.values());
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
  // ข้อมูลบัญชีรับเงิน (แก้ผ่าน modal ที่เปิดจากไอคอนดินสอ)
  const [bankAccount, setBankAccount] = useState("");
  const [paymentInfo, setPaymentInfo] = useState("");
  const [promptPay, setPromptPay] = useState("");
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [bankModalKey, setBankModalKey] = useState(0); // บังคับ remount การ์ดให้ค่าเริ่มต้นใหม่ทุกครั้งที่เปิด
  const [wages, setWages] = useState<CoachWageEntry[]>([]);
  // วันที่ของคาบที่ "สอนจริง" (เช็คชื่อปิดรอบแล้ว + fallback คาบเก่า) รูปแบบ YYYY-MM-DD
  const [taughtDates, setTaughtDates] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ป้องกันการดึงข้อมูลซ้อน + กันยิงถี่เกินไปตอน refetch-on-focus
  const isFetchingRef = useRef(false);
  const lastFetchRef = useRef(0);

  // เลื่อนแนวนอนด้วยล้อ/ลากเมาส์สำหรับการ์ดสถิติ (swipe) และตารางที่กว้างเกินจอบนมือถือ
  const statsScrollRef = useHorizontalWheelScroll<HTMLDivElement>();
  const monthlyTableRef = useHorizontalWheelScroll<HTMLDivElement>();
  const yearlyTableRef = useHorizontalWheelScroll<HTMLDivElement>();

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
        setBankAccount(myProfile.bank_account || "");
        setPaymentInfo(myProfile.payment_info || "");
        setPromptPay(myProfile.prompt_pay || "");
      }

      const [wagesData, taughtDatesData] = await Promise.all([
        fetchCoachWages(resolvedId, token),
        fetchCoachTaughtSessionDates(resolvedId, token),
      ]);
      setWages(wagesData);
      setTaughtDates(taughtDatesData);
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

  // เปิด modal แก้บัญชี — ดึงค่าบัญชีล่าสุดก่อนเปิด (กันค่าค้างเก่าหลังเพิ่งแก้) แล้ว remount การ์ด
  const openBankEditor = async () => {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const p = await fetchMyCoachProfile(token);
        setBankAccount(p.bank_account || "");
        setPaymentInfo(p.payment_info || "");
        setPromptPay(p.prompt_pay || "");
        if (!coachId) setCoachId(p.id);
      } catch {
        /* ใช้ค่าที่มีอยู่ ถ้าดึงใหม่ไม่สำเร็จ */
      }
    }
    setBankModalKey((k) => k + 1);
    setIsBankModalOpen(true);
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
    // prev > 0: คำนวณปกติ (ไม่มี cap — โตเกิน 100% ได้ และตกได้ถึง -100%)
    // prev = 0 แต่เดือนนี้มีรายได้: โตจากศูนย์คำนวณ % ไม่ได้ → Infinity ให้แสดง "ใหม่"
    // prev = 0 และเดือนนี้ก็ 0: ไม่มีอะไรเทียบ → null (ซ่อนบรรทัด)
    const delta =
      prevMonth > 0 ? ((thisMonth - prevMonth) / prevMonth) * 100 : thisMonth > 0 ? Infinity : null;
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

  // แท็บ "รายปี" มีประโยชน์เฉพาะเมื่อมีข้อมูล ≥ 2 ปี (ไว้เทียบข้ามปี) — ปีเดียวซ่อนไป
  // effectiveView บังคับเป็นรายเดือนเสมอเมื่อมีปีเดียว กัน state ค้างที่ "yearly"
  const showYearlyTab = yearGroups.length > 1;
  const effectiveView = showYearlyTab ? viewMode : "monthly";

  const maxMonthTotal = currentYearGroup ? Math.max(...currentYearGroup.months.map((m) => m.total), 0) : 0;

  // นับ "คาบที่สอนจริง" (จาก backend = เช็คชื่อปิดรอบแล้ว) แยกตามปี-เดือน
  // parse YYYY-MM-DD เองแบบ tz-proof (ไม่ผ่าน new Date เพื่อกันวันเพี้ยนข้ามเดือน)
  const sessionCountByYearMonth = useMemo(() => {
    const map = new Map<string, number>();
    taughtDates.forEach((ds) => {
      const [y, m] = ds.split("-").map(Number);
      if (!y || !m) return;
      const key = `${y}-${m - 1}`; // m เป็น 1-12 → เก็บเป็น 0-11 ให้ตรงกับ getMonth()
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [taughtDates]);

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

  // โค้ชรายเดือนได้เงินคงที่ไม่ผูกกับจำนวนคาบ จึงไม่โชว์คอลัมน์เทียบตารางสอน (null)
  const comparison = paymentType !== "monthly" ? scheduleComparison : null;
  const compByMonth = useMemo(
    () => new Map((comparison?.rows ?? []).map((r) => [r.month, r] as const)),
    [comparison]
  );

  // โบนัส/รายได้อื่นของปีที่เลือก แยกรายเดือน — รวมเข้ากับตารางรายละเอียดรายเดือน
  // (ยอด "ได้รับจริง" = ค่าจ้าง + โบนัส และตอนกดขยายจะเห็นทั้งค่าจ้างและโบนัสรวมกัน)
  const bonusByMonth = useMemo(() => {
    const map = new Map<number, { total: number; entries: CoachWageEntry[] }>();
    if (selectedYear === null) return map;
    otherEntries.forEach((e) => {
      if (!e.expensedate) return;
      const d = new Date(e.expensedate);
      if (d.getFullYear() !== selectedYear) return;
      const mo = d.getMonth();
      if (!map.has(mo)) map.set(mo, { total: 0, entries: [] });
      const g = map.get(mo)!;
      g.total += e.expenseamount;
      g.entries.push(e);
    });
    return map;
  }, [otherEntries, selectedYear]);
  const yearBonusTotal = useMemo(
    () => Array.from(bonusByMonth.values()).reduce((s, b) => s + b.total, 0),
    [bonusByMonth]
  );

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
    return <CoachPaymentSkeleton />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-fadeIn">
      {/* แถบสถานะตอน refetch เบื้องหลัง — ลอยใต้ topbar ไม่บังเนื้อหา */}
      {isRefreshing && (
        <div className="fixed left-1/2 top-[104px] z-30 -trangray-x-1/2 animate-fadeIn">
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
              <p className="text-sm font-bold text-gray-800 truncate">{userName}</p>
              <p className="text-[11px] text-gray-400 truncate">
                {paymentType === "monthly" ? "โค้ช · รายเดือน" : "โค้ช · รายคาบ"}
              </p>
            </div>
            <button
              type="button"
              onClick={openBankEditor}
              aria-label="แก้ไขบัญชีรับเงิน"
              className="p-2 rounded-full text-[#CC0000] hover:bg-[#FFF0F0] transition-colors flex-shrink-0"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-5 space-y-2">
            <div className="flex items-end justify-between gap-3">
              <span className="text-xs text-gray-500">ยอดเงินที่ได้รับเดือนนี้</span>
              <span className="text-2xl font-black text-[#CC0000] tabular-nums">฿{receivedThisMonth.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-100">
              <span className="text-xs text-gray-500">ยอดเงินที่ได้รับปีนี้</span>
              <span className="text-sm font-bold text-gray-700 tabular-nums">
                ฿{receivedThisYear.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* เลือกเดือนรายการธุรกรรม */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">เลือกเดือนรายการธุรกรรม</label>
          <div className="relative">
            <select
              value={selectedTxMonth}
              onChange={(e) => setSelectedTxMonth(e.target.value)}
              disabled={availableTxMonths.length === 0}
              className="w-full appearance-none bg-white border border-gray-200 rounded-xl shadow-sm pl-4 pr-10 py-3 text-sm font-bold text-gray-800 outline-none focus:border-[#CC0000] focus:ring-2 focus:ring-red-100 disabled:text-gray-400"
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
            <ChevronDown className="absolute right-3.5 top-1/2 -trangray-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* รายการธุรกรรมของเดือนที่เลือก — จัดกลุ่มตามวัน (หัวข้อวันที่ + ยอดรวมของวัน) */}
        <div className="space-y-4">
          {groupedTransactions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm py-12 text-center text-gray-400">
              <Wallet className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-xs">ไม่มีรายการในเดือนนี้</p>
            </div>
          ) : (
            groupedTransactions.map((group) => (
              <div key={group.key} className="space-y-2">
                {/* หัวข้อวัน: วันที่มุมซ้าย + ยอดรวมของวันนั้นมุมขวา */}
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-gray-500">{group.label}</span>
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
                      className="w-full text-left bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3.5 flex items-center justify-between gap-3 hover:border-[#CC0000]/40 hover:bg-gray-50/60 active:scale-[0.99] transition-all"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-800 truncate">
                          {e.expensedescription || (isBonus ? "รายได้อื่น ๆ" : "ค่าจ้างการสอน")}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {isBonus ? "โบนัส / รายได้อื่น ๆ" : "ค่าจ้างการสอน"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-black text-emerald-600 tabular-nums whitespace-nowrap">
                            +฿{e.expenseamount.toLocaleString()}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300" />
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
              <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-200" />

              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <h3 className="text-lg font-black text-gray-800">รายละเอียดรายการ</h3>
                  <p className="text-xs text-gray-400 mt-0.5">รหัสรายการ #{selectedTx.id}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTx(null)}
                  aria-label="ปิด"
                  className="p-2 -mr-2 rounded-full text-gray-400 hover:bg-gray-100 transition-colors flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500 flex-shrink-0">จำนวนเงินที่ได้รับ</dt>
                  <dd className="font-semibold text-gray-800 text-right tabular-nums">
                    ฿{selectedTx.expenseamount.toLocaleString()}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500 flex-shrink-0">ประเภท</dt>
                  <dd className="font-semibold text-gray-800 text-right">
                    {selectedTx.expensetype === "coach_other" ? "โบนัส / รายได้อื่น ๆ" : "ค่าจ้างการสอน"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500 flex-shrink-0">วันที่ทำรายการ</dt>
                  <dd className="font-semibold text-gray-800 text-right">{formatThaiDate(selectedTx.expensedate)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500 flex-shrink-0">รายละเอียด</dt>
                  <dd className="font-semibold text-gray-800 text-right">{selectedTx.expensedescription || "-"}</dd>
                </div>
                {selectedTx.created_at && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500 flex-shrink-0">บันทึกเมื่อ</dt>
                    <dd className="font-semibold text-gray-800 text-right">{formatThaiDate(selectedTx.created_at)}</dd>
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
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm py-20 text-center text-gray-400">
          <Wallet className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="text-xs">ยังไม่มีประวัติค่าจ้างในขณะนี้</p>
        </div>
      ) : (
        <>
          {wageEntries.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm py-16 text-center text-gray-400">
              <Wallet className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-semibold text-gray-500">ยังไม่มีข้อมูลเงินเดือน / ค่าจ้างการสอน</p>
              <p className="text-xs mt-1">เมื่อสถาบันบันทึกค่าจ้างการสอนให้ ระบบจะแสดงสรุปและกราฟรายได้ที่นี่</p>
            </div>
          ) : (
          <>
          {/* Stats — จอเล็ก: เลื่อนแนวนอน (swipe) · จอใหญ่: grid */}
          <div
            ref={statsScrollRef}
            className="flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory [&>*]:min-w-[78%] [&>*]:snap-center sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-4 sm:overflow-visible sm:snap-none sm:[&>*]:min-w-0"
          >
            {/* ค่าจ้างสะสม — แดง */}
            <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-gray-300 hover:shadow-md">
              <span className="absolute inset-y-0 left-0 w-1 bg-[#CC0000]" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#CC0000]" />
                  <span className="text-sm font-bold text-gray-600">ค่าจ้างสะสมทั้งหมด</span>
                </div>
                <Wallet className="h-5 w-5 text-[#CC0000]" />
              </div>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-base font-bold text-gray-400">฿</span>
                <span className="text-2xl font-black tabular-nums text-gray-900 sm:text-[28px]">{totalWages.toLocaleString()}</span>
              </div>
              <div className="mt-4 border-t border-gray-100 pt-3">
                <span className="text-xs text-gray-500">รวมทุกปีที่ผ่านมา</span>
              </div>
            </div>

            {/* ยอดรวมปี — น้ำเงิน */}
            <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-gray-300 hover:shadow-md">
              <span className="absolute inset-y-0 left-0 w-1 bg-blue-500" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  <span className="text-sm font-bold text-gray-600">ยอดรวมปี {selectedYear ?? "-"}</span>
                </div>
                <CalendarDays className="h-5 w-5 text-blue-600" />
              </div>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-base font-bold text-gray-400">฿</span>
                <span className="text-2xl font-black tabular-nums text-gray-900 sm:text-[28px]">{((currentYearGroup?.total ?? 0) + yearBonusTotal).toLocaleString()}</span>
              </div>
              <div className="mt-4 border-t border-gray-100 pt-3">
                {yearBonusTotal > 0 ? (
                  <span className="text-xs text-gray-500">
                    ค่าจ้าง ฿{(currentYearGroup?.total ?? 0).toLocaleString()} ·{" "}
                    <span className="font-semibold text-violet-600">โบนัส ฿{yearBonusTotal.toLocaleString()}</span>
                  </span>
                ) : (
                  <span className="text-xs text-gray-500">เฉลี่ย ฿{Math.round(avgPerMonthThisYear).toLocaleString()}/เดือน</span>
                )}
              </div>
            </div>

            {/* ยอดเดือนนี้ — เขียว */}
            <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-gray-300 hover:shadow-md">
              <span className="absolute inset-y-0 left-0 w-1 bg-emerald-500" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-sm font-bold text-gray-600">ยอดเดือนนี้</span>
                </div>
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-base font-bold text-gray-400">฿</span>
                <span className="text-2xl font-black tabular-nums text-gray-900 sm:text-[28px]">{currentMonthTotal.toLocaleString()}</span>
              </div>
              <div className="mt-4 border-t border-gray-100 pt-3">
                {momDeltaPct !== null ? (
                  <span className={`flex items-center gap-1 text-xs font-semibold ${momDeltaPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {momDeltaPct >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {Number.isFinite(momDeltaPct)
                      ? `${momDeltaPct >= 0 ? "+" : ""}${momDeltaPct.toFixed(1)}% จากเดือนก่อน`
                      : "ใหม่ (เดือนก่อนไม่มีรายได้)"}
                  </span>
                ) : (
                  <span className="text-xs text-gray-500">เทียบกับเดือนก่อนไม่ได้</span>
                )}
              </div>
            </div>

            {/* โบนัส / รายได้อื่น — ม่วง */}
            <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-gray-300 hover:shadow-md">
              <span className="absolute inset-y-0 left-0 w-1 bg-violet-500" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-violet-500" />
                  <span className="text-sm font-bold text-gray-600">โบนัส / รายได้อื่น ๆ</span>
                </div>
                <Gift className="h-5 w-5 text-violet-600" />
              </div>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-base font-bold text-gray-400">฿</span>
                <span className="text-2xl font-black tabular-nums text-gray-900 sm:text-[28px]">{otherTotal.toLocaleString()}</span>
              </div>
              <div className="mt-4 border-t border-gray-100 pt-3">
                <span className="text-xs text-gray-500">รวม {otherEntries.length} รายการ</span>
              </div>
            </div>
          </div>

          {/* View toggle + year selector — ซ่อนปุ่มสลับเมื่อมีปีเดียว (ไม่มีอะไรให้สลับ) */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {showYearlyTab ? (
              <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl p-1 self-start">
                {(["monthly", "yearly"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setViewMode(v)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      effectiveView === v ? "bg-[#CC0000] text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {v === "monthly" ? "รายเดือน" : "รายปี"}
                  </button>
                ))}
              </div>
            ) : (
              <h3 className="text-md font-bold text-gray-800 self-start">รายได้รายเดือน</h3>
            )}

            {effectiveView === "monthly" && yearGroups.length > 0 && (
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
                        ? "bg-gray-800 text-white border-gray-800"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {yg.year}
                  </button>
                ))}
              </div>
            )}
          </div>

          {effectiveView === "monthly" && currentYearGroup ? (
            <>
              {/* Monthly bar chart — ซ่อนบนมือถือ (แท่งแคบ + tooltip อาศัย hover) ดูข้อมูลได้จากตารางด้านล่างแทน */}
              <div className="hidden md:block bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <div className="mb-6">
                  <h3 className="text-md font-bold text-gray-800">รายได้รายเดือน ปี {selectedYear}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
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
                        <div className="absolute -top-2 -trangray-y-full left-1/2 -trangray-x-1/2 bg-gray-800 text-white text-[10px] rounded-lg px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                          <span className="font-bold">฿{m.total.toLocaleString()}</span>
                          <span className="text-gray-300"> · {MONTH_NAMES_FULL[m.month]}</span>
                        </div>
                        {m.total > 0 ? (
                          <div
                            style={{ height: `${Math.max(pct, 3)}%` }}
                            className="w-full max-w-[28px] rounded-t-md bg-[#CC0000] group-hover:brightness-110 transition-all duration-500"
                          />
                        ) : (
                          <div className="w-full max-w-[28px] h-[3px] rounded-t-md bg-gray-200" />
                        )}
                        <span className={`text-[10px] font-semibold mt-2 ${isCurrent ? "text-[#CC0000] font-black" : "text-gray-500"}`}>
                          {MONTH_NAMES_SHORT[m.month]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Monthly breakdown table — รวมคอลัมน์เทียบตารางสอน (เฉพาะโค้ชรายครั้ง) เข้ามาในตัว
                  กดที่แถวเพื่อขยายดูรายการแบบสมุดบัญชี */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-100">
                  <h3 className="text-md font-bold text-gray-800">รายละเอียดรายเดือน</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {comparison
                      ? <>คลิกที่แถวเพื่อดูรายการของเดือนนั้น · &quot;ได้รับจริง&quot; รวมค่าจ้างสอน + โบนัส/รายได้อื่น เทียบกับรายได้ที่ควรได้จากคาบที่สอนจริง × ค่าจ้างต่อคาบ (฿{payRate.toLocaleString()}/คาบ){payRate === 0 && " — ยังไม่ได้ตั้งค่าอัตราค่าจ้าง ตัวเลขที่ควรได้จึงยังไม่ถูกต้อง"}</>
                      : "คลิกที่แถวเพื่อดูรายการของเดือนนั้น · ยอดรวมค่าจ้างสอน + โบนัส/รายได้อื่น"}
                  </p>
                </div>
                <div ref={monthlyTableRef} className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 text-[10px] font-bold uppercase tracking-wider border-b border-gray-200">
                        <th className="py-3 px-4 sm:px-5">เดือน</th>
                        {comparison ? (
                          <>
                            <th className="py-3 px-4 sm:px-5 hidden sm:table-cell">คาบที่สอนจริง</th>
                            <th className="py-3 px-4 sm:px-5 text-right hidden sm:table-cell">รายได้ที่ควรได้</th>
                            <th className="py-3 px-4 sm:px-5 text-right">ได้รับจริง</th>
                            <th className="py-3 px-4 sm:px-5 text-right">ส่วนต่าง</th>
                          </>
                        ) : (
                          <>
                            <th className="py-3 px-5 whitespace-nowrap">จำนวนครั้ง</th>
                            <th className="py-3 px-5 text-right">ยอดรวม</th>
                            <th className="py-3 px-5 text-right whitespace-nowrap">สัดส่วน</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {currentYearGroup.months
                        .filter((m) => m.count > 0 || (bonusByMonth.get(m.month)?.total ?? 0) > 0 || (comparison && (compByMonth.get(m.month)?.sessionsDone ?? 0) > 0))
                        .map((m) => {
                        const isExpanded = expandedMonth === m.month;
                        const comp = compByMonth.get(m.month);
                        const monthBonus = bonusByMonth.get(m.month);
                        // ได้รับจริง = ค่าจ้างสอน + โบนัส/รายได้อื่นของเดือนนั้น (รวมกันในตัวเลขเดียว)
                        const received = m.total + (monthBonus?.total ?? 0);
                        const variance = received - (comp?.expected ?? 0);
                        const yearReceivedTotal = currentYearGroup.total + yearBonusTotal;
                        const pct = yearReceivedTotal > 0 ? (received / yearReceivedTotal) * 100 : 0;
                        // รวมรายการค่าจ้าง + โบนัส ไว้ดูตอนกดขยาย (สมุดบัญชีแยกสีให้อยู่แล้ว)
                        const combinedEntries = [...m.entries, ...(monthBonus?.entries ?? [])];
                        const txCount = m.count + (monthBonus?.entries.length ?? 0);
                        const hasEntries = combinedEntries.length > 0;
                        return (
                          <React.Fragment key={m.month}>
                            <tr
                              onClick={() => hasEntries && setExpandedMonth(isExpanded ? null : m.month)}
                              className={`text-xs transition-colors ${hasEntries ? "cursor-pointer" : ""} ${isExpanded ? "bg-gray-50/70" : "hover:bg-gray-50/60"}`}
                            >
                              <td className="py-3.5 px-4 sm:px-5 font-bold text-gray-800 whitespace-nowrap">
                                <span className="flex items-center gap-2">
                                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${hasEntries ? "" : "opacity-0"} ${isExpanded ? "rotate-180" : ""}`} />
                                  {MONTH_NAMES_FULL[m.month]}
                                </span>
                              </td>
                              {comparison ? (
                                <>
                                  <td className="py-3.5 px-4 sm:px-5 text-gray-600 hidden sm:table-cell">{comp?.sessionsDone ?? 0} คาบ</td>
                                  <td className="py-3.5 px-4 sm:px-5 text-right text-gray-600 tabular-nums hidden sm:table-cell">฿{(comp?.expected ?? 0).toLocaleString()}</td>
                                  <td className="py-3.5 px-4 sm:px-5 text-right font-bold text-gray-900 tabular-nums whitespace-nowrap">
                                    ฿{received.toLocaleString()}
                                    {(monthBonus?.total ?? 0) > 0 && (
                                      <span className="mt-0.5 block text-[10px] font-medium text-gray-400">
                                        ค่าจ้าง ฿{m.total.toLocaleString()} ·{" "}
                                        <span className="font-semibold text-violet-500">โบนัส ฿{(monthBonus?.total ?? 0).toLocaleString()}</span>
                                      </span>
                                    )}
                                  </td>
                                  <td className={`py-3.5 px-4 sm:px-5 text-right text-sm font-bold tabular-nums whitespace-nowrap ${variance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                    {variance >= 0 ? "+" : ""}฿{variance.toLocaleString()}
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="py-3.5 px-5 text-gray-600">{txCount} ครั้ง</td>
                                  <td className="py-3.5 px-5 text-right font-bold text-gray-900 tabular-nums">
                                    ฿{received.toLocaleString()}
                                    {(monthBonus?.total ?? 0) > 0 && (
                                      <span className="mt-0.5 block text-[10px] font-medium text-gray-400">
                                        ค่าจ้าง ฿{m.total.toLocaleString()} ·{" "}
                                        <span className="font-semibold text-violet-500">โบนัส ฿{(monthBonus?.total ?? 0).toLocaleString()}</span>
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3.5 px-5">
                                    <div className="flex items-center justify-end gap-2">
                                      <div className="hidden sm:block h-1.5 w-16 rounded-full bg-gray-100 overflow-hidden">
                                        <div className="h-full rounded-full bg-[#CC0000] transition-all duration-500" style={{ width: `${pct}%` }} />
                                      </div>
                                      <span className="w-11 text-right font-semibold text-gray-600 tabular-nums">{pct.toFixed(1)}%</span>
                                    </div>
                                  </td>
                                </>
                              )}
                            </tr>
                            {isExpanded && hasEntries && (
                              <tr className="bg-gray-50/40">
                                <td colSpan={comparison ? 5 : 4} className="px-5 pb-5 pt-3">
                                  {/* มุมมองสมุดบัญชี: ค่าจ้าง + โบนัสรวมกัน จัดกลุ่มตามวัน (แบบเดียวกับมือถือ) */}
                                  <div className="space-y-4">
                                    {groupEntriesByDay(combinedEntries).map((day) => (
                                      <div key={day.key} className="space-y-2">
                                        {/* หัวข้อวัน: วันที่ซ้าย + ยอดรวมของวันขวา */}
                                        <div className="flex items-center justify-between px-1">
                                          <span className="text-xs font-bold text-gray-500">{day.label}</span>
                                          <span className="text-xs font-bold text-emerald-600 tabular-nums">
                                            +฿{day.total.toLocaleString()}
                                          </span>
                                        </div>

                                        {day.items.map((e) => {
                                          const isBonus = e.expensetype === "coach_other";
                                          return (
                                            <div
                                              key={e.id}
                                              className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 transition-all hover:border-[#CC0000]/40 hover:bg-gray-50/60"
                                            >
                                              <div className="flex min-w-0 items-center gap-3">
                                                <span
                                                  className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-full ${
                                                    isBonus ? "bg-violet-50 text-violet-600" : "bg-red-50 text-[#CC0000]"
                                                  }`}
                                                >
                                                  {isBonus ? <Gift className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
                                                </span>
                                                <div className="min-w-0">
                                                  <p className="truncate text-sm font-bold text-gray-800">
                                                    {e.expensedescription || (isBonus ? "รายได้อื่น ๆ" : "ค่าจ้างการสอน")}
                                                  </p>
                                                  <p className="mt-0.5 text-[11px] text-gray-400">
                                                    {isBonus ? "โบนัส / รายได้อื่น ๆ" : "ค่าจ้างการสอน"}
                                                  </p>
                                                </div>
                                              </div>
                                              <div className="flex flex-shrink-0 items-center gap-2.5">
                                                <span
                                                  className={`text-sm font-black tabular-nums whitespace-nowrap ${
                                                    isBonus ? "text-violet-600" : "text-emerald-600"
                                                  }`}
                                                >
                                                  +฿{e.expenseamount.toLocaleString()}
                                                </span>
                                                {e.receipturl && (
                                                  <button
                                                    type="button"
                                                    onClick={() => setReceiptUrl(e.receipturl)}
                                                    title="ดูใบเสร็จ"
                                                    className="rounded-md p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-[#CC0000] cursor-pointer"
                                                  >
                                                    <FileText className="h-4 w-4" />
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    {comparison && (() => {
                      // รวมทั้งปี: ได้รับจริง = ค่าจ้างรวม + โบนัสรวมทั้งปี · ส่วนต่าง = ได้รับจริง − ที่ควรได้
                      const footReceived = comparison.totals.actual + yearBonusTotal;
                      const footVariance = footReceived - comparison.totals.expected;
                      return (
                      <tfoot>
                        <tr className="text-sm bg-gray-50 border-t-2 border-gray-200">
                          <td className="py-4 px-4 sm:px-5 font-black text-gray-900 whitespace-nowrap">รวมทั้งปี</td>
                          <td className="py-4 px-4 sm:px-5 font-bold text-gray-800 hidden sm:table-cell">{comparison.totals.sessionsDone} คาบ</td>
                          <td className="py-4 px-4 sm:px-5 text-right font-bold text-gray-800 tabular-nums hidden sm:table-cell">฿{comparison.totals.expected.toLocaleString()}</td>
                          <td className="py-4 px-4 sm:px-5 text-right font-black text-gray-900 tabular-nums whitespace-nowrap">฿{footReceived.toLocaleString()}</td>
                          <td className={`py-4 px-4 sm:px-5 text-right font-black tabular-nums whitespace-nowrap ${footVariance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {footVariance >= 0 ? "+" : ""}฿{footVariance.toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                      );
                    })()}
                  </table>
                </div>
              </div>
            </>
          ) : effectiveView === "yearly" ? (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100">
                <h3 className="text-md font-bold text-gray-800">สรุปรายได้รายปี</h3>
                <p className="text-xs text-gray-500 mt-0.5">ยอดรวมค่าจ้างแยกตามปี ทั้งหมด {yearGroups.length} ปี</p>
              </div>
              <div ref={yearlyTableRef} className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600 text-[10px] font-bold uppercase tracking-wider border-b border-gray-200">
                      <th className="py-3 px-5">ปี</th>
                      <th className="py-3 px-5 whitespace-nowrap">จำนวนครั้ง</th>
                      <th className="py-3 px-5 text-right">ยอดรวม</th>
                      <th className="py-3 px-5 whitespace-nowrap hidden sm:table-cell">เฉลี่ย/เดือน</th>
                      <th className="py-3 px-5 w-40 hidden sm:table-cell">สัดส่วนต่อยอดรวม</th>
                      <th className="py-3 px-5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {yearGroups.map((yg) => {
                      const activeMonths = yg.months.filter((m) => m.count > 0).length || 1;
                      const pct = totalWages > 0 ? (yg.total / totalWages) * 100 : 0;
                      return (
                        <tr key={yg.year} className="text-xs hover:bg-gray-50/50 transition-colors">
                          <td className="py-3.5 px-5 font-black text-gray-800">{yg.year}</td>
                          <td className="py-3.5 px-5 text-gray-600 whitespace-nowrap">{yg.count} ครั้ง</td>
                          <td className="py-3.5 px-5 text-right font-bold text-gray-900 whitespace-nowrap">฿{yg.total.toLocaleString()}</td>
                          <td className="py-3.5 px-5 text-gray-600 whitespace-nowrap hidden sm:table-cell">฿{Math.round(yg.total / activeMonths).toLocaleString()}</td>
                          <td className="py-3.5 px-5 hidden sm:table-cell">
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 rounded-full bg-gray-100 overflow-hidden">
                                <div className="h-full rounded-full bg-[#CC0000] transition-all duration-700" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="w-9 shrink-0 text-right text-[11px] font-semibold text-gray-500 tabular-nums">
                                {pct.toFixed(0)}%
                              </span>
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
        </>
      )}
      </div>

      {/* Modal แก้ไขบัญชีรับเงิน — เปิดจากไอคอนดินสอ (มี step-up ยืนยันรหัสผ่านในตัวการ์ด) */}
      {coachId !== null && (
        <Modal
          isOpen={isBankModalOpen}
          onClose={() => setIsBankModalOpen(false)}
          title="แก้ไขบัญชีรับเงิน"
          subtitle="ธนาคาร เลขบัญชี และพร้อมเพย์สำหรับรับค่าจ้าง"
        >
          <CoachBankAccountCard
            key={bankModalKey}
            coachId={coachId}
            initialBankAccount={bankAccount}
            initialPaymentInfo={paymentInfo}
            initialPromptPay={promptPay}
          />
        </Modal>
      )}

      {/* ป็อปอัพดูรูปใบเสร็จ — ใช้ได้ทั้งมือถือและเดสก์ท็อป */}
      <ImageLightbox url={receiptUrl} onClose={() => setReceiptUrl(null)} alt="ใบเสร็จ" />
    </div>
  );
}

// โครงหน้าตอนโหลด — ล้อ layout จริงทั้งมือถือ (สมุดบัญชี) และเดสก์ท็อป (สรุป/กราฟ/ตาราง)
function CoachPaymentSkeleton() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-6">
      {/* ===== มือถือ ===== */}
      <div className="md:hidden space-y-4">
        {/* การ์ดบัญชี */}
        <div className="rounded-3xl border-2 border-[#CC0000]/30 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 shrink-0 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-32 rounded bg-gray-200" />
              <div className="h-2.5 w-20 rounded bg-gray-100" />
            </div>
            <div className="h-8 w-8 shrink-0 rounded-full bg-gray-100" />
          </div>
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3 w-28 rounded bg-gray-100" />
              <div className="h-7 w-28 rounded bg-gray-200" />
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 pt-2">
              <div className="h-3 w-24 rounded bg-gray-100" />
              <div className="h-4 w-20 rounded bg-gray-200" />
            </div>
          </div>
        </div>

        {/* เลือกเดือน */}
        <div className="space-y-2">
          <div className="h-3 w-36 rounded bg-gray-100" />
          <div className="h-12 w-full rounded-xl bg-gray-200" />
        </div>

        {/* รายการธุรกรรม */}
        {Array.from({ length: 2 }).map((_, g) => (
          <div key={g} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="h-3 w-24 rounded bg-gray-100" />
              <div className="h-3 w-16 rounded bg-gray-100" />
            </div>
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3.5">
                <div className="space-y-2">
                  <div className="h-3.5 w-40 rounded bg-gray-200" />
                  <div className="h-2.5 w-24 rounded bg-gray-100" />
                </div>
                <div className="h-4 w-16 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ===== เดสก์ท็อป ===== */}
      <div className="hidden md:block space-y-6">
        {/* Stat cards — สไตล์ PaymentStats (แถบ accent + จุด + คำโปรยท้าย) */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5">
              <span className="absolute inset-y-0 left-0 w-1 bg-gray-200" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-gray-200" />
                  <div className="h-3.5 w-24 rounded bg-gray-200" />
                </div>
                <div className="h-5 w-5 rounded bg-gray-200" />
              </div>
              <div className="mt-5 h-8 w-28 rounded-lg bg-gray-200" />
              <div className="mt-4 border-t border-gray-100 pt-3">
                <div className="h-3 w-24 rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>

        {/* Toggle + year selector */}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4">
          <div className="h-9 w-40 rounded-xl bg-gray-200" />
          <div className="h-8 w-32 rounded bg-gray-100" />
        </div>

        {/* Chart */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="mb-6 space-y-2">
            <div className="h-4 w-48 rounded bg-gray-200" />
            <div className="h-3 w-64 rounded bg-gray-100" />
          </div>
          <div className="flex h-40 items-end gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex-1 rounded-t-md bg-gray-200" style={{ height: `${20 + ((i * 37) % 80)}%` }} />
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="space-y-2 border-b border-gray-100 p-5">
            <div className="h-4 w-40 rounded bg-gray-200" />
            <div className="h-3 w-56 rounded bg-gray-100" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between border-b border-gray-50 px-5 py-3.5 last:border-0">
              <div className="h-3.5 w-28 rounded bg-gray-200" />
              <div className="h-3.5 w-16 rounded bg-gray-100" />
              <div className="h-3.5 w-20 rounded bg-gray-200" />
              <div className="h-3.5 w-12 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
