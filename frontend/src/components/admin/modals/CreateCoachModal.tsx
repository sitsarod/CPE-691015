import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import InputField from "@/components/InputField";
import SelectField from "@/components/SelectField";
import { CreateCoachInput, getAllCoachesAPI } from "@/services/coachAPI";
import { getAllUsersAPI } from "@/services/userAPI";
import { FormError } from "@/components/admin/ManagementUI";
import { COACH_LEVEL_OPTIONS, COACH_LICENSE_OPTIONS, COACH_PAYMENT_TYPE_OPTIONS, CoachPaymentType } from "@/types/coach";

// ตัวเลือกผู้ใช้ที่ยังว่าง (role = coach และยังไม่มีโปรไฟล์โค้ช)
interface AvailableUser {
  id: number;
  label: string;
}

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
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // โหลดรายชื่อผู้ใช้ที่มี role = coach และยังไม่มีโปรไฟล์โค้ช ตอนเปิด modal
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    (async () => {
      setLoadingUsers(true);
      try {
        const [users, coaches] = await Promise.all([getAllUsersAPI(), getAllCoachesAPI()]);
        const takenUserIds = new Set(coaches.map((c) => c.user_id));
        const available = users
          .filter((u) => u.role === "coach" && !takenUserIds.has(u.id))
          .map((u) => ({
            id: u.id,
            label: `${u.firstName} ${u.lastName} (${u.email})`,
          }));
        if (active) setAvailableUsers(available);
      } catch {
        if (active) setAvailableUsers([]);
      } finally {
        if (active) setLoadingUsers(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isOpen]);

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
          หมายเหตุ: เลือกผู้ใช้ที่มีบทบาท (role) เป็น <b>coach</b> จากรายการด้านล่าง (แสดงเฉพาะคนที่ยังไม่มีโปรไฟล์โค้ช) — ถ้าไม่มีให้สร้างบัญชี coach ในหน้า &quot;จัดการสมาชิก&quot; ก่อน
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="w-full flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">
              ผู้ใช้ (coach) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                required
                value={createForm.user_id || ""}
                onChange={(e) => setCreateForm({ ...createForm, user_id: Number(e.target.value) })}
                disabled={loadingUsers}
                className="w-full appearance-none px-4 py-3 pr-11 border rounded-xl text-base bg-white text-gray-900 border-gray-200 focus:outline-none focus:border-orange-primary disabled:bg-gray-100 disabled:text-gray-500 cursor-pointer transition-colors"
              >
                <option value="" disabled>
                  {loadingUsers ? "กำลังโหลดรายชื่อ..." : "-- เลือกผู้ใช้ --"}
                </option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-5 h-5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
          <InputField label="ชื่อเล่น" required value={createForm.nickname} onChange={(e) => setCreateForm({ ...createForm, nickname: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField label="เบอร์โทรศัพท์ (10 หลัก)" required inputMode="numeric" maxLength={10} value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} />
          <InputField label="เลขบัตรประชาชน (13 หลัก)" required inputMode="numeric" maxLength={13} value={createForm.uid} onChange={(e) => setCreateForm({ ...createForm, uid: e.target.value.replace(/\D/g, "").slice(0, 13) })} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField label="วันเกิด" type="date" required value={createForm.birth_date} onChange={(e) => setCreateForm({ ...createForm, birth_date: e.target.value })} />
          <SelectField
            label="ระดับฝีมือ"
            required
            options={COACH_LEVEL_OPTIONS}
            value={createForm.specialization}
            onChange={(e) => setCreateForm({ ...createForm, specialization: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="ใบรับรองผู้ฝึกสอน"
            required
            options={COACH_LICENSE_OPTIONS}
            value={createForm.coach_license}
            onChange={(e) => setCreateForm({ ...createForm, coach_license: e.target.value })}
          />
          <InputField label="ที่อยู่" required value={createForm.address} onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField label="Line ID (ถ้ามี)" value={createForm.lineId ?? ""} onChange={(e) => setCreateForm({ ...createForm, lineId: e.target.value })} />
          <InputField label="Facebook (ถ้ามี)" value={createForm.facebook ?? ""} onChange={(e) => setCreateForm({ ...createForm, facebook: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField label="เลขบัญชีธนาคาร" required value={createForm.bank_account} onChange={(e) => setCreateForm({ ...createForm, bank_account: e.target.value })} />
          <InputField label="ข้อมูลการจ่ายเงิน" required value={createForm.payment_info} onChange={(e) => setCreateForm({ ...createForm, payment_info: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="ประเภทการจ่ายเงิน"
            required
            options={COACH_PAYMENT_TYPE_OPTIONS}
            value={createForm.payment_type}
            onChange={(e) => setCreateForm({ ...createForm, payment_type: e.target.value as CoachPaymentType })}
          />
          <InputField
            label={createForm.payment_type === "monthly" ? "ค่าจ้างต่อเดือน (บาท)" : "ค่าจ้างต่อครั้ง (บาท)"}
            type="number"
            required
            value={createForm.pay_rate || ""}
            onChange={(e) => setCreateForm({ ...createForm, pay_rate: Number(e.target.value) })}
          />
        </div>
      </div>
    </Modal>
  );
}