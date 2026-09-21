"use client";

import { useState } from "react";
import { useRouter } from "next/navigation"; 
import Button from "@/components/Button";
import InputField from "@/components/InputField";
import SelectField from "@/components/SelectField";
import DateField, { maxDateForMinAge } from "@/components/DateField";
import { registerAPI } from "@/services/authAPI";

export default function RegisterPage() {
  const router = useRouter(); 
  const [errorMsg, setErrorMsg] = useState(""); 
  const [errors, setErrors] = useState<Record<string, string>>({}); 
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "", lastName: "", nickname: "", gender: "", birthDate: "",
    email: "", password: "", confirmPassword: "", phoneNumber: "",
    lineId: "", facebook: "",
    parentEmail: "", parentPhoneNumber: "",
  });

  const maxBirthDate = maxDateForMinAge(3);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // ตัดอักขระที่ไม่ใช่ตัวเลขทิ้งทันทีที่พิมพ์
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 10);
    setFormData({ ...formData, [e.target.name]: digitsOnly });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setErrors({});

    const newErrors: Record<string, string> = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(formData.email)) {
      newErrors.email = "กรุณาระบุรูปแบบอีเมลให้ถูกต้อง";
    }

    if (formData.parentEmail && !emailRegex.test(formData.parentEmail)) {
      newErrors.parentEmail = "กรุณาระบุรูปแบบอีเมลผู้ปกครองให้ถูกต้อง";
    }

    // ⚠️ สองด่านนี้นับคนละหน่วย ให้ตรงกับ services.ValidatePasswordStrength ฝั่ง backend
    //
    //   ขั้นต่ำ นับเป็นตัวอักษร — เป็นกติกาที่สื่อกับผู้ใช้
    //   เพดาน  นับเป็นไบต์     — เป็นข้อจำกัดจริงของ bcrypt (ไทย 1 ตัว = 3 ไบต์)
    //
    // เดิมใช้ .length ทั้งสองด่าน ทำให้รหัสผ่านภาษาไทย 30 ตัว (90 ไบต์)
    // ผ่านหน้าเว็บไปได้ แล้วไปโดนเซิร์ฟเวอร์ปฏิเสธ ผู้ใช้จะงงว่าทำตามที่บอกแล้วทำไมไม่ผ่าน
    if ([...formData.password].length < 8) {
      newErrors.password = "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร";
    } else if (new TextEncoder().encode(formData.password).length > 72) {
      newErrors.password = "รหัสผ่านยาวเกินไป (ภาษาอังกฤษไม่เกิน 72 ตัว หรือภาษาไทยไม่เกิน 24 ตัว)";
    } else if (!/\d/.test(formData.password)) {
      newErrors.password = "รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว";
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน";
    }

    if (!/^0\d{9}$/.test(formData.phoneNumber)) {
      newErrors.phoneNumber = "กรุณาระบุหมายเลขโทรศัพท์มือถือให้ครบ 10 หลัก ขึ้นต้นด้วย 0";
    }

    if (formData.parentPhoneNumber && !/^0\d{9}$/.test(formData.parentPhoneNumber)) {
      newErrors.parentPhoneNumber = "กรุณาระบุหมายเลขโทรศัพท์ให้ครบ 10 หลัก ขึ้นต้นด้วย 0";
    }

    if (formData.birthDate) {
      const birthDate = new Date(formData.birthDate);
      const now = new Date();
      const minBirthDate = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());

      if (birthDate > now) {
        newErrors.birthDate = "วันเกิดต้องไม่ใช่วันที่ในอนาคต";
      } else if (birthDate > minBirthDate) {
        newErrors.birthDate = "อายุต้องไม่ต่ำกว่า 3 ปี";
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);

    try {
      await registerAPI({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        role: "customer",
        customer: {
          nickname: formData.nickname,
          gender: formData.gender,
          birthDate: formData.birthDate ? new Date(formData.birthDate).toISOString() : null,
          phoneNumber: formData.phoneNumber,
          lineId: formData.lineId || "",
          facebook: formData.facebook || "",
          parentEmail: formData.parentEmail || null,
          parentPhoneNumber: formData.parentPhoneNumber || null,
        }
      });

      // ยังเข้าระบบไม่ได้ทันที — ต้องยืนยันอีเมลด้วย OTP ที่ส่งไปให้ก่อน
      router.push(`/register/verify?email=${encodeURIComponent(formData.email)}`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการลงทะเบียน");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-96px)] bg-white flex items-center justify-center p-4 md:p-8">
      <div className="bg-white w-full max-w-3xl">
        
        <h1 className="text-3xl font-bold text-gray-900 mb-2">KOYAMA</h1>
        <p className="text-sm text-gray-500 mb-8">สร้างบัญชีใหม่เพื่อเริ่มต้นใช้งานระบบของคุณ</p>

        {errorMsg && (
          <div className="w-full p-4 mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="flex flex-row flex-wrap w-full gap-y-5 text-left">
          
          <InputField 
            label="ชื่อ" name="firstName" placeholder="ชื่อจริง" required onChange={handleChange} 
            error={errors.firstName} containerClassName="w-full sm:w-[calc(50%-0.75rem)] mr-auto" 
          />

          <InputField 
            label="นามสกุล" name="lastName" placeholder="นามสกุล" required onChange={handleChange} 
            error={errors.lastName} containerClassName="w-full sm:w-[calc(50%-0.75rem)]" 
          />

          <InputField 
            label="ชื่อเล่น" name="nickname" placeholder="ชื่อเล่น" required onChange={handleChange} 
            error={errors.nickname} containerClassName="w-full sm:w-[calc(50%-0.75rem)] mr-auto" 
          />

          <SelectField 
            label="เพศ" name="gender" required onChange={handleChange} 
            error={errors.gender} containerClassName="w-full sm:w-[calc(50%-0.75rem)]" 
            options={[{ label: "ชาย", value: "male" }, { label: "หญิง", value: "female" }]} 
          />

          <DateField
            label="วันเกิด" name="birthDate" required
            value={formData.birthDate}
            onChange={(val) => setFormData({ ...formData, birthDate: val })}
            max={maxBirthDate} error={errors.birthDate}
          />

          <InputField 
            label="อีเมล" name="email" type="email" placeholder="ระบุอีเมล" required onChange={handleChange} 
            error={errors.email} 
          />

          <InputField 
            label="รหัสผ่าน" name="password" type="password" placeholder="รหัสผ่าน" required onChange={handleChange} 
            error={errors.password} containerClassName="w-full sm:w-[calc(50%-0.75rem)] mr-auto" 
          />

          <InputField 
            label="ยืนยันรหัสผ่าน" name="confirmPassword" type="password" placeholder="ยืนยันรหัสผ่าน" required onChange={handleChange} 
            error={errors.confirmPassword} containerClassName="w-full sm:w-[calc(50%-0.75rem)]" 
          />

          <InputField
            label="หมายเลขโทรศัพท์มือถือ" name="phoneNumber" placeholder="ระบุหมายเลขโทรศัพท์มือถือ (10 หลัก ขึ้นต้นด้วย 0)"
            inputMode="numeric" maxLength={10} value={formData.phoneNumber}
            required onChange={handlePhoneChange}
            error={errors.phoneNumber}
          />

          <InputField
            label="Line ID (ถ้ามี)" name="lineId" placeholder="ระบุ Line ID" onChange={handleChange}
            error={errors.lineId} containerClassName="w-full sm:w-[calc(50%-0.75rem)] mr-auto"
          />

          <InputField
            label="Facebook (ถ้ามี)" name="facebook" placeholder="ระบุชื่อ/ลิงก์ Facebook" onChange={handleChange}
            error={errors.facebook} containerClassName="w-full sm:w-[calc(50%-0.75rem)]"
          />

          <InputField
            label="อีเมลผู้ปกครอง (ถ้ามี)" name="parentEmail" type="email" placeholder="ระบุอีเมลผู้ปกครอง" onChange={handleChange}
            error={errors.parentEmail}
          />

          <InputField
            label="หมายเลขโทรศัพท์ผู้ปกครอง (ถ้ามี)" name="parentPhoneNumber" placeholder="ระบุหมายเลขโทรศัพท์ผู้ปกครอง (10 หลัก ขึ้นต้นด้วย 0)"
            inputMode="numeric" maxLength={10} value={formData.parentPhoneNumber}
            onChange={handlePhoneChange}
            error={errors.parentPhoneNumber}
          />

          <div className="flex justify-end space-x-3 w-full mt-6 pt-4 border-t border-gray-100">
            <Button variant="outline" type="button" onClick={() => window.history.back()}>
              ยกเลิก
            </Button>
            <Button variant="primary" type="submit" disabled={isLoading}>
              {isLoading ? "กำลังสร้างบัญชี..." : "สร้างบัญชีใหม่"}
            </Button>
          </div>

        </form>
      </div>
    </div>
  );
}