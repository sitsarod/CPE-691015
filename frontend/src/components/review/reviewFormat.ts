import type { ElementType } from "react";
import { BookOpen, UserRound, MapPin, Wrench, MoreHorizontal } from "lucide-react";
import type { Review, ReviewCategory } from "@/types/review";

/**
 * ตัวช่วยแปลงข้อมูลรีวิวให้เป็นข้อความที่คนอ่าน
 *
 * ทั้งสามฟังก์ชันเคยถูกก๊อปไว้ในหน้ารีวิวของแอดมิน โค้ช และผู้เรียน
 * ตัวอักษรตรงกันทุกตัว รวมมาไว้ที่เดียวเพื่อให้ชื่อและวันที่แสดงเหมือนกันทุกหน้า
 */

/** ชื่อและไอคอนของแต่ละหัวข้อรีวิว */
export const CATEGORY_META: Record<ReviewCategory, { label: string; icon: ElementType }> = {
  course: { label: "รีวิวคอร์ส", icon: BookOpen },
  coach: { label: "รีวิวโค้ช", icon: UserRound },
  place: { label: "สถานที่", icon: MapPin },
  service: { label: "บริการ", icon: Wrench },
  other: { label: "อื่นๆ", icon: MoreHorizontal },
};

/** ชื่อหัวข้อรีวิวแบบข้อความล้วน */
export const categoryLabel = (category: ReviewCategory): string =>
  CATEGORY_META[category]?.label ?? category;

/**
 * หัวข้อที่ไม่ได้ผูกกับคอร์สหรือโค้ชโดยตรง
 *
 * สามหน้าต่างเช็คด้วยเงื่อนไขยาว ๆ เหมือนกัน:
 *   category === 'place' || category === 'service' || category === 'other'
 * รวมมาไว้ที่เดียว ถ้าวันหนึ่งเพิ่มหัวข้อใหม่จะได้ไม่ต้องไล่แก้สามที่
 */
export const isGeneralCategory = (category: ReviewCategory): boolean =>
  category === "place" || category === "service" || category === "other";

/**
 * ชื่อผู้รีวิวที่พร้อมแสดง
 *
 * ⚠️ ต้องรับกรณีที่ customer เป็น null ได้
 *
 * รีวิวไม่ถูกลบตามเจ้าของเมื่อสมาชิกถูกลบ (ตั้งใจ เพื่อเก็บสถิติไว้)
 * ถ้าไม่เช็คตรงนี้ หน้าเว็บจะพังทั้งหน้าเมื่อเจอรีวิวของคนที่ถูกลบไปแล้ว
 */
export function customerName(r: Review): string {
  if (!r.customer) return "ผู้ใช้ที่ถูกลบ";

  const full = [r.customer.firstName, r.customer.lastName].filter(Boolean).join(" ");
  if (r.customer.nickname) {
    return full ? `${r.customer.nickname} (${full})` : r.customer.nickname;
  }
  return full || "ไม่ระบุชื่อ";
}

/** ตัวอักษรตัวแรกของชื่อ ใช้แสดงในวงกลมแทนรูปโปรไฟล์ */
export function customerInitial(r: Review): string {
  const name = r.customer?.nickname || r.customer?.firstName || "?";
  return name.charAt(0).toUpperCase();
}

/**
 * วันที่แบบไทย เช่น 24 ส.ค. 2569
 *
 * ครอบด้วย try เพราะค่าที่ได้จาก API อาจเป็นข้อความว่างหรือรูปแบบที่แปลงไม่ได้
 * ซึ่งจะทำให้ new Date คืน Invalid Date แล้ว toLocaleDateString โยน error
 * ทำให้ทั้งหน้าจอขาว เพียงเพราะรีวิวใบเดียวมีวันที่เพี้ยน
 */
export function formatReviewDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}
