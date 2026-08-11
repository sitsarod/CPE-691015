import { Loader2 } from "lucide-react";
import Modal from "@/components/Modal";
import InputField from "@/components/InputField";
import SelectField from "@/components/SelectField";
import { CreateUserInput } from "@/services/userAPI";
import { FormError, BRAND } from "@/components/admin/ManagementUI";
import Button from "@/components/Button";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  createForm: CreateUserInput;
  setCreateForm: (form: CreateUserInput) => void;
  formError: string | null;
  isSubmitting: boolean;
  onCreate: () => void;
}

export function CreateMemberModal({ isOpen, onClose, createForm, setCreateForm, formError, isSubmitting, onCreate }: Props) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="เพิ่มสมาชิกใหม่"
      subtitle="สร้างบัญชีผู้ใช้ใหม่เข้าสู่ระบบ"
      footer={
        <>
          <Button onClick={onClose} disabled={isSubmitting} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            ยกเลิก
          </Button>
          <Button onClick={onCreate} disabled={isSubmitting} style={{ backgroundColor: BRAND }} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white hover:brightness-95 disabled:opacity-50">
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            สร้างผู้ใช้
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {formError && <FormError message={formError} />}
        <SelectField
          label="บทบาท (Role)"
          required
          value={createForm.role}
          onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as CreateUserInput["role"] })}
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
        <InputField label="อีเมล (@gmail.com)" type="email" required value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
        <InputField label="รหัสผ่าน" type="password" required value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} placeholder="อย่างน้อย 6 ตัวอักษร" />
      </div>
    </Modal>
  );
}