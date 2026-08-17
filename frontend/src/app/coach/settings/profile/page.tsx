"use client";

import React, { useEffect, useState } from "react";
import Button from "@/components/Button";
import InputField from "@/components/InputField";
import { getMyCoachProfileAPI, updateCoachAPI } from "@/services/coachAPI";
import { CoachProfile } from "@/types/coach";
import CoachBankAccountCard from "@/components/settings/CoachBankAccountCard";

/**
 * หน้าให้โค้ชแก้ข้อมูลของตัวเอง
 *
 * ตามนโยบายของทีม เจ้าตัวแก้ได้เฉพาะ "ช่องทางติดต่อ" ที่เปลี่ยนบ่อยและความเสี่ยงต่ำ
 * (เบอร์โทร Line Facebook ที่อยู่) ส่วนข้อมูลตัวตนต้องส่งหลักฐาน
 * ให้แอดมินตรวจแล้วแก้ให้ผ่านหน้าจัดการสมาชิก
 *
 * ข้อยกเว้นคือบัญชีรับเงิน — โค้ชแก้เองได้ แต่ต้องยืนยันรหัสผ่านก่อน
 * จึงแยกไปอยู่ใน CoachBankAccountCard ที่มีปุ่มบันทึกของตัวเอง
 *
 * ช่องที่ล็อกไว้ยังแสดงอยู่ (ไม่ซ่อน) เพื่อให้โค้ชเห็นว่าระบบเก็บอะไรของตัวเองไว้บ้าง
 * และรู้ว่าถ้าผิดต้องไปแจ้งใคร — ตรงกับชุดฟิลด์ใน UpdateCoachRequest ฝั่ง backend
 */
