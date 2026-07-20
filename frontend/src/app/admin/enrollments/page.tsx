"use client";

import { useState, useEffect } from "react";
import { Loader2, CheckCircle, Clock, AlertCircle, Search } from "lucide-react";
import { fetchAllEnrollments, approveEnrollment } from "@/services/enrollmentAPI";
import type { AdminEnrollment } from "@/types/enrollment";


export default function AdminEnrollmentsPage() {
  const [enrollments, setEnrollments] = useState<AdminEnrollment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [processingId, setProcessingId] = useState<number | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem("token");
      if (!token) return;
      const data = await fetchAllEnrollments(token);
      setEnrollments(data);
    } catch (err: any) {
      setError(err.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApprove = async (id: number) => {
    if (!confirm("ยืนยันการอนุมัติการสมัครเรียนและสร้างบิลเรียกเก็บเงิน?")) return;
    setProcessingId(id);
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      await approveEnrollment(id, token);
      alert("อนุมัติสำเร็จ!");
      loadData();
    } catch (err: any) {
      alert(err.message || "ไม่สามารถอนุมัติได้");
    } finally {
      setProcessingId(null);
    }
  };

  const filteredEnrollments = enrollments.filter(e => 
    e.customer?.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    e.customer?.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.package?.course?.course_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) return <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#CC0000]" /></div>;
  if (error) return <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200">{error}</div>;

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">จัดการคำขอสมัครเรียน</h1>
          <p className="text-gray-500 mt-2">อนุมัติคำขอสมัครเรียนเพื่อสร้างบิลเรียกเก็บเงิน</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input 
            type="text" 
            placeholder="ค้นหาชื่อผู้สมัคร หรือคอร์ส..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-[300px] focus:outline-none focus:ring-2 focus:ring-[#CC0000]"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-sm font-semibold text-gray-600">
              <th className="p-4">ผู้สมัคร</th>
              <th className="p-4">คอร์สเรียน / แพ็กเกจ</th>
              <th className="p-4">ราคา</th>
              <th className="p-4">วันที่สมัคร</th>
              <th className="p-4">สถานะ</th>
              <th className="p-4 text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {filteredEnrollments.map((item) => (
              <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="p-4">
                  <div className="font-semibold text-gray-900">{item.customer?.first_name} {item.customer?.last_name}</div>
                  <div className="text-xs text-gray-500">{item.customer?.email}</div>
                </td>
                <td className="p-4">
                  <div className="font-bold text-[#CC0000]">{item.package?.course?.course_name}</div>
                  <div className="text-xs text-gray-600">แพ็กเกจ {item.package?.sessions_count} ครั้ง</div>
                </td>
                <td className="p-4 font-semibold text-gray-900">
                  {item.package?.price?.toLocaleString()} ฿
                </td>
                <td className="p-4 text-sm text-gray-600">
                  {new Date(item.enrollment_date).toLocaleDateString('th-TH')}
                </td>
                <td className="p-4">
                  {item.status === 'pending' ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800">
                      <Clock className="w-3 h-3 mr-1" /> รอดำเนินการ
                    </span>
                  ) : item.status === 'active' ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                      <CheckCircle className="w-3 h-3 mr-1" /> อนุมัติแล้ว
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-800">
                      {item.status}
                    </span>
                  )}
                </td>
                <td className="p-4 text-center">
                  {item.status === 'pending' ? (
                    <button 
                      onClick={() => handleApprove(item.id)}
                      disabled={processingId === item.id}
                      className="px-4 py-1.5 bg-[#CC0000] text-white text-sm font-bold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                      {processingId === item.id ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "อนุมัติ"}
                    </button>
                  ) : (
                    <span className="text-sm text-gray-400">-</span>
                  )}
                </td>
              </tr>
            ))}
            {filteredEnrollments.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-500">
                  <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  ไม่พบข้อมูลคำขอสมัครเรียน
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
