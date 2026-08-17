"use client";

import PrivacySettings from "@/components/settings/PrivacySettings";

/**
 * โค้ชก็ต้องให้ความยินยอมเก็บข้อมูลใบหน้าเหมือนผู้เรียน
 * เพราะใช้สแกนหน้าเช็คชื่อเข้างาน ซึ่งเป็นข้อมูลชีวภาพตาม PDPA เท่ากัน
 */
export default function CoachPrivacySettingsPage() {
  return <PrivacySettings role="coach" />;
}
