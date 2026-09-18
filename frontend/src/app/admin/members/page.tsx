"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useIsMobile } from "@/hooks/useIsMobile";
import { AdminTabs } from "@/components/admin/shared/AdminTabs";
import {
  useMemberManagement,
  MemberManagementDesktop,
  MemberManagementMobile,
} from "../usermanagement/components";
import {
  useStudentManagement,
  StudentManagementDesktop,
  StudentManagementMobile,
} from "../studentmanagement/components";
import {
  useCoachManagement,
  CoachManagementDesktop,
  CoachManagementMobile,
} from "../coachmanagement/components";

type Tab = "all" | "student" | "coach";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "student", label: "นักเรียน" },
  { key: "coach", label: "โค้ช" },
];

/**
 * หน้ารวม "จัดการสมาชิก" — แทนที่สามหน้าเดิม (usermanagement / studentmanagement /
 * coachmanagement) ด้วยหน้าเดียวมีแท็บสลับมุมมอง ไม่ได้เขียนตรรกะใหม่ แค่ประกอบ
 * หน้าจอเดิมเข้าด้วยกัน เพราะแต่ละบทบาทมีฟีเจอร์เฉพาะทางจริง (นักเรียนมีตัวกรองครั้งทบ,
 * โค้ชมีตารางสอน) ไม่มีแท็บ "แอดมิน" แยก เพราะแท็บ "ทั้งหมด" มีตัวกรองบทบาทในตัวอยู่แล้ว
 *
 * ⚠️ ต้องเรียก hook ทั้งสามตัวไม่มีเงื่อนไขก่อนเลือกเรนเดอร์หน้าจอเสมอ (กฎ hook ของ React)
 */
export default function MembersPage() {
  return (
    <Suspense fallback={null}>
      <MembersTabs />
    </Suspense>
  );
}

function MembersTabs() {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab") as Tab | null;
  const initialTab: Tab = TABS.some((t) => t.key === requestedTab) ? (requestedTab as Tab) : "all";

  const [tab, setTab] = useState<Tab>(initialTab);
  const isMobile = useIsMobile();

  const memberManager = useMemberManagement();
  const studentManager = useStudentManagement();
  const coachManager = useCoachManagement();

  return (
    <div>
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-0 sm:pt-0">
        <AdminTabs tabs={TABS} active={tab} onChange={setTab} />
      </div>

      {tab === "student" &&
        (isMobile ? <StudentManagementMobile manager={studentManager} /> : <StudentManagementDesktop manager={studentManager} />)}

      {tab === "coach" &&
        (isMobile ? <CoachManagementMobile manager={coachManager} /> : <CoachManagementDesktop manager={coachManager} />)}

      {tab === "all" &&
        (isMobile ? <MemberManagementMobile manager={memberManager} /> : <MemberManagementDesktop manager={memberManager} />)}

      {/* กล่องยืนยันของทั้งสามแท็บ — แทน confirm() ของเบราว์เซอร์ซึ่งตัดข้อความยาวทิ้ง
          แยกตัวละแท็บเพราะแต่ละ manager ถือสถานะของตัวเอง */}
      {[memberManager, studentManager, coachManager].map((m, i) => (
        <ConfirmDialog
          key={i}
          {...m.confirmDialog}
          title="ยืนยันการทำรายการ"
          confirmText="ยืนยัน"
          cancelText="ยกเลิก"
        />
      ))}
    </div>
  );
}
