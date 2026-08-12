import React from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import { AdminUserDetail } from "@/services/userAPI";
import { DetailItem, RoleBadge, StatusPill, normalizeRole, isActive, BRAND } from "@/components/admin/ManagementUI";

const GENDER_LABEL: Record<string, string> = { male: "ชาย", female: "หญิง" };

const CONSENT_LABEL: Record<string, string> = {
  unknown: "ยังไม่เคยถาม",
  granted: "ยินยอม",
  declined: "ปฏิเสธ",
  withdrawn: "ถอนความยินยอมแล้ว",
};

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  per_session: "รายครั้ง",
  monthly: "รายเดือน",
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  detail: AdminUserDetail | null;
  isLoadingDetail: boolean;
  onEdit?: () => void;
}

/**
 * แสดงข้อมูลสมาชิกแบบเต็ม โดยส่วนล่างเปลี่ยนตามบทบาท
 *
 * ใช้ข้อมูลจาก GET /admin/users/:id ซึ่งคืนโปรไฟล์มาเป็นก้อนแยกตามบทบาท
 * component จึงเช็คแค่ว่ามีก้อนไหนมา ไม่ต้องเดาจาก role
 */
export function ViewMemberModal({ isOpen, onClose, detail, isLoadingDetail, onEdit }: Props) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="รายละเอียดสมาชิก"
      maxWidth="max-w-3xl"
      footer={
        // เรียงแบบเดียวกับโมดัลอื่นในระบบ: ปุ่มถอยอยู่ซ้าย ปุ่มที่ต้องการให้กดอยู่ขวา
        // เพราะนิ้วโป้งอยู่ฝั่งขวาเวลาถือมือถือ และตาไล่จากซ้ายไปขวาจบที่ปุ่มหลัก
        <>
          <Button variant="outline" onClick={onClose}>ปิด</Button>
          {onEdit && detail && (
            <Button variant="primary" onClick={onEdit} className="bg-[#E63946] hover:bg-[#d62839]">
              แก้ไขข้อมูล
            </Button>
          )}
        </>
      }
    >
      {isLoadingDetail ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: BRAND }} />
        </div>
      ) : detail ? (
        <div className="space-y-6">
          {/* ── หัวข้อ ── */}
          <div>
            <div className="font-bold text-gray-900">
              {detail.firstName} {detail.lastName}
              {detail.customer?.nickname && (
                <span className="ml-2 font-normal text-gray-500">({detail.customer.nickname})</span>
              )}
              {detail.coach?.nickname && (
                <span className="ml-2 font-normal text-gray-500">({detail.coach.nickname})</span>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <RoleBadge role={normalizeRole(detail.role)} />
              {detail.customer && (
                <StatusPill active={isActive(detail.customer.status)} status={detail.customer.status} />
              )}
            </div>
          </div>

          {/* ── ข้อมูลบัญชี ── */}
          <section>
            <h3 className="mb-3 text-xs font-bold text-gray-500">ข้อมูลบัญชี</h3>
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <DetailItem label="รหัสสมาชิก" value={String(detail.id)} />
              <DetailItem label="อีเมล" value={detail.email} />
              <DetailItem label="วันที่สมัคร" value={detail.createdAt} />
            </dl>
          </section>

          {/* ── โปรไฟล์ผู้เรียน ── */}
          {detail.customer && (
            <section>
              <h3 className="mb-3 text-xs font-bold text-gray-500">ข้อมูลผู้เรียน</h3>
              <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <DetailItem label="ชื่อเล่น" value={detail.customer.nickname} />
                <DetailItem label="เพศ" value={GENDER_LABEL[detail.customer.gender] ?? "-"} />
                <DetailItem label="วันเกิด" value={detail.customer.birthDate} />
                <DetailItem label="เบอร์โทรศัพท์" value={detail.customer.phoneNumber} />
                <DetailItem label="Line ID" value={detail.customer.lineId} />
                <DetailItem label="Facebook" value={detail.customer.facebook} />
                <DetailItem label="อีเมลผู้ปกครอง" value={detail.customer.parentEmail} />
                <DetailItem label="เบอร์ผู้ปกครอง" value={detail.customer.parentPhoneNumber} />
                <DetailItem
                  label="ความยินยอมเก็บข้อมูลใบหน้า"
                  value={CONSENT_LABEL[detail.customer.faceConsentStatus] ?? detail.customer.faceConsentStatus}
                />
              </dl>
            </section>
          )}

          {/* ── โปรไฟล์โค้ช ── */}
          {detail.coach && (
            <section>
              <h3 className="mb-3 text-xs font-bold text-gray-500">ข้อมูลโค้ช</h3>
              <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <DetailItem label="ชื่อเล่น" value={detail.coach.nickname} />
                <DetailItem label="เบอร์โทรศัพท์" value={detail.coach.phone} />
                <DetailItem label="เลขบัตรประชาชน" value={detail.coach.uid} />
                <DetailItem label="วันเกิด" value={detail.coach.birth_date} />
                <DetailItem label="Line ID" value={detail.coach.lineId} />
                <DetailItem label="Facebook" value={detail.coach.facebook} />
                <DetailItem label="ที่อยู่" value={detail.coach.address} />
                <DetailItem label="ระดับฝีมือ" value={detail.coach.specialization} />
                <DetailItem label="ใบรับรองผู้ฝึกสอน" value={detail.coach.coach_license} />
                <DetailItem label="เลขบัญชีธนาคาร" value={detail.coach.bank_account} />
                <DetailItem label="ข้อมูลการจ่ายเงิน" value={detail.coach.payment_info} />
                <DetailItem
                  label="ประเภทการจ่ายเงิน"
                  value={PAYMENT_TYPE_LABEL[detail.coach.payment_type] ?? "-"}
                />
                <DetailItem
                  label={detail.coach.payment_type === "monthly" ? "ค่าจ้างต่อเดือน" : "ค่าจ้างต่อครั้ง"}
                  value={detail.coach.pay_rate != null ? `${detail.coach.pay_rate.toLocaleString()} บาท` : "-"}
                />
              </dl>
            </section>
          )}

          {detail.role === "admin" && (
            <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
              บัญชีแอดมินไม่มีโปรไฟล์ผู้เรียนหรือโค้ช
            </p>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
