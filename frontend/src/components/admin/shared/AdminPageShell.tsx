"use client";

import { ReactNode } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";
import Button from "@/components/Button";

/**
 * ชิ้นส่วนที่หน้าจัดการทุกหน้าใช้เหมือนกัน
 *
 * หัวเรื่องพร้อมปุ่มรีเฟรช และแถบแจ้งข้อผิดพลาด เคยถูกก๊อปไว้สามที่แบบ
 * ตัวอักษรตรงกันทุกตัว ต่างแค่ข้อความ พอมีคนแก้สีหรือระยะห่างที่หน้าหนึ่ง
 * อีกสองหน้าก็เพี้ยนไปจากกันทันทีโดยไม่มีใครสังเกต
 */

/**
 * หัวเรื่องของหน้าจัดการ
 *
 * ปุ่มรีเฟรชอยู่ในนี้เสมอเพราะทุกหน้าต้องมี ส่วน actions ไว้ใส่ปุ่มเฉพาะของหน้านั้น
 * เช่นปุ่ม "เพิ่มสมาชิกใหม่" ที่มีแค่หน้าจัดการสมาชิก
 */
export function AdminPageHeader({
  title,
  subtitle,
  onRefresh,
  isLoading,
  actions,
}: {
  title: string;
  subtitle: string;
  onRefresh: () => void;
  isLoading: boolean;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
        <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
      </div>

      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          onClick={onRefresh}
          disabled={isLoading}
          className="!w-10 !h-10 !p-0 !rounded-xl border-gray-200"
          title="รีเฟรชข้อมูล"
        >
          <RefreshCw className={`h-4 w-4 text-gray-600 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
        {actions}
      </div>
    </div>
  );
}

/**
 * แถบแจ้งข้อผิดพลาดของทั้งหน้า
 *
 * คืน null เมื่อไม่มีข้อความ ผู้เรียกจึงวางไว้ได้เลยโดยไม่ต้องเขียนเงื่อนไขเอง
 * ซึ่งเป็นจุดที่เดิมเขียนซ้ำสามที่ในรูป {error && (...)}
 */
export function AdminErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div className="mt-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
      <AlertCircle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

/**
 * ข้อความแทนหน้าจอมือถือที่ยังไม่ได้ทำ
 *
 * ⚠️ ตัวนี้เป็นของชั่วคราว ตั้งใจให้ถูกลบทิ้ง
 *
 * เมื่อหน้าจอมือถือของหน้าไหนเขียนเสร็จ ให้เอาการเรียกตัวนี้ออกจากหน้านั้น
 * ถ้าวันหนึ่งไม่มีใครเรียกแล้ว ให้ลบไฟล์ส่วนนี้ทิ้งได้เลย
 */
export function MobileNotReady() {
  return (
    <div className="p-6 text-center text-sm text-gray-400">
      หน้าจอสำหรับมือถือยังอยู่ระหว่างการพัฒนา
    </div>
  );
}
