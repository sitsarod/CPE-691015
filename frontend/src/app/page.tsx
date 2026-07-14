"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import HeroSlider from "@/components/HeroSlider";
import { fetchAllCourses } from "@/services/courseAPI";
import { CourseDTO } from "@/types/course";
import { BookOpen, Loader2 } from "lucide-react";

export default function Home() {
  const [courses, setCourses] = useState<CourseDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadCourses = async () => {
      try {
        const data = await fetchAllCourses();
        setCourses(data);
      } catch (error) {
        console.error("Failed to fetch courses:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadCourses();
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      
      <main className="w-full">
        <HeroSlider />
      </main>

      {/* 2. พื้นที่ส่วนบุคลากร */}
      <section id="coaches" className="w-full min-h-screen bg-white flex items-center justify-center border-t">
        <h2 className="text-4xl font-bold text-gray-800">บุคลากร (Coaches)</h2>
      </section>

      {/* 3. พื้นที่ส่วนคอร์สเรียน (เปลี่ยนเป็นแบบคลิกไปดูรายละเอียด) */}
      <section id="courses" className="w-full py-20 bg-gray-50 border-t">
        <div className="container mx-auto px-6">
          <h2 className="text-4xl font-bold text-gray-800 text-center mb-12">คอร์สเรียน (Courses)</h2>

          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-10 h-10 animate-spin text-[#CC0000]" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {courses.map((course) => (
                <Link key={course.id} href={`/courses/${course.id}`}>
                  <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm hover:shadow-xl transition-all duration-300 h-full flex flex-col">
                    <div className="flex items-center gap-3 mb-4">
                      <BookOpen className="w-6 h-6 text-[#CC0000]" />
                      <span className="bg-red-100 text-[#CC0000] text-xs font-bold px-3 py-1 rounded-full uppercase">
                        {course.status}
                      </span>
                    </div>
                    
                    <h3 className="text-xl font-bold text-gray-900 mb-3">{course.course_name}</h3>
                    <p className="text-gray-600 text-sm mb-6 flex-grow line-clamp-3">
                      {course.description}
                    </p>
                    
                    <div className="border-t pt-4 text-center">
                      <span className="text-[#CC0000] font-semibold text-sm hover:underline">
                        ดูรายละเอียดและแพ็กเกจทั้งหมด →
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 4. พื้นที่ส่วนเกี่ยวกับฉัน */}
      <section id="about" className="w-full min-h-screen bg-white flex items-center justify-center border-t">
        <h2 className="text-4xl font-bold text-gray-800">เกี่ยวกับฉัน (About)</h2>
      </section>

    </div>
  );
}