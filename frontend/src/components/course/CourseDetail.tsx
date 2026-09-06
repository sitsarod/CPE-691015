"use client";

import { GraduationCap, CircleCheck, Layers, Clock3, Users2 } from "lucide-react";
import { CourseDTO, CoursePackageDTO } from "@/types/course";
import PackageCard from "./PackageCard";
import CourseCover from "./CourseCover";
import { priceRange, seatsTotal } from "./courseUtils";

interface CourseDetailProps {
  course: CourseDTO;
  ctaLabel?: string;
  onSelectPackage?: (pkg: CoursePackageDTO, course: CourseDTO) => void;
  /** ระดับหัวข้อชื่อคอร์ส — หน้ารายละเอียดใช้ h1, หน้ารวมคอร์สใช้ h2 */
  headingLevel?: "h1" | "h2";
}

/**
 * บล็อกรายละเอียดคอร์สหนึ่งคอร์ส: ชื่อ + คำอธิบาย + สิ่งที่จะได้เรียนรู้ + แพ็กเกจทั้งหมด
 *
 * ใช้ร่วมกันทั้งหน้า /courses/[id] (public) และ /customer/enrollment
 * เพื่อไม่ให้ผู้เรียนเห็นข้อมูลคอร์สไม่เท่ากันในสองหน้า
 */
export default function CourseDetail({
  course,
  ctaLabel,
  onSelectPackage,
  headingLevel = "h2",
}: CourseDetailProps) {
  const packages = course.packages ?? [];
  const outcomes = course.learning_outcomes ?? [];
  const range = priceRange(packages);
  const Heading = headingLevel;

  // ขนาดกลุ่มเล็กสุดที่มีในคอร์ส ใช้บอกภาพรวมว่าเป็นคอร์สกลุ่มหรือตัวต่อตัว
  const groupSizes = packages.map(seatsTotal).filter((n) => n > 0);
  const smallestGroup = groupSizes.length > 0 ? Math.min(...groupSizes) : 0;

  const totalHoursRange = packages
    .map((p) => p.hours_count)
    .filter((h) => h > 0);

  return (
    <section className="w-full">
      <CourseCover
        src={course.image_url}
        alt={course.course_name}
        width={1280}
        height={720}
        className="mb-6 aspect-[16/9] w-full max-w-3xl rounded-2xl bg-gray-50 object-cover"
      />

      {/* ── หัวคอร์ส ── */}
      <div className="mb-6">
        <Heading
          className={`border-l-4 border-[#CC0000] pl-4 font-black tracking-tight text-gray-900 ${
            headingLevel === "h1" ? "text-4xl" : "text-3xl"
          }`}
        >
          {course.course_name}
        </Heading>

        {course.description && (
          <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-gray-600">
            {course.description}
          </p>
        )}

        {/* สรุปตัวเลขภาพรวมของคอร์ส */}
        <div className="mt-5 flex flex-wrap gap-2.5">
          <SummaryChip
            icon={<Layers className="h-3.5 w-3.5" />}
            label={`${packages.length} แพ็กเกจให้เลือก`}
          />
          {totalHoursRange.length > 0 && (
            <SummaryChip
              icon={<Clock3 className="h-3.5 w-3.5" />}
              label={
                Math.min(...totalHoursRange) === Math.max(...totalHoursRange)
                  ? `${totalHoursRange[0]} ชั่วโมง`
                  : `${Math.min(...totalHoursRange)}–${Math.max(
                      ...totalHoursRange
                    )} ชั่วโมง`
              }
            />
          )}
          {smallestGroup > 0 && (
            <SummaryChip
              icon={<Users2 className="h-3.5 w-3.5" />}
              label={
                smallestGroup <= 2
                  ? "เรียนตัวต่อตัว"
                  : `กลุ่มเล็ก ไม่เกิน ${smallestGroup} คน`
              }
            />
          )}
          {range && (
            <SummaryChip
              icon={<span className="text-[13px] font-black leading-none">฿</span>}
              label={
                range.min === range.max
                  ? range.min.toLocaleString("th-TH")
                  : `${range.min.toLocaleString(
                      "th-TH"
                    )} – ${range.max.toLocaleString("th-TH")}`
              }
              highlight
            />
          )}
        </div>
      </div>

      {/* ── สิ่งที่จะได้เรียนรู้ ── */}
      {outcomes.length > 0 && (
        <div className="mb-8 rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-red-50/30 p-6">
          <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-gray-900">
            <GraduationCap className="h-5 w-5 text-[#CC0000]" />
            สิ่งที่จะได้เรียนรู้
          </h3>
          <ul className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
            {outcomes.map((item, idx) => (
              <li
                key={`outcome-${course.id}-${idx}`}
                className="flex items-start gap-2.5 text-sm leading-relaxed text-gray-700"
              >
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#CC0000]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── แพ็กเกจ ── */}
      {packages.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
          คอร์สนี้ยังไม่มีแพ็กเกจเปิดรับสมัคร
        </p>
      ) : (
        <div
          className="-mx-1 flex snap-x snap-mandatory gap-6 overflow-x-auto px-1 pb-2
                     [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {packages.map((pkg) => (
            <div
              key={`pkg-${pkg.id}`}
              className="w-[min(20rem,82vw)] shrink-0 snap-start"
            >
              <PackageCard
                pkg={pkg}
                ctaLabel={ctaLabel}
                onSelect={
                  onSelectPackage ? (p) => onSelectPackage(p, course) : undefined
                }
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SummaryChip({
  icon,
  label,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  highlight?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
        highlight
          ? "border-red-100 bg-red-50 text-[#CC0000]"
          : "border-gray-200 bg-white text-gray-600"
      }`}
    >
      {icon}
      {label}
    </span>
  );
}
