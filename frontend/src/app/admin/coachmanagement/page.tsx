import { redirect } from "next/navigation";

// หน้านี้ถูกรวมเข้ากับ /admin/members แล้ว (แท็บ "โค้ช") — เหลือไว้แค่ redirect
// กันลิงก์เก่า/บุ๊กมาร์กเดิมพัง
export default function CoachManagementPage() {
  redirect("/admin/members?tab=coach");
}
