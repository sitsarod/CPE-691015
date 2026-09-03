"use client";

import React, { useEffect, useState } from "react";
import { IdCard, Phone, Landmark, CheckCircle2, AlertCircle } from "lucide-react";
import Button from "@/components/Button";
import InputField from "@/components/InputField";
import { getMyCoachProfileAPI, updateCoachAPI } from "@/services/coachAPI";
import { CoachProfile } from "@/types/coach";
import CoachBankAccountCard from "@/components/settings/CoachBankAccountCard";
import AvatarUploader from "@/components/AvatarUploader";

/**
 * หน้าให้โค้ชแก้ข้อมูลของตัวเอง (จัด UI เป็นการ์ดเป็นสัดส่วน)
 *
 * ตามนโยบายของทีม เจ้าตัวแก้ได้เฉพาะ "ช่องทางติดต่อ" ที่เปลี่ยนบ่อยและความเสี่ยงต่ำ
 * ส่วนข้อมูลตัวตนต้องส่งหลักฐานให้แอดมินแก้ให้ และบัญชีรับเงินต้องยืนยันรหัสผ่านก่อน
 */
export default function CoachEditProfilePage() {
  const [coachId, setCoachId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [profilePicture, setProfilePicture] = useState("");

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

  const [bank, setBank] = useState({ account: "", info: "", promptPay: "" });

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
        setProfilePicture(profile.profile_picture || "");
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
          promptPay: profile.prompt_pay || "",
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

  // อัปโหลดรูปสำเร็จ → บันทึก URL ลงโปรไฟล์ทันที แล้วอัปเดต avatar
  const handleAvatarUploaded = async (url: string) => {
    if (!coachId) return;
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await updateCoachAPI(coachId, { profile_picture: url });
      setProfilePicture(url);
      setSuccessMsg("เปลี่ยนรูปโปรไฟล์เรียบร้อยแล้ว");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "บันทึกรูปโปรไฟล์ไม่สำเร็จ");
    }
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

  const fullName = `${readOnlyData.firstName} ${readOnlyData.lastName}`.trim();
  const initials = (readOnlyData.firstName?.[0] || readOnlyData.nickname?.[0] || "C").toUpperCase();

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900">แก้ไขโปรไฟล์</h1>
        <p className="text-sm text-gray-500 mt-1">
          แก้ได้เองเฉพาะช่องทางติดต่อและบัญชีรับเงิน ส่วนข้อมูลตัวตนต้องส่งหลักฐานให้แอดมินแก้ให้
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {successMsg}
        </div>
      )}

      {/* ── การ์ดโปรไฟล์ (avatar + อัปโหลดรูป) ── */}
      <div className="rounded-2xl border border-gray-200 p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <AvatarUploader
          currentUrl={profilePicture}
          initials={initials}
          folder="profile"
          disabled={coachId === null}
          onUploaded={handleAvatarUploaded}
        />

        <div className="flex-1 min-w-0 text-center sm:text-left">
          <h2 className="text-lg font-bold text-gray-900 truncate">{fullName || "โค้ช"}</h2>
          {readOnlyData.nickname && (
            <p className="text-sm text-gray-500">({readOnlyData.nickname})</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2 justify-center sm:justify-start">
            {readOnlyData.specialization && (
              <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-600/20">
                ระดับ {readOnlyData.specialization}
              </span>
            )}
            {readOnlyData.coachLicense && (
              <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-600/20">
                {readOnlyData.coachLicense}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── ข้อมูลระบุตัวตน (อ่านอย่างเดียว) ── */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        <div className="p-4 sm:p-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="p-3 rounded-xl bg-gray-100 shrink-0">
              <IdCard className="w-6 h-6 text-gray-500" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900">ข้อมูลระบุตัวตน</h2>
              <p className="text-sm text-gray-500 mt-1">แก้เองไม่ได้ ถ้าข้อมูลไม่ถูกต้องกรุณาส่งหลักฐานให้แอดมินแก้ให้</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadItem label="ชื่อ - นามสกุล" value={fullName} />
            <ReadItem label="อีเมล (ใช้ล็อกอิน)" value={readOnlyData.email} />
            <ReadItem label="ชื่อเล่น" value={readOnlyData.nickname} />
            <ReadItem label="วันเกิด" value={readOnlyData.birthDate} />
            <ReadItem label="เลขบัตรประชาชน" value={readOnlyData.uid} />
            <ReadItem label="ระดับฝีมือ" value={readOnlyData.specialization} />
            <ReadItem label="ใบรับรองผู้ฝึกสอน" value={readOnlyData.coachLicense} />
          </div>
        </div>
      </div>

      {/* ── ช่องทางติดต่อ (แก้เองได้) ── */}
      <form onSubmit={handleSave} noValidate>
        <div className="rounded-2xl border border-gray-200 overflow-hidden">
          <div className="p-4 sm:p-6">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="p-3 rounded-xl bg-red-50 shrink-0">
                <Phone className="w-6 h-6 text-[#CC0000]" />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-gray-900">ช่องทางติดต่อ</h2>
                <p className="text-sm text-gray-500 mt-1">ส่วนนี้แก้ไขได้เองทันที ไม่ต้องแจ้งแอดมิน</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField
                label="หมายเลขโทรศัพท์ (10 หลัก)" name="phone" inputMode="numeric" maxLength={10} required
                value={formData.phone}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))
                }
                placeholder="ระบุหมายเลขโทรศัพท์"
              />
              <InputField
                label="Line ID (ถ้ามี)" name="lineId" value={formData.lineId}
                onChange={handleChange} placeholder="ระบุ Line ID"
              />
              <InputField
                label="Facebook (ถ้ามี)" name="facebook" value={formData.facebook}
                onChange={handleChange} placeholder="ระบุชื่อ/ลิงก์ Facebook"
              />
              <InputField
                label="ที่อยู่" name="address" value={formData.address}
                onChange={handleChange} placeholder="ระบุที่อยู่"
              />
            </div>
          </div>

          <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 flex items-center justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => window.history.back()} disabled={isSaving}>
              ยกเลิก
            </Button>
            <Button variant="primary" type="submit" disabled={isSaving} className="bg-[#E63946] hover:bg-[#d62839]">
              {isSaving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
            </Button>
          </div>
        </div>
      </form>

      {/* ── บัญชีรับเงิน ── */}
      {coachId !== null && (
        <div className="flex items-center gap-2 text-xs text-gray-400 pt-2">
          <Landmark className="w-3.5 h-3.5" /> ข้อมูลการเงิน
        </div>
      )}
      {coachId !== null && (
        <CoachBankAccountCard
          coachId={coachId}
          initialBankAccount={bank.account}
          initialPaymentInfo={bank.info}
          initialPromptPay={bank.promptPay}
        />
      )}
    </div>
  );
}

// ช่องแสดงข้อมูลแบบอ่านอย่างเดียว (ไม่ใช้ input disabled เพื่อให้ดูสะอาดขึ้น)
function ReadItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-2.5">
      <dt className="text-xs font-medium text-gray-400">{label}</dt>
      <dd className="text-sm font-semibold text-gray-800 mt-0.5 break-words">{value || "-"}</dd>
    </div>
  );
}
