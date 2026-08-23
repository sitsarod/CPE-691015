"use client";

import React, { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { IMAGE_ACCEPT, MAX_UPLOAD_MB, validateImageFile, uploadImage } from "@/utils/imageUpload";
import ImageCropModal from "@/components/ImageCropModal";

interface Props {
  /** URL รูปปัจจุบัน (ถ้าไม่มีจะโชว์ตัวอักษรย่อ) */
  currentUrl?: string;
  /** ตัวอักษรย่อสำหรับ placeholder เมื่อยังไม่มีรูป */
  initials?: string;
  /** โฟลเดอร์ปลายทางบน Cloudinary (ต้องอยู่ใน whitelist ของ backend) */
  folder?: string;
  /** เรียกเมื่ออัปโหลดสำเร็จ พร้อม URL ใหม่ — ผู้เรียกเอาไปบันทึกลงโปรไฟล์เอง */
  onUploaded: (url: string) => void | Promise<void>;
  disabled?: boolean;
}

// อัปโหลดรูป avatar ขึ้น Cloudinary — กรองเฉพาะรูปภาพและจำกัดขนาด
export default function AvatarUploader({
  currentUrl,
  initials = "?",
  folder = "profile",
  onUploaded,
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null); // object URL ระหว่างเปิด crop modal

  const handlePick = () => {
    if (isBusy || disabled) return;
    inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // เคลียร์เพื่อให้เลือกไฟล์เดิมซ้ำได้
    if (!file) return;

    // ด่านแรก: ตรวจชนิด (ต้องเป็นรูป) + ขนาด ที่ฝั่ง client ก่อนเปิด crop
    const invalid = validateImageFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }

    setError(null);
    // เปิด crop modal ก่อน — ยังไม่อัปโหลดจนกว่าผู้ใช้จะกด "ใช้รูปนี้"
    setCropSrc(URL.createObjectURL(file));
  };

  const closeCrop = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  // ผู้ใช้กดยืนยันใน crop modal → อัปโหลดรูปที่ crop แล้วขึ้น Cloudinary
  const handleCropConfirm = async (croppedFile: File) => {
    setIsBusy(true);
    try {
      const url = await uploadImage(croppedFile, folder);
      await onUploaded(url);
      closeCrop();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "อัปโหลดรูปภาพไม่สำเร็จ");
      closeCrop();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center sm:items-start gap-2">
      <div className="relative shrink-0">
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt="รูปโปรไฟล์"
            className="w-24 h-24 rounded-full object-cover ring-4 ring-gray-100"
          />
        ) : (
          <div className="w-24 h-24 rounded-full grid place-items-center bg-gradient-to-br from-[#E63946] to-[#CC0000] text-white text-3xl font-black ring-4 ring-gray-100">
            {initials}
          </div>
        )}

        {/* ปุ่มกล้องมุมขวาล่าง */}
        <button
          type="button"
          onClick={handlePick}
          disabled={isBusy || disabled}
          title="เปลี่ยนรูปโปรไฟล์"
          className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-[#CC0000] text-white ring-2 ring-white shadow-md hover:bg-[#A30A0E] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          onChange={handleChange}
          className="hidden"
          disabled={isBusy || disabled}
        />
      </div>

      <p className="text-[11px] text-gray-400 text-center sm:text-left">
        รูปภาพเท่านั้น · ไม่เกิน {MAX_UPLOAD_MB} MB
      </p>

      {error && (
        <p className="text-[11px] text-red-600 text-center sm:text-left whitespace-pre-line max-w-[180px]">{error}</p>
      )}

      {cropSrc && (
        <ImageCropModal src={cropSrc} onCancel={closeCrop} onConfirm={handleCropConfirm} />
      )}
    </div>
  );
}
