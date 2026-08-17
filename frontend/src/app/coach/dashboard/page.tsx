"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, CalendarClock, Wallet, ClipboardList, Clock } from "lucide-react";

import { fetchMyCoachProfile, fetchCoachSchedules, fetchCoachAvailability } from "@/services/coachAPI";
import { CoachProfile, WorkScheduleItem, AvailabilitySlot } from "@/types/coach";

export default function CoachDashboardPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [schedules, setSchedules] = useState<WorkScheduleItem[]>([]);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setError(null);
        const token = localStorage.getItem("token");
        if (!token) {
          router.push("/login");
          return;
        }

        const myProfile = await fetchMyCoachProfile(token);
        setProfile(myProfile);

        const [schedulesData, availabilityData] = await Promise.all([
          fetchCoachSchedules(myProfile.id, token),
          fetchCoachAvailability(myProfile.id, token)
        ]);
        setSchedules(schedulesData);
        setAvailability(availabilityData);
      } catch (err: unknown) {
        console.error(err);
        setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการดึงข้อมูล");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [router]);

  if (isLoading) {
    return (
      <div className="w-full min-h-[60vh] flex flex-col items-center justify-center text-gray-500">
        <Loader2 className="w-12 h-12 animate-spin text-[#CC0000] mb-4" />
        <span className="text-sm font-semibold tracking-wide animate-pulse">กำลังโหลดข้อมูล...</span>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3 max-w-2xl">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold">เกิดข้อผิดพลาด</h4>
          <p className="text-sm mt-0.5">{error || "ไม่พบข้อมูลโค้ช"}</p>
        </div>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const upcomingSchedules = schedules
    .filter(s => s.date >= today)
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time))
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-7xl space-y-8 animate-fadeIn">
      <div className="border-b border-gray-150 pb-6">
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">
          สวัสดี, {profile.nickname || profile.first_name}
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          ภาพรวมตารางสอนและข้อมูลของคุณในระบบ
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard
          icon={<ClipboardList className="w-6 h-6" />}
          label="คาบสอนทั้งหมด"
          value={`${schedules.length} คาบ`}
        />
        <StatCard
          icon={<Wallet className="w-6 h-6" />}
          label={profile.payment_type === "monthly" ? "ค่าจ้างต่อเดือน" : "ค่าจ้างต่อคาบ"}
          value={`฿${profile.pay_rate.toLocaleString()}`}
        />
        <StatCard
          icon={<Clock className="w-6 h-6" />}
          label="ช่วงเวลาว่างที่ตั้งไว้"
          value={`${availability.length} ช่วง`}
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex items-center gap-3">
          <CalendarClock className="w-5 h-5 text-[#CC0000]" />
          <div>
            <h3 className="text-md font-bold text-slate-800">คาบสอนที่จะถึง</h3>
            <p className="text-xs text-slate-500 mt-0.5">5 คาบสอนถัดไปของคุณ</p>
          </div>
        </div>

        {upcomingSchedules.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-12">ไม่มีคาบสอนที่จะถึงในขณะนี้</p>
        ) : (
          <div className="divide-y divide-slate-200">
            {upcomingSchedules.map(s => (
              <div key={s.ID} className="flex items-center justify-between px-6 py-4 text-xs">
                <div>
                  <p className="font-bold text-slate-800">{s.date}</p>
                  <p className="text-slate-500 mt-0.5">{s.course?.course_name || "-"}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-700">{s.start_time} - {s.end_time}</p>
                  <p className="text-slate-500 mt-0.5">สนาม {s.court_number}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-[#FFF0F0] text-[#CC0000] flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-xs text-slate-500 font-semibold">{label}</p>
        <p className="text-xl font-black text-slate-800 mt-0.5">{value}</p>
      </div>
    </div>
  );
}
