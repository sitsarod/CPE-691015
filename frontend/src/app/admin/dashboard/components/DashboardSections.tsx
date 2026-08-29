import Link from "next/link";
import { Bell, TrendingUp, TrendingDown } from "lucide-react";
import { fmtBaht, fmtPct } from "./buildDashboard";
import type {
  ActivityRow,
  AlertRow,
  ChartPoint,
  CourseRow,
  Insights,
  Kpi,
} from "./types";

/* ------------------------------- KPI cards ------------------------------- */

export function KpiCards({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {kpis.map(({ label, value, accent, icon: Icon, trend }) => {
        const color = trend.up ? accent : "#E63946";
        return (
          <div
            key={label}
            className="rounded-2xl border border-gray-200/80 border-l-4 bg-white p-5 shadow-sm transition hover:shadow-md"
            style={{ borderLeftColor: accent }}
          >
            <p className="text-sm font-medium text-gray-500">{label}</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">{value}</p>
            <div className="mt-3 flex items-center gap-1.5 text-xs">
              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
              <span className="font-semibold" style={{ color }}>
                {trend.text}
              </span>
              {trend.note && <span className="text-gray-400">{trend.note}</span>}
            </div>
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
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export function RevenueChart({ chart }: { chart: ChartPoint[] }) {
  // scale เทียบกับค่ามากสุดของทั้งรายได้และค่าใช้จ่าย เพื่อให้ทั้งสองแท่งอยู่ในสเกลเดียวกัน
  const chartMax = Math.max(1, ...chart.flatMap((d) => [d.revenue, d.expense]));
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm lg:col-span-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">ผลการดำเนินงานรายได้</h2>
        <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
          <LegendDot color="#2563EB" label="รายได้" />
          <LegendDot color="#E63946" label="ค่าใช้จ่าย" />
        </div>
      </div>

      {/* แท่งคู่ต่อเดือน: น้ำเงิน = รายได้ · แดง = ค่าใช้จ่าย (สีตรงกับ legend) */}
      <div className="mt-8 flex h-64 items-end justify-between gap-2 sm:gap-4">
        {chart.map((d) => {
          const revH = (d.revenue / chartMax) * 100;
          const expH = (d.expense / chartMax) * 100;
          return (
            <div key={d.label} className="group flex h-full flex-1 flex-col items-center gap-3">
              <div className="flex w-full flex-1 items-end justify-center gap-1 sm:gap-1.5">
                <div
                  className="w-full max-w-[18px] rounded-t-md bg-[#2563EB] opacity-90 transition-opacity group-hover:opacity-100"
                  style={{ height: `${revH}%` }}
                  title={`รายได้ ${fmtBaht(d.revenue)}`}
                />
                <div
                  className="w-full max-w-[18px] rounded-t-md bg-[#E63946] opacity-90 transition-opacity group-hover:opacity-100"
                  style={{ height: `${expH}%` }}
                  title={`ค่าใช้จ่าย ${fmtBaht(d.expense)}`}
                />
              </div>
              <span className="text-xs font-medium text-gray-400">{d.label}</span>
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
    <div className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-gray-900">หลักสูตรขายดีที่สุด</h2>
      {courses.length === 0 ? (
        <p className="mt-8 text-center text-sm text-gray-400">ยังไม่มีข้อมูลการลงทะเบียน</p>
      ) : (
        <ul className="mt-5 space-y-1">
          {courses.map((c) => (
            <li
              key={c.name}
              className="flex items-center gap-4 rounded-xl px-2 py-2 transition hover:bg-gray-50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{c.name}</p>
                <p className="truncate text-xs text-gray-500">
                  นักเรียน {c.students} คนลงทะเบียน
                </p>
              </div>
              <span className="shrink-0 text-sm font-bold text-emerald-600">{c.revenue}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------- Realtime insights --------------------------- */

export function RealtimeInsights({ insights }: { insights: Insights }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">ข้อมูลเชิงลึกแบบเรียลไทม์</h2>

      <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-gray-500">นักเรียนใหม่เดือนนี้</p>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold tabular-nums text-gray-900">
            {insights.newThisMonth}
          </span>
          <span className="text-sm text-gray-400">คน</span>
        </div>
        <p
          className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${
            insights.newDelta >= 0 ? "text-emerald-600" : "text-rose-600"
          }`}
        >
          {insights.newDelta >= 0 ? (
            <TrendingUp className="h-3.5 w-3.5" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5" />
          )}
          {fmtPct(insights.newDelta, 0)} จากเดือนก่อน
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-gray-500">อัตราการใช้คาบเรียน</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
          {insights.sessionUsage.toFixed(1)}%
        </p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${Math.min(100, insights.sessionUsage)}%` }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-500">ทีมผู้สอน ({insights.coachCount} คน)</p>
          <Link href="/admin/coachmanagement" className="text-xs font-semibold text-[#CC0000] hover:underline">
            จัดการ
          </Link>
        </div>
        {insights.coachCount === 0 ? (
          <p className="text-sm text-gray-400">ยังไม่มีโค้ชในระบบ</p>
        ) : (
          <div className="flex items-center gap-3">
            {/* avatar ตัวย่อซ้อนกัน แสดงไม่เกิน 4 คน ที่เหลือรวมเป็น +N */}
            <div className="flex -space-x-2">
              {insights.coachNames.slice(0, 4).map((name, i) => (
                <div
                  key={i}
                  title={name}
                  className="grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-rose-100 text-xs font-bold text-rose-600"
                >
                  {name.slice(0, 2).toUpperCase()}
                </div>
              ))}
              {insights.coachCount > 4 && (
                <div className="grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-gray-100 text-[11px] font-bold text-gray-500">
                  +{insights.coachCount - 4}
                </div>
              )}
            </div>
            <p className="min-w-0 flex-1 truncate text-xs text-gray-500">
              {insights.coachNames.slice(0, 3).join(" · ")}
              {insights.coachCount > 3 ? ` และอีก ${insights.coachCount - 3} คน` : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- Recent activity ---------------------------- */

export function RecentActivity({ activities }: { activities: ActivityRow[] }) {
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-gray-900">กิจกรรมล่าสุด</h2>
      {activities.length === 0 ? (
        <p className="mt-8 text-center text-sm text-gray-400">ยังไม่มีกิจกรรม</p>
      ) : (
        <ul className="mt-5 space-y-5">
          {activities.map((a, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-1.5 flex flex-col items-center">
                <span className={`h-2.5 w-2.5 rounded-full ${a.dot}`} />
                {i < activities.length - 1 && <span className="mt-1 h-8 w-px bg-gray-100" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-gray-700">{a.text}</p>
                <p className="mt-0.5 text-xs text-gray-400">{a.time}</p>
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
  danger: { wrap: "border-red-200 bg-red-50/70", bar: "bg-red-500", icon: "text-red-500", title: "text-red-800", action: "text-red-600 hover:text-red-700" },
  warning: { wrap: "border-amber-200 bg-amber-50/70", bar: "bg-amber-500", icon: "text-amber-500", title: "text-amber-800", action: "text-amber-600 hover:text-amber-700" },
  info: { wrap: "border-blue-200 bg-blue-50/70", bar: "bg-blue-500", icon: "text-blue-500", title: "text-blue-800", action: "text-blue-600 hover:text-blue-700" },
  success: { wrap: "border-emerald-200 bg-emerald-50/70", bar: "bg-emerald-500", icon: "text-emerald-600", title: "text-emerald-800", action: "text-emerald-600 hover:text-emerald-700" },
} as const;

export function ImportantAlerts({ alerts }: { alerts: AlertRow[] }) {
  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
        <Bell className="h-5 w-5 text-gray-400" />
        การแจ้งเตือนที่สำคัญ
      </h2>
      <div className="space-y-3">
        {alerts.map((al) => {
          const t = alertToneMap[al.tone];
          return (
            <div
              key={al.title}
              className={`relative overflow-hidden rounded-xl border p-4 pl-5 ${t.wrap}`}
            >
              <span className={`absolute inset-y-0 left-0 w-1 ${t.bar}`} />
              <div className="flex items-start gap-2.5">
                <al.icon className={`mt-0.5 h-4 w-4 shrink-0 ${t.icon}`} />
                <div className="min-w-0">
                  <p className={`text-sm font-bold ${t.title}`}>{al.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-600">{al.body}</p>
                  <Link
                    href={al.href}
                    className={`mt-2 inline-block text-xs font-semibold ${t.action}`}
                  >
                    {al.action}
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
