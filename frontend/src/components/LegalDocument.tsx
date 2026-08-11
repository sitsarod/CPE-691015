"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { homeContentAPI } from "@/services/homeContentAPI";

// หน้าเอกสารทางกฎหมาย (นโยบายความเป็นส่วนตัว / ข้อกำหนดการใช้งาน)
// ดึงเนื้อหาจาก CMS (แอดมินแก้ผ่านหน้า /admin/settings) แล้วแสดงแบบคงบรรทัดเดิม
export default function LegalDocument({
  title,
  field,
}: {
  title: string;
  field: "privacy_policy" | "terms_of_service";
}) {
  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    homeContentAPI
      .getPublicHome()
      .then((home) => setText(home.content[field] ?? ""))
      .catch(() => setText(""))
      .finally(() => setLoading(false));
  }, [field]);

  return (
    <div className="min-h-[calc(100vh-96px)] bg-gray-50 py-12 px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-8 md:p-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">{title}</h1>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-[#CC0000]" />
          </div>
        ) : text.trim() ? (
          <div className="text-gray-700 leading-relaxed whitespace-pre-line">{text}</div>
        ) : (
          <p className="text-gray-400">ยังไม่มีการกำหนดเนื้อหาส่วนนี้</p>
        )}

        <div className="mt-10 pt-6 border-t border-gray-100">
          <Link href="/" className="text-[#CC0000] hover:underline">
            ← กลับหน้าหลัก
          </Link>
        </div>
      </div>
    </div>
  );
}
