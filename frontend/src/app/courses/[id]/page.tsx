"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchCourseByID } from "@/services/courseAPI";
import { CourseDTO, CoursePackageDTO } from "@/types/course";
import { Loader2, ArrowLeft } from "lucide-react";
import CourseDetail from "@/components/course/CourseDetail";

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [course, setCourse] = useState<CourseDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCourseDetail = async () => {
      const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
      const courseId = Number(rawId);

      if (!rawId || Number.isNaN(courseId)) {
        setError("รหัสคอร์สไม่ถูกต้อง");
        setIsLoading(false);
        return;
      }

      try {
        // เดิมหน้านี้ดึงคอร์สทั้งหมดมาแล้ว .find() เอง ซึ่งโหลดข้อมูลเกินจำเป็น
        // และไม่ได้ 404 จริงเมื่อไม่มีคอร์สนั้น — เปลี่ยนมาใช้ endpoint ราย id ตรง ๆ
        setCourse(await fetchCourseByID(courseId));
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "ไม่พบคอร์สที่ต้องการ"
        );
      } finally {
        setIsLoading(false);
      }
    };
    loadCourseDetail();
  }, [params.id]);

  const handleEnroll = (pkg: CoursePackageDTO) => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    router.push(`/customer/enrollment?pkg=${pkg.id}`);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Loader2 className="animate-spin text-[#CC0000]" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-20 text-center">
        <p className="mb-6 text-gray-600">{error ?? "ไม่พบคอร์สที่ต้องการ"}</p>
        <button
          onClick={() => router.push("/courses")}
          className="rounded-lg bg-[#CC0000] px-6 py-2.5 font-bold text-white hover:bg-red-700"
        >
          กลับไปหน้าคอร์สทั้งหมด
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <button
        onClick={() => router.back()}
        className="mb-8 flex items-center text-gray-500 transition-colors hover:text-black"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> ย้อนกลับ
      </button>

      <CourseDetail
        course={course}
        headingLevel="h1"
        ctaLabel="สมัครเรียนแพ็กเกจนี้"
        onSelectPackage={handleEnroll}
      />
    </div>
  );
}
