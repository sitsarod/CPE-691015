"use client";

import React, { useState, useEffect, useRef } from "react";
import { Eye, Pencil, Trash2, MoreVertical, AlertCircle, CalendarClock, Power } from "lucide-react";

export const BRAND = "#E63946";

export type RoleKey = "admin" | "coach" | "customer";

export const normalizeRole = (role?: string): RoleKey => {
  const r = role?.toLowerCase();
  if (r === "admin") return "admin";
  if (r === "coach") return "coach";
  return "customer";
};

export const isActive = (status?: string) => {
  const s = status?.toLowerCase();
  return s !== "inactive" && s !== "suspended" && s !== "rejected";
};

/* ===================== การ์ดสรุปตัวเลข ===================== */
export function SummaryCard({
  label,
  value,
  icon: Icon,
  tint,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  tint: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-3xl bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-gray-900/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_32px_-8px_rgba(0,0,0,0.12)] hover:ring-gray-900/10">
      {/* วงกลมสีจางลอยมุมขวาบน ใช้สีเดียวกับ tint ของไอคอน ให้แต่ละการ์ดมีธีมสีของตัวเอง */}
      <div
        className={`pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-[0.08] transition-transform duration-500 ease-out group-hover:scale-125 ${tint}`}
      />

      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-gray-900">
            {value.toLocaleString()}
          </p>
        </div>
        <div
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl shadow-sm ring-1 ring-black/5 transition-transform duration-300 group-hover:scale-110 ${tint}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

/* ===================== Badge บทบาท ===================== */
export function RoleBadge({ role }: { role: RoleKey }) {
  const map: Record<RoleKey, { label: string; cls: string }> = {
    admin: { label: "Admin", cls: "bg-violet-50 text-violet-700 ring-violet-600/20" },
    coach: { label: "Coach", cls: "bg-sky-50 text-sky-700 ring-sky-600/20" },
    customer: { label: "Customer", cls: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  };
  const { label, cls } = map[role];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}>
      {label}
    </span>
  );
}

/* ===================== Badge สีกำหนดเอง ===================== */
export function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${color}`}>
      {label}
    </span>
  );
}

/* ===================== Pill สถานะ ===================== */
export function StatusPill({ active, status }: { active: boolean; status?: string }) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600 ring-1 ring-inset ring-gray-500/20">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
      {status || "Inactive"}
    </span>
  );
}

/* ===================== เมนู dropdown จัดการต่อแถว ===================== */
export function RowActionMenu({
  onView,
  onEdit,
  onDelete,
  onSchedule,
  onToggleStatus,
  isActive,
}: {
  onView: () => void;
  /** ไม่ส่งมา = ไม่แสดงเมนูแก้ไข (บางหน้ายังไม่มีฟอร์มแก้ไข) */
  onEdit?: () => void;
  onDelete: () => void;
  onSchedule?: () => void; // optional: แสดงเมนู "ดูตารางเวลาว่าง" เฉพาะเมื่อส่ง handler มา (ใช้กับหน้าจัดการโค้ช)
  onToggleStatus?: () => void; // optional: แสดงเมนู เปิด/ปิดใช้งาน
  isActive?: boolean; // สถานะปัจจุบัน (ใช้กำหนดข้อความเมนู)
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const MENU_W = 176;

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setCoords({ top: r.bottom + 6, left: Math.max(8, r.right - MENU_W) });
    }
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        menuRef.current?.contains(e.target as Node) ||
        btnRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className={`grid h-8 w-8 place-items-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 ${
          open ? "bg-gray-100 text-gray-700" : ""
        }`}
        title="ตัวเลือก"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ top: coords.top, left: coords.left, width: MENU_W }}
          className="fixed z-50 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-[0_4px_16px_rgba(0,0,0,0.08)] ring-1 ring-black/5"
        >
          <MenuItem icon={Eye} label="ดูรายละเอียด" onClick={() => run(onView)} />
          {onEdit && <MenuItem icon={Pencil} label="แก้ไข" onClick={() => run(onEdit)} />}
          {onSchedule && (
            <MenuItem icon={CalendarClock} label="ดูตารางเวลาว่าง" onClick={() => run(onSchedule)} />
          )}
          {onToggleStatus && (
            <MenuItem
              icon={Power}
              label={isActive ? "ปิดใช้งาน (พักงาน)" : "เปิดใช้งาน"}
              onClick={() => run(onToggleStatus)}
            />
          )}
          <MenuItem icon={Trash2} label="ลบ" danger onClick={() => run(onDelete)} />
        </div>
      )}
    </>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium transition ${
        danger ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-50"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

/* ===================== แถวรายละเอียดใน modal ===================== */
export function DetailItem({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value || "-"}</dd>
    </div>
  );
}

/* ===================== กล่องแจ้ง error ในฟอร์ม ===================== */
export function FormError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
      <AlertCircle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}