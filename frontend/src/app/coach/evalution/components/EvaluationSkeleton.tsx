import React from 'react';

/**
 * โครงหน้าตอนโหลดของหน้าประเมินผู้เรียน — ล้อ layout จริง
 * (หัวเรื่อง → การ์ดความคืบหน้า → แท็บกรอง → รายชื่อผู้เรียน)
 *
 * เดิมเป็นข้อความ "กำลังโหลดรายชื่อนักเรียน..." กลางจอ พอข้อมูลมาถึงหน้าจะกระโดดทั้งหน้า
 */
export default function EvaluationSkeleton({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const isMobile = variant === 'mobile';

  return (
    <div
      className={
        isMobile
          ? 'animate-pulse space-y-5 px-4 pb-8 pt-4'
          : 'mx-auto max-w-7xl animate-pulse space-y-8'
      }
    >
      {/* หัวเรื่อง */}
      <div>
        <div className="h-3 w-40 rounded bg-gray-100" />
        <div className={`mt-2.5 rounded bg-gray-200 ${isMobile ? 'h-7 w-44' : 'h-9 w-64'}`} />
        <div className="mt-2 h-3.5 w-72 max-w-full rounded bg-gray-100" />
        {!isMobile && <div className="mt-6 h-px bg-gray-200" />}
      </div>

      {/* การ์ดความคืบหน้า */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="h-4 w-44 max-w-full rounded bg-gray-200" />
            <div className="h-3 w-56 max-w-full rounded bg-gray-100" />
          </div>
          <div className="h-7 w-14 flex-none rounded bg-gray-200" />
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-gray-100" />
      </div>

      {/* แท็บกรอง */}
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 w-32 flex-none rounded-xl bg-gray-100" />
        ))}
      </div>

      {/* รายชื่อผู้เรียน */}
      <div className={isMobile ? 'space-y-3' : 'grid grid-cols-1 gap-3 sm:grid-cols-2'}>
        {Array.from({ length: isMobile ? 4 : 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4">
            <div className="h-11 w-11 flex-none rounded-full bg-gray-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-36 max-w-full rounded bg-gray-200" />
              <div className="h-3 w-24 rounded bg-gray-100" />
            </div>
            <div className="h-7 w-20 flex-none rounded-lg bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
