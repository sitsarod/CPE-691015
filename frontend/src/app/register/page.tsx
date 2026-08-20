"use client";

import { useState } from "react";
import { useRouter } from "next/navigation"; 
import Button from "@/components/Button";
import InputField from "@/components/InputField";
import SelectField from "@/components/SelectField";
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
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

    // เกณฑ์ต้องตรงกับฝั่ง backend (dto.RegisterRequest + services.ValidatePasswordStrength)
    // ถ้าไม่ตรงกัน ผู้ใช้จะกดสมัครแล้วเจอ error จากเซิร์ฟเวอร์ทีหลังโดยไม่รู้สาเหตุ
    if (formData.password.length < 8) {
      newErrors.password = "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร";
    } else if (formData.password.length > 72) {
      // 72 คือเพดานของ bcrypt ที่ backend ใช้ ถ้าเกินจะถูกตัดทิ้งเงียบ ๆ
      newErrors.password = "รหัสผ่านต้องไม่เกิน 72 ตัวอักษร";
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน";
    }

    if (formData.phoneNumber.length !== 10) {
      newErrors.phoneNumber = "กรุณาระบุหมายเลขโทรศัพท์มือถือให้ครบ 10 หลัก";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);

    try {
      const data = await registerAPI({
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

      localStorage.setItem("token", data.token);
      if (data.refreshToken) localStorage.setItem("refresh_token", data.refreshToken);
      localStorage.setItem("role", data.user.role);
      localStorage.setItem("firstName", data.user.firstName);
      localStorage.setItem("email", data.user.email);
      localStorage.setItem("user_id", data.user.id.toString());
      if (data.customer?.qrImage) localStorage.setItem("qrImage", data.customer.qrImage);
      
      router.push("/login");
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการลงทะเบียน");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-96px)] bg-gray-50 flex items-center justify-center p-4 md:p-8">
      <div className="bg-white w-full max-w-3xl p-8 md:p-12 rounded-3xl shadow-md">
        
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

          <InputField 
            label="วันเกิด" name="birthDate" type="date" required onChange={handleChange} 
            error={errors.birthDate} 
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
            label="หมายเลขโทรศัพท์มือถือ" name="phoneNumber" placeholder="ระบุหมายเลขโทรศัพท์มือถือ (10 หลัก)" required onChange={handleChange} 
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
            label="หมายเลขโทรศัพท์ผู้ปกครอง (ถ้ามี)" name="parentPhoneNumber" placeholder="ระบุหมายเลขโทรศัพท์ผู้ปกครอง" onChange={handleChange} 
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