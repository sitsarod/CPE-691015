import React from "react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import InputField from "@/components/InputField";
import SelectField from "@/components/SelectField";
import { FormError, DetailItem } from "@/components/admin/ManagementUI";
import { CoachProfile, COACH_LEVEL_OPTIONS, COACH_LICENSE_OPTIONS, COACH_PAYMENT_TYPE_OPTIONS, CoachPaymentType } from "@/types/coach";
import { formatDate } from "@/lib/format";

// ข้อมูลที่แก้ไขได้ (ผ่าน PATCH /coaches/:id + /coaches/:id/level)
export interface EditCoachForm {
  nickname: string;
  phone: string;
  lineId: string;   // ไม่บังคับ
  facebook: string; // ไม่บังคับ
  address: string;
  bank_account: string;
  payment_info: string;
  specialization: string;
  coach_license: string;
  payment_type: CoachPaymentType;
  pay_rate: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editForm: EditCoachForm;
  setEditForm: React.Dispatch<React.SetStateAction<EditCoachForm>>;
  detail: CoachProfile | null; // ข้อมูลระบุตัวตน (แสดงอย่างเดียว)
  formError: string | null;
  isSubmitting: boolean;
  onSave: () => void;
}

export function EditCoachModal({
  isOpen, onClose, editForm, setEditForm, detail, formError, isSubmitting, onSave,
}: Props) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="แก้ไขข้อมูลโค้ช"
      subtitle="ปรับปรุงข้อมูลโปรไฟล์โค้ช"
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>ยกเลิก</Button>
          <Button variant="primary" onClick={onSave} disabled={isSubmitting} className="bg-[#E63946] hover:bg-[#d62839]">
            {isSubmitting ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {formError && <FormError message={formError} />}

        {/* ข้อมูลระบุตัวตน — แก้ไขไม่ได้ในหน้านี้ */}
        {detail && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="mb-2 text-xs font-semibold text-gray-500">ข้อมูลระบุตัวตน (แก้ไขไม่ได้ในหน้านี้)</p>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <DetailItem label="ชื่อ - นามสกุล" value={`${detail.first_name} ${detail.last_name}`} />
              <DetailItem label="อีเมล" value={detail.email} />
              <DetailItem label="เลขบัตรประชาชน" value={detail.uid} />
              <DetailItem label="วันเกิด" value={formatDate(detail.birth_date)} />
            </dl>
          </div>
        )}

        {/* ข้อมูลที่แก้ไขได้ */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField label="ชื่อเล่น" required value={editForm.nickname} onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })} />
          <InputField
            label="เบอร์โทรศัพท์ (10 หลัก)" required inputMode="numeric" maxLength={10}
            value={editForm.phone}
            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField label="Line ID (ถ้ามี)" value={editForm.lineId} onChange={(e) => setEditForm({ ...editForm, lineId: e.target.value })} />
          <InputField label="Facebook (ถ้ามี)" value={editForm.facebook} onChange={(e) => setEditForm({ ...editForm, facebook: e.target.value })} />
        </div>
        <InputField label="ที่อยู่" required value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField label="เลขบัญชีธนาคาร" required value={editForm.bank_account} onChange={(e) => setEditForm({ ...editForm, bank_account: e.target.value })} />
          <InputField label="ข้อมูลการจ่ายเงิน" required value={editForm.payment_info} onChange={(e) => setEditForm({ ...editForm, payment_info: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="ระดับฝีมือ"
            required
            options={COACH_LEVEL_OPTIONS}
            value={editForm.specialization}
            onChange={(e) => setEditForm({ ...editForm, specialization: e.target.value })}
          />
          <SelectField
            label="ใบรับรองผู้ฝึกสอน"
            required
            options={COACH_LICENSE_OPTIONS}
            value={editForm.coach_license}
            onChange={(e) => setEditForm({ ...editForm, coach_license: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="ประเภทการจ่ายเงิน"
            required
            options={COACH_PAYMENT_TYPE_OPTIONS}
            value={editForm.payment_type}
            onChange={(e) => setEditForm({ ...editForm, payment_type: e.target.value as CoachPaymentType })}
          />
          <InputField
            label={editForm.payment_type === "monthly" ? "ค่าจ้างต่อเดือน (บาท)" : "ค่าจ้างต่อครั้ง (บาท)"}
            type="number"
            required
            value={editForm.pay_rate || ""}
            onChange={(e) => setEditForm({ ...editForm, pay_rate: Number(e.target.value) })}
          />
        </div>
      </div>
    </Modal>
  );
}
