import Modal from "@/components/Modal";
import InputField from "@/components/InputField";
import SelectField from "@/components/SelectField";
import DateField, { maxDateForMinAge } from "@/components/DateField";
import Button from "@/components/Button";
import { AdminUpdateUserInput } from "@/services/userAPI";
import { COACH_LEVEL_OPTIONS, COACH_LICENSE_OPTIONS, COACH_PAYMENT_TYPE_OPTIONS, BANK_OPTIONS } from "@/types/coach";
import { FormError, DetailItem } from "@/components/admin/ManagementUI";

/**
 * ฟอร์มให้แอดมินแก้ข้อมูลสมาชิก
 *
 * ตามนโยบายของทีม เจ้าตัวแก้เองได้เฉพาะช่องทางติดต่อ ส่วนข้อมูลตัวตนและการเงิน
 * (ชื่อ อีเมล วันเกิด เลขบัตร บัญชีธนาคาร) ต้องให้แอดมินแก้หลังตรวจหลักฐาน
 * ซึ่งส่งกันนอกระบบ — หน้านี้จึงเป็นที่เดียวที่แก้ของพวกนั้นได้
 *
 * ไม่มีช่องรหัสผ่านและบทบาทโดยตั้งใจ:
 *   - รหัสผ่านต้องมี flow ยืนยันตัวตนของตัวเอง
 *   - เปลี่ยนบทบาทแล้วโปรไฟล์เดิมจะกลายเป็นข้อมูลกำพร้า
 */
interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** บทบาทของคนที่กำลังแก้ ใช้เลือกว่าจะโชว์ช่องกลุ่มไหน */
  role: string;
  editForm: AdminUpdateUserInput;
  setEditForm: (form: AdminUpdateUserInput) => void;
  formError: string | null;
  isSubmitting: boolean;
  onSave: () => void;
  /** รหัสประจำตัว (แสดงอย่างเดียว) — ส่งมาจากข้อมูลสมาชิกที่โหลดไว้ */
  memberCode?: string;
}

