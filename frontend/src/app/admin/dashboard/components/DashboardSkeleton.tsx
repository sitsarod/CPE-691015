function Sk({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`bg-gray-200/70 ${className}`} style={style} />;
}

// ความสูงคงที่ของแท่งกราฟ — หลีกเลี่ยง Math.random() เพราะจะทำให้ค่าไม่ตรงกันระหว่าง SSR/CSR
const SKELETON_BARS = [55, 65, 90, 72, 100, 78];

function Rows({ n }: { n: number }) {
  return (
    <div className="mt-5 flex flex-col divide-y divide-gray-100">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-4">
          <div className="flex-1 space-y-2">
            <Sk className="h-3.5 w-40" />
            <Sk className="h-3 w-24" />
          </div>
          <Sk className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export default function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-10">
      {/* stat row */}
      <div className="hidden grid-cols-5 gap-px border border-gray-200 bg-gray-200 md:grid">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2.5 bg-white px-4 py-5">
            <Sk className="h-3 w-16" />
            <Sk className="h-7 w-20" />
            <Sk className="h-2.5 w-14" />
          </div>
        ))}
      </div>

      {/* headcount */}
      <div>
        <div className="border-b border-gray-200 pb-4">
          <Sk className="h-6 w-48" />
        </div>
        <Rows n={4} />
      </div>

      {/* 2-col */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-[1.55fr_1fr]">
        <div className="hidden flex-col gap-10 md:flex">
          <div>
            <div className="border-b border-gray-200 pb-4">
              <Sk className="h-6 w-52" />
            </div>
            <div className="mt-6 flex h-56 items-end justify-between gap-4">
              {SKELETON_BARS.map((h, i) => (
                <Sk key={i} className="flex-1" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div>
            <div className="border-b border-gray-200 pb-4">
              <Sk className="h-6 w-40" />
            </div>
            <Rows n={4} />
          </div>
        </div>

        <div className="flex flex-col gap-10">
          <div>
            <div className="border-b border-gray-200 pb-4">
              <Sk className="h-6 w-44" />
            </div>
            <div className="mt-4 space-y-3.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Sk key={i} className="h-24 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