export default function CoachEditProfilePage() {
  const [coachId, setCoachId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // ค่าที่แก้ไม่ได้ เก็บแยกไว้อ่านอย่างเดียว จะได้ไม่หลุดไปอยู่ใน payload ตอนบันทึก
  const [readOnlyData, setReadOnlyData] = useState({
    firstName: "",
    lastName: "",
    nickname: "",
    email: "",
    uid: "",
    birthDate: "",
    specialization: "",
    coachLicense: "",
  });

  // แยกจาก readOnlyData เพราะสองช่องนี้แก้เองได้ แต่ต้องยืนยันรหัสผ่านก่อน
  // จึงมีการ์ดของตัวเองอยู่ท้ายหน้า ไม่ปนกับฟอร์มช่องทางติดต่อ
  const [bank, setBank] = useState({ account: "", info: "" });

  const [formData, setFormData] = useState({
    phone: "",
    lineId: "",
    facebook: "",
    address: "",
  });

  useEffect(() => {
    getMyCoachProfileAPI()
      .then((profile: CoachProfile) => {
        setCoachId(profile.id);
        setReadOnlyData({
          firstName: profile.first_name || "",
          lastName: profile.last_name || "",
          nickname: profile.nickname || "",
          email: profile.email || "",
          uid: profile.uid || "",
          birthDate: profile.birth_date ? profile.birth_date.split("T")[0] : "",
          specialization: profile.specialization || "",
          coachLicense: profile.coach_license || "",
        });
        setBank({
          account: profile.bank_account || "",
          info: profile.payment_info || "",
        });
        setFormData({
          phone: profile.phone || "",
          lineId: profile.lineId || "",
          facebook: profile.facebook || "",
          address: profile.address || "",
        });
      })
      .catch((err: unknown) =>
        setErrorMsg(err instanceof Error ? err.message : "ไม่สามารถดึงข้อมูลโปรไฟล์โค้ชได้")
      )
      .finally(() => setIsLoading(false));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coachId) return;

    setErrorMsg("");
    setSuccessMsg("");

    if (formData.phone.length !== 10) {
      setErrorMsg("กรุณาระบุหมายเลขโทรศัพท์ให้ครบ 10 หลัก");
      return;
    }

    try {
      setIsSaving(true);
      await updateCoachAPI(coachId, {
        phone: formData.phone,
        lineId: formData.lineId,
        facebook: formData.facebook,
        address: formData.address,
      });
      setSuccessMsg("บันทึกข้อมูลเรียบร้อยแล้ว");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-[50vh] flex items-center justify-center text-gray-500 font-medium">
        กำลังโหลดข้อมูลโปรไฟล์...
      </div>
    );
  }

  // ตัว wrapper หน้า (sidebar + padding) มาจาก layout ของ /coach/settings แล้ว
  // ที่นี่จึงเรนเดอร์แค่เนื้อหา เหมือนหน้าตั้งค่าฝั่งผู้เรียน
  return (
    <div className="max-w-4xl">
      <div>
        <h1 className="text-2xl font-black mb-2">แก้ไขโปรไฟล์</h1>
        <p className="text-sm text-gray-500 mb-8">
          แก้ได้เองเฉพาะช่องทางติดต่อและบัญชีรับเงิน ส่วนข้อมูลตัวตนต้องส่งหลักฐานให้แอดมินแก้ให้
        </p>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-medium">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm font-medium">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSave} noValidate className="flex flex-row flex-wrap w-full gap-y-5 text-left">

          {/* ── ข้อมูลที่แก้เองไม่ได้ ── */}
          <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            ช่องที่เป็นสีเทาแก้เองไม่ได้ ถ้าข้อมูลไม่ถูกต้อง กรุณาส่งหลักฐานให้แอดมินแก้ให้
          </div>

          <InputField
            label="ชื่อ" name="firstName" value={readOnlyData.firstName} readOnly disabled
            containerClassName="w-full sm:w-[calc(50%-0.75rem)] mr-auto"
          />
          <InputField
            label="นามสกุล" name="lastName" value={readOnlyData.lastName} readOnly disabled
            containerClassName="w-full sm:w-[calc(50%-0.75rem)]"
          />
          <InputField
            label="ชื่อเล่น" name="nickname" value={readOnlyData.nickname} readOnly disabled
            containerClassName="w-full sm:w-[calc(50%-0.75rem)] mr-auto"
          />
          <InputField
            label="วันเกิด" name="birthDate" type="date" value={readOnlyData.birthDate} readOnly disabled
            containerClassName="w-full sm:w-[calc(50%-0.75rem)]"
          />
          <InputField
            label="เลขบัตรประชาชน" name="uid" value={readOnlyData.uid} readOnly disabled
            containerClassName="w-full sm:w-[calc(50%-0.75rem)] mr-auto"
          />
          {/*
            อีเมลแก้เองไม่ได้ เพราะเป็นชื่อผู้ใช้ที่ใช้ล็อกอินและเป็นปลายทางกู้รหัสผ่าน
            ถ้าเปลี่ยนเองได้ ใครที่ยึด session ไปได้จะยึดบัญชีถาวรทันที
          */}
          <InputField
            label="อีเมล (ใช้ล็อกอิน)" name="email" type="email" value={readOnlyData.email} readOnly disabled
            containerClassName="w-full sm:w-[calc(50%-0.75rem)]"
          />
          <InputField
            label="ระดับฝีมือ" name="specialization" value={readOnlyData.specialization} readOnly disabled
            containerClassName="w-full sm:w-[calc(50%-0.75rem)] mr-auto"
          />
          <InputField
            label="ใบรับรองผู้ฝึกสอน" name="coachLicense" value={readOnlyData.coachLicense} readOnly disabled
            containerClassName="w-full sm:w-[calc(50%-0.75rem)]"
          />
          {/* ── ช่องทางติดต่อ (แก้เองได้) ── */}
          <div className="w-full pt-4 mt-2 border-t border-gray-200">
            <h2 className="text-sm font-bold text-gray-900">ช่องทางติดต่อ</h2>
            <p className="text-xs text-gray-500 mt-1">ส่วนนี้แก้ไขได้เองทันที ไม่ต้องแจ้งแอดมิน</p>
          </div>

          <InputField
            label="หมายเลขโทรศัพท์ (10 หลัก)" name="phone" inputMode="numeric" maxLength={10} required
            value={formData.phone}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))
            }
            placeholder="ระบุหมายเลขโทรศัพท์"
            containerClassName="w-full sm:w-[calc(50%-0.75rem)] mr-auto"
          />
          <InputField
            label="Line ID (ถ้ามี)" name="lineId" value={formData.lineId}
            onChange={handleChange} placeholder="ระบุ Line ID"
            containerClassName="w-full sm:w-[calc(50%-0.75rem)]"
          />
          <InputField
            label="Facebook (ถ้ามี)" name="facebook" value={formData.facebook}
            onChange={handleChange} placeholder="ระบุชื่อ/ลิงก์ Facebook"
          />
          <InputField
            label="ที่อยู่" name="address" value={formData.address}
            onChange={handleChange} placeholder="ระบุที่อยู่"
          />

          <div className="flex flex-row gap-3 pt-6 border-t border-gray-200 justify-end w-full mt-4">
            <Button
              variant="outline" type="button" onClick={() => window.history.back()} disabled={isSaving}
            >
              ยกเลิก
            </Button>
            <Button
              variant="primary" type="submit" disabled={isSaving}
              className="bg-[#E63946] hover:bg-[#d62839]"
            >
              {isSaving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
            </Button>
          </div>

        </form>

        {/*
          บัญชีรับเงินอยู่นอกฟอร์มด้านบนโดยตั้งใจ และมีปุ่มบันทึกของตัวเอง
          เพราะต้องยืนยันรหัสผ่านก่อนบันทึก ถ้าเอาไปรวมในฟอร์มเดียวกัน
          การแก้เบอร์โทรเฉย ๆ ก็จะต้องกรอกรหัสผ่านตามไปด้วยทุกครั้ง
        */}
        {coachId !== null && (
          <div className="mt-10">
            <CoachBankAccountCard
              coachId={coachId}
              initialBankAccount={bank.account}
              initialPaymentInfo={bank.info}
            />
          </div>
        )}
      </div>
    </div>
  );
}
