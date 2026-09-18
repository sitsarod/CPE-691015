// DashboardSkeleton — โครงหน้าแดชบอร์ดลูกค้า (แบนเนอร์ hero + การ์ดข่าว) ระหว่างรอโหลด
// ตามคอนเวนชัน Sk + animate-pulse

function Sk({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-200/70 rounded ${className}`} />;
}

export default function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-7xl min-h-[calc(100vh-80px)] animate-pulse overflow-hidden rounded-2xl bg-gray-50 pb-20 shadow-sm">
      {/* แบนเนอร์ hero */}
      <div className="relative h-[380px] w-full bg-gray-200 md:h-[460px]">
        <div className="absolute bottom-0 left-0 w-full space-y-4 p-8 md:p-16">
          <Sk className="h-6 w-28 rounded-md bg-gray-300/70" />
          <Sk className="h-10 w-3/4 max-w-xl bg-gray-300/70 md:h-12" />
          <Sk className="h-11 w-40 rounded-full bg-gray-300/70" />
        </div>
      </div>

      {/* หัวข้อ + การ์ดข่าว */}
      <div className="p-6 md:p-10">
        <Sk className="mb-6 h-7 w-52" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <Sk className="aspect-[16/9] w-full rounded-2xl" />
            <Sk className="h-6 w-3/4" />
            <Sk className="h-4 w-full" />
          </div>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Sk className="h-20 w-28 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2 py-1">
                  <Sk className="h-4 w-full" />
                  <Sk className="h-4 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
