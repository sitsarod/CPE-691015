"use client";

import { Clock, Calendar, Users, Timer, TicketCheck } from "lucide-react";
import { CoursePackageDTO } from "@/types/course";
import {
  dayLabel,
  groupSchedulesByTime,
  pricePerSession,
  pricePerHour,
  hoursPerSession,
  seatsLeft,
  seatsTotal,
  seatsFillPercent,
  isFull,
  isAlmostFull,
  formatPrice,
  formatNumber,
} from "./courseUtils";

interface PackageCardProps {
  pkg: CoursePackageDTO;
  ctaLabel?: string;
  onSelect?: (pkg: CoursePackageDTO) => void;
}

export default function PackageCard({
  pkg,
  ctaLabel = "สมัครเรียนแพ็กเกจนี้",
  onSelect,
}: PackageCardProps) {
  const perSession = pricePerSession(pkg);
  const perHour = pricePerHour(pkg);
  const perSessionHours = hoursPerSession(pkg);
  const scheduleGroups = groupSchedulesByTime(pkg.schedules);
  const full = isFull(pkg);
  const almostFull = isAlmostFull(pkg);
  const left = seatsLeft(pkg);
  const total = seatsTotal(pkg);
  const fillPercent = seatsFillPercent(pkg);

  return (
    <div
      className={`relative flex w-full flex-col overflow-hidden rounded-2xl border bg-white transition-all ${
        full
          ? "border-gray-200 opacity-70"
          : "border-gray-200 shadow-sm hover:border-gray-300 hover:shadow-md"
      }`}
    >
      <div className="flex flex-1 flex-col p-6">
        {/* หัวการ์ด: จำนวนครั้ง */}
        <div className="mb-5">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            แพ็กเกจ
          </span>
          <h4 className="mt-1 text-2xl font-black tracking-tight text-gray-900">
            {pkg.sessions_count} ครั้ง
          </h4>
        </div>

        {/* รายละเอียดที่คำนวณได้ */}
        <dl className="mb-5 space-y-2.5 text-sm">
          <DetailRow
            icon={<Clock className="h-4 w-4" />}
            label="เวลาเรียนรวม"
            value={`${pkg.hours_count} ชั่วโมง`}
          />
          {perSessionHours > 0 && (
            <DetailRow
              icon={<Timer className="h-4 w-4" />}
              label="ต่อครั้ง"
              value={`${formatNumber(perSessionHours)} ชั่วโมง`}
            />
          )}
          {total > 0 && (
            <DetailRow
              icon={<Users className="h-4 w-4" />}
              label="ขนาดกลุ่ม"
              value={total <= 2 ? `ตัวต่อตัว (${total} คน)` : `ไม่เกิน ${total} คน`}
            />
          )}
        </dl>

        {/* ตารางเรียน */}
        {scheduleGroups.length > 0 && (
          <div className="mb-5 rounded-xl border border-gray-100 bg-gray-50/70 p-3.5">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-gray-700">
              <Calendar className="h-3.5 w-3.5 text-[#CC0000]" />
              รอบเวลาเรียน
            </div>
            <div className="space-y-1.5">
              {scheduleGroups.map((group, idx) => (
                <div key={`sch-${pkg.id}-${idx}`} className="text-xs">
                  <span className="font-semibold text-gray-700">
                    {group.days.map(dayLabel).join(" · ")}
                  </span>
                  <span className="ml-2 rounded bg-white px-2 py-0.5 text-[11px] text-gray-500 ring-1 ring-gray-100">
                    {group.startTime} - {group.endTime}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ที่นั่ง */}
        {total > 0 && (
          <div className="mb-5">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-gray-500">ที่นั่ง</span>
              <span
                className={`font-bold ${
                  full
                    ? "text-gray-400"
                    : almostFull
                    ? "text-orange-600"
                    : "text-green-600"
                }`}
              >
                {full ? "เต็มแล้ว" : `เหลือ ${left} จาก ${total} ที่`}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-all ${
                  full
                    ? "bg-gray-300"
                    : almostFull
                    ? "bg-orange-400"
                    : "bg-green-500"
                }`}
                style={{ width: `${fillPercent}%` }}
              />
            </div>
            {almostFull && (
              <p className="mt-1.5 text-[11px] font-semibold text-orange-600">
                ใกล้เต็มแล้ว
              </p>
            )}
          </div>
        )}

        {/* ราคา */}
        <div className="mt-auto border-t border-gray-100 pt-4">
          <p className="mb-0.5 text-xs font-medium text-gray-400">ราคาแพ็กเกจ</p>
          <p className="text-3xl font-black leading-none text-[#CC0000]">
            {pkg.price ? pkg.price.toLocaleString("th-TH") : "—"}
            {pkg.price > 0 && (
              <span className="ml-1.5 text-base font-bold tracking-normal text-gray-400">
                บาท
              </span>
            )}
          </p>
          {!pkg.price && (
            <p className="mt-1 text-sm font-semibold text-gray-500">
              {formatPrice(pkg.price)}
            </p>
          )}

          {(perSession !== null || perHour !== null) && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
              {perSession !== null && (
                <span>
                  เฉลี่ย{" "}
                  <strong className="font-bold text-gray-700">
                    {Math.round(perSession).toLocaleString("th-TH")}
                  </strong>{" "}
                  บาท/ครั้ง
                </span>
              )}
              {perHour !== null && (
                <span>
                  <strong className="font-bold text-gray-700">
                    {Math.round(perHour).toLocaleString("th-TH")}
                  </strong>{" "}
                  บาท/ชั่วโมง
                </span>
              )}
            </div>
          )}
        </div>

        {/* ปุ่ม */}
        {onSelect && (
          <button
            type="button"
            disabled={full}
            onClick={() => !full && onSelect(pkg)}
            className={`mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-bold transition-all ${
              full
                ? "cursor-not-allowed bg-gray-100 text-gray-400"
                : "bg-[#CC0000] text-white shadow-md shadow-red-200 hover:bg-red-700"
            }`}
          >
            {!full && <TicketCheck className="h-4 w-4" />}
            {full ? "ที่นั่งเต็มแล้ว" : ctaLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-2 text-gray-500">
        <span className="text-gray-400">{icon}</span>
        {label}
      </dt>
      <dd className="font-semibold text-gray-800">{value}</dd>
    </div>
  );
}
