function Sk({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`rounded-md bg-gray-200/70 ${className}`} style={style} />;
}

// ความสูงคงที่ของแท่งกราฟ — หลีกเลี่ยง Math.random() เพราะจะทำให้ค่าไม่ตรงกันระหว่าง SSR/CSR
const SKELETON_BARS = [55, 65, 90, 72, 100, 78];

export default function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-gray-200/80 border-l-4 border-l-gray-200 bg-white p-5 shadow-sm"
          >
            <Sk className="h-3.5 w-24" />
            <Sk className="mt-3 h-8 w-28" />
            <Sk className="mt-4 h-3 w-20" />
          </div>
        ))}
      </div>

      {/* Chart + Top courses */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <Sk className="h-5 w-40" />
            <Sk className="h-3 w-28" />
          </div>
          <div className="mt-8 flex h-64 items-end justify-between gap-3 sm:gap-6">
            {SKELETON_BARS.map((h, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-3">
                <div className="flex h-full w-full items-end justify-center">
                  <Sk
                    className="w-full max-w-[46px] rounded-b-none"
                    style={{ height: `${h}%` }}
                  />
                </div>
                <Sk className="h-3 w-8" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
          <Sk className="h-5 w-36" />
          <ul className="mt-5 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3">
                <Sk className="h-10 w-10 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Sk className="h-3.5 w-32" />
                  <Sk className="h-3 w-24" />
                </div>
                <Sk className="h-4 w-14" />
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Insights + Activity + Alerts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4">
          <Sk className="h-5 w-44" />
          <Sk className="h-28 w-full rounded-2xl" />
          <Sk className="h-24 w-full rounded-2xl" />
          <Sk className="h-24 w-full rounded-2xl" />
        </div>

        <div className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
          <Sk className="h-5 w-32" />
          <ul className="mt-5 space-y-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex gap-3">
                <Sk className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Sk className="h-3.5 w-full max-w-[220px]" />
                  <Sk className="h-3 w-20" />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <Sk className="h-5 w-40" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Sk key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
