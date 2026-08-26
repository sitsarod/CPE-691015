"use client";

import { useState } from "react";
import { Star } from "lucide-react";

/**
 * แถวดาวให้คะแนน ใช้ได้ทั้งแบบดูอย่างเดียวและแบบกดเลือกได้
 *
 * ─── ปัญหาที่แก้ ───
 *
 * เดิมมีสามชุดในสามหน้า (แอดมิน โค้ช ผู้เรียน) ที่เขียนแยกกัน
 * สองชุดแรกเป็นแบบดูอย่างเดียว ชุดของผู้เรียนกดเลือกได้ ทั้งที่หน้าตาเหมือนกันหมด
 *
 * ไม่ส่ง onChange = ดูอย่างเดียว ส่ง onChange = กดให้ดาวได้
 * รวมสองแบบไว้ตัวเดียวเพราะดาวที่วาดออกมาเหมือนกันเป๊ะ ต่างแค่กดได้หรือไม่
 */
export function StarRating({
  value,
  size = 16,
  onChange,
}: {
  value: number;
  size?: number;
  onChange?: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const interactive = typeof onChange === "function";

  // แบบดูอย่างเดียวไม่ต้องเป็นปุ่ม เพราะปุ่มที่กดไม่ได้ทำให้คนใช้คีย์บอร์ด
  // ต้องกด Tab ผ่านดาวห้าดวงโดยไม่ได้อะไรเลย
  if (!interactive) {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={size}
            className={star <= value ? "text-amber-400" : "text-gray-300"}
            fill={star <= value ? "currentColor" : "none"}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= (hover || value);
        return (
          <button
            key={star}
            type="button"
            aria-label={`ให้ ${star} ดาว`}
            onClick={() => onChange?.(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            className="cursor-pointer transition-transform hover:scale-110"
          >
            <Star
              size={size}
              className={filled ? "text-amber-400" : "text-gray-300"}
              fill={filled ? "currentColor" : "none"}
            />
          </button>
        );
      })}
    </div>
  );
}
