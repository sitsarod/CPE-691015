"use client";

import StudentOverview from "./components/StudentOverview";

export default function CustomerOverviewPage() {
  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-gray-900">
          <span className="text-[#CC0000]">|</span> แดชบอร์ดของฉัน
        </h1>
        <p className="text-sm text-gray-500">
          ภาพรวมคอร์สเรียน ตารางเรียน และสถานะการเงินของคุณ
        </p>
      </div>
      <StudentOverview />
    </div>
  );
}
