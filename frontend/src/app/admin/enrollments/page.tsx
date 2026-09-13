"use client";

import { useState, useEffect } from "react";
import { Loader2, CheckCircle, Clock, AlertCircle, Search, FileSearch, Wallet, CalendarX, AlertTriangle, XCircle } from "lucide-react";
import {
  fetchAllEnrollments,
  approveEnrollment,
  rejectEnrollment,
} from "@/services/enrollmentAPI";
import type { AdminEnrollment } from "@/types/enrollment";
import { ENROLLMENT_STATUS_LABEL } from "@/types/enrollment";
import {
  describeExpiry,
  expiryTextClass,
  formatThaiDate,
} from "@/components/course/expiryUtils";
import EnrollmentReviewPanel from "./components/EnrollmentReviewPanel";


// แยกออกมาเพราะทั้งการ์ดและตารางใช้ชุดเดียวกัน — ถ้าปล่อยไว้ในที่เดิมจะต้อง
// ก๊อปโซ่ ternary หกชั้นไปวางสองที่ แล้ววันหลังแก้ที่เดียวลืมอีกที่

function StatusBadge({ status }: { status: AdminEnrollment["status"] }) {
  const base = "inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-bold";

  if (status === 'pending')
    return <span className={`${base} bg-yellow-100 text-yellow-800`}><Clock className="w-3 h-3 mr-1" /> รอดำเนินการ</span>;
  if (status === 'awaiting_payment')
    return <span className={`${base} bg-orange-100 text-orange-800`}><Wallet className="w-3 h-3 mr-1" /> รอชำระเงิน</span>;
  if (status === 'active')
    return <span className={`${base} bg-green-100 text-green-800`}><CheckCircle className="w-3 h-3 mr-1" /> อนุมัติแล้ว</span>;
  if (status === 'expired')
    return <span className={`${base} bg-slate-100 text-slate-700`}><CalendarX className="w-3 h-3 mr-1" /> หมดอายุ</span>;
  if (status === 'rejected')
    return <span className={`${base} bg-red-100 text-red-700`}><XCircle className="w-3 h-3 mr-1" /> ปฏิเสธแล้ว</span>;

  return <span className={`${base} bg-gray-100 text-gray-800`}>{ENROLLMENT_STATUS_LABEL[status] ?? status}</span>;
}

function ExpiryInfo({ item }: { item: AdminEnrollment }) {
  const expiry = item.expires_at
    ? describeExpiry(item.days_left, item.status, item.grace_days_left)
    : null;

  return (
    <div className="text-sm">
      {expiry ? (
        <>
          <div className="text-gray-700">{formatThaiDate(item.expires_at!)}</div>
          <div className={`text-xs font-semibold ${expiryTextClass(expiry.tone)}`}>
            {expiry.label}
          </div>
          {item.grace_days_left !== null && item.grace_days_left > 0 && (
            <div className="text-xs font-bold text-red-600">
              ยังเหลือ {item.remaining_sessions} ครั้ง
            </div>
          )}
        </>
      ) : (
        <span className="text-xs text-gray-400">ยังไม่เริ่มนับ</span>
      )}

      {item.is_overdue && (
        <div className="mt-1 inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-bold text-red-700">
          <AlertTriangle className="h-3 w-3" /> ค้างชำระ
        </div>
      )}
    </div>
  );
}

