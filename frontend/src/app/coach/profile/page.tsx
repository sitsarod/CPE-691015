"use client";

import ProfileView from "@/components/ProfileView";

// ใช้ ProfileView ตัวเดียวกับฝั่งผู้เรียน/แอดมิน หน้าตาจึงเหมือนกันทุกอย่าง
// หน้าแก้ไขให้โค้ชแก้ได้เฉพาะช่องทางติดต่อ ส่วนข้อมูลตัวตนและการเงินยังต้องให้แอดมินแก้ให้
export default function CoachProfilePage() {
  return (
    <ProfileView
      fallbackName="โค้ช"
      editHref="/coach/settings/profile"
      qrHref="/coach/profile/viewQR"
    />
  );
}
