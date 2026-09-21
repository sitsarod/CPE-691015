'use client';

import { useRef } from 'react';

/**
 * กล่องกรอกรหัส OTP แบบแยกทีละหลัก (แทนช่องข้อความยาวช่องเดียว) — พิมพ์เลขแล้วเลื่อนโฟกัส
 * ไปช่องถัดไปให้อัตโนมัติ, กด Backspace ตอนช่องว่างจะถอยไปช่องก่อนหน้า, วาง (paste) รหัสทั้งชุด
 * ทีเดียวได้เลยไม่ต้องพิมพ์ทีละตัว
 */
export default function OtpInput({
  length = 6,
  value,
  onChange,
  disabled,
  autoFocus,
}: {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const setDigit = (index: number, digit: string) => {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join('').slice(0, length));
  };

  const handleChange = (index: number, raw: string) => {
    // เอาตัวเลขตัวสุดท้ายที่พิมพ์มา กันเคสคีย์บอร์ดบางระบบ/ป้อนอัตโนมัติใส่มาหลายตัวในช่องเดียว
    const digit = raw.replace(/\D/g, '').slice(-1);
    setDigit(index, digit);
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    inputRefs.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  return (
    <div className="flex justify-center gap-2 sm:gap-3">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={digit}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className="h-14 w-11 rounded-xl border border-gray-200 text-center text-2xl font-bold text-gray-900 outline-none transition-colors focus:border-orange-primary focus:ring-2 focus:ring-orange-primary/20 sm:h-16 sm:w-14"
        />
      ))}
    </div>
  );
}
