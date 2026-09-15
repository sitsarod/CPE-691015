import { redirect } from "next/navigation";

// หน้านี้ถูกรวมเข้ากับ /admin/members แล้ว (แท็บ "นักเรียน") — เหลือไว้แค่ redirect
// กันลิงก์เก่า/บุ๊กมาร์กเดิมพัง
export default function StudentManagementPage() {
  redirect("/admin/members?tab=student");
}
