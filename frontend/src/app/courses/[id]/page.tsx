"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchAllCourses } from "@/services/courseAPI";
import { CourseDTO } from "@/types/course";
import { Loader2, ArrowLeft, Calendar, Clock, DollarSign } from "lucide-react";

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [course, setCourse] = useState<CourseDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadCourseDetail = async () => {
      try {
        const data = await fetchAllCourses();
        const found = data.find((c) => c.id.toString() === params.id);
        setCourse(found || null);
      } catch (err) {
        console.error("Error:", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadCourseDetail();
  }, [params.id]);

  const handleEnroll = (packageId: number) => {
    const token = localStorage.getItem("token");
    if (!token) router.push("/login");
    else router.push(`/customer/enrollment?pkg=${packageId}`);
  };

  if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-[#CC0000]" /></div>;
  if (!course) return <div className="text-center p-20">ไม่พบคอร์สที่ต้องการ</div>;

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <button onClick={() => router.back()} className="flex items-center text-gray-500 mb-8 hover:text-black">
        <ArrowLeft className="w-4 h-4 mr-2" /> ย้อนกลับ
      </button>

      <h1 className="text-4xl font-bold mb-4">{course.course_name}</h1>
      <p className="text-gray-600 mb-10 text-lg">{course.description}</p>

      <div className="space-y-6">
        <h2 className="text-2xl font-bold">แพ็กเกจทั้งหมด</h2>
        {course.packages.map((pkg) => (
          <div key={pkg.id} className="bg-white border p-6 rounded-xl shadow-sm flex items-center justify-between gap-6">
            <div className="flex-1">
              <h3 className="text-lg font-bold mb-2">แพ็กเกจ {pkg.sessions_count} ครั้ง</h3>
              <div className="flex gap-6 text-sm text-gray-600">
                <span className="flex items-center"><Clock className="w-4 h-4 mr-1" /> {pkg.hours_count} ชม.</span>
                <span className="flex items-center"><Calendar className="w-4 h-4 mr-1" />
                    {pkg.schedules.map(s => `${s.day_of_week} (${s.start_time}-${s.end_time})`).join(', ')}
                </span>
              </div>
            </div>
            
            <div className="text-right">
              <p className="text-xl font-black text-[#CC0000] mb-2">{pkg.price.toLocaleString()} บาท</p>
              <button 
                onClick={() => handleEnroll(pkg.id)}
                className="bg-[#CC0000] text-white px-6 py-2 rounded-lg font-bold hover:bg-red-700"
              >
                สมัครเรียน
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}