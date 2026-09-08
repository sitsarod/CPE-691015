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
  /** รูปทรงพรีวิว: วงกลม (avatar) หรือ สี่เหลี่ยม (รูปการ์ดหน้าแรก) */
  shape?: "circle" | "square";
  /** เปิด crop ก่อนอัปโหลด (avatar); ถ้า false จะแค่ให้ยืนยันรูปแล้วอัปโหลดตามสัดส่วนจริง */
  enableCrop?: boolean;
  /** อัตราส่วนกรอบ crop (กว้าง/สูง) — 1 = จัตุรัส, 3/4 = แนวตั้ง (ใช้กับ shape square) */
  cropAspect?: number;
}

// อัปโหลดรูป avatar ขึ้น Cloudinary — กรองเฉพาะรูปภาพและจำกัดขนาด
export default function AvatarUploader({
  currentUrl,
  initials = "?",
  folder = "profile",
  onUploaded,
  disabled = false,
  shape = "circle",
  enableCrop = true,
  cropAspect = 1,
}: Props) {
  const radius = shape === "square" ? "rounded-2xl" : "rounded-full";
  const inputRef = useRef<HTMLInputElement>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null); // object URL ระหว่างเปิด crop modal
  const [confirmSrc, setConfirmSrc] = useState<string | null>(null); // object URL ระหว่างยืนยันรูป (โหมดไม่ crop)
  const [pendingFile, setPendingFile] = useState<File | null>(null); // ไฟล์ต้นฉบับที่รอยืนยันอัปโหลด

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
    // ยังไม่อัปโหลดจนกว่าผู้ใช้จะกดยืนยัน — เปิด crop (avatar) หรือหน้ายืนยันรูป (ไม่ crop)
    if (enableCrop) {
      setCropSrc(URL.createObjectURL(file));
    } else {
      setPendingFile(file);
      setConfirmSrc(URL.createObjectURL(file));
    }
  };

  const closeCrop = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  const closeConfirm = () => {
    if (confirmSrc) URL.revokeObjectURL(confirmSrc);
    setConfirmSrc(null);
    setPendingFile(null);
  };

  // โหมดไม่ crop: ยืนยันแล้วอัปโหลดไฟล์ต้นฉบับตามสัดส่วนจริง
  const handleConfirmNoCrop = async () => {
    if (!pendingFile) return;
    setIsBusy(true);
    try {
      const url = await uploadImage(pendingFile, folder);
      await onUploaded(url);
      closeConfirm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "อัปโหลดรูปภาพไม่สำเร็จ");
      closeConfirm();
    } finally {
      setIsBusy(false);
    }
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
            className={`w-24 h-24 ${radius} object-cover ring-4 ring-gray-100`}
          />
        ) : (
          <div className={`w-24 h-24 ${radius} grid place-items-center bg-gradient-to-br from-[#E63946] to-[#CC0000] text-white text-3xl font-black ring-4 ring-gray-100`}>
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
        <ImageCropModal
          src={cropSrc}
          onCancel={closeCrop}
          onConfirm={handleCropConfirm}
          aspect={cropAspect}
          maskShape={shape === "square" ? "rect" : "circle"}
        />
      )}

      {/* โหมดไม่ crop: ยืนยันรูปก่อนอัปโหลด (แสดงรูปตามสัดส่วนจริง) */}
      {confirmSrc && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" onClick={closeConfirm}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-gray-100 px-5 py-3">
              <h3 className="text-base font-bold text-gray-900">ตรวจสอบรูปภาพ</h3>
              <p className="text-xs text-gray-400">ดูรูปก่อนแล้วกดยืนยันเพื่ออัปโหลด</p>
            </div>
            <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={confirmSrc} alt="พรีวิว" className="mx-auto max-h-[60vh] w-auto rounded-lg object-contain" />
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
              <button onClick={closeConfirm} disabled={isBusy} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                ยกเลิก
              </button>
              <button onClick={handleConfirmNoCrop} disabled={isBusy} className="rounded-xl bg-[#E63946] px-4 py-2 text-sm font-bold text-white hover:bg-[#d62839] disabled:opacity-60">
                {isBusy ? "กำลังอัปโหลด..." : "ใช้รูปนี้"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
