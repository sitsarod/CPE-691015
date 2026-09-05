"use client";

import FaceEnrollment from "@/components/face/FaceEnrollment";

/** โค้ชใช้หน้าเดียวกับผู้เรียน — สแกนเช็คชื่อที่เครื่องคีออสตัวเดียวกัน */
export default function CoachFaceEnrollmentPage() {
  return <FaceEnrollment privacyHref="/coach/settings/privacy" />;
}
