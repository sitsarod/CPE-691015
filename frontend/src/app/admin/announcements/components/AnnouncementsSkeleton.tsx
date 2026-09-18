// AnnouncementsSkeleton — โครงหน้าจัดการประกาศระหว่างรอโหลดข้อมูล
// ตามคอนเวนชันของโปรเจกต์ (ดู DashboardSkeleton/PaymentSkeleton): helper Sk + animate-pulse ที่ตัวครอบ

function Sk({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-200/70 rounded ${className}`} />;
}

export default function AnnouncementsSkeleton() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-6">
      {/* กรอบหัวข้อ + ค้นหา */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <Sk className="h-7 w-56" />
            <Sk className="h-4 w-72" />
          </div>
          <div className="flex gap-3">
            <Sk className="h-10 w-36 rounded-lg" />
            <Sk className="h-10 w-32 rounded-lg" />
          </div>
        </div>
        <div className="border-t border-gray-100 p-4">
          <Sk className="h-11 w-full max-w-md rounded-lg" />
        </div>
      </div>

      {/* การ์ดรายการประกาศ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <Sk className="h-40 w-full rounded-none" />
            <div className="space-y-3 p-4">
              <Sk className="h-5 w-3/4" />
              <Sk className="h-4 w-full" />
              <Sk className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
