"use client";

import Link from "next/link";
import CourseCover from "./CourseCover";
import { BookOpen, ArrowRight, GraduationCap, Layers, Users2 } from "lucide-react";
import { CourseDTO } from "@/types/course";
import { priceRange, seatsTotal } from "./courseUtils";

interface CourseSummaryCardProps {
  course: CourseDTO;
  /** โหมดลิงก์ — ใช้ในหน้า public ที่ไปยังอีกหน้าจริง */
  href?: string;
  /** โหมดกดในหน้า — ใช้ในหน้า customer ที่สลับมุมมองอยู่กับที่ */
  onClick?: (course: CourseDTO) => void;
}

/**
 * การ์ดสรุปคอร์สแบบกระชับ — แสดงเท่าที่จำเป็นต่อการตัดสินใจว่าจะกดเข้าไปดูต่อไหม
 *
 * ตั้งใจไม่ใส่รายละเอียดแพ็กเกจทั้งหมดลงในนี้ เพราะการวางทุกอย่างไว้หน้าเดียว
 * ทำให้หน้ารกจนเทียบคอร์สกันไม่ออก รายละเอียดเต็มอยู่ที่ CourseDetail
 */
export default function CourseSummaryCard({
  course,
  href,
  onClick,
}: CourseSummaryCardProps) {
  const packages = course.packages ?? [];
  const outcomes = course.learning_outcomes ?? [];
  const range = priceRange(packages);

  const groupSizes = packages.map(seatsTotal).filter((n) => n > 0);
  const smallestGroup = groupSizes.length > 0 ? Math.min(...groupSizes) : 0;

  // แสดงตัวอย่าง 3 ข้อแรกพอให้เห็นภาพ ที่เหลือสรุปเป็นตัวเลข
  const previewOutcomes = outcomes.slice(0, 3);
  const remainingCount = outcomes.length - previewOutcomes.length;

  const body = (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-sm transition-all group-hover:border-[#CC0000] group-hover:shadow-xl">
      <CourseCover
        src={course.image_url}
        alt={course.course_name}
        className="aspect-[16/9] w-full shrink-0 bg-gray-50 object-cover"
      />

      <div className="flex flex-1 flex-col p-7">
        {!course.image_url && <BookOpen className="mb-4 h-8 w-8 text-[#CC0000]" />}

        <h2 className="mb-2.5 text-xl font-bold text-gray-900">
          {course.course_name}
        </h2>

        <p className="mb-5 line-clamp-3 text-sm leading-relaxed text-gray-600">
          {course.description}
        </p>

        {previewOutcomes.length > 0 && (
          <div className="mb-5">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-gray-700">
              <GraduationCap className="h-3.5 w-3.5 text-[#CC0000]" />
              สิ่งที่จะได้เรียนรู้
            </div>
            <ul className="space-y-1">
              {previewOutcomes.map((item, idx) => (
                <li
                  key={`preview-${course.id}-${idx}`}
                  className="flex items-start gap-2 text-xs leading-relaxed text-gray-500"
                >
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#CC0000]" />
                  <span className="line-clamp-1">{item}</span>
                </li>
              ))}
            </ul>
            {remainingCount > 0 && (
              <p className="mt-1.5 pl-3 text-xs font-semibold text-gray-400">
                และอีก {remainingCount} หัวข้อ
              </p>
            )}
          </div>
        )}

        <div className="mt-auto space-y-3 border-t border-gray-100 pt-4">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              {packages.length} แพ็กเกจ
            </span>
            {smallestGroup > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Users2 className="h-3.5 w-3.5" />
                {smallestGroup <= 2 ? "ตัวต่อตัว" : `ไม่เกิน ${smallestGroup} คน`}
              </span>
            )}
          </div>

          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] text-gray-400">เริ่มต้น</p>
              <p className="text-lg font-black text-[#CC0000]">
                {range ? (
                  <>
                    {range.min.toLocaleString("th-TH")}
                    <span className="ml-1 text-xs font-bold text-gray-400">บาท</span>
                  </>
                ) : (
                  <span className="text-sm font-bold text-gray-500">
                    สอบถามราคา
                  </span>
                )}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-bold text-[#CC0000]">
              ดูรายละเอียด
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </div>
    </article>
  );

  if (href) {
    return (
      <Link href={href} className="group block h-full">
        {body}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onClick?.(course)}
      className="group block h-full w-full"
    >
      {body}
    </button>
  );
}
