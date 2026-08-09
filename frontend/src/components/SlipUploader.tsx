import React, { useState } from 'react';
import { Receipt } from 'lucide-react';
import { MAX_UPLOAD_MB, validateImageSize } from '@/utils/imageUpload';

export interface SlipUploaderProps {
  onUploadSuccess: (url: string) => void;
  currentUrl?: string;
  label?: string;
  onError?: (errMessage: string) => void;
}

export default function SlipUploader({
  onUploadSuccess,
  currentUrl = '',
  label = 'แนบหลักฐานชำระเงิน (ควรมี)',
  onError
}: SlipUploaderProps) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const sizeError = validateImageSize(file);
    if (sizeError) {
      if (onError) onError(sizeError);
      else alert(sizeError);
      e.target.value = '';
      return;
    }

    setUploading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      const formData = new FormData();
      formData.append("file", file);

      const baseUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${baseUrl}/upload`, {
        method: "POST",
        headers: {
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: formData
      });

      if (!res.ok) {
        throw new Error("อัปโหลดหลักฐานแนบไม่สำเร็จ");
      }

      const data = await res.json();
      onUploadSuccess(data.url);
    } catch (err: unknown) {
      console.error(err);
      if (onError) {
        onError(err instanceof Error ? err.message : "อัปโหลดล้มเหลว");
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-600 block">{label}</label>
      <div className="mt-1 flex flex-col items-center p-4 border border-dashed border-slate-350 rounded-xl hover:bg-slate-50 transition-colors bg-white">
        <input
          type="file"
          id="global-slip-upload"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          disabled={uploading}
        />
        <label
          htmlFor="global-slip-upload"
          className="cursor-pointer flex flex-col items-center space-y-1 w-full text-center"
        >
          <Receipt className="w-6 h-6 text-slate-400 mx-auto" />
          <span className="text-xs text-[#CD0D13] font-bold block mt-1">คลิกเลือกรูปภาพสลิป</span>
          <span className="text-[10px] text-slate-450 block">รูปถ่าย หรือ Screenshot (ไม่เกิน {MAX_UPLOAD_MB} MB)</span>
        </label>

        {uploading && (
          <div className="mt-2 text-[10px] text-slate-550 animate-pulse font-medium">
            กำลังอัปโหลดรูปภาพ...
          </div>
        )}

        {!uploading && currentUrl && (
          <div className="mt-3 w-full flex items-center justify-between p-2 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-semibold border border-emerald-100">
            <span className="truncate max-w-[120px]">อัปโหลดรูปภาพเรียบร้อย</span>
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-emerald-800"
            >
              ดูรูปภาพแนบ
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
