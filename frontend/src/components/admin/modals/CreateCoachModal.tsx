import React from "react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import InputField from "@/components/InputField";
import { CreateCoachInput } from "@/services/coachAPI";
import { FormError } from "@/components/admin/ManagementUI";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  createForm: CreateCoachInput;
  setCreateForm: React.Dispatch<React.SetStateAction<CreateCoachInput>>;
  formError: string | null;
  isSubmitting: boolean;
  onCreate: () => void;
}

export function CreateCoachModal({
  isOpen, onClose, createForm, setCreateForm, formError, isSubmitting, onCreate
}: Props) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="เพิ่มโค้ชใหม่"
      subtitle="สร้างโปรไฟล์โค้ชจากผู้ใช้ที่มีบทบาท coach อยู่แล้ว"
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>ยกเลิก</Button>
          <Button variant="primary" onClick={onCreate} disabled={isSubmitting} className="bg-[#E63946] hover:bg-[#d62839]">
            {isSubmitting ? "กำลังสร้าง..." : "สร้างโค้ช"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {formError && <FormError message={formError} />}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          หมายเหตุ: ต้องสร้างบัญชีผู้ใช้ที่มีบทบาท (role) เป็น <b>coach</b> ก่อนในหน้า &quot;จัดการสมาชิก&quot; แล้วนำ User ID มากรอกที่นี่
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField label="User ID" type="number" required value={createForm.user_id || ""} onChange={(e) => setCreateForm({ ...createForm, user_id: Number(e.target.value) })} />
          <InputField label="ชื่อเล่น" required value={createForm.nickname} onChange={(e) => setCreateForm({ ...createForm, nickname: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField label="เบอร์โทรศัพท์" required value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} />
          <InputField label="เลขบัตรประชาชน (UID)" required value={createForm.uid} onChange={(e) => setCreateForm({ ...createForm, uid: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField label="วันเกิด" type="date" required value={createForm.birth_date} onChange={(e) => setCreateForm({ ...createForm, birth_date: e.target.value })} />
          <InputField label="ระดับ / ความเชี่ยวชาญ" required value={createForm.specialization} onChange={(e) => setCreateForm({ ...createForm, specialization: e.target.value })} />
        </div>
        <InputField label="ที่อยู่" required value={createForm.address} onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })} />
        <InputField label="รูปโปรไฟล์ (URL)" required value={createForm.profile_picture} onChange={(e) => setCreateForm({ ...createForm, profile_picture: e.target.value })} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField label="เลขบัญชีธนาคาร" required value={createForm.bank_account} onChange={(e) => setCreateForm({ ...createForm, bank_account: e.target.value })} />
          <InputField label="ข้อมูลการจ่ายเงิน" required value={createForm.payment_info} onChange={(e) => setCreateForm({ ...createForm, payment_info: e.target.value })} />
        </div>
        <InputField label="ค่าจ้างต่อครั้ง (บาท)" type="number" required value={createForm.pay_rate_per_session || ""} onChange={(e) => setCreateForm({ ...createForm, pay_rate_per_session: Number(e.target.value) })} />
      </div>
    </Modal>
  );
}