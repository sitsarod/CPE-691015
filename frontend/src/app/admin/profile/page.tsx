"use client";

import ProfileView from "@/components/ProfileView";

// ใช้ ProfileView ตัวเดียวกับฝั่งผู้เรียน หน้าตาจึงเหมือนกันทุกอย่าง
//
// ยังไม่ส่ง editHref/qrHref เพราะฝั่งแอดมินยังไม่มีหน้าปลายทาง:
//   - QR Code เป็นของนักเรียนไว้เช็คชื่อ แอดมินไม่มีแถวใน customers จึงไม่มี QR
//   - หน้าแก้ไขโปรไฟล์มีแต่ /customer/settings/profile ซึ่งเป็นฟอร์มของนักเรียน
//     (มีชื่อเล่น/ผู้ปกครอง) และ render อยู่ใน layout ฝั่งลูกค้า
// ถ้าทำ /admin/settings/profile เมื่อไหร่ ค่อยส่ง editHref เข้ามาได้เลย
export default function AdminProfilePage() {
  return <ProfileView fallbackName="ผู้ดูแลระบบ" />;
}
