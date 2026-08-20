import Modal from "@/components/Modal";
import InputField from "@/components/InputField";
import SelectField from "@/components/SelectField";
import { AdminCreateUserInput } from "@/services/userAPI";
import { COACH_LEVEL_OPTIONS, COACH_LICENSE_OPTIONS, COACH_PAYMENT_TYPE_OPTIONS, BANK_OPTIONS } from "@/types/coach";
import { FormError } from "@/components/admin/ManagementUI";
import Button from "@/components/Button";

/**
 * ฟอร์มสร้างสมาชิกที่ช่องเปลี่ยนตามบทบาทที่เลือก
 *
 * เจตนา: หน้าจัดการสมาชิกเป็น "ที่เดียว" ที่สร้างบัญชีได้ทุกบทบาท
 * เดิมการเพิ่มโค้ชต้องสร้าง user ที่นี่ก่อน แล้วไปผูกโปรไฟล์ที่หน้าจัดการโค้ชอีกที
 * ซึ่งเป็นสองขั้นตอนแยกกัน ถ้าขั้นที่สองไม่ได้ทำจะเหลือบัญชีที่ใช้งานจริงไม่ได้
 *
 * ตอนนี้กรอกทีเดียวจบ แล้วเซิร์ฟเวอร์เขียนลงฐานในทรานแซกชันเดียว
 */
interface Props {
  isOpen: boolean;
  onClose: () => void;
  createForm: AdminCreateUserInput;
  setCreateForm: (form: AdminCreateUserInput) => void;
  formError: string | null;
  isSubmitting: boolean;
  onCreate: () => void;
}

