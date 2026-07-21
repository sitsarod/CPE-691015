"use client";

import ProfileView from "@/components/ProfileView";

// ใช้ ProfileView ตัวเดียวกับฝั่งผู้เรียน/แอดมิน หน้าตาจึงเหมือนกันทุกอย่าง
// ยังไม่ส่ง editHref/qrHref เพราะฝั่งโค้ชยังไม่มีหน้าแก้ไขโปรไฟล์/QR ของตัวเอง
export default function CoachProfilePage() {
  return <ProfileView fallbackName="โค้ช" />;
}