function ReviewButton({
  item,
  onClick,
  block,
}: {
  item: AdminEnrollment;
  onClick: () => void;
  block?: boolean;
}) {
  const isPending = item.status === 'pending';

  return (
    <button
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-bold transition-colors ${
        block ? 'w-full' : ''
      } ${
        isPending
          ? 'bg-[#CC0000] text-white hover:bg-[#A30A0E]'
          : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
      }`}
    >
      <FileSearch className="h-4 w-4" />
      {isPending ? 'ตรวจสอบ' : 'ดูข้อมูล'}
    </button>
  );
}

export default function AdminEnrollmentsPage() {
  const [enrollments, setEnrollments] = useState<AdminEnrollment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [reviewingId, setReviewingId] = useState<number | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem("token");
      if (!token) return;
      const data = await fetchAllEnrollments(token);
      setEnrollments(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // อนุมัติได้จากในแผงตรวจสอบเท่านั้น เพื่อบังคับให้แอดมินเห็นยอดค้างชำระ
  // ที่นั่งคงเหลือ และคอร์สอื่นที่ผู้สมัครเรียนอยู่ ก่อนตัดสินใจ
  const handleApprove = async (id: number, allowOverbook = false) => {
    setProcessingId(id);
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      await approveEnrollment(id, token, allowOverbook);
      setReviewingId(null);
      alert("อนุมัติสำเร็จ!");
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถอนุมัติได้");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: number, reason: string) => {
    setRejectingId(id);
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      await rejectEnrollment(id, reason, token);
      setReviewingId(null);
      alert("ปฏิเสธคำขอเรียบร้อย ระบบแจ้งเตือนนักเรียนพร้อมเหตุผลแล้ว");
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถปฏิเสธคำขอได้");
    } finally {
      setRejectingId(null);
    }
  };

  // ไม่ได้ค้นอะไร = เห็นทุกแถว · ของเดิมกรองด้วย || ของค่าที่อาจเป็น undefined
  // แถวที่ไม่มีทั้งลูกค้าและแพ็กเกจจึงหลุดหายไปเงียบ ๆ แม้ช่องค้นหาจะว่าง
  const searchKeyword = searchTerm.trim().toLowerCase();
  const filteredEnrollments = searchKeyword
    ? enrollments.filter((e) =>
        [
          e.customer?.first_name,
          e.customer?.last_name,
          e.customer?.nickname,
          e.customer?.email,
          e.package?.course?.course_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(searchKeyword)
      )
    : enrollments;

  if (isLoading) return <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#CC0000]" /></div>;
  if (error) return <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200">{error}</div>;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        {/* จอมือถือสูงจำกัด หัวข้อกินที่ไปเปล่า ๆ โดยไม่ได้บอกอะไรที่เมนูไม่ได้บอก */}
        <div className="hidden sm:block">
          <h1 className="text-3xl font-bold text-gray-900">จัดการคำขอสมัครเรียน</h1>
          <p className="text-gray-500 mt-2">อนุมัติคำขอสมัครเรียนเพื่อสร้างบิลเรียกเก็บเงิน</p>
        </div>

        <div className="relative w-full sm:w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="ค้นหาชื่อผู้สมัคร หรือคอร์ส..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full min-h-11 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CC0000]"
          />
        </div>
      </div>

      {filteredEnrollments.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500 shadow-sm">
          <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          ไม่พบข้อมูลคำขอสมัครเรียน
        </div>
      )}

      {/* ── มือถือ/แท็บเล็ต: การ์ดต่อคำขอ ──
          ตารางนี้มีเจ็ดคอลัมน์ที่ล้วนมีเนื้อหา ยัดลงจอแคบกว่า xl ไม่ได้
          พอถึง lg ที่จอเริ่มกว้างจึงวางสองใบต่อแถวแทนที่จะยืดใบเดียวจนโล่ง */}
      <div className="grid gap-3 lg:grid-cols-2 xl:hidden">
        {filteredEnrollments.map((item) => (
          <div
            key={item.id}
            className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">
                  {item.customer?.first_name} {item.customer?.last_name}
                </p>
                <p className="truncate text-xs text-gray-500">{item.customer?.email}</p>
              </div>
              <StatusBadge status={item.status} />
            </div>

            <div className="mt-3 border-t border-gray-100 pt-3">
              <p className="truncate font-bold text-[#CC0000]">
                {item.package?.course?.course_name}
              </p>
              <p className="text-xs text-gray-600">
                แพ็กเกจ {item.package?.sessions_count} ครั้ง ·{' '}
                <span className="font-semibold text-gray-900">
                  {(item.agreed_price || item.package?.price)?.toLocaleString()} ฿
                </span>
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                สมัครเมื่อ {new Date(item.enrollment_date).toLocaleDateString('th-TH')}
              </p>
            </div>

            <div className="mt-3 border-t border-gray-100 pt-3">
              <p className="text-xs font-medium text-gray-500">สิทธิ์เรียน</p>
              <div className="mt-0.5">
                <ExpiryInfo item={item} />
              </div>
            </div>

            <div className="mt-4">
              <ReviewButton item={item} onClick={() => setReviewingId(item.id)} block />
            </div>
          </div>
        ))}
      </div>

      {/* ── จอกว้าง: ตาราง ──
          table-fixed กันไม่ให้คอลัมน์ยืดตามเนื้อหาจนตารางล้นออกนอกจอ
          ข้อความไทยยาว ๆ ที่ไม่มีเว้นวรรคตัดบรรทัดไม่ได้ ต้องตัดท้ายด้วย … แทน */}
      <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm xl:block">
        <table className="w-full table-fixed text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-sm font-semibold text-gray-600">
              <th className="p-4">ผู้สมัคร</th>
              <th className="w-52 p-4">คอร์สเรียน / แพ็กเกจ</th>
              <th className="w-28 p-4">ราคา</th>
              <th className="w-32 p-4">วันที่สมัคร</th>
              <th className="w-40 p-4">สิทธิ์เรียน</th>
              <th className="w-36 p-4">สถานะ</th>
              <th className="w-36 p-4 text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {filteredEnrollments.map((item) => (
              <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="p-4">
                  <div className="truncate font-semibold text-gray-900">
                    {item.customer?.first_name} {item.customer?.last_name}
                  </div>
                  <div className="truncate text-xs text-gray-500">{item.customer?.email}</div>
                </td>
                <td className="p-4">
                  <div className="truncate font-bold text-[#CC0000]">
                    {item.package?.course?.course_name}
                  </div>
                  <div className="truncate text-xs text-gray-600">
                    แพ็กเกจ {item.package?.sessions_count} ครั้ง
                  </div>
                </td>
                <td className="p-4 font-semibold text-gray-900">
                  {(item.agreed_price || item.package?.price)?.toLocaleString()} ฿
                </td>
                <td className="p-4 text-sm text-gray-600">
                  {new Date(item.enrollment_date).toLocaleDateString('th-TH')}
                </td>
                <td className="p-4">
                  <ExpiryInfo item={item} />
                </td>
                <td className="p-4">
                  <StatusBadge status={item.status} />
                </td>
                <td className="p-4 text-center">
                  <ReviewButton item={item} onClick={() => setReviewingId(item.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <EnrollmentReviewPanel
        // remount ทุกครั้งที่เปลี่ยนใบ เพื่อล้างฟอร์มเหตุผลที่ค้างอยู่ในแผง
        key={reviewingId ?? "none"}
        enrollmentId={reviewingId}
        onClose={() => setReviewingId(null)}
        onApprove={handleApprove}
        onReject={handleReject}
        isRejecting={rejectingId !== null}
        isApproving={processingId != null}
      />

    </div>
  );
}
