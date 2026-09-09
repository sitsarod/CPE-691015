'use client';

import React from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';

// สีหลักของธีม (คงขาว-แดงเดิม)
export const RED = '#CC0000';
export const RED_HOVER = '#990000';

// input/textarea มาตรฐาน (ใช้ซ้ำทุก editor)
export const inputClass =
  'w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-colors';
export const smallInputClass =
  'w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-colors';

// หัวข้อหมวดแบบมีเลขกำกับ (01 · ชื่อไทย + subtitle อังกฤษ) + ช่องด้านขวา
export function SectionHeader({
  number,
  title,
  subtitle,
  right,
}: {
  number: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-gray-200 pb-4 mb-6">
      <div className="flex items-baseline gap-3 min-w-0">
        <span className="text-xs font-medium tracking-[0.2em] text-[#CC0000] tabular-nums">
          {number}
        </span>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 leading-tight">
          {title}
          {subtitle && (
            <span className="ml-2 text-sm font-light text-gray-400 tracking-normal">{subtitle}</span>
          )}
        </h2>
      </div>
      {right && <div className="flex-none">{right}</div>}
    </div>
  );
}

// ป้ายกำกับช่องกรอก
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ปุ่มเพิ่มแถว (ใช้ร่วมทุก list editor)
export function AddRowButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-[#CC0000] hover:text-[#990000] transition-colors"
    >
      <Plus size={16} /> {label}
    </button>
  );
}

// ปุ่มลบแถว
export function RemoveRowButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="ลบแถว"
      className="flex-shrink-0 grid place-items-center w-9 h-9 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
    >
      <Trash2 size={16} />
    </button>
  );
}

// ปุ่มไอคอนเล็ก (แถบเครื่องมือ)
export function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid place-items-center w-8 h-8 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        danger
          ? 'text-gray-500 hover:bg-red-50 hover:text-red-600'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  );
}

// จุดกริปสำหรับลาก (ตกแต่ง — การจัดลำดับใช้ปุ่มขึ้น/ลง)
export function DragHandle() {
  return <GripVertical size={16} className="flex-none text-gray-300" aria-hidden />;
}
