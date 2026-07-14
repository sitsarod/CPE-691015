"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchAllCourses } from "@/services/courseAPI";
import { CourseDTO } from "@/types/course";
import { Loader2, BookOpen } from "lucide-react";

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadCourses = async () => {
      try {
        const data = await fetchAllCourses();
        setCourses(data);
      } catch (err) {
        console.error("Error loading courses:", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadCourses();
  }, []);

  if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-[#CC0000]" /></div>;

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-12 text-center">คอร์สเรียนแบดมินตัน</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {courses.map((course) => (
          <Link key={course.id} href={`/courses/${course.id}`}>
            <div className="bg-white border p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all h-full flex flex-col">
              <BookOpen className="w-8 h-8 text-[#CC0000] mb-4" />
              <h2 className="text-xl font-bold mb-3">{course.course_name}</h2>
              <p className="text-gray-600 text-sm flex-grow mb-6">{course.description}</p>
              <span className="text-[#CC0000] font-bold text-sm">ดูรายละเอียดแพ็กเกจ →</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}