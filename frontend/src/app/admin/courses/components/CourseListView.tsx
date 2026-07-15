"use client";

import { useState, useEffect } from "react";
import { Clock, Calendar, Loader2, BookOpen } from "lucide-react"; // ลบ Edit ออก
import { fetchAllCourses } from "@/services/courseAPI";
import { CourseDTO } from "@/types/course";

export default function CourseListView() { 
  const [courses, setCourses] = useState<CourseDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCourses = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAllCourses();
      setCourses(data);
    } catch (err: any) {
      setError(err.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  if (isLoading) return <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#CC0000]" /></div>;
  if (error) return <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200">{error}</div>;
  if (courses.length === 0) return <div className="text-center py-20 text-gray-500">ยังไม่มีข้อมูลคอร์สเรียนในระบบ</div>;

  return (
    <div className="space-y-8">
      {courses.map((course: any) => (
        <div key={course.id || course.ID} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-gray-50 p-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center">
              <BookOpen className="w-6 h-6 text-[#CC0000] mr-3" />
              <div>
                <h3 className="text-xl font-bold text-gray-900">{course.course_name}</h3>
                <p className="text-sm text-gray-500">{course.description}</p>
              </div>
            </div>
          </div>
          
          <div className="p-6">
            <h4 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wide">แพ็กเกจในคอร์สนี้</h4>
            <div className="flex flex-wrap gap-4">
              {(course.packages ?? []).map((pkg: any) => (
                <div key={pkg.id || pkg.ID} className="w-[280px] bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-lg text-gray-900">{pkg.sessions_count} ครั้ง</span>
                    <span className="bg-red-100 text-[#CC0000] text-xs font-bold px-2 py-1 rounded">
                      {pkg.price.toLocaleString()} ฿
                    </span>
                  </div>
                  <div className="flex items-center text-gray-500 text-sm mb-4">
                    <Clock className="w-4 h-4 mr-1" /> รวม {pkg.hours_count} ชม.
                  </div>
                  
                  <div className="bg-gray-50 rounded p-2 text-xs text-gray-600">
                    <div className="font-semibold mb-1 flex items-center">
                      <Calendar className="w-3 h-3 mr-1" /> ตารางเรียน
                    </div>
                    {pkg.schedules && pkg.schedules.length > 0 ? (
                      <ul className="space-y-1 pl-4 list-disc marker:text-gray-300">
                        {pkg.schedules.map((sch: any, i: number) => (
                          <li key={i}>{sch.day_of_week} ({sch.start_time}-{sch.end_time})</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-gray-400">ยังไม่ระบุ</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}