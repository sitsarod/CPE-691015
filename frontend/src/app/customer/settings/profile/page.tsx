"use client";

import React, { useEffect, useState } from 'react';
import Button from '@/components/Button';
import InputField from '@/components/InputField';
import SelectField from '@/components/SelectField';
import AvatarUploader from '@/components/AvatarUploader';
import {
  getUserProfileAPI,
  updateUserProfileAPI,
  UserProfileResponseDTO
} from '@/services/userAPI';

export default function EditForm() {
  const [userId, setUserId] = useState<number | null>(null);
  const [profilePicture, setProfilePicture] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    nickname: "",
    gender: "",
    birthDate: "",
    email: "",
    phoneNumber: "",
    lineId: "",
    facebook: "",
    parentEmail: "",
    parentPhoneNumber: ""
  });

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setIsLoading(true);
        const storedUserId = localStorage.getItem("user_id");

        if (!storedUserId) {
          setErrorMsg("ไม่พบข้อมูลผู้ใช้งาน กรุณาล็อกอินใหม่อีกครั้ง");
          return;
        }

        const id = parseInt(storedUserId, 10);
        setUserId(id);

        const profile: UserProfileResponseDTO = await getUserProfileAPI(id);

        setProfilePicture(profile.profile_picture || "");
        setFormData({
          firstName: profile.firstName || "",
          lastName: profile.lastName || "",
          nickname: profile.nickname || "",
          gender: profile.gender || "",
          birthDate: profile.birthDate ? profile.birthDate.split("T")[0] : "",
          email: profile.email || "",
          phoneNumber: profile.phoneNumber || "",
          lineId: profile.lineId || "",
          facebook: profile.facebook || "",
          parentEmail: profile.parentEmail || "",
          parentPhoneNumber: profile.parentPhoneNumber || ""
        });
      } catch (err: any) {
        setErrorMsg(err.message || "ไม่สามารถดึงข้อมูลโปรไฟล์ได้");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // อัปโหลดรูปสำเร็จ → บันทึก URL ลงโปรไฟล์ทันที
  const handleAvatarUploaded = async (url: string) => {
    if (!userId) return;
    try {
      await updateUserProfileAPI(userId, { profile_picture: url });
      setProfilePicture(url);
    } catch (err: any) {
      setErrorMsg(err.message || "บันทึกรูปโปรไฟล์ไม่สำเร็จ");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    try {
      setIsSaving(true);
      setErrorMsg("");

      // ไม่ส่ง email มาแล้ว เพราะ backend ถอดออกจาก UpdateProfileInput
      // ถ้ายังส่งอยู่จะถูกทิ้งเงียบ ๆ ทำให้เข้าใจผิดว่าบันทึกสำเร็จ
      await updateUserProfileAPI(userId, {
        phoneNumber: formData.phoneNumber,
        lineId: formData.lineId,
        facebook: formData.facebook,
        parentEmail: formData.parentEmail,
        parentPhoneNumber: formData.parentPhoneNumber,
      });

      window.history.back();
    } catch (err: any) {
      setErrorMsg(err.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-6 md:p-12 text-center text-gray-500 font-medium">
        กำลังโหลดข้อมูลโปรไฟล์จากระบบ...
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 md:p-12 overflow-y-auto max-w-4xl">
      <h1 className="text-2xl font-black mb-8">Edit profile</h1>

      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-medium">
          {errorMsg}
        </div>
      )}

      {/* Profile Header — อัปโหลดรูปโปรไฟล์ขึ้น Cloudinary */}
      <div className="w-full bg-white p-4 md:p-6 rounded-2xl border border-gray-200 flex items-center gap-5 mb-8 shadow-xs">
        <AvatarUploader
          currentUrl={profilePicture}
          initials={(formData.firstName?.[0] || formData.nickname?.[0] || "?").toUpperCase()}
          folder="profile"
          disabled={userId === null}
          onUploaded={handleAvatarUploaded}
        />
        <div className="min-w-0">
          <p className="font-bold text-gray-900 truncate">
            {[formData.firstName, formData.lastName].filter(Boolean).join(" ") || "ผู้เรียน"}
          </p>
          {formData.nickname && <p className="text-sm text-gray-500 truncate">({formData.nickname})</p>}
        </div>
      </div>

      <form onSubmit={handleSave} className="flex flex-row flex-wrap w-full gap-y-5 text-left bg-white">
        
        {/* (ReadOnly) */}
        <InputField 
          label="ชื่อ" name="firstName" value={formData.firstName} readOnly disabled 
          containerClassName="w-full sm:w-[calc(50%-0.75rem)] mr-auto" 
        />
        <InputField 
          label="นามสกุล" name="lastName" value={formData.lastName} readOnly disabled 
          containerClassName="w-full sm:w-[calc(50%-0.75rem)]" 
        />
        <InputField 
          label="ชื่อเล่น" name="nickname" value={formData.nickname} readOnly disabled 
          containerClassName="w-full sm:w-[calc(50%-0.75rem)] mr-auto" 
        />
        <SelectField 
          label="เพศ" name="gender" value={formData.gender} disabled 
          containerClassName="w-full sm:w-[calc(50%-0.75rem)]" 
          options={[{ label: "ชาย", value: "male" }, { label: "หญิง", value: "female" }]} 
        />
        <InputField 
          label="วันเกิด" name="birthDate" type="date" value={formData.birthDate} readOnly disabled 
        />

        {/*
          อีเมลแก้เองไม่ได้ เพราะเป็นชื่อผู้ใช้ที่ใช้ล็อกอินและเป็นปลายทางของการกู้รหัสผ่าน
          ถ้าเปลี่ยนเองได้ ใครที่ยึด session ไปได้จะยึดบัญชีถาวรทันที
          ต้องแจ้งแอดมินให้เปลี่ยนให้หลังตรวจหลักฐานแทน
        */}
        <InputField
          label="อีเมล (แจ้งแอดมินเพื่อเปลี่ยน)" name="email" type="email" value={formData.email}
          readOnly disabled
        />
        <InputField 
          label="หมายเลขโทรศัพท์มือถือ" name="phoneNumber" type="text" value={formData.phoneNumber} required 
          onChange={handleChange} placeholder="ระบุหมายเลขโทรศัพท์มือถือ" 
        />
        <InputField
          label="Line ID (ถ้ามี)" name="lineId" type="text" value={formData.lineId}
          onChange={handleChange} placeholder="ระบุ Line ID"
        />
        <InputField
          label="Facebook (ถ้ามี)" name="facebook" type="text" value={formData.facebook}
          onChange={handleChange} placeholder="ระบุชื่อ/ลิงก์ Facebook"
        />
        <InputField
          label="อีเมลผู้ปกครอง (ถ้ามี)" name="parentEmail" type="email" value={formData.parentEmail}
          onChange={handleChange} placeholder="ระบุอีเมลผู้ปกครอง" 
        />
        <InputField 
          label="หมายเลขโทรศัพท์ผู้ปกครอง (ถ้ามี)" name="parentPhoneNumber" type="text" value={formData.parentPhoneNumber} 
          onChange={handleChange} placeholder="ระบุหมายเลขโทรศัพท์ผู้ปกครอง" 
        />

        <div className="flex flex-row gap-3 pt-6 border-t border-gray-200 justify-end w-full mt-4">
          <Button 
            variant="outline" type="button" onClick={() => window.history.back()} disabled={isSaving}
            className="bg-transparent border border-gray-300 hover:bg-gray-50 text-gray-700"
          >
            ยกเลิก
          </Button>
          <Button 
            variant="primary" type="submit" disabled={isSaving}
            className="bg-[#3B82F6] hover:bg-blue-700 text-white shadow-xs"
          >
            {isSaving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
          </Button>
        </div>

      </form>
    </div>
  );
}