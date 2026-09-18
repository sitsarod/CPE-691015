"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";

interface DateFieldProps {
  /** ไม่ใส่ = ไม่แสดง label ของตัวเอง (ใช้เมื่อหน้าที่เรียกมี label แยกอยู่แล้ว) */
  label?: string;
  name?: string;
  required?: boolean;
  error?: string;
  containerClassName?: string;
  /** แทนที่คลาสของปุ่ม (สี/ขนาด/ความโค้งขอบ) ทั้งชุด ให้เข้ากับฟอร์มที่ไม่ได้ใช้ธีมปุ่มมาตรฐาน */
  buttonClassName?: string;
  placeholder?: string;
  /** ค่าปัจจุบันรูปแบบ YYYY-MM-DD (ว่าง = ยังไม่ได้เลือก) */
  value: string;
  onChange: (value: string) => void;
  /** วันที่ล่าสุดที่เลือกได้ รูปแบบ YYYY-MM-DD */
  max?: string;
  /** วันที่แรกสุดที่เลือกได้ รูปแบบ YYYY-MM-DD */
  min?: string;
}

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function parseDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatDate(y: number, m: number, d: number): string {
  return `${y}`.padStart(4, "0") + "-" + `${m + 1}`.padStart(2, "0") + "-" + `${d}`.padStart(2, "0");
}

/**
 * วันที่ล่าสุดที่ยังนับว่าอายุครบ N ปี ใช้เป็นค่า max ของช่องวันเกิด
 *
 * ใช้ค่าวันที่ท้องถิ่น ไม่ใช่ toISOString() ซึ่งแปลงเป็น UTC แล้วอาจได้วันที่
 * คลาดเคลื่อนไปหนึ่งวันช่วงเที่ยงคืนถึงตี 7 (ไทยอยู่ UTC+7)
 */
export function maxDateForMinAge(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * ช่องเลือกวันที่แบบปฏิทินในตัว — แทน <input type="date"> ของเบราว์เซอร์
 *
 * ปฏิทินของเบราว์เซอร์แก้สไตล์ไม่ได้เลย (เป็น native widget ของ OS) และบังคับ
 * ให้คลิกที่ไอคอนปฏิทินเท่านั้นถึงจะเปิด คลิกที่อื่นในช่องจะไม่มีอะไรเกิดขึ้น
 *
 * ตัวนี้คลิกได้ทั้งช่อง เปิดเป็น popover ปฏิทินที่ออกแบบเองให้ตรงธีมของเว็บ
 * พร้อมตัวเลือกเดือน/ปีสำหรับกระโดดข้ามปีเร็ว ๆ (จำเป็นมากสำหรับกรอกวันเกิด
 * ที่มักย้อนไปหลายสิบปี กดลูกศรทีละเดือนจะช้าเกินไป)
 */
export default function DateField({
  label,
  name,
  required = false,
  error,
  containerClassName = "",
  buttonClassName,
  placeholder = "เลือกวันที่",
  value,
  onChange,
  max,
  min,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = parseDate(value);
  const maxDate = max ? parseDate(max) : null;
  const minDate = min ? parseDate(min) : null;

  const today = new Date();
  const [viewYear, setViewYear] = useState(() => (selected ?? maxDate ?? today).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (selected ?? maxDate ?? today).getMonth());

  // เปิดปฏิทินทีไร ให้เลื่อนไปแสดงเดือน/ปีของค่าที่เลือกไว้อยู่เสมอ ไม่ใช่ค้างที่เดือนก่อนหน้า
  const toggleOpen = () => {
    setOpen((v) => {
      if (!v) {
        const base = selected ?? maxDate ?? today;
        setViewYear(base.getFullYear());
        setViewMonth(base.getMonth());
      }
      return !v;
    });
  };

  // ปิดเมื่อคลิกข้างนอก หรือกด Escape
  useEffect(() => {
    if (!open) return;

    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const isDisabled = (d: Date) => !!((maxDate && d > maxDate) || (minDate && d < minDate));

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const leadingBlanks = new Date(viewYear, viewMonth, 1).getDay();

  const yearRangeStart = (maxDate ?? today).getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => yearRangeStart - i);

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const displayText = selected
    ? `${selected.getDate()} ${MONTHS[selected.getMonth()]} ${selected.getFullYear() + 543}`
    : "";

  const defaultButtonClass = `px-4 py-3 border rounded-xl text-base bg-white
    ${selected ? "text-gray-900" : "text-gray-400"}
    ${error ? "border-red-500 focus:border-red-500" : "border-gray-200 focus:border-orange-primary"}`;

  return (
    <div className={`relative w-full flex flex-col space-y-1.5 ${containerClassName}`} ref={wrapperRef}>
      {label && (
        <label className="text-sm font-semibold text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      <button
        type="button"
        onClick={toggleOpen}
        className={`w-full flex items-center justify-between gap-2 text-left transition-colors focus:outline-none ${buttonClassName ?? defaultButtonClass}`}
      >
        <span>{displayText || placeholder}</span>
        <CalendarIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
      </button>

      {/* input ซ่อนไว้ให้ form ปกติ (เช่น required ตอน submit) ยังอ่านชื่อ/ค่าได้ตามปกติ */}
      {name && <input type="hidden" name={name} value={value} required={required} />}

      {error && <span className="text-xs text-red-500 font-medium">{error}</span>}

      {open && (
        <div className="absolute z-20 top-full left-0 mt-2 w-[min(300px,calc(100vw-2rem))] rounded-2xl border border-gray-100 bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between gap-2 mb-3">
            <button
              type="button"
              onClick={goToPrevMonth}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="เดือนก่อนหน้า"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-1.5">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="rounded-lg border-none bg-gray-50 py-1 pl-2 pr-6 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-primary"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>
              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="rounded-lg border-none bg-gray-50 py-1 pl-2 pr-6 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-primary"
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y + 543}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={goToNextMonth}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="เดือนถัดไป"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-1 text-center">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-xs font-semibold text-gray-400 py-1">{w}</div>
            ))}

            {Array.from({ length: leadingBlanks }, (_, i) => (
              <div key={`blank-${i}`} />
            ))}

            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
              const cellDate = new Date(viewYear, viewMonth, d);
              const disabled = isDisabled(cellDate);
              const isSelected = selected && sameDay(cellDate, selected);
              const isToday = sameDay(cellDate, today);

              return (
                <button
                  key={d}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(formatDate(viewYear, viewMonth, d));
                    setOpen(false);
                  }}
                  className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors
                    ${disabled ? "text-gray-300 cursor-not-allowed" : "text-gray-700 hover:bg-orange-50 cursor-pointer"}
                    ${isSelected ? "bg-orange-primary text-white font-bold hover:bg-orange-primary" : ""}
                    ${!isSelected && isToday ? "ring-1 ring-orange-primary font-semibold" : ""}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
