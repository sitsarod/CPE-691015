"use client";

import React from "react";
import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

/* ---------- หัวข้อหมวด (ชื่อไทย + English sub) ---------- */
export function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4 border-b border-gray-200 pb-4">
      <h2 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
        {title}
        {subtitle && (
          <span className="ml-2 text-sm font-light tracking-normal text-gray-400">{subtitle}</span>
        )}
      </h2>
      {right && <div className="flex-none">{right}</div>}
    </div>
  );
}

/* ---------- ป้ายสถานะเล็ก (chip) ---------- */
export type ChipTone = "red" | "redSolid" | "amber" | "gray";

export function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: ChipTone }) {
  const cls =
    tone === "red"
      ? "border-[#CC0000] text-[#CC0000]"
      : tone === "redSolid"
        ? "border-[#CC0000] bg-[#CC0000] text-white"
        : tone === "amber"
          ? "border-amber-300 bg-amber-50 text-amber-700"
          : "border-gray-200 text-gray-500";
  return (
    <span
      className={`inline-flex flex-none items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

/* ---------- ปุ่ม/ลิงก์แบบ editorial ---------- */
export function ActionLink({
  href,
  children,
  variant = "outline",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "outline" | "solid" | "text";
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap";
  const style =
    variant === "solid"
      ? "bg-[#CC0000] px-5 py-2.5 text-white hover:bg-[#990000]"
      : variant === "text"
        ? "text-[#CC0000] hover:text-[#990000]"
        : "border border-gray-300 px-5 py-2.5 text-gray-700 hover:border-[#CC0000] hover:text-[#CC0000]";
  return (
    <Link href={href} className={`${base} ${style} ${className}`}>
      {children}
    </Link>
  );
}

/* ---------- เซลล์สถิติในแถบ 1px-gutter ---------- */
export function StatCell({
  label,
  value,
  note,
  accentRed = false,
}: {
  label: string;
  value: string;
  note?: string;
  accentRed?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 bg-white px-4 py-4 sm:px-5 sm:py-5">
      <span className="text-xs font-light text-gray-500">{label}</span>
      <span
        className={`truncate text-2xl font-semibold leading-none tabular-nums sm:text-3xl ${
          accentRed ? "text-[#CC0000]" : "text-gray-900"
        }`}
      >
        {value}
      </span>
      {note && <span className="text-[11px] font-light leading-snug text-gray-400">{note}</span>}
    </div>
  );
}

/* ---------- แถวแจ้งเตือน (01) : status tile + title/desc + text link + action ---------- */
export type NotifTone = "danger" | "warning" | "info" | "success";

export function NotificationRow({
  tone,
  icon: Icon,
  title,
  body,
  linkText,
  linkHref,
  actionText,
  actionHref,
  onAction,
  actionVariant = "solid",
}: {
  tone: NotifTone;
  icon: LucideIcon;
  title: string;
  body: string;
  linkText?: string;
  linkHref?: string;
  actionText?: string;
  actionHref?: string;
  onAction?: () => void;
  actionVariant?: "solid" | "amber";
}) {
  const tile =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-[#CC0000]"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-600"
        : tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-600"
          : "border-blue-200 bg-blue-50 text-blue-600";

  const actionCls =
    actionVariant === "amber"
      ? "border border-amber-300 text-amber-700 hover:bg-amber-50"
      : "bg-[#CC0000] text-white hover:bg-[#990000]";

  return (
    <div className="flex flex-col gap-3 bg-white py-4 sm:flex-row sm:items-center sm:gap-5">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div
          className={`grid h-11 w-11 flex-none place-items-center border ${tile}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 sm:text-base">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500 sm:text-[13px]">{body}</p>
        </div>
      </div>
      {(linkText || actionText) && (
        <div className="flex flex-none items-center gap-4 pl-[60px] sm:pl-0">
          {linkText && linkHref && (
            <Link href={linkHref} className="text-[13px] font-light text-gray-500 hover:text-[#CC0000]">
              {linkText}
            </Link>
          )}
          {actionText &&
            (actionHref ? (
              <Link
                href={actionHref}
                className={`flex h-10 items-center rounded-lg px-5 text-[13px] font-medium ${actionCls}`}
              >
                {actionText}
              </Link>
            ) : (
              <button
                type="button"
                onClick={onAction}
                className={`flex h-10 items-center rounded-lg px-5 text-[13px] font-medium ${actionCls}`}
              >
                {actionText}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/* ---------- แผงด้านขวา (side panel) ---------- */
export function SidePanel({
  title,
  titleTone = "default",
  children,
}: {
  title: string;
  titleTone?: "default" | "amber";
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 bg-white py-5">
      <p className={`text-base font-medium ${titleTone === "amber" ? "text-amber-600" : "text-gray-900"}`}>
        {title}
      </p>
      {children}
    </div>
  );
}

export { ArrowUpRight };
