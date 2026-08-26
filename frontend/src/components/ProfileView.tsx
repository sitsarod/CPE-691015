"use client";

import React, { useEffect, useState } from "react";
import Button from "@/components/Button";
import { getUserProfileAPI, type UserProfileResponseDTO } from "@/services/userAPI";
import { Grid2X2, ClipboardCheck } from "lucide-react";


const ROLE_LABEL: Record<string, string> = {
  admin: "ผู้ดูแลระบบ",
  coach: "โค้ช",
  customer: "ผู้เรียน",
};

function formatBirthDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
}

function genderLabel(value?: string) {
  if (value === "male") return "ชาย";
  if (value === "female") return "หญิง";
  return null;
}

interface ProfileViewProps {
  /** ชื่อที่แสดงระหว่างยังไม่รู้ชื่อจริง */
  fallbackName?: string;
  /** ปลายทางปุ่ม Edit profile — ไม่ส่งมา = ไม่แสดงปุ่ม */
  editHref?: string;
  /** ปลายทางปุ่ม View QR Code — ไม่ส่งมา = ไม่แสดงปุ่ม */
  qrHref?: string;
}

export default function ProfileView({
  fallbackName = "ผู้ใช้งาน",
  editHref,
  qrHref,
}: ProfileViewProps) {
  const [profile, setProfile] = useState<UserProfileResponseDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"posts" | "evaluation">("posts");

  useEffect(() => {
    const userId = localStorage.getItem("user_id");
    if (!userId) {
      setError("ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่");
      setIsLoading(false);
      return;
    }

    getUserProfileAPI(Number(userId))
      .then(setProfile)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "ไม่สามารถดึงข้อมูลโปรไฟล์ได้"))
      .finally(() => setIsLoading(false));
  }, []);

  const fullName =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || fallbackName;

  const isStudentRole = profile?.role === "customer" || Boolean(profile?.isStudent);

  const details = [
    // วางรหัสประจำตัวไว้บนสุด เพราะเป็นสิ่งที่ต้องหยิบไปบอกเจ้าหน้าที่บ่อยที่สุด
    { label: "รหัสประจำตัว", value: profile?.memberCode },
    { label: "ชื่อเล่น", value: profile?.nickname },
    { label: "อีเมล", value: profile?.email },
    { label: "สิทธิ์การใช้งาน", value: profile?.role ? ROLE_LABEL[profile.role] ?? profile.role : undefined },
    { label: "เบอร์โทรศัพท์", value: profile?.phoneNumber },
    { label: "วันเกิด", value: formatBirthDate(profile?.birthDate) },
    { label: "เพศ", value: genderLabel(profile?.gender) },
    { label: "อีเมลผู้ปกครอง", value: profile?.parentEmail },
    { label: "เบอร์ผู้ปกครอง", value: profile?.parentPhoneNumber },
  ].filter((item) => item.value);

  if (isLoading) {
    return (
      <div className="w-full min-h-[calc(100vh-96px)] flex items-center justify-center text-gray-500">
        กำลังโหลดข้อมูลโปรไฟล์...
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full min-h-[calc(100vh-96px)] flex items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 text-red-600 px-6 py-4 rounded-xl">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[calc(100vh-96px)] bg-gray-50 flex items-center justify-center p-4 md:p-8">
      <div className="bg-white w-full max-w-5xl p-10 md:p-16 rounded-3xl shadow-sm text-left">

        {/* Profile Section สไตล์ IG */}
        <div className="flex flex-col mb-6">

          <div className="flex flex-row items-center gap-8 md:gap-14">
            <div className="relative flex-shrink-0">
              <div className="w-28 h-28 md:w-36 md:h-36 rounded-full border-4 border-gray-100 overflow-hidden bg-gray-100 shadow-xs grid place-items-center">
                {profile?.profile_picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.profile_picture} alt="รูปโปรไฟล์" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl md:text-5xl font-black text-white bg-gradient-to-br from-[#E63946] to-[#CC0000] w-full h-full grid place-items-center">
                    {(profile?.firstName?.[0] || profile?.nickname?.[0] || "?").toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col space-y-4 w-full">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl md:text-4xl font-black text-gray-900 tracking-tight">
                  {fullName}
                </h2>
                {profile?.nickname && (
                  <span className="text-lg md:text-2xl text-gray-500 font-medium">
                    ({profile.nickname})
                  </span>
                )}
                {profile?.isStudent && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                    กำลังเรียน
                  </span>
                )}
              </div>

              <div className="flex flex-row items-center gap-6 text-sm md:text-lg text-gray-600 font-medium">
                <span><strong className="text-gray-900 font-bold">0</strong> posts</span>
                <span><strong className="text-gray-900 font-bold">182</strong> followers</span>
              </div>
            </div>
          </div>

          {(editHref || qrHref) && (
            <div className="flex flex-row gap-4 w-full mt-8">
              {editHref && (
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => (window.location.href = editHref)}
                  className="flex-1 md:flex-initial py-3 text-sm md:text-base bg-gray-50 hover:bg-gray-100 border border-gray-200"
                >
                  Edit profile
                </Button>
              )}

              {qrHref && (
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => (window.location.href = qrHref)}
                  className="flex-1 md:flex-initial py-3 text-sm md:text-base bg-gray-50 hover:bg-gray-100 border border-gray-200"
                >
                  View QR Code
                </Button>
              )}
            </div>
          )}
        </div>

        {/* ข้อมูลส่วนตัว (ดึงจาก /api/users/:id) */}
        {details.length > 0 && (
          <div className="w-full border-t border-gray-200 pt-8 mb-8">
            <h3 className="text-lg font-bold text-gray-900 mb-6">ข้อมูลส่วนตัว</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-5">
              {details.map((item) => (
                <div key={item.label} className="flex flex-col gap-1">
                  <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {item.label}
                  </dt>
                  <dd className="text-base text-gray-900 font-medium break-words">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* แถบแท็บสไตล์ IG */}
        <div className="w-full border-t border-gray-200 flex justify-center text-gray-900 gap-8">
          
          {/* แท็บ Posts */}
          <button
            type="button"
            onClick={() => setActiveTab("posts")}
            className={`flex items-center gap-2 py-3 text-xs md:text-sm tracking-widest uppercase font-bold transition-all -mt-[2px] ${
              activeTab === "posts"
                ? "border-t-2 border-gray-900 text-gray-900"
                : "text-gray-400 hover:text-gray-600 border-t-2 border-transparent"
            }`}
          >
            <Grid2X2 className="w-4 h-4" />
            Posts
          </button>

          {/* แท็บ Evaluation (เฉพาะนักเรียน) */}
          {isStudentRole && (
            <button
              type="button"
              onClick={() => setActiveTab("evaluation")}
              className={`flex items-center gap-2 py-3 text-xs md:text-sm tracking-widest uppercase font-bold transition-all -mt-[2px] ${
                activeTab === "evaluation"
                  ? "border-t-2 border-gray-900 text-gray-900"
                  : "text-gray-400 hover:text-gray-600 border-t-2 border-transparent"
              }`}
            >
              <ClipboardCheck className="w-4 h-4" />
              Evaluation
            </button>
          )}

        </div>

      </div>
    </div>
  );
}
