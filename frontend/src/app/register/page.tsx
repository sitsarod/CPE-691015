// frontend/src/app/register/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation"; 
import Button from "@/components/Button";
import { apiFetch } from "@/services/apiClient"; 
import { registerAPI } from "@/services/authAPI";

interface RegisterResponse {
  token: string;
  user: {
    id: number;
    role: string;
    firstName: string;
    email: string;
  };
  customer: {
    nickname: string;
    qrImage: string;
  };
}

export default function RegisterPage() {
  const router = useRouter(); 
  const [errorMsg, setErrorMsg] = useState(""); 
  const [isLoading, setIsLoading] = useState(false);


  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    nickname: "",
    gender: "",
    birthDate: "",
    email: "",
    password: "",
    confirmPassword: "",
    phoneNumber: "",
    parentEmail: "",
    parentPhoneNumber: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (formData.password !== formData.confirmPassword) {
      setErrorMsg("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกันคัป");
      return;
    }

    setIsLoading(true);


    const payload = {
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
        parentEmail: formData.parentEmail || null,
        parentPhoneNumber: formData.parentPhoneNumber || null,
      }
    };

    try {

      const data = await registerAPI(payload);


      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.user.role);
      localStorage.setItem("firstName", data.user.firstName);
      localStorage.setItem("email", data.user.email);
      localStorage.setItem("user_id", data.user.id.toString());
      if (data.customer?.qrImage) {
        localStorage.setItem("qrImage", data.customer.qrImage);
      }
      
      router.push("/login");
      router.refresh();
    } catch (err: any) {
      setErrorMsg(err.message || "เกิดข้อผิดพลาดในการลงทะเบียน");
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
          <div className="w-full p-4 mb-6 text-sm text-red-600 bg-red-50 rounded-xl font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-row flex-wrap w-full gap-y-5 text-left">
          
          <div className="w-full sm:w-[calc(50%-0.75rem)] mr-auto flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">ชื่อ</label>
            <input name="firstName" type="text" required onChange={handleChange} placeholder="ชื่อจริง" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base" />
          </div>

          <div className="w-full sm:w-[calc(50%-0.75rem)] flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">นามสกุล</label>
            <input name="lastName" type="text" required onChange={handleChange} placeholder="นามสกุล" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base" />
          </div>

          <div className="w-full sm:w-[calc(50%-0.75rem)] mr-auto flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">ชื่อเล่น</label>
            <input name="nickname" type="text" required onChange={handleChange} placeholder="ชื่อเล่น" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base" />
          </div>

          <div className="w-full sm:w-[calc(50%-0.75rem)] flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">เพศ</label>
            <select name="gender" required onChange={handleChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base">
              <option value="">เลือกเพศของคุณ</option>
              <option value="male">ชาย</option>
              <option value="female">หญิง</option>
            </select>
          </div>

          <div className="w-full flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">วันเกิด</label>
            <input name="birthDate" type="date" required onChange={handleChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl" />
          </div>

          <div className="w-full flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">อีเมล</label>
            <input name="email" type="email" required onChange={handleChange} placeholder="ระบุอีเมล" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base" />
          </div>

          <div className="w-full sm:w-[calc(50%-0.75rem)] mr-auto flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">รหัสผ่าน</label>
            <input name="password" type="password" required onChange={handleChange} placeholder="รหัสผ่าน" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base" />
          </div>

          <div className="w-full sm:w-[calc(50%-0.75rem)] flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">ยืนยันรหัสผ่าน</label>
            <input name="confirmPassword" type="password" required onChange={handleChange} placeholder="ยืนยันรหัสผ่าน" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base" />
          </div>

          <div className="w-full flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">หมายเลขโทรศัพท์มือถือ</label>
            <input name="phoneNumber" type="text" required onChange={handleChange} placeholder="ระบุหมายเลขโทรศัพท์มือถือ" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base" />
          </div>

          <div className="w-full flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">อีเมลผู้ปกครอง (ถ้ามี)</label>
            <input name="parentEmail" type="email" onChange={handleChange} placeholder="ระบุอีเมลผู้ปกครอง" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base" />
          </div>

          <div className="w-full flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">หมายเลขโทรศัพท์ผู้ปกครอง (ถ้ามี)</label>
            <input name="parentPhoneNumber" type="text" onChange={handleChange} placeholder="ระบุหมายเลขโทรศัพท์ผู้ปกครอง" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base" />
          </div>

          <div className="flex justify-end space-x-3 w-full mt-6 pt-4 border-t border-gray-100">
            <Button variant="outline" type="button" onClick={() => window.history.back()}>
              ยกเลิก
            </Button>
            <Button  variant="primary" type="submit" disabled={isLoading}>
              {isLoading ? "กำลังสร้างบัญชี..." : "สร้างบัญชีใหม่"}
            </Button>
          </div>

        </form>
      </div>
    </div>
  );
}