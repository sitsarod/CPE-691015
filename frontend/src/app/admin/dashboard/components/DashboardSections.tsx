import Link from "next/link";
import { TrendingUp, TrendingDown } from "lucide-react";
import { fmtBaht, fmtPct } from "./buildDashboard";
import { SectionHeader } from "./dashParts";
import type {
  ActivityRow,
  AlertRow,
  ChartPoint,
  CourseRow,
  Insights,
  Kpi,
} from "./types";

// สีกราฟรายได้/ค่าใช้จ่าย (โทนขาว-แดง)
const REVENUE_COLOR = "#CC0000";
const EXPENSE_COLOR = "#9ca3af";

/* ------------------------------- KPI stat row ------------------------------- */

export function KpiCards({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-px border border-gray-200 bg-gray-200 sm:grid-cols-3 xl:grid-cols-5">
      {kpis.map(({ label, value, accent, icon: Icon, trend }) => {
        const color = trend.up ? accent : "#E63946";
        return (
          <div key={label} className="flex flex-col gap-2 bg-white px-4 py-5">
            <span className="text-xs font-light text-gray-500">{label}</span>
            <span className="text-2xl font-semibold leading-none tabular-nums text-gray-900 sm:text-3xl">
              {value}
            </span>
            <span className="flex items-center gap-1 text-[11px]">
              <Icon className="h-3 w-3 shrink-0" style={{ color }} />
              <span className="font-medium" style={{ color }}>
                {trend.text}
              </span>
              {trend.note && <span className="font-light text-gray-400">{trend.note}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------ Revenue chart ----------------------------- */

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export function RevenueChart({ chart }: { chart: ChartPoint[] }) {
  const chartMax = Math.max(1, ...chart.flatMap((d) => [d.revenue, d.expense]));
  return (
    <div>
      <SectionHeader
        title="ผลการดำเนินงานรายได้"
        right={
          <div className="flex items-center gap-4 text-xs font-light text-gray-500">
            <LegendDot color={REVENUE_COLOR} label="รายได้" />
            <LegendDot color={EXPENSE_COLOR} label="ค่าใช้จ่าย" />
          </div>
        }
      />
      {/* แท่งคู่ต่อเดือน: แดง = รายได้ · เทา = ค่าใช้จ่าย */}
      <div className="flex h-64 items-end justify-between gap-2 sm:gap-4">
        {chart.map((d) => {
          const revH = (d.revenue / chartMax) * 100;
          const expH = (d.expense / chartMax) * 100;
          return (
            <div key={d.label} className="group flex h-full flex-1 flex-col items-center gap-3">
              <div className="flex w-full flex-1 items-end justify-center gap-1 sm:gap-1.5">
                <div
                  className="w-full max-w-[22px] transition-opacity"
                  style={{ height: `${revH}%`, backgroundColor: REVENUE_COLOR }}
                  title={`รายได้ ${fmtBaht(d.revenue)}`}
                />
                <div
                  className="w-full max-w-[22px] transition-opacity"
                  style={{ height: `${expH}%`, backgroundColor: EXPENSE_COLOR }}
                  title={`ค่าใช้จ่าย ${fmtBaht(d.expense)}`}
                />
              </div>
              <span className="text-xs font-light text-gray-400">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------- Top courses ------------------------------ */

export function TopCourses({ courses }: { courses: CourseRow[] }) {
  return (
    <div>
      <SectionHeader title="หลักสูตรขายดีที่สุด" meta="นับเฉพาะยอดที่ชำระจริง" />
      {courses.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">ยังไม่มีข้อมูลการลงทะเบียน</p>
      ) : (
        <div className="flex flex-col divide-y divide-gray-100">
          {courses.map((c) => (
            <div key={c.name} className="flex items-center gap-4 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] text-gray-900">{c.name}</p>
                <p className="truncate text-xs text-gray-500">นักเรียน {c.students} คนลงทะเบียน</p>
              </div>
              <span className="shrink-0 text-[15px] font-semibold tabular-nums text-emerald-600">
                {c.revenue}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------- Realtime insights --------------------------- */

export function RealtimeInsights({ insights }: { insights: Insights }) {
  return (
    <div>
      <SectionHeader title="ข้อมูลเชิงลึก" />
      <div className="flex flex-col gap-6">
        {/* นักเรียนใหม่ */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-light text-gray-500">นักเรียนใหม่เดือนนี้</span>
          <span className="text-2xl font-semibold leading-none tabular-nums text-gray-900">
            {insights.newThisMonth}
            <span className="ml-1 text-sm font-light text-gray-400">คน</span>
          </span>
          <span
            className={`inline-flex items-center gap-1 text-xs font-light ${
              insights.newDelta >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {insights.newDelta >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            {fmtPct(insights.newDelta, 0)} <span className="text-gray-400">จากเดือนก่อน</span>
          </span>
        </div>

        {/* อัตราการใช้คาบเรียน */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-light text-gray-500">อัตราการใช้คาบเรียน</span>
            <span className="text-lg font-semibold tabular-nums text-gray-900">
              {insights.sessionUsage.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden bg-gray-100">
            <div
              className="h-full bg-[#CC0000]"
              style={{ width: `${Math.min(100, insights.sessionUsage)}%` }}
            />
          </div>
        </div>

        {/* ทีมผู้สอน */}
        <div className="flex flex-col gap-3.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-light text-gray-500">ทีมผู้สอน ({insights.coachCount} คน)</span>
            <Link
              href="/admin/members?tab=coach"
              className="text-xs font-medium text-[#CC0000] hover:text-[#990000]"
            >
              จัดการ
            </Link>
          </div>
          {insights.coachCount === 0 ? (
            <p className="text-sm text-gray-400">ยังไม่มีโค้ชในระบบ</p>
          ) : (
            <div className="flex items-center gap-3.5">
              <div className="flex -space-x-2">
                {insights.coachNames.slice(0, 4).map((name, i) => (
                  <div
                    key={i}
                    title={name}
                    className="grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-[#FFF0F0] text-xs font-medium text-[#CC0000]"
                  >
                    {name.slice(0, 2)}
                  </div>
                ))}
                {insights.coachCount > 4 && (
                  <div className="grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-gray-100 text-[11px] font-medium text-gray-500">
                    +{insights.coachCount - 4}
                  </div>
                )}
              </div>
              <p className="min-w-0 flex-1 truncate text-xs font-light text-gray-500">
                {insights.coachNames.slice(0, 3).join(" · ")}
                {insights.coachCount > 3 ? ` และอีก ${insights.coachCount - 3} คน` : ""}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Recent activity ---------------------------- */

export function RecentActivity({ activities }: { activities: ActivityRow[] }) {
  return (
    <div>
      <SectionHeader title="กิจกรรมล่าสุด" />
      {activities.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">ยังไม่มีกิจกรรม</p>
      ) : (
        <ul className="flex flex-col gap-5">
          {activities.map((a, i) => (
            <li key={i} className="flex gap-4">
              <span className={`mt-[7px] h-2 w-2 shrink-0 ${a.dot}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-relaxed text-gray-700">{a.text}</p>
                <p className="mt-0.5 text-xs font-light text-gray-400">{a.time}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------- Important alerts ---------------------------- */

const alertToneMap = {
  danger: { border: "border-red-200 border-l-[#CC0000]", bg: "bg-red-50/60", title: "text-[#CC0000]", action: "text-[#CC0000] hover:text-[#990000]" },
  warning: { border: "border-amber-200 border-l-amber-500", bg: "bg-amber-50/60", title: "text-amber-700", action: "text-amber-700 hover:text-amber-800" },
  info: { border: "border-gray-200 border-l-gray-400", bg: "bg-white", title: "text-gray-900", action: "text-gray-600 hover:text-[#CC0000]" },
  success: { border: "border-emerald-200 border-l-emerald-500", bg: "bg-emerald-50/50", title: "text-emerald-700", action: "text-emerald-700 hover:text-emerald-800" },
} as const;

export function ImportantAlerts({ alerts }: { alerts: AlertRow[] }) {
  return (
    <div>
      <SectionHeader title="การแจ้งเตือนที่สำคัญ" meta={`${alerts.length} รายการ`} />
      <div className="flex flex-col gap-3.5">
        {alerts.map((al) => {
          const t = alertToneMap[al.tone];
          return (
            <div key={al.title} className={`border border-l-[3px] ${t.border} ${t.bg} p-4`}>
              <div className="flex items-center gap-2">
                <al.icon className={`h-4 w-4 shrink-0 ${t.title}`} />
                <p className={`text-sm font-semibold ${t.title}`}>{al.title}</p>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-gray-600">{al.body}</p>
              <Link href={al.href} className={`mt-2 inline-block text-xs font-medium ${t.action}`}>
                {al.action} →
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
