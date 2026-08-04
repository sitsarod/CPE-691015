"use client";

import { useEffect, useState } from "react";
import { fetchAllCourses } from "@/services/courseAPI";
import { CourseDTO } from "@/types/course";
import { Loader2 } from "lucide-react";
import CourseSummaryCard from "@/components/course/CourseSummaryCard";

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCourses = async () => {
      try {
        setCourses(await fetchAllCourses());
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "ไม่สามารถโหลดข้อมูลคอร์สเรียนได้"
        );
      } finally {
        setIsLoading(false);
      }
    };
    loadCourses();
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Loader2 className="animate-spin text-[#CC0000]" />
      </div>
    );
  }

  if (error) {
    return <div className="p-20 text-center text-red-600">{error}</div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-bold text-gray-900">คอร์สเรียนแบดมินตัน</h1>
        <p className="mt-3 text-gray-500">
          เลือกคอร์สที่เหมาะกับระดับและเป้าหมายของคุณ
        </p>
      </div>

      {courses.length === 0 ? (
        <p className="py-16 text-center text-gray-400">
          ยังไม่มีคอร์สเปิดรับสมัครในขณะนี้
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseSummaryCard
              key={course.id}
              course={course}
              href={`/courses/${course.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
