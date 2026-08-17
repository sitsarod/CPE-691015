"use client";

import PrivacySettings from "@/components/settings/PrivacySettings";

// เนื้อหาทั้งหมดอยู่ใน PrivacySettings เพราะฝั่งโค้ชใช้หน้าเดียวกัน
// ต่างกันแค่ถ้อยคำว่า "เข้าเรียน" หรือ "เข้างาน"
export default function PrivacySettingsPage() {
  return <PrivacySettings role="customer" />;
}
