import React from 'react';

/**
 * โครงหน้าตอนโหลดของหน้าจัดการหน้าแรก (admin/settings) — ล้อ layout จริง
 *
 * เดิมเป็นสปินเนอร์กลางจอ พอข้อมูลมาถึงหน้าจะกระโดดทั้งหน้า
 * desktop = หัวเรื่อง + สารบัญด้านซ้าย + แผงแก้ไขหลายหมวด
 * mobile  = หัวเรื่อง + ลิสต์สารบัญ
 */
export default function SettingsSkeleton({
  variant = 'desktop',
}: {
  variant?: 'desktop' | 'mobile';
}) {
  if (variant === 'mobile') {
    return (
      <div className="mx-auto max-w-3xl animate-pulse">
        {/* หัวเรื่อง */}
        <div className="mb-6">
          <div className="h-7 w-44 rounded bg-gray-200" />
          <div className="mt-2 h-3 w-32 rounded bg-gray-100" />
        </div>

        {/* ลิสต์สารบัญ 2 กลุ่ม */}
        {Array.from({ length: 2 }).map((_, g) => (
          <div key={g} className="mb-6 flex flex-col gap-2">
            <div className="h-3 w-28 rounded bg-gray-100" />
            <div className="flex flex-col border-t border-gray-100">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3.5 border-b border-gray-100 py-3.5">
                  <div className="h-3 w-6 flex-none rounded bg-gray-100" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-36 max-w-full rounded bg-gray-200" />
                    <div className="h-3 w-52 max-w-full rounded bg-gray-100" />
                  </div>
                  <div className="h-4 w-4 flex-none rounded bg-gray-100" />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* พรีวิว + แถบบันทึก */}
        <div className="mt-6 h-40 w-full rounded-2xl bg-gray-100" />
        <div className="mt-8 flex gap-3 border-t border-gray-200 pt-4">
          <div className="h-12 w-28 flex-none rounded-xl bg-gray-100" />
          <div className="h-12 flex-1 rounded-xl bg-gray-200" />
        </div>
      </div>
    );
  }

  // ---------- DESKTOP ----------
  return (
    <div className="mx-auto max-w-[1400px] animate-pulse">
      {/* header */}
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="h-8 w-56 rounded bg-gray-200" />
          <div className="mt-2.5 h-3.5 w-80 max-w-full rounded bg-gray-100" />
        </div>
        <div className="flex items-center gap-5">
          <div className="h-10 w-32 rounded-xl bg-gray-100" />
          <div className="h-10 w-[180px] rounded-xl bg-gray-200" />
        </div>
      </div>

      {/* body: สารบัญ + แผงแก้ไข */}
      <div className="flex gap-8 pt-6">
        {/* สารบัญด้านซ้าย */}
        <aside className="hidden h-fit w-[240px] flex-none lg:block">
          <div className="flex flex-col gap-6">
            {Array.from({ length: 2 }).map((_, g) => (
              <div key={g} className="flex flex-col gap-2.5">
                <div className="h-3 w-24 rounded bg-gray-100" />
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-9 w-full rounded-lg bg-gray-100" />
                ))}
              </div>
            ))}
          </div>
        </aside>

        {/* แผงแก้ไขหลายหมวด */}
        <div className="flex min-w-0 flex-1 flex-col gap-14">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-4">
              <div className="space-y-2">
                <div className="h-5 w-48 rounded bg-gray-200" />
                <div className="h-3.5 w-72 max-w-full rounded bg-gray-100" />
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <div className="space-y-4">
                  <div className="h-10 w-full rounded-lg bg-gray-100" />
                  <div className="h-10 w-full rounded-lg bg-gray-100" />
                  <div className="h-24 w-full rounded-lg bg-gray-100" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
