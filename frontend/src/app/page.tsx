"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import HeroSlider from "@/components/HeroSlider";
import SocialLinks from "@/components/SocialLinks";
import { fetchAllCourses } from "@/services/courseAPI";
import { homeContentAPI } from "@/services/homeContentAPI";
import { reviewAPI } from "@/services/reviewAPI";
import { CourseDTO } from "@/types/course";
import { PublicHome } from "@/types/homeContent";
import { Review } from "@/types/review";
import { BookOpen, Loader2, Star, UserRound } from "lucide-react";

export default function Home() {
  const [courses, setCourses] = useState<CourseDTO[]>([]);
  const [home, setHome] = useState<PublicHome | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        // โหลดคอร์ส + เนื้อหาหน้าแรกพร้อมกัน โดยไม่ให้ตัวใดตัวหนึ่งพังทั้งหน้า
        const [coursesRes, homeRes] = await Promise.allSettled([
          fetchAllCourses(),
          homeContentAPI.getPublicHome(),
        ]);

        if (coursesRes.status === "fulfilled") setCourses(coursesRes.value);
        if (homeRes.status === "fulfilled") {
          setHome(homeRes.value);
          // โหลดรีวิว featured เฉพาะเมื่อแอดมินเปิดใช้งาน
          if (homeRes.value.content.show_featured_reviews) {
            try {
              setReviews(await reviewAPI.getFeaturedReviews());
            } catch (e) {
              console.error("โหลดรีวิวไม่สำเร็จ:", e);
            }
          }
        }
      } catch (error) {
        console.error("โหลดข้อมูลหน้าแรกไม่สำเร็จ:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const content = home?.content;
  const slideImages = (home?.slides ?? []).map((s) => s.image_url);
  const coaches = home?.featured_coaches ?? [];

  // แผนที่ที่ตั้ง: รองรับทั้งกรณีแอดมินวาง src ตรงๆ หรือวาง <iframe .../> ทั้งก้อน
  const rawMap = content?.map_embed_url?.trim() ?? "";
  const mapSrc = rawMap.includes("<iframe")
    ? rawMap.match(/src="([^"]+)"/i)?.[1] ?? ""
    : rawMap;
  const showMap = mapSrc.startsWith("http");

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">

      <main className="w-full">
        <HeroSlider images={slideImages} />
      </main>

      {/* 2. ส่วนบุคลากร */}
      <section id="coaches" className="w-full py-20 bg-white">
        <div className="container mx-auto px-6 md:px-12 lg:px-24">
          <h2 className="text-4xl font-bold text-gray-800 text-center">
            {content?.coaches_title || "บุคลากร"}
          </h2>
          {content?.coaches_subtitle && (
            <p className="mt-3 text-center text-gray-500 max-w-2xl mx-auto">{content.coaches_subtitle}</p>
          )}

          {coaches.length === 0 ? (
            <p className="mt-12 text-center text-gray-400">เร็วๆ นี้</p>
          ) : (
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {coaches.map((coach) => {
                const name =
                  coach.nickname ||
                  [coach.firstName, coach.lastName].filter(Boolean).join(" ") ||
                  `โค้ช #${coach.id}`;
                return (
                  <div key={coach.id} className="flex flex-col items-center text-center">
                    {coach.profile_picture ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={coach.profile_picture} alt={name}
                        className="w-40 h-40 rounded-full object-cover shadow-md" />
                    ) : (
                      <div className="w-40 h-40 rounded-full bg-gray-100 flex items-center justify-center text-gray-300 shadow-md">
                        <UserRound className="w-16 h-16" />
                      </div>
                    )}
                    <h3 className="mt-5 text-xl font-bold text-gray-900">{name}</h3>
                    {coach.specialization && (
                      <p className="mt-1 text-sm text-[#CC0000] font-medium">{coach.specialization}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 3. ส่วนคอร์สเรียน */}
      <section id="courses" className="w-full py-20 bg-gray-50">
        <div className="container mx-auto px-6 md:px-12 lg:px-24">
          <h2 className="text-4xl font-bold text-gray-800 text-center mb-3">
            {content?.courses_title || "คอร์สเรียน"}
          </h2>
          {content?.courses_subtitle && (
            <p className="mb-9 text-center text-gray-500 max-w-2xl mx-auto">{content.courses_subtitle}</p>
          )}
          <div className="mb-3" />

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

      {/* 4. ส่วนเสียงจากผู้เรียน (รีวิว) */}
      {content?.show_featured_reviews && reviews.length > 0 && (
        <section id="reviews" className="w-full py-20 bg-white">
          <div className="container mx-auto px-6 md:px-12 lg:px-24">
            <h2 className="text-4xl font-bold text-gray-800 text-center mb-3">
              {content.reviews_title || "เสียงจากผู้เรียน"}
            </h2>
            {content.reviews_subtitle && (
              <p className="mb-12 text-center text-gray-500 max-w-2xl mx-auto">{content.reviews_subtitle}</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {reviews.map((review) => (
                <div key={review.id} className="bg-gray-50 border border-gray-200 rounded-2xl p-6 flex flex-col">
                  <div className="flex items-center gap-1 mb-3">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star key={star} size={18}
                        className={star <= review.rating ? "text-amber-400" : "text-gray-300"}
                        fill={star <= review.rating ? "currentColor" : "none"} />
                    ))}
                  </div>
                  <p className="text-gray-600 text-sm leading-relaxed flex-grow whitespace-pre-line">
                    {review.comment}
                  </p>
                  <div className="mt-4 pt-4 border-t border-gray-200 text-sm">
                    <span className="font-bold text-gray-800">
                      {review.customer?.nickname ||
                        [review.customer?.firstName, review.customer?.lastName].filter(Boolean).join(" ") ||
                        "ผู้เรียน"}
                    </span>
                    {review.course?.course_name && (
                      <span className="text-gray-400"> · {review.course.course_name}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 5. ส่วนเกี่ยวกับเรา */}
      <section id="about" className="w-full py-20 bg-gray-50">
        <div className="container mx-auto px-6 md:px-12 lg:px-24">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-bold text-gray-800">
                {content?.about_title || "เกี่ยวกับเรา"}
              </h2>
              <p className="mt-6 text-gray-600 leading-relaxed whitespace-pre-line">
                {content?.about_content || "เร็วๆ นี้"}
              </p>
              {content && (
                <SocialLinks content={content} variant="light" className="mt-8" />
              )}
            </div>
            {showMap && (
              <iframe
                src={mapSrc}
                title={content?.about_title || "แผนที่ที่ตั้ง"}
                className="w-full h-96 rounded-2xl shadow-lg border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            )}
          </div>
        </div>
      </section>

      {/* 6. ท้ายหน้า (Footer) */}
      <footer className="w-full bg-gray-900 text-gray-400 py-12">
        <div className="container mx-auto px-6 md:px-12 lg:px-24 flex flex-col items-center gap-6 text-center">
          {content && (
            <SocialLinks content={content} variant="dark" />
          )}
          <p className="text-sm">
            © {new Date().getFullYear()}{" "}
            <span className="font-semibold text-white">
              {content?.about_title || "เกี่ยวกับเรา"}
            </span>
            . สงวนลิขสิทธิ์.
          </p>
        </div>
      </footer>

    </div>
  );
}
