"use client";

import ProfileView from "@/components/ProfileView";

// ใช้ ProfileView ตัวเดียวกับฝั่งผู้เรียน/แอดมิน หน้าตาจึงเหมือนกันทุกอย่าง
// ยังไม่ส่ง editHref เพราะฝั่งโค้ชยังไม่มีหน้าแก้ไขโปรไฟล์ของตัวเอง
// (แก้ผ่านหน้าแอดมินอย่างเดียว) แต่ QR เช็กชื่อเข้างานมีแล้ว
export default function CoachProfilePage() {
  return <ProfileView fallbackName="โค้ช" qrHref="/coach/profile/viewQR" />;
}
