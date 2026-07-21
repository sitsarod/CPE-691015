"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, Wallet, RefreshCw } from "lucide-react";

import { fetchMyCoachProfile, fetchCoachWages } from "@/services/coachAPI";
import { CoachWageEntry } from "@/types/coach";

export default function CoachPaymentPage() {
  const router = useRouter();

  const [coachId, setCoachId] = useState<number | null>(null);
  const [wages, setWages] = useState<CoachWageEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (id?: number) => {
    try {
      setError(null);
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      let resolvedId = id;
      if (!resolvedId) {
        const myProfile = await fetchMyCoachProfile(token);
        resolvedId = myProfile.id;
        setCoachId(myProfile.id);
      }

      const wagesData = await fetchCoachWages(resolvedId, token);
      setWages(wagesData);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการดึงข้อมูล");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData(coachId || undefined);
  };

  if (isLoading) {
    return (
      <div className="w-full min-h-[60vh] flex flex-col items-center justify-center text-gray-500">
        <Loader2 className="w-12 h-12 animate-spin text-[#CC0000] mb-4" />
        <span className="text-sm font-semibold tracking-wide animate-pulse">กำลังโหลดข้อมูลการเงิน...</span>
      </div>
    );
  }

  const totalWages = wages.reduce((sum, w) => sum + w.expenseamount, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-150 pb-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Wallet className="w-8 h-8 text-[#CC0000]" />
            การเงินของฉัน
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            ประวัติค่าจ้างที่สถาบันบันทึกจ่ายให้คุณ
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-250 text-gray-700 hover:text-black py-2.5 px-4 rounded-xl text-sm font-bold transition-all border border-gray-200 cursor-pointer self-start md:self-auto disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-[#CC0000]" : ""}`} />
          {isRefreshing ? "กำลังอัปเดต..." : "อัปเดตข้อมูล"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold">เกิดข้อผิดพลาด</h4>
            <p className="text-sm mt-0.5">{error}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex items-center gap-4 max-w-sm">
        <div className="w-12 h-12 rounded-xl bg-[#FFF0F0] text-[#CC0000] flex items-center justify-center flex-shrink-0">
          <Wallet className="w-6 h-6" />
        </div>
        <div>
          <p className="text-xs text-slate-500 font-semibold">ยอดค่าจ้างสะสมทั้งหมด</p>
          <p className="text-2xl font-black text-slate-800 mt-0.5">฿{totalWages.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-5">วันที่</th>
                <th className="py-3 px-5">รายละเอียด</th>
                <th className="py-3 px-5 text-right">จำนวนเงิน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {wages.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-16 text-center text-slate-400">
                    <p className="text-xs">ยังไม่มีประวัติค่าจ้างในขณะนี้</p>
                  </td>
                </tr>
              ) : (
                wages.map(w => (
                  <tr key={w.id} className="hover:bg-slate-50/50 text-xs transition-colors">
                    <td className="py-3.5 px-5 font-semibold text-slate-700">{w.expensedate?.split("T")[0]}</td>
                    <td className="py-3.5 px-5 text-slate-550">{w.expensedescription || "-"}</td>
                    <td className="py-3.5 px-5 text-right font-bold text-slate-900">฿{w.expenseamount.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