export function EditMemberModal({
  isOpen, onClose, role, editForm, setEditForm, formError, isSubmitting, onSave, memberCode,
}: Props) {
  const customer = editForm.customer ?? {};
  const coach = editForm.coach ?? {};

  const setCustomer = (patch: Partial<NonNullable<AdminUpdateUserInput["customer"]>>) =>
    setEditForm({ ...editForm, customer: { ...customer, ...patch } });

  const setCoach = (patch: Partial<NonNullable<AdminUpdateUserInput["coach"]>>) =>
    setEditForm({ ...editForm, coach: { ...coach, ...patch } });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="แก้ไขข้อมูลสมาชิก"
      subtitle="ข้อมูลตัวตนและการเงินควรแก้หลังตรวจหลักฐานจากเจ้าตัวแล้ว"
      maxWidth="max-w-3xl"
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

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          การเปลี่ยนชื่อ อีเมล วันเกิด เลขบัตรประชาชน หรือเลขบัญชีธนาคาร
          ควรทำต่อเมื่อได้ตรวจหลักฐานจากเจ้าของบัญชีแล้วเท่านั้น
        </div>

        {/* ── ข้อมูลบัญชี ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField label="ชื่อ" value={editForm.firstName ?? ""} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} />
          <InputField label="นามสกุล" value={editForm.lastName ?? ""} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} />
        </div>
        <InputField label="อีเมล (ใช้ล็อกอิน)" type="email" value={editForm.email ?? ""} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />

        {/* ── โปรไฟล์ผู้เรียน ── */}
        {role === "customer" && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
            <p className="text-xs font-bold text-gray-500">ข้อมูลผู้เรียน</p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField label="ชื่อเล่น" value={customer.nickname ?? ""} onChange={(e) => setCustomer({ nickname: e.target.value })} />
              <SelectField
                label="เพศ" value={customer.gender ?? ""}
                onChange={(e) => setCustomer({ gender: e.target.value })}
                options={[{ label: "ชาย", value: "male" }, { label: "หญิง", value: "female" }]}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DateField
                label="วันเกิด"
                value={customer.birthDate ? customer.birthDate.slice(0, 10) : ""}
                onChange={(val) => setCustomer({ birthDate: val })}
                max={maxDateForMinAge(3)}
              />
              <InputField
                label="เบอร์โทรศัพท์ (10 หลัก)" inputMode="numeric" maxLength={10}
                value={customer.phoneNumber ?? ""}
                onChange={(e) => setCustomer({ phoneNumber: e.target.value.replace(/\D/g, "").slice(0, 10) })}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField label="Line ID" value={customer.lineId ?? ""} onChange={(e) => setCustomer({ lineId: e.target.value })} />
              <InputField label="Facebook" value={customer.facebook ?? ""} onChange={(e) => setCustomer({ facebook: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField label="อีเมลผู้ปกครอง" type="email" value={customer.parentEmail ?? ""} onChange={(e) => setCustomer({ parentEmail: e.target.value })} />
              <InputField
                label="เบอร์ผู้ปกครอง" inputMode="numeric" maxLength={10}
                value={customer.parentPhoneNumber ?? ""}
                onChange={(e) => setCustomer({ parentPhoneNumber: e.target.value.replace(/\D/g, "").slice(0, 10) })}
              />
            </div>
            <SelectField
              label="สถานะ" value={customer.status ?? ""}
              onChange={(e) => setCustomer({ status: e.target.value })}
              options={[{ label: "ใช้งานอยู่", value: "active" }, { label: "พักการใช้งาน", value: "inactive" }]}
            />
          </div>
        )}

        {/* ── โปรไฟล์โค้ช ── */}
        {role === "coach" && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
            <p className="text-xs font-bold text-gray-500">ข้อมูลโค้ช</p>

            {/* รหัสประจำตัว — แสดงอย่างเดียว แก้ไม่ได้ */}
            {memberCode && (
              <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 w-fit">
                <DetailItem label="รหัสประจำตัว" value={memberCode} />
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField label="ชื่อเล่น" value={coach.nickname ?? ""} onChange={(e) => setCoach({ nickname: e.target.value })} />
              <InputField
                label="เบอร์โทรศัพท์ (10 หลัก)" inputMode="numeric" maxLength={10}
                value={coach.phone ?? ""}
                onChange={(e) => setCoach({ phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField
                label="เลขบัตรประชาชน (13 หลัก)" inputMode="numeric" maxLength={13}
                value={coach.uid ?? ""}
                onChange={(e) => setCoach({ uid: e.target.value.replace(/\D/g, "").slice(0, 13) })}
              />
              <DateField label="วันเกิด" value={coach.birth_date ?? ""} onChange={(val) => setCoach({ birth_date: val })} />
            </div>
            <InputField label="ที่อยู่" value={coach.address ?? ""} onChange={(e) => setCoach({ address: e.target.value })} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField label="Line ID" value={coach.lineId ?? ""} onChange={(e) => setCoach({ lineId: e.target.value })} />
              <InputField label="Facebook" value={coach.facebook ?? ""} onChange={(e) => setCoach({ facebook: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField label="ระดับฝีมือ" options={COACH_LEVEL_OPTIONS} value={coach.specialization ?? ""} onChange={(e) => setCoach({ specialization: e.target.value })} />
              <SelectField label="ใบรับรองผู้ฝึกสอน" options={COACH_LICENSE_OPTIONS} value={coach.coach_license ?? ""} onChange={(e) => setCoach({ coach_license: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField label="ธนาคาร" options={BANK_OPTIONS} value={coach.bank_account ?? ""} onChange={(e) => setCoach({ bank_account: e.target.value })} />
              <InputField label="เลขบัญชี" inputMode="numeric" value={coach.payment_info ?? ""} onChange={(e) => setCoach({ payment_info: e.target.value.replace(/[^\d]/g, "") })} />
            </div>
            <InputField label="พร้อมเพย์" inputMode="numeric" value={coach.prompt_pay ?? ""} onChange={(e) => setCoach({ prompt_pay: e.target.value.replace(/[^\d]/g, "") })} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField label="ประเภทการจ่ายเงิน" options={COACH_PAYMENT_TYPE_OPTIONS} value={coach.payment_type ?? ""} onChange={(e) => setCoach({ payment_type: e.target.value })} />
              <InputField
                label={coach.payment_type === "monthly" ? "ค่าจ้างต่อเดือน (บาท)" : "ค่าจ้างต่อครั้ง (บาท)"}
                type="number"
                value={coach.pay_rate || ""}
                onChange={(e) => setCoach({ pay_rate: Number(e.target.value) })}
              />
            </div>
          </div>
        )}

        {role === "admin" && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500">
            บัญชีแอดมินแก้ได้เฉพาะชื่อและอีเมล
          </div>
        )}
      </div>
    </Modal>
  );
}
