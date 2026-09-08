"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import HeroSlider from "@/components/HeroSlider";
import AnnouncementNewsSection from "@/components/AnnouncementNewsSection";
import AnnouncementDetailModal from "@/components/AnnouncementDetailModal";
import SocialLinks from "@/components/SocialLinks";
import { fetchAllCourses } from "@/services/courseAPI";
import { homeContentAPI } from "@/services/homeContentAPI";
import { reviewAPI } from "@/services/reviewAPI";
import { announcementAPI } from "@/services/announcementAPI";
import { CourseDTO } from "@/types/course";
import CourseSummaryCard from "@/components/course/CourseSummaryCard";
import { PublicHome, PublicCoach } from "@/types/homeContent";
import { Review } from "@/types/review";
import { Announcement } from "@/types/announcement";
import { Loader2, Star, UserRound, MapPin, Phone, Mail, Clock, X } from "lucide-react";

export default function Home() {
  const [courses, setCourses] = useState<CourseDTO[]>([]);
  const [home, setHome] = useState<PublicHome | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedCoach, setSelectedCoach] = useState<PublicCoach | null>(null); // คลิกการ์ดโค้ช → เปิด modal รายละเอียด

  // ประกาศข่าวสารสำหรับผู้เยี่ยมชม (visibility: all/guest) — ใช้ในส่วนข่าว/ประกาศบนหน้าแรก
  const [guestAnnouncements, setGuestAnnouncements] = useState<Announcement[]>([]);
  // แกลเลอรีรูปประกาศทั้งหมด (รวมที่หมดอายุแล้ว) — เปิดจากปุ่ม "ดูข่าวทั้งหมด"
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [galleryItems, setGalleryItems] = useState<Announcement[]>([]);
  const [isGalleryLoading, setIsGalleryLoading] = useState(false);
  const [galleryLoaded, setGalleryLoaded] = useState(false); // โหลดครั้งแรกตอนกดปุ่มเท่านั้น
  const [selectedNews, setSelectedNews] = useState<Announcement | null>(null); // ประกาศที่กดอ่านจากแกลเลอรี

  useEffect(() => {
    const loadData = async () => {
      try {
        // โหลดคอร์ส + เนื้อหาหน้าแรก + ประกาศสำหรับผู้เยี่ยมชมพร้อมกัน โดยไม่ให้ตัวใดตัวหนึ่งพังทั้งหน้า
        const [coursesRes, homeRes, announcementsRes] = await Promise.allSettled([
          fetchAllCourses(),
          homeContentAPI.getPublicHome(),
          announcementAPI.getPublicAnnouncements('guest'),
        ]);

        if (coursesRes.status === "fulfilled") setCourses(coursesRes.value);
        if (announcementsRes.status === "fulfilled") setGuestAnnouncements(announcementsRes.value);
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

  // โหลดแกลเลอรีรูปประกาศทั้งหมด (รวมที่หมดอายุแล้ว) แบบ lazy — เรียกครั้งแรกตอนกดปุ่มเท่านั้น
  const handleOpenGallery = async () => {
    setIsGalleryOpen(true);
    if (galleryLoaded) return;
    setIsGalleryLoading(true);
    try {
      const items = await announcementAPI.getGuestGallery();
      setGalleryItems(items);
      setGalleryLoaded(true);
    } catch (error) {
      console.error("โหลดแกลเลอรีประกาศไม่สำเร็จ:", error);
    } finally {
      setIsGalleryLoading(false);
    }
  };
  // ชื่อแบรนด์สำหรับ footer/ลิขสิทธิ์ — ใช้ค่าจาก CMS ถ้ามี ไม่งั้น fallback ชื่อโรงเรียน
  const schoolName = content?.school_name?.trim() || "Koyama Badminton School";

  // แผนที่ที่ตั้ง: รองรับทั้งกรณีแอดมินวาง src ตรงๆ หรือวาง <iframe .../> ทั้งก้อน
  const rawMap = content?.map_embed_url?.trim() ?? "";
  const mapSrc = rawMap.includes("<iframe")
    ? rawMap.match(/src="([^"]+)"/i)?.[1] ?? ""
    : rawMap;
  const showMap = mapSrc.startsWith("http");

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">

      <main className="w-full">
        {/* แบนเนอร์สไลด์หน้าแรกจาก CMS (แอดมินตั้งรูปสไลด์เอง) */}
        <HeroSlider slides={slideImages.map((image_url) => ({ image_url }))} />

        {/* ส่วนข่าว/ประกาศสไตล์ BWF — แสดงเมื่อมีประกาศสำหรับผู้เยี่ยมชม (ถ้าไม่มีจะซ่อนเอง) */}
        <AnnouncementNewsSection announcements={guestAnnouncements} onOpenGallery={handleOpenGallery} />
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
            <div className="mt-12 flex flex-wrap justify-center gap-8">
              {coaches.map((coach) => {
                // ใช้รูปหน้าแรกที่แอดมินตั้ง ถ้ายังไม่ตั้งค่อย fallback รูปโปรไฟล์โค้ช
                const img = coach.home_image || coach.profile_picture;
                const name =
                  coach.nickname ||
                  [coach.firstName, coach.lastName].filter(Boolean).join(" ") ||
                  `โค้ช #${coach.id}`;
                return (
                  <button
                    key={coach.id}
                    type="button"
                    onClick={() => setSelectedCoach(coach)}
                    className="group relative aspect-[3/4] w-64 sm:w-72 overflow-hidden rounded-3xl bg-gray-100 shadow-sm ring-1 ring-black/5 transition duration-300 hover:-translate-y-1.5 hover:shadow-2xl focus:outline-none"
                  >
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-300">
                        <UserRound className="h-16 w-16" />
                      </div>
                    )}

                    {/* ไล่เฉดดำด้านล่าง + ชื่อโค้ช (จัดกึ่งกลาง) */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-4 pb-6 pt-16 text-center">
                      <h3 className="text-xl font-bold leading-tight text-white drop-shadow">{name}</h3>
                      {coach.specialization && (
                        <span className="mt-2 inline-block rounded-full bg-[#CC0000] px-3 py-0.5 text-xs font-bold text-white">
                          ระดับ {coach.specialization}
                        </span>
                      )}
                    </div>
                  </button>
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
            // แถวเลื่อนซ้ายขวา — เดิมเป็นกริดสามคอลัมน์ที่พอคอร์สเยอะจะยาวลงไปเรื่อย ๆ
            // จนดันเนื้อหาส่วนถัดไปตกจอ
            //
            // ความกว้างการ์ด 84vw บนจอเล็กโดยตั้งใจ ให้เห็นขอบใบถัดไปโผล่มานิดหนึ่ง
            // เป็นสัญญาณว่าเลื่อนได้ ถ้าเต็ม 100% จะดูเหมือนมีใบเดียว
            <div
              className="-mx-1 flex snap-x snap-mandatory gap-8 overflow-x-auto px-1 pb-3
                         [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {courses.map((course) => (
                <div
                  key={course.id}
                  className="w-[min(25rem,86vw)] shrink-0 snap-start"
                >
                  <CourseSummaryCard course={course} href={`/courses/${course.id}`} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 4. ส่วนเสียงจากผู้เรียน (รีวิว) */}
      {content?.show_featured_reviews && reviews.length > 0 && (
        <section id="reviews" className="w-full py-24 bg-gradient-to-b from-rose-50/40 via-white to-white">
          <div className="container mx-auto px-6 md:px-12 lg:px-24">
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="h-px w-8 bg-[#CC0000]/40" />
              <span className="text-[#CC0000] text-sm font-bold uppercase tracking-widest">Reviews</span>
              <span className="h-px w-8 bg-[#CC0000]/40" />
            </div>
            <h2 className="text-4xl font-bold text-gray-800 text-center mb-3">
              {content.reviews_title || "เสียงจากผู้เรียน"}
            </h2>
            {content.reviews_subtitle && (
              <p className="mb-14 text-center text-gray-500 max-w-2xl mx-auto">{content.reviews_subtitle}</p>
            )}
            {!content.reviews_subtitle && <div className="mb-14" />}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {reviews.map((review) => (
                <div
                  key={review.id}
                  className="group relative bg-white border border-gray-200 rounded-3xl p-8 flex flex-col items-center text-center shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-[#CC0000]/20 transition-all duration-300"
                >
                  {/* ดาว */}
                  <div className="flex items-center justify-center gap-1 mb-4">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star key={star} size={20}
                        className={star <= review.rating ? "text-amber-400" : "text-gray-200"}
                        fill={star <= review.rating ? "currentColor" : "none"} />
                    ))}
                  </div>

                  {/* เนื้อหารีวิว */}
                  <p className="text-gray-600 text-base leading-relaxed whitespace-pre-line">
                    “{review.comment}”
                  </p>
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
      <footer className="w-full bg-gray-900 text-gray-400">
        <div className="container mx-auto px-6 md:px-12 lg:px-24 py-14">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">

            {/* คอลัมน์ 1: แบรนด์ + โซเชียล */}
            <div>
              <h3 className="text-xl font-bold text-white">{schoolName}</h3>
              {content?.about_content && (
                <p className="mt-3 text-sm leading-relaxed line-clamp-4">
                  {content.about_content}
                </p>
              )}
              {content && (
                <SocialLinks content={content} variant="dark" className="mt-5" />
              )}
            </div>

            {/* คอลัมน์ 2: ลิงก์ลัด */}
            <div>
              <h4 className="text-sm font-bold uppercase tracking-wider text-white">เมนูลัด</h4>
              <ul className="mt-4 space-y-3 text-sm">
                <li><Link href="/#coaches" className="hover:text-white transition-colors">บุคลากร</Link></li>
                <li><Link href="/#courses" className="hover:text-white transition-colors">คอร์สเรียน</Link></li>
                <li><Link href="/#about" className="hover:text-white transition-colors">เกี่ยวกับเรา</Link></li>
              </ul>
            </div>

            {/* คอลัมน์ 3: ข้อมูลติดต่อ (แสดงเฉพาะช่องที่กรอกไว้) */}
            {(content?.contact_address || content?.contact_phone || content?.contact_email || content?.opening_hours) && (
              <div>
                <h4 className="text-sm font-bold uppercase tracking-wider text-white">ติดต่อเรา</h4>
                <ul className="mt-4 space-y-3 text-sm">
                  {content?.contact_address && (
                    <li className="flex gap-3">
                      <MapPin className="w-5 h-5 flex-shrink-0 mt-0.5 text-[#CC0000]" />
                      <span className="whitespace-pre-line">{content.contact_address}</span>
                    </li>
                  )}
                  {content?.contact_phone && (
                    <li className="flex gap-3 items-center">
                      <Phone className="w-5 h-5 flex-shrink-0 text-[#CC0000]" />
                      <a href={`tel:${content.contact_phone.replace(/[^\d+]/g, "")}`} className="hover:text-white transition-colors">
                        {content.contact_phone}
                      </a>
                    </li>
                  )}
                  {content?.contact_email && (
                    <li className="flex gap-3 items-center">
                      <Mail className="w-5 h-5 flex-shrink-0 text-[#CC0000]" />
                      <a href={`mailto:${content.contact_email}`} className="hover:text-white transition-colors break-all">
                        {content.contact_email}
                      </a>
                    </li>
                  )}
                  {content?.opening_hours && (
                    <li className="flex gap-3">
                      <Clock className="w-5 h-5 flex-shrink-0 mt-0.5 text-[#CC0000]" />
                      <span className="whitespace-pre-line">{content.opening_hours}</span>
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* ปุ่ม CTA: สมัคร/เข้าสู่ระบบ */}
        <div className="border-t border-gray-800">
          <div className="container mx-auto px-6 md:px-12 lg:px-24 py-10 flex flex-col items-center gap-4 text-center">
            <p className="text-white text-lg font-semibold">พร้อมเริ่มเรียนกับเราแล้วหรือยัง?</p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg bg-[#CC0000] px-16 py-4 min-w-[18rem] text-lg font-bold text-white shadow-lg shadow-[#CC0000]/25 hover:bg-[#990000] transition-colors"
            >
              สมัคร / เข้าสู่ระบบ
            </Link>
          </div>
        </div>

        {/* แถบลิขสิทธิ์ + ลิงก์เอกสารทางกฎหมาย */}
        <div className="border-t border-gray-800">
          <div className="container mx-auto px-6 md:px-12 lg:px-24 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-center">
            <p>
              © {new Date().getFullYear()}{" "}
              <span className="font-semibold text-white">{schoolName}</span>
              . สงวนลิขสิทธิ์.
            </p>
            {(content?.privacy_policy || content?.terms_of_service) && (
              <div className="flex items-center gap-4">
                {content?.privacy_policy && (
                  <Link href="/privacy" className="hover:text-white transition-colors">
                    นโยบายความเป็นส่วนตัว
                  </Link>
                )}
                {content?.privacy_policy && content?.terms_of_service && (
                  <span className="text-gray-700">|</span>
                )}
                {content?.terms_of_service && (
                  <Link href="/terms" className="hover:text-white transition-colors">
                    ข้อกำหนดการใช้งาน
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </footer>

      {/* Modal รายละเอียดโค้ช — เปิดเมื่อคลิกการ์ดในส่วนบุคลากร */}
      {selectedCoach && (() => {
        const c = selectedCoach;
        const img = c.home_image || c.profile_picture;
        const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ");
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setSelectedCoach(null)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setSelectedCoach(null)}
                className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/80 text-gray-700 shadow transition hover:bg-white"
                aria-label="ปิด"
              >
                <X className="h-5 w-5" />
              </button>

              {/* รูปด้านบน — เต็มความกว้าง สัดส่วน 3:4 (ตรงกับรูปที่ครอปไว้) ไม่มีขอบข้าง */}
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt="" className="aspect-[3/4] w-full bg-gray-50 object-cover" />
              ) : (
                <div className="flex aspect-[3/4] w-full items-center justify-center bg-gray-100 text-gray-300">
                  <UserRound className="h-20 w-20" />
                </div>
              )}

              <div className="p-6">
                <h3 className="text-2xl font-bold text-gray-900">
                  {c.nickname || fullName || `โค้ช #${c.id}`}
                </h3>
                {fullName && c.nickname && <p className="mt-0.5 text-sm text-gray-400">{fullName}</p>}

                <div className="mt-3 flex flex-wrap gap-2">
                  {c.specialization && (
                    <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-[#CC0000]">ระดับ {c.specialization}</span>
                  )}
                  {c.coach_license && (
                    <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{c.coach_license}</span>
                  )}
                </div>

                {c.bio?.trim() ? (
                  <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-gray-600">{c.bio}</p>
                ) : (
                  <p className="mt-4 text-sm text-gray-400">ยังไม่มีรายละเอียดเพิ่มเติม</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal แกลเลอรีรูปประกาศทั้งหมด — เปิดจากปุ่มมุมซ้ายล่างของรูปสไลด์ (รวมประกาศที่หมดอายุแล้ว) */}
      {isGalleryOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={() => setIsGalleryOpen(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-lg font-bold text-gray-900">รูปประกาศทั้งหมด</h3>
              <button
                onClick={() => setIsGalleryOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-full bg-black/5 text-gray-600 transition hover:bg-black/10"
                aria-label="ปิด"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-5">
              {isGalleryLoading ? (
                <div className="flex justify-center items-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-[#CC0000]" />
                </div>
              ) : galleryItems.length === 0 ? (
                <p className="py-16 text-center text-gray-400">ยังไม่มีรูปประกาศ</p>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {galleryItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedNews(item)}
                      className="group flex flex-col overflow-hidden rounded-xl border border-gray-100 bg-white text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#CC0000]/40 hover:shadow-md"
                    >
                      {/* รูปเห็นเต็มภาพไม่ตัดขอบ + พื้นหลังเบลอเติมขอบ */}
                      <div className="relative aspect-square w-full overflow-hidden bg-black">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.image_url} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.image_url} alt={item.title} className="relative h-full w-full object-contain" />
                      </div>
                      <p className="line-clamp-2 px-2.5 py-2 text-xs font-medium text-gray-700 group-hover:text-[#CC0000]">
                        {item.title}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* หน้าต่างอ่านข่าว — เปิดจากการกดการ์ดในแกลเลอรี "รูปประกาศทั้งหมด" */}
      {selectedNews && (
        <AnnouncementDetailModal announcement={selectedNews} onClose={() => setSelectedNews(null)} />
      )}
    </div>
  );
}
