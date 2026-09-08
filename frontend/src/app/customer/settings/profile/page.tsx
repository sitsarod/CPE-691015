"use client";

import React, { useEffect, useState } from 'react';
import { IdCard, Phone, AlertCircle } from 'lucide-react';
import Button from '@/components/Button';
import InputField from '@/components/InputField';
import AvatarUploader from '@/components/AvatarUploader';
import {
  getUserProfileAPI,
  updateUserProfileAPI,
  UserProfileResponseDTO
} from '@/services/userAPI';

const GENDER_LABEL: Record<string, string> = { male: "ชาย", female: "หญิง" };

// ช่องแสดงข้อมูลแบบอ่านอย่างเดียว (ให้ตรงกับหน้าโปรไฟล์โค้ช)
function ReadItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-2.5">
      <dt className="text-xs font-medium text-gray-400">{label}</dt>
      <dd className="text-sm font-semibold text-gray-800 mt-0.5 break-words">{value || "-"}</dd>
    </div>
  );
}

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
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "ไม่สามารถดึงข้อมูลโปรไฟล์ได้");
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
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "บันทึกรูปโปรไฟล์ไม่สำเร็จ");
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
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-[50vh] flex items-center justify-center text-gray-500 font-medium">
        กำลังโหลดข้อมูลโปรไฟล์จากระบบ...
      </div>
    );
  }

  const fullName = [formData.firstName, formData.lastName].filter(Boolean).join(" ");
  const initials = (formData.firstName?.[0] || formData.nickname?.[0] || "?").toUpperCase();

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900">แก้ไขโปรไฟล์</h1>
        <p className="text-sm text-gray-500 mt-1">
          แก้ได้เองเฉพาะช่องทางติดต่อ ส่วนข้อมูลตัวตนต้องแจ้งแอดมินเพื่อแก้ให้
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {errorMsg}
        </div>
      )}

      {/* ── การ์ดโปรไฟล์ (avatar + อัปโหลดรูป) ── */}
      <div className="rounded-2xl border border-gray-200 p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <AvatarUploader
          currentUrl={profilePicture}
          initials={initials}
          folder="profile"
          disabled={userId === null}
          onUploaded={handleAvatarUploaded}
        />
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <h2 className="text-lg font-bold text-gray-900 truncate">{fullName || "ผู้เรียน"}</h2>
          {formData.nickname && <p className="text-sm text-gray-500">({formData.nickname})</p>}
        </div>
      </div>

      {/* ── ข้อมูลส่วนตัว (อ่านอย่างเดียว) ── */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        <div className="p-4 sm:p-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="p-3 rounded-xl bg-gray-100 shrink-0">
              <IdCard className="w-6 h-6 text-gray-500" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900">ข้อมูลส่วนตัว</h2>
              <p className="text-sm text-gray-500 mt-1">แก้เองไม่ได้ ถ้าข้อมูลไม่ถูกต้องกรุณาแจ้งแอดมินเพื่อแก้ให้</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadItem label="ชื่อ - นามสกุล" value={fullName} />
            <ReadItem label="อีเมล (ใช้ล็อกอิน)" value={formData.email} />
            <ReadItem label="ชื่อเล่น" value={formData.nickname} />
            <ReadItem label="เพศ" value={GENDER_LABEL[formData.gender] || ""} />
            <ReadItem label="วันเกิด" value={formData.birthDate} />
          </div>
        </div>
      </div>

      {/* ── ช่องทางติดต่อ (แก้เองได้) ── */}
      <form onSubmit={handleSave} noValidate>
        <div className="rounded-2xl border border-gray-200 overflow-hidden">
          <div className="p-4 sm:p-6">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="p-3 rounded-xl bg-blue-50 shrink-0">
                <Phone className="w-6 h-6 text-[#3B82F6]" />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-gray-900">ช่องทางติดต่อ</h2>
                <p className="text-sm text-gray-500 mt-1">ส่วนนี้แก้ไขได้เองทันที ไม่ต้องแจ้งแอดมิน</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            </div>
          </div>

          <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 flex items-center justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => window.history.back()} disabled={isSaving}>
              ยกเลิก
            </Button>
            <Button
              variant="primary" type="submit" disabled={isSaving}
              className="bg-[#3B82F6] hover:bg-blue-700 text-white"
            >
              {isSaving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}