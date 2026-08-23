"use client";

import Image from "next/image";

interface CourseCoverProps {
  src?: string | null;
  alt: string;
  /** คุมขนาดและมุมจากฝั่งผู้เรียก เพราะแต่ละหน้าใช้คนละสัดส่วน */
  className?: string;
  width?: number;
  height?: number;
}

/**
 * รูปปกคอร์ส — คืน null เมื่อยังไม่ได้ตั้งรูป ผู้เรียกจึงเขียน fallback เองได้
 *
 * ⚠️ ทุกจุดต้องใช้ unoptimized เพราะ Cloudinary ไม่ได้อยู่ใน images.remotePatterns
 * ของ next.config — ลืมแม้แต่ที่เดียว หน้านั้นพังตอน render จึงรวมไว้ที่นี่ที่เดียว
 */
export default function CourseCover({
  src,
  alt,
  className,
  width = 640,
  height = 360,
}: CourseCoverProps) {
  if (!src) return null;

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      unoptimized
      className={className}
    />
  );
}