export function CreateMemberModal({
  isOpen, onClose, createForm, setCreateForm, formError, isSubmitting, onCreate,
}: Props) {
  const role = createForm.role;

  // helper ย่อ ๆ กันเขียน setCreateForm({ ...createForm, customer: { ...createForm.customer, x } }) ซ้ำทุกช่อง
  const setCustomer = (patch: Partial<NonNullable<AdminCreateUserInput["customer"]>>) =>
    setCreateForm({
      ...createForm,
      customer: { ...(createForm.customer ?? emptyCustomer), ...patch },
    });

  const setCoach = (patch: Partial<NonNullable<AdminCreateUserInput["coach"]>>) =>
    setCreateForm({
      ...createForm,
      coach: { ...(createForm.coach ?? emptyCoach), ...patch },
    });

  const customer = createForm.customer ?? emptyCustomer;
  const coach = createForm.coach ?? emptyCoach;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="เพิ่มสมาชิกใหม่"
      subtitle="สร้างบัญชีพร้อมข้อมูลโปรไฟล์ในขั้นตอนเดียว"
      maxWidth="max-w-3xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>ยกเลิก</Button>
          <Button variant="primary" onClick={onCreate} disabled={isSubmitting} className="bg-[#E63946] hover:bg-[#d62839]">
            {isSubmitting ? "กำลังสร้าง..." : "สร้างสมาชิก"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {formError && <FormError message={formError} />}

        {/* ── ข้อมูลบัญชี (ทุกบทบาทต้องมี) ── */}
        <SelectField
          label="บทบาท (Role)"
          required
          value={role}
          onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as AdminCreateUserInput["role"] })}
          options={[
            { label: "สมาชิก (Customer)", value: "customer" },
            { label: "โค้ช (Coach)", value: "coach" },
            { label: "แอดมิน (Admin)", value: "admin" },
          ]}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField label="ชื่อ" required value={createForm.firstName} onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })} />
          <InputField label="นามสกุล" required value={createForm.lastName} onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* บัญชีแอดมินควรใช้อีเมลที่เปิดไว้เป็นของโรงเรียน (เช่น koyama@gmail.com)
              ไม่ใช่อีเมลส่วนตัวของพนักงาน เพราะพอคนนั้นลาออก บัญชีจะติดตัวเขาไปด้วย
              เป็นแนวปฏิบัติ ไม่ได้บังคับในโค้ด จึงบอกไว้ตรงนี้ให้คนกรอกเห็น */}
          <InputField
            label={role === "admin" ? "อีเมล (ใช้อีเมลกลางของโรงเรียน ไม่ใช่อีเมลส่วนตัว)" : "อีเมล"}
            type="email" required value={createForm.email}
            onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
          />
          <InputField label="รหัสผ่าน" type="password" required value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} placeholder="อย่างน้อย 8 ตัวอักษร" />
        </div>

        {/* ── โปรไฟล์ผู้เรียน ── */}
        {role === "customer" && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
            <p className="text-xs font-bold text-gray-500">ข้อมูลผู้เรียน</p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField label="ชื่อเล่น" required value={customer.nickname} onChange={(e) => setCustomer({ nickname: e.target.value })} />
              <SelectField
                label="เพศ" required value={customer.gender}
                onChange={(e) => setCustomer({ gender: e.target.value })}
                options={[{ label: "ชาย", value: "male" }, { label: "หญิง", value: "female" }]}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField
                label="วันเกิด" type="date" required
                value={customer.birthDate ? customer.birthDate.slice(0, 10) : ""}
                onChange={(e) => setCustomer({ birthDate: e.target.value || null })}
              />
              <InputField
                label="เบอร์โทรศัพท์ (10 หลัก)" required inputMode="numeric" maxLength={10}
                value={customer.phoneNumber}
                onChange={(e) => setCustomer({ phoneNumber: e.target.value.replace(/\D/g, "").slice(0, 10) })}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField label="Line ID (ถ้ามี)" value={customer.lineId ?? ""} onChange={(e) => setCustomer({ lineId: e.target.value })} />
              <InputField label="Facebook (ถ้ามี)" value={customer.facebook ?? ""} onChange={(e) => setCustomer({ facebook: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField label="อีเมลผู้ปกครอง (ถ้ามี)" type="email" value={customer.parentEmail ?? ""} onChange={(e) => setCustomer({ parentEmail: e.target.value })} />
              <InputField
                label="เบอร์ผู้ปกครอง (ถ้ามี)" inputMode="numeric" maxLength={10}
                value={customer.parentPhoneNumber ?? ""}
                onChange={(e) => setCustomer({ parentPhoneNumber: e.target.value.replace(/\D/g, "").slice(0, 10) })}
              />
            </div>
          </div>
        )}

        {/* ── โปรไฟล์โค้ช ── */}
        {role === "coach" && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
            <p className="text-xs font-bold text-gray-500">ข้อมูลโค้ช</p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField label="ชื่อเล่น" required value={coach.nickname} onChange={(e) => setCoach({ nickname: e.target.value })} />
              <InputField
                label="เบอร์โทรศัพท์ (10 หลัก)" required inputMode="numeric" maxLength={10}
                value={coach.phone}
                onChange={(e) => setCoach({ phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField
                label="เลขบัตรประชาชน (13 หลัก)" required inputMode="numeric" maxLength={13}
                value={coach.uid}
                onChange={(e) => setCoach({ uid: e.target.value.replace(/\D/g, "").slice(0, 13) })}
              />
              <InputField label="วันเกิด" type="date" required value={coach.birth_date} onChange={(e) => setCoach({ birth_date: e.target.value })} />
            </div>
            <InputField label="ที่อยู่" required value={coach.address} onChange={(e) => setCoach({ address: e.target.value })} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField label="Line ID (ถ้ามี)" value={coach.lineId ?? ""} onChange={(e) => setCoach({ lineId: e.target.value })} />
              <InputField label="Facebook (ถ้ามี)" value={coach.facebook ?? ""} onChange={(e) => setCoach({ facebook: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField label="ระดับฝีมือ" required options={COACH_LEVEL_OPTIONS} value={coach.specialization} onChange={(e) => setCoach({ specialization: e.target.value })} />
              <SelectField label="ใบรับรองผู้ฝึกสอน" required options={COACH_LICENSE_OPTIONS} value={coach.coach_license} onChange={(e) => setCoach({ coach_license: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField label="ธนาคาร" required options={BANK_OPTIONS} value={coach.bank_account} onChange={(e) => setCoach({ bank_account: e.target.value })} />
              <InputField label="เลขบัญชี" required inputMode="numeric" value={coach.payment_info} onChange={(e) => setCoach({ payment_info: e.target.value.replace(/[^\d]/g, "") })} />
            </div>
            <InputField label="พร้อมเพย์" required inputMode="numeric" value={coach.prompt_pay ?? ""} onChange={(e) => setCoach({ prompt_pay: e.target.value.replace(/[^\d]/g, "") })} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField label="ประเภทการจ่ายเงิน" required options={COACH_PAYMENT_TYPE_OPTIONS} value={coach.payment_type} onChange={(e) => setCoach({ payment_type: e.target.value })} />
              <InputField
                label={coach.payment_type === "monthly" ? "ค่าจ้างต่อเดือน (บาท)" : "ค่าจ้างต่อครั้ง (บาท)"}
                type="number" required
                value={coach.pay_rate || ""}
                onChange={(e) => setCoach({ pay_rate: Number(e.target.value) })}
              />
            </div>
            <InputField label="รูปโปรไฟล์ (URL, ถ้ามี)" value={coach.profile_picture ?? ""} onChange={(e) => setCoach({ profile_picture: e.target.value })} />
          </div>
        )}

        {role === "admin" && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500">
            บัญชีแอดมินไม่ต้องกรอกข้อมูลโปรไฟล์เพิ่ม เพราะไม่ได้เข้าเรียนและไม่ได้เช็กชื่อเข้างาน
          </div>
        )}
      </div>
    </Modal>
  );
}

/** ค่าเริ่มต้นของโปรไฟล์แต่ละแบบ — export ให้หน้าที่เรียกใช้ reset ฟอร์มได้ด้วยค่าเดียวกัน */
export const emptyCustomer: NonNullable<AdminCreateUserInput["customer"]> = {
  nickname: "", gender: "", birthDate: null, phoneNumber: "",
  lineId: "", facebook: "", parentEmail: "", parentPhoneNumber: "",
};

export const emptyCoach: NonNullable<AdminCreateUserInput["coach"]> = {
  nickname: "", phone: "", uid: "", birth_date: "", address: "",
  specialization: "", coach_license: "", bank_account: "", payment_info: "", prompt_pay: "",
  payment_type: "per_session", pay_rate: 0,
  lineId: "", facebook: "", profile_picture: "",
};
