import React from "react";

// โครงหน้าตอนโหลด — ล้อ layout จริง (header + การ์ด 3 ใบ + แท็บ + รายการ)
// เพื่อไม่ให้หน้ากระโดดเมื่อข้อมูลมาถึง
export default function PaymentSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-8">
      {/* Header */}
      <div>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <div className="h-3 w-28 rounded bg-gray-200" />
            <div className="h-9 w-72 rounded-lg bg-gray-200" />
            <div className="h-3 w-80 max-w-full rounded bg-gray-100" />
          </div>
          <div className="h-11 w-36 rounded-xl bg-gray-100" />
        </div>
        <div className="mt-6 h-px bg-gray-200" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5"
          >
            <span className="absolute inset-y-0 left-0 w-1 bg-gray-200" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-gray-200" />
                <div className="h-3.5 w-24 rounded bg-gray-200" />
              </div>
              <div className="h-5 w-5 rounded bg-gray-200" />
            </div>
            <div className="mt-5 h-8 w-40 rounded-lg bg-gray-200" />
            <div className="mt-4 border-t border-gray-100 pt-3">
              <div className="h-3 w-28 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-gray-200 pb-3">
        <div className="h-5 w-48 rounded bg-gray-200" />
        <div className="h-5 w-40 rounded bg-gray-100" />
      </div>

      {/* List rows */}
      <div className="grid grid-cols-1 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="relative flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 pl-6 md:flex-row md:items-center"
          >
            <span className="absolute inset-y-0 left-0 w-1 bg-gray-200" />
            <div className="flex items-start gap-4">
              <div className="mt-1 h-4 w-4 rounded bg-gray-200" />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-16 rounded bg-gray-200" />
                  <div className="h-4 w-20 rounded-full bg-gray-100" />
                </div>
                <div className="h-4 w-52 max-w-full rounded bg-gray-200" />
                <div className="h-3 w-64 max-w-full rounded bg-gray-100" />
              </div>
            </div>
            <div className="h-6 w-28 rounded-lg bg-gray-200 md:self-center" />
          </div>
        ))}
      </div>
    </div>
  );
}
