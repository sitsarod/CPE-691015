"use client";

import { useEffect, useState } from "react";
import { FileEdit, Bookmark, LayoutGrid, Loader2 } from "lucide-react";
import { Enrollment, Course } from "@/types/enrollment";
import { fetchCustomerEnrollments, fetchAvailableCourses } from "@/services/enrollmentAPI";

export default function EnrollmentPage() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [recommendedCourses, setRecommendedCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const token = localStorage.getItem("token");
        const customerId = localStorage.getItem("user_id"); 

        if (!token) throw new Error("ไม่พบ Token กรุณาเข้าสู่ระบบใหม่");
        if (!customerId) throw new Error("ไม่พบข้อมูลผู้ใช้งาน (Customer ID)");

        const [enrollmentsData, coursesData] = await Promise.all([
          fetchCustomerEnrollments(customerId, token),
          fetchAvailableCourses(token)
        ]);
        
        setEnrollments(enrollmentsData);
        setRecommendedCourses(coursesData);

      } catch (err: any) {
        console.error("Fetch Error:", err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  if (isLoading) {
    return (
      <div className="w-full h-[60vh] flex flex-col items-center justify-center text-gray-500">
        <Loader2 className="w-10 h-10 animate-spin text-[#CC0000] mb-4" />
        <p className="text-lg font-medium">กำลังโหลดข้อมูล...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full p-6 bg-red-50 border border-red-200 rounded-lg text-red-600">
        <p className="font-bold text-lg mb-2">พบปัญหา:</p>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* ---------------- ส่วนที่ 1: คอร์สของฉัน ---------------- */}
      <div className="mb-14">
        <h1 className="text-[22px] font-bold text-gray-900 mb-8">คอร์สของฉัน</h1>
        
        {enrollments.length === 0 ? (
          <p className="text-gray-500 text-[16px]">คุณยังไม่มีข้อมูลการลงทะเบียนคอร์สเรียนในขณะนี้</p>
        ) : (
          <div className="flex flex-wrap gap-10">
            {enrollments.map((item) => {
              const courseName = item.package?.course?.course_name || `คอร์ส รหัส ${item.package?.course_id}`;

              return (
                <div 
                  key={item.ID} 
                  className="w-[240px] h-[340px] border border-gray-400 rounded-lg p-6 flex flex-col justify-between shadow-sm hover:shadow-md hover:border-[#CC0000] transition-all cursor-pointer bg-white group"
                >
                  <div className="flex-1 flex justify-center items-center">
                    <FileEdit 
                      className="w-32 h-32 text-[#CC0000] group-hover:scale-105 transition-transform" 
                      strokeWidth={1.2} 
                    />
                  </div>
                  <div className="mt-4">
                    <p className="text-gray-900 font-bold text-[18px] truncate" title={courseName}>
                      {courseName}
                    </p>
                    <p className="text-gray-800 font-semibold mt-1 text-[16px]">
                      เรียน {item.total_sessions} ครั้ง 
                      <span className="text-sm text-gray-500 font-normal block mt-0.5">
                        (คงเหลือ {item.remaining_sessions} ครั้ง)
                      </span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <hr className="my-10 border-gray-300" />

      {/* ---------------- ส่วนที่ 2: แนะนำคอร์ส ---------------- */}
      <div className="mb-10 w-full">
        <div className="flex justify-end mb-6">
          <span className="flex items-center gap-3 text-gray-900 font-bold text-[18px]">
            <LayoutGrid className="w-6 h-6 text-[#CC0000]" />
            แนะนำคอร์ส
          </span>
        </div>

        {recommendedCourses.length === 0 ? (
          <p className="text-gray-500 text-right">ไม่มีคอร์สแนะนำในขณะนี้</p>
        ) : (
          <div className="flex flex-wrap gap-10">
            {recommendedCourses.map((course) => (
              <div key={course.ID} className="w-[200px] group cursor-pointer">
                <div className="w-full h-[260px] bg-[#CC0000] rounded-sm relative shadow-md group-hover:bg-red-700 transition-colors flex justify-center">
                  <Bookmark className="w-16 h-16 text-white absolute top-6" fill="currentColor" strokeWidth={1} />
                </div>
                <div className="mt-5">
                  <p className="text-gray-900 font-bold text-[18px] leading-snug line-clamp-2" title={course.course_name}>
                    {course.course_name}
                  </p>
                  <p className="text-gray-600 font-medium mt-2 text-[14px] leading-snug line-clamp-2" title={course.description}>
                    {course.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}