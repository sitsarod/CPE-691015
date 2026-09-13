export const EXPIRY_WARNING_DAYS = 7;

export type ExpiryTone = "none" | "normal" | "warning" | "expired" | "carried";

export interface ExpiryDisplay {
  label: string;
  tone: ExpiryTone;
  highlight: boolean;
}
export function describeExpiry(
  daysLeft: number | null,
  status?: string,
  carriedOverSessions?: number
): ExpiryDisplay {
  if (carriedOverSessions && carriedOverSessions > 0) {
    return {
      label: `หมดอายุแล้ว · ทบไว้ให้ ${carriedOverSessions} ครั้ง`,
      tone: "carried",
      highlight: true,
    };
  }

  if (status === "expired") {
    return { label: "หมดอายุแล้ว", tone: "expired", highlight: true };
  }

  if (daysLeft === null || daysLeft === undefined) {
    return { label: "ยังไม่เริ่มนับ", tone: "none", highlight: false };
  }

  if (daysLeft <= 0) {
    return { label: "หมดอายุแล้ว", tone: "expired", highlight: true };
  }

  if (daysLeft === 1) {
    return { label: "หมดอายุวันนี้", tone: "warning", highlight: true };
  }

  if (daysLeft <= EXPIRY_WARNING_DAYS) {
    return { label: `เหลืออีก ${daysLeft} วัน`, tone: "warning", highlight: true };
  }

  return { label: `เหลืออีก ${daysLeft} วัน`, tone: "normal", highlight: false };
}

export function expiryTextClass(tone: ExpiryTone): string {
  switch (tone) {
    case "expired":
      return "text-slate-500";
    case "carried":
      return "text-emerald-700";
    case "warning":
      return "text-orange-600";
    case "normal":
      return "text-gray-600";
    default:
      return "text-gray-400";
  }
}

export function expiryBadgeClass(tone: ExpiryTone): string {
  switch (tone) {
    case "expired":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "carried":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "warning":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "normal":
      return "bg-gray-50 text-gray-600 border-gray-200";
    default:
      return "bg-gray-50 text-gray-400 border-gray-200";
  }
}

export function formatThaiDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDuration(days: number | undefined | null): string {
  if (!days || days <= 0) return "";
  if (days % 30 === 0) {
    const months = days / 30;
    return months === 1 ? "เรียนได้ 1 เดือน" : `เรียนได้ ${months} เดือน`;
  }
  return `เรียนได้ ${days} วัน`;
}
