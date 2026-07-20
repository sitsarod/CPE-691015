"use client";

import React, { useEffect, useState } from 'react';
import Button from '@/components/Button';

export default function EditForm() {
  const [formData, setFormData] = useState({
    firstName: "นักเรียน",
    lastName: "",
    nickname: "",
    gender: "",
    birthDate: "",
    email: "",
    password: "",
    confirmPassword: "",
    phoneNumber: "",
    parentEmail: "",
    parentPhoneNumber: ""
  });

  useEffect(() => {
    const savedData: Partial<typeof formData> = {};
    const keys = Object.keys(formData) as Array<keyof typeof formData>;
    
    keys.forEach(key => {
      const value = localStorage.getItem(key);
      if (value) savedData[key] = value;
    });

    setFormData(prev => ({ ...prev, ...savedData }));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password && formData.password !== formData.confirmPassword) {
      alert("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกันคัป!");
      return;
    }
    Object.entries(formData).forEach(([key, value]) => {
      localStorage.setItem(key, value);
    });
    alert("บันทึกข้อมูลเรียบร้อยแล้วคัป!");
    window.history.back(); 
  };

  return (
    <div className="flex-1 p-6 md:p-12 overflow-y-auto max-w-4xl">
      <h1 className="text-2xl font-black mb-8">Edit profile</h1>

      {/* ส่วนแสดงรูปโปรไฟล์เดิม */}
      <div className="w-full bg-white p-4 md:p-6 rounded-2xl border border-gray-200 flex items-center justify-between mb-8 shadow-xs">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 border border-gray-200 flex-shrink-0">
            <img src="/slide3.jpg" alt="Avatar" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-base text-gray-900 truncate">{formData.firstName}</h3>
          </div>
        </div>
        <Button 
          variant="primary" 
          type="button" 
          onClick={() => alert("ระบบอัปโหลดรูปภาพกำลังมาคัป")}
          className="!w-fit flex-shrink-0 px-5 py-2 rounded-lg bg-[#CC0000] text-white font-bold hover:bg-red-700 transition-colors"
        >
          Change photo
        </Button>
      </div>


      <form onSubmit={handleSave} className="flex flex-row flex-wrap w-full gap-y-5 text-left bg-white">
        
        {/* ชื่อจริง */}
        <div className="w-full sm:w-[calc(50%-0.75rem)] mr-auto flex flex-col space-y-1.5">
          <label className="text-sm font-semibold text-gray-700">ชื่อ</label>
          <input name="firstName" type="text" required value={formData.firstName} onChange={handleChange} placeholder="ชื่อจริง" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base bg-white text-gray-900" />
        </div>

        {/* นามสกุล */}
        <div className="w-full sm:w-[calc(50%-0.75rem)] flex flex-col space-y-1.5">
          <label className="text-sm font-semibold text-gray-700">นามสกุล</label>
          <input name="lastName" type="text" required value={formData.lastName} onChange={handleChange} placeholder="นามสกุล" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base bg-white text-gray-900" />
        </div>

        {/* ชื่อเล่น */}
        <div className="w-full sm:w-[calc(50%-0.75rem)] mr-auto flex flex-col space-y-1.5">
          <label className="text-sm font-semibold text-gray-700">ชื่อเล่น</label>
          <input name="nickname" type="text" required value={formData.nickname} onChange={handleChange} placeholder="ชื่อเล่น" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base bg-white text-gray-900" />
        </div>

        {/* เพศ */}
        <div className="w-full sm:w-[calc(50%-0.75rem)] flex flex-col space-y-1.5">
          <label className="text-sm font-semibold text-gray-700">เพศ</label>
          <select name="gender" required value={formData.gender} onChange={handleChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base bg-white text-gray-900">
            <option value="">เลือกเพศของคุณ</option>
            <option value="male">ชาย</option>
            <option value="female">หญิง</option>
          </select>
        </div>

        {/* วันเกิด */}
        <div className="w-full flex flex-col space-y-1.5">
          <label className="text-sm font-semibold text-gray-700">วันเกิด</label>
          <input name="birthDate" type="date" required value={formData.birthDate} onChange={handleChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white text-gray-900" />
        </div>

        {/* อีเมล */}
        <div className="w-full flex flex-col space-y-1.5">
          <label className="text-sm font-semibold text-gray-700">อีเมล</label>
          <input name="email" type="email" required value={formData.email} onChange={handleChange} placeholder="ระบุอีเมล" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base bg-white text-gray-900" />
        </div>

        {/* หมายเลขโทรศัพท์มือถือ */}
        <div className="w-full flex flex-col space-y-1.5">
          <label className="text-sm font-semibold text-gray-700">หมายเลขโทรศัพท์มือถือ</label>
          <input name="phoneNumber" type="text" required value={formData.phoneNumber} onChange={handleChange} placeholder="ระบุหมายเลขโทรศัพท์มือถือ" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base bg-white text-gray-900" />
        </div>

        {/* อีเมลผู้ปกครอง */}
        <div className="w-full flex flex-col space-y-1.5">
          <label className="text-sm font-semibold text-gray-700">อีเมลผู้ปกครอง (ถ้ามี)</label>
          <input name="parentEmail" type="email" value={formData.parentEmail} onChange={handleChange} placeholder="ระบุอีเมลผู้ปกครอง" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base bg-white text-gray-900" />
        </div>

        {/* หมายเลขโทรศัพท์ผู้ปกครอง */}
        <div className="w-full flex flex-col space-y-1.5">
          <label className="text-sm font-semibold text-gray-700">หมายเลขโทรศัพท์ผู้ปกครอง (ถ้ามี)</label>
          <input name="parentPhoneNumber" type="text" value={formData.parentPhoneNumber} onChange={handleChange} placeholder="ระบุหมายเลขโทรศัพท์ผู้ปกครอง" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base bg-white text-gray-900" />
        </div>

        {/* กลุ่มปุ่มกดยืนยันบันทึกข้อมูล */}
        <div className="flex flex-row gap-3 pt-6 border-t border-gray-200 justify-end w-full mt-4">
          <Button variant="outline" type="button" onClick={() => window.history.back()} className="bg-transparent border border-gray-300 hover:bg-gray-50 text-gray-700">
            ยกเลิก
          </Button>
          <Button variant="primary" type="submit" className="bg-[#3B82F6] hover:bg-blue-700 text-white shadow-xs">
            บันทึกข้อมูล
          </Button>
        </div>

      </form>
    </div>
  );
}