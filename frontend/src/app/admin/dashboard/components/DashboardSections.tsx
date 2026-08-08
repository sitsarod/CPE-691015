import Link from "next/link";
import { Bell, ArrowUpRight } from "lucide-react";
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
  const chartMax = Math.max(1, ...chart.map((d) => d.revenue));
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm lg:col-span-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">ผลการดำเนินงานรายได้</h2>
        <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
          <LegendDot color="#2563EB" label="รายได้" />
          <LegendDot color="#E63946" label="ค่าใช้จ่าย" />
        </div>
      </div>

      <div className="mt-8 flex h-64 items-end justify-between gap-3 sm:gap-6">
        {chart.map((d) => {
          const revH = (d.revenue / chartMax) * 100;
          const expH = (d.expense / chartMax) * 100;
          return (
            <div key={d.label} className="group flex flex-1 flex-col items-center gap-3">
              <div className="relative flex h-full w-full items-end justify-center">
                <div
                  className="w-full max-w-[46px] rounded-t-lg bg-blue-200/70 transition-all group-hover:bg-blue-300/70"
                  style={{ height: `${revH}%` }}
                  title={`รายได้ ${fmtBaht(d.revenue)}`}
                >
                  <div
                    className="w-full rounded-t-lg bg-gray-200/80"
                    style={{ height: `${revH > 0 ? (expH / revH) * 100 : 0}%` }}
                    title={`ค่าใช้จ่าย ${fmtBaht(d.expense)}`}
                  />
                </div>
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
        <ul className="mt-5 space-y-2">
          {courses.map((c) => (
            <li
              key={c.name}
              className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-gray-50"
            >
              <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${c.tint}`}>
                <c.icon className="h-5 w-5" />
              </div>
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

      <div className="rounded-2xl bg-blue-600 p-5 text-white shadow-sm shadow-blue-600/20">
        <p className="text-sm font-medium text-blue-100">นักเรียนใหม่เดือนนี้</p>
        <p className="mt-1 text-4xl font-bold tabular-nums">{insights.newThisMonth}</p>
        <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-100">
          <ArrowUpRight className="h-3.5 w-3.5" />
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
        <p className="mb-3 text-sm font-medium text-gray-500">
          ทีมผู้สอน ({insights.coachCount} คน)
        </p>
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rose-100 text-sm font-bold text-rose-600">
            {insights.topCoachName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{insights.topCoachName}</p>
            <p className="text-xs text-gray-500">โค้ชในระบบ</p>
          </div>
        </div>
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
