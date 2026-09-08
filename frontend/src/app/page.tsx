"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import HeroSlider from "@/components/HeroSlider";
import AnnouncementDetailModal, { Poster } from "@/components/AnnouncementDetailModal";
import SocialLinks from "@/components/SocialLinks";
import { fetchAllCourses } from "@/services/courseAPI";
import { homeContentAPI } from "@/services/homeContentAPI";
import { reviewAPI } from "@/services/reviewAPI";
import { announcementAPI } from "@/services/announcementAPI";
import { CourseDTO, CoursePackageDTO } from "@/types/course";
import { groupSchedulesByTime, seatsTotal, priceRange } from "@/components/course/courseUtils";
import { PublicHome, PublicCoach } from "@/types/homeContent";
import { Review } from "@/types/review";
import { Announcement } from "@/types/announcement";
import { Loader2, Star, UserRound, MapPin, Phone, Mail, Clock, X, ArrowRight, ArrowUpRight, Plus, Minus } from "lucide-react";

// โทนสี/ฟอนต์ของดีไซน์ 2b แต่คงโทนสีเดิมของเว็บ (ขาว + แดง #CC0000) และใช้ฟอนต์ Kanit
const ACCENT = "#CC0000";

// สีเน้น (red accent) แบบ Tailwind arbitrary value — ใช้ซ้ำหลายที่
const kanitFont = { fontFamily: "var(--font-kanit), system-ui, sans-serif" } as const;

// ---- ตัวช่วยสรุปข้อมูลแพ็กเกจสำหรับตารางค่าเรียนสไตล์ editorial ----

// ชื่อวัน (อังกฤษจาก backend) → อักษรย่อไทย เช่น Monday → "จ."
const DAY_SHORT: Record<string, string> = {
  Monday: "จ.",
  Tuesday: "อ.",
  Wednesday: "พ.",
  Thursday: "พฤ.",
  Friday: "ศ.",
  Saturday: "ส.",
  Sunday: "อา.",
};

// แพ็กเกจตัวแทนของคอร์ส = ราคาถูกสุดที่ตั้งราคาแล้ว (ถ้าไม่มีก็ใช้ตัวแรก)
function representativePackage(course: CourseDTO): CoursePackageDTO | null {
  const pkgs = course.packages ?? [];
  if (pkgs.length === 0) return null;
  const priced = pkgs.filter((p) => p.price > 0);
  const pool = priced.length > 0 ? priced : pkgs;
  return pool.reduce((min, p) => (p.price < min.price ? p : min), pool[0]);
}

function sessionsLabel(pkg: CoursePackageDTO): string {
  return pkg.sessions_count ? `${pkg.sessions_count} ครั้ง` : "รายชม.";
}

function groupLabel(pkg: CoursePackageDTO): string {
  const total = seatsTotal(pkg);
  if (total <= 0) return "—";
  if (total <= 2) return "ตัวต่อตัว";
  return `${total} คน`;
}

function scheduleLabel(pkg: CoursePackageDTO): string {
  const groups = groupSchedulesByTime(pkg.schedules);
  if (groups.length === 0) return "ตามนัดหมาย";
  const g = groups[0];
  const days = g.days.map((d) => DAY_SHORT[d] ?? d).join(" / ");
  return `${days} ${g.startTime.slice(0, 5)}`;
}

// คำถามที่พบบ่อย (static — ไม่มีใน CMS) จัดเป็น accordion
const FAQ_ITEMS = [
  {
    q: "ลูกไม่มีพื้นฐานเลย เรียนได้ไหม?",
    a: "ได้ คลาสระดับเริ่มต้นออกแบบมาสำหรับเด็กที่ยังไม่เคยเล่น เริ่มจากการจับไม้และการเคลื่อนที่ให้ถูกต้อง ไม่มีการวัดผลแข่งขันในช่วงแรก",
  },
  {
    q: "ต้องเตรียมอุปกรณ์อะไรมาเอง?",
    a: "แค่รองเท้าในร่มและชุดกีฬา ไม้แบดและลูกขนไก่ทางโรงเรียนมีให้ยืมฟรีตลอดคอร์ส",
  },
  {
    q: "ผู้ปกครองนั่งรอในสนามได้หรือไม่?",
    a: "มีโซนพักสำหรับผู้ปกครองให้นั่งรอและชมการฝึกซ้อมได้ตลอดคาบเรียน",
  },
  {
    q: "ถ้าลูกป่วย เลื่อนคลาสได้ไหม?",
    a: "แจ้งล่วงหน้าอย่างน้อย 24 ชั่วโมงสามารถเลื่อนคาบเรียนได้โดยไม่มีค่าใช้จ่าย",
  },
  {
    q: "มีคลาสทดลองเรียนก่อนสมัครหรือเปล่า?",
    a: "มี ทดลองเรียนฟรี 1 ครั้ง โดยไม่มีข้อผูกมัด ติดต่อทางโทรศัพท์หรือ LINE เพื่อจองรอบทดลอง",
  },
];

// หัวข้อ section แบบ editorial (สไตล์ 2b) — ไม่มีเลขกำกับ
function SectionHeading({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-6">
      <h2 className="text-3xl font-medium tracking-tight text-gray-900 md:text-4xl">
        {title}
        {sub && <span className="ml-3 text-base font-light text-gray-400">{sub}</span>}
      </h2>
      {right}
    </div>
  );
}

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });

export default function Home() {
  const [courses, setCourses] = useState<CourseDTO[]>([]);
  const [home, setHome] = useState<PublicHome | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedCoach, setSelectedCoach] = useState<PublicCoach | null>(null); // คลิกการ์ดโค้ช → เปิด modal รายละเอียด
  const [openFaq, setOpenFaq] = useState<number>(0); // FAQ ที่เปิดอยู่ (ค่าเริ่มต้นเปิดข้อแรก)

  // ประกาศข่าวสารสำหรับผู้เยี่ยมชม (visibility: all/guest) — ใช้ในส่วนข่าว/ประกาศบนหน้าแรก
  const [guestAnnouncements, setGuestAnnouncements] = useState<Announcement[]>([]);
  // แกลเลอรีรูปประกาศทั้งหมด (รวมที่หมดอายุแล้ว) — เปิดจากปุ่ม "ดูข่าวทั้งหมด"
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [galleryItems, setGalleryItems] = useState<Announcement[]>([]);
  const [isGalleryLoading, setIsGalleryLoading] = useState(false);
  const [galleryLoaded, setGalleryLoaded] = useState(false); // โหลดครั้งแรกตอนกดปุ่มเท่านั้น
  const [selectedNews, setSelectedNews] = useState<Announcement | null>(null); // ประกาศที่กดอ่าน

  useEffect(() => {
    const loadData = async () => {
      try {
        // โหลดคอร์ส + เนื้อหาหน้าแรก + ประกาศสำหรับผู้เยี่ยมชมพร้อมกัน โดยไม่ให้ตัวใดตัวหนึ่งพังทั้งหน้า
        const [coursesRes, homeRes, announcementsRes] = await Promise.allSettled([
          fetchAllCourses(),
          homeContentAPI.getPublicHome(),
          announcementAPI.getPublicAnnouncements("guest"),
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
  const mapSrc = rawMap.includes("<iframe") ? rawMap.match(/src="([^"]+)"/i)?.[1] ?? "" : rawMap;
  const showMap = mapSrc.startsWith("http");

  // ข่าว/ประกาศที่มีรูป — ข่าวเด่น 1 + รายการรอง
  const newsWithImage = guestAnnouncements.filter((a) => !!a.image_url);
  const featuredNews = newsWithImage[0] ?? null;
  const secondaryNews = newsWithImage.slice(1, 5);

  // สถิติ — ผสมข้อมูลจริง (จำนวนคอร์ส) กับตัวเลขการตลาดคงที่ตาม mockup
  const stats = [
    { value: "12", label: "เหรียญระดับจังหวัด" },
    { value: "450+", label: "นักเรียนที่ผ่านการฝึก" },
    { value: courses.length > 0 ? `${courses.length}` : "—", label: "คอร์สที่เปิดสอน" },
    { value: "7", label: "ปีที่เปิดสอน" },
  ];

  const priceHint = (course: CourseDTO) => {
    const r = priceRange(course.packages);
    return r ? `${r.min.toLocaleString("th-TH")} บาท` : "สอบถามราคา";
  };

  return (
    <div style={kanitFont} className="min-h-screen bg-white text-gray-900">

      {/* ===== HERO ===== สไลด์ CMS + headline ทับบนสไลด์ตรงๆ (สไตล์ 2b) */}
      <section className="w-full">
        <div className="relative">
          <HeroSlider slides={slideImages.map((image_url) => ({ image_url }))} fit="cover" />

          {/* ไล่เฉดจากซ้ายให้ headline อ่านออกไม่ว่าภาพจะสีอะไร (2b ใช้ไล่ 90deg เข้ม→ใส) */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-transparent" />

          {/* กล่องข้อความทับสไลด์ — pointer-events-none ที่ตัวกล่องเพื่อไม่บังการปัดสไลด์
              แล้วเปิด pointer-events-auto เฉพาะปุ่ม/ลิงก์ที่ต้องกดได้ */}
          <div className="pointer-events-none absolute inset-0 flex items-center">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 pb-14 md:px-10">
              <span className="text-xs font-light tracking-[0.22em] text-white/90">
                สำหรับผู้ปกครอง · เปิดสอนตั้งแต่ปี 2562
              </span>
              <h1 className="text-4xl font-semibold leading-[1.15] tracking-tight text-white drop-shadow-md md:text-6xl">
                พื้นฐานที่ถูกต้อง<br />สำคัญกว่าชนะเร็ว
              </h1>
              <p className="max-w-xl text-sm font-light leading-relaxed text-white/85 drop-shadow md:text-base">
                คลาสเยาวชนกลุ่มเล็ก โค้ชมีใบรับรอง และระบบที่ผู้ปกครองเข้าไปดูตารางเรียน ค่าเรียน และพัฒนาการของลูกได้ทุกเมื่อ
              </p>
              <div className="pointer-events-auto flex flex-wrap items-center gap-5 pt-1">
                <Link
                  href="/login"
                  className="px-8 py-4 text-[15px] font-medium text-white shadow-lg transition-colors hover:brightness-110"
                  style={{ backgroundColor: ACCENT }}
                >
                  ทดลองเรียนฟรี 1 ครั้ง
                </Link>
                <a
                  href="#courses"
                  className="border-b border-white/50 pb-1 text-sm font-light text-white/90 transition-colors hover:border-white hover:text-white"
                >
                  ดูค่าเรียนทุกคอร์ส
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* แถบสถิติ — เต็มความกว้างใต้ hero (2b วางเป็นแถบแบ่งช่องใต้ภาพ) */}
        <div className="border-b border-gray-200 bg-white">
          <div className="mx-auto grid max-w-6xl grid-cols-2 md:grid-cols-4">
            {stats.map((s, i) => (
              <div
                key={i}
                className="flex flex-col gap-1 border-gray-200 px-5 py-5 [&:not(:nth-child(2n))]:border-r [&:nth-child(-n+2)]:border-b md:border-b-0 md:[&:not(:last-child)]:border-r"
              >
                <span className="text-2xl font-medium" style={{ color: ACCENT }}>{s.value}</span>
                <span className="text-xs font-light leading-snug text-gray-500">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== คอร์สเรียนและค่าเรียน ===== */}
      <section id="courses" className="border-t border-gray-200 bg-white py-14">
        <div className="mx-auto max-w-6xl px-6 md:px-10">
          <SectionHeading
            title={content?.courses_title || "คอร์สเรียนและค่าเรียน"}
            sub={content?.courses_subtitle ? undefined : "Courses & pricing"}
          />
          {content?.courses_subtitle && (
            <p className="-mt-4 mb-8 text-sm font-light text-gray-500">{content.courses_subtitle}</p>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-9 w-9 animate-spin" style={{ color: ACCENT }} />
            </div>
          ) : courses.length === 0 ? (
            <p className="py-12 text-center font-light text-gray-400">เร็วๆ นี้</p>
          ) : (
            <div>
              {/* หัวตาราง (เฉพาะจอ md ขึ้นไป) */}
              <div className="hidden grid-cols-[1.6fr_0.8fr_0.8fr_1fr_1fr_140px] gap-4 border-b border-gray-200 pb-3 text-[11px] font-light tracking-[0.08em] text-gray-400 md:grid">
                <span>คอร์ส</span>
                <span>ครั้ง</span>
                <span>กลุ่ม</span>
                <span>รอบเวลา</span>
                <span>ค่าเรียน</span>
                <span />
              </div>

              {courses.map((course) => {
                const pkg = representativePackage(course);
                return (
                  <div
                    key={course.id}
                    className="grid grid-cols-1 items-center gap-y-2 border-b border-gray-100 py-5 transition-colors hover:bg-[#CC0000]/[0.03] md:grid-cols-[1.6fr_0.8fr_0.8fr_1fr_1fr_140px] md:gap-4"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-base font-normal text-gray-900">{course.course_name}</span>
                      {course.description && (
                        <span className="line-clamp-1 text-xs font-light text-gray-400">{course.description}</span>
                      )}
                    </div>
                    <span className="text-sm font-light text-gray-600">
                      <span className="text-gray-400 md:hidden">ครั้ง: </span>
                      {pkg ? sessionsLabel(pkg) : "—"}
                    </span>
                    <span className="text-sm font-light text-gray-600">
                      <span className="text-gray-400 md:hidden">กลุ่ม: </span>
                      {pkg ? groupLabel(pkg) : "—"}
                    </span>
                    <span className="text-sm font-light text-gray-600">
                      <span className="text-gray-400 md:hidden">รอบเวลา: </span>
                      {pkg ? scheduleLabel(pkg) : "ตามนัดหมาย"}
                    </span>
                    <span className="text-base font-medium text-gray-900">{priceHint(course)}</span>
                    <Link
                      href={`/courses/${course.id}`}
                      className="inline-flex w-fit items-center gap-1 border border-gray-300 px-4 py-2 text-[13px] font-light text-gray-700 transition-colors hover:border-[#CC0000] hover:text-[#CC0000] md:justify-self-end"
                    >
                      เลือกคอร์ส
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                );
              })}
              <p className="mt-4 text-xs font-light text-gray-400">
                รวมค่าคอร์ทและลูกขนไก่ · ยืมไม้ฟรีตลอดคอร์ส · แบ่งชำระ 2 งวดได้
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ===== 02 บุคลากร ===== */}
      <section id="coaches" className="border-t border-gray-200 bg-gray-50 py-14">
        <div className="mx-auto max-w-6xl px-6 md:px-10">
          <SectionHeading
            title={content?.coaches_title || "บุคลากร"}
            sub={content?.coaches_subtitle ? undefined : "Coaches"}
          />
          {content?.coaches_subtitle && (
            <p className="-mt-4 mb-8 text-sm font-light text-gray-500">{content.coaches_subtitle}</p>
          )}

          {coaches.length === 0 ? (
            <p className="py-12 text-center font-light text-gray-400">เร็วๆ นี้</p>
          ) : (
            <div className="grid grid-cols-2 gap-px bg-gray-200 md:grid-cols-4">
              {coaches.map((coach) => {
                // ใช้รูปหน้าแรกที่แอดมินตั้ง ถ้ายังไม่ตั้งค่อย fallback รูปโปรไฟล์โค้ช
                const img = coach.home_image || coach.profile_picture;
                const name =
                  coach.nickname ||
                  [coach.firstName, coach.lastName].filter(Boolean).join(" ") ||
                  `โค้ช #${coach.id}`;
                const role = coach.specialization ? `ระดับ ${coach.specialization}` : coach.coach_license || "ผู้ฝึกสอน";
                return (
                  <button
                    key={coach.id}
                    type="button"
                    onClick={() => setSelectedCoach(coach)}
                    className="group flex flex-col bg-gray-50 pb-4 text-left transition-colors hover:bg-white"
                  >
                    <div className="aspect-[3/4] w-full overflow-hidden bg-gray-100">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt={name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-300">
                          <UserRound className="h-14 w-14" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5 px-4 pt-4">
                      <span className="text-[15px] font-medium text-gray-900">{name}</span>
                      <span className="text-[11px] font-light text-gray-500">{role}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ===== เสียงจากผู้เรียน (รีวิว) — แสดงเมื่อแอดมินเปิดใช้งานและมีรีวิว ===== */}
      {content?.show_featured_reviews && reviews.length > 0 && (
        <section id="reviews" className="border-t border-gray-200 bg-white py-14">
          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <div className="mb-8 flex items-baseline gap-4">
              <span className="text-xs font-light tracking-[0.2em]" style={{ color: ACCENT }}>REVIEWS</span>
              <h2 className="text-3xl font-medium tracking-tight text-gray-900 md:text-4xl">
                {content.reviews_title || "เสียงจากผู้เรียน"}
              </h2>
            </div>
            {content.reviews_subtitle && (
              <p className="-mt-4 mb-8 text-sm font-light text-gray-500">{content.reviews_subtitle}</p>
            )}
            <div className="grid grid-cols-1 gap-px bg-gray-200 md:grid-cols-3">
              {reviews.map((review) => (
                <div key={review.id} className="flex flex-col gap-3 bg-white p-7">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        size={16}
                        className={star <= review.rating ? "text-amber-400" : "text-gray-200"}
                        fill={star <= review.rating ? "currentColor" : "none"}
                      />
                    ))}
                  </div>
                  <p className="whitespace-pre-line text-sm font-light leading-relaxed text-gray-600">
                    “{review.comment}”
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ===== ข่าวและประกาศ ===== */}
      {featuredNews && (
        <section id="news" className="border-t border-gray-200 bg-gray-50 py-14">
          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <SectionHeading
              title="ข่าวและประกาศ"
              sub="News"
              right={
                <button
                  onClick={handleOpenGallery}
                  className="border-b border-gray-300 pb-1 text-sm font-light text-gray-500 transition-colors hover:border-[#CC0000] hover:text-[#CC0000]"
                >
                  ดูข่าวทั้งหมด
                </button>
              }
            />
            <div className="grid grid-cols-1 gap-px bg-gray-200 md:grid-cols-[1.2fr_1fr]">
              {/* ข่าวเด่น */}
              <button
                type="button"
                onClick={() => setSelectedNews(featuredNews)}
                className="group flex flex-col bg-gray-50 pb-6 pr-0 text-left md:pr-6"
              >
                <Poster src={featuredNews.image_url} alt={featuredNews.title} className="aspect-[16/9] w-full" />
                <div className="flex flex-col gap-2.5 pt-5">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-light tracking-[0.16em]" style={{ color: ACCENT }}>
                      {featuredNews.category?.name || "ประกาศ"}
                    </span>
                    <span className="text-xs font-light text-gray-400">{fmtDate(featuredNews.start_date)}</span>
                  </div>
                  <span className="text-xl font-normal leading-snug text-gray-900 transition-colors group-hover:text-[#CC0000] md:text-2xl">
                    {featuredNews.title}
                  </span>
                  <p className="line-clamp-3 max-w-xl text-sm font-light leading-relaxed text-gray-500">
                    {featuredNews.content}
                  </p>
                </div>
              </button>

              {/* รายการข่าวรอง */}
              <div className="flex flex-col bg-gray-50 pl-0 md:pl-6">
                {secondaryNews.length === 0 ? (
                  <p className="py-8 text-sm font-light text-gray-400">ยังไม่มีข่าวเพิ่มเติม</p>
                ) : (
                  secondaryNews.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedNews(item)}
                      className="group flex flex-col gap-1.5 border-b border-gray-200 py-4 text-left last:border-b-0"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-[10.5px] font-light tracking-[0.16em] text-gray-400">
                          {item.category?.name || "ข่าว"}
                        </span>
                        <span className="text-[11px] font-light text-gray-400">{fmtDate(item.start_date)}</span>
                      </div>
                      <span className="text-[15px] font-normal leading-snug text-gray-800 transition-colors group-hover:text-[#CC0000]">
                        {item.title}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===== คำถามที่พบบ่อย ===== */}
      <section id="faq" className="border-t border-gray-200 bg-white py-14">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 md:grid-cols-[1fr_1.15fr] md:px-10">
          <div>
            <div className="mb-4">
              <h2 className="text-3xl font-medium leading-tight tracking-tight text-gray-900 md:text-4xl">
                คำถาม<br />ที่พบบ่อย
              </h2>
            </div>
            <p className="text-sm font-light leading-relaxed text-gray-500">
              ยังไม่พบคำตอบ?{" "}
              {content?.contact_phone ? `โทร ${content.contact_phone}` : "โทร 02-123-4567"} ทุกวัน 09:00–20:00
            </p>
          </div>
          <div className="flex flex-col">
            {FAQ_ITEMS.map((item, i) => {
              const open = openFaq === i;
              return (
                <div key={i} className="border-b border-gray-200">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? -1 : i)}
                    className="flex w-full items-center justify-between gap-5 py-5 text-left"
                  >
                    <span className="text-base font-normal text-gray-900">{item.q}</span>
                    {open ? (
                      <Minus className="h-4 w-4 shrink-0" style={{ color: ACCENT }} />
                    ) : (
                      <Plus className="h-4 w-4 shrink-0 text-gray-400" />
                    )}
                  </button>
                  {open && (
                    <p className="max-w-2xl pb-5 text-sm font-light leading-relaxed text-gray-500">{item.a}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== ติดต่อเรา / เกี่ยวกับเรา ===== */}
      <section id="about" className="border-t border-gray-200 bg-gray-50 py-14">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 md:grid-cols-[1fr_1.1fr] md:px-10">
          <div className="flex flex-col gap-5">
            <h2 className="text-3xl font-medium tracking-tight text-gray-900 md:text-4xl">
              {content?.about_title || "ติดต่อเรา"}
            </h2>

            {content?.about_content && (
              <p className="max-w-xl whitespace-pre-line text-sm font-light leading-relaxed text-gray-500">
                {content.about_content}
              </p>
            )}

            <div className="flex flex-col gap-4 text-sm font-light text-gray-700">
              {content?.contact_address && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-light tracking-[0.1em] text-gray-400">ADDRESS</span>
                  <span className="flex gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: ACCENT }} />
                    <span className="whitespace-pre-line">{content.contact_address}</span>
                  </span>
                </div>
              )}
              {content?.opening_hours && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-light tracking-[0.1em] text-gray-400">HOURS</span>
                  <span className="flex gap-2">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: ACCENT }} />
                    <span className="whitespace-pre-line">{content.opening_hours}</span>
                  </span>
                </div>
              )}
              {(content?.contact_phone || content?.contact_email) && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-light tracking-[0.1em] text-gray-400">PHONE / EMAIL</span>
                  {content?.contact_phone && (
                    <a
                      href={`tel:${content.contact_phone.replace(/[^\d+]/g, "")}`}
                      className="flex items-center gap-2 transition-colors hover:text-[#CC0000]"
                    >
                      <Phone className="h-4 w-4 shrink-0" style={{ color: ACCENT }} />
                      {content.contact_phone}
                    </a>
                  )}
                  {content?.contact_email && (
                    <a
                      href={`mailto:${content.contact_email}`}
                      className="flex items-center gap-2 break-all transition-colors hover:text-[#CC0000]"
                    >
                      <Mail className="h-4 w-4 shrink-0" style={{ color: ACCENT }} />
                      {content.contact_email}
                    </a>
                  )}
                </div>
              )}
            </div>

            {content && <SocialLinks content={content} variant="light" className="pt-1" />}

            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/login"
                className="px-6 py-3.5 text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: ACCENT }}
              >
                นัดเข้าชมสถานที่
              </Link>
              {content?.line_url && (
                <a
                  href={content.line_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-gray-300 px-6 py-3.5 text-sm font-light text-gray-700 transition-colors hover:border-[#CC0000] hover:text-[#CC0000]"
                >
                  แชท LINE
                </a>
              )}
            </div>
          </div>

          {/* แผนที่ */}
          {showMap ? (
            <iframe
              src={mapSrc}
              title={content?.about_title || "แผนที่ที่ตั้ง"}
              className="min-h-[300px] w-full border border-gray-200"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          ) : (
            <div className="flex min-h-[300px] items-center justify-center border border-gray-200 bg-white text-sm font-light text-gray-400">
              แผนที่ — ยังไม่ได้ตั้งค่า
            </div>
          )}
        </div>
      </section>

      {/* ===== CTA ปิดท้าย ===== */}
      <section className="border-t border-gray-200 bg-white py-14">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 px-6 md:flex-row md:items-end md:px-10">
          <h2 className="max-w-md text-3xl font-medium leading-tight tracking-tight text-gray-900 md:text-4xl">
            พร้อมเริ่มเรียน<br />กับเราแล้วหรือยัง?
          </h2>
          <div className="flex items-center gap-5">
            <span className="text-xs font-light leading-relaxed text-gray-400">
              ทดลองเรียนฟรี 1 ครั้ง<br />ไม่มีข้อผูกมัด
            </span>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-8 py-4 text-[15px] font-medium text-white transition-colors"
              style={{ backgroundColor: ACCENT }}
            >
              สมัคร / เข้าสู่ระบบ
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="bg-gray-900 text-gray-400">
        <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
          <div className="flex flex-col items-start justify-between gap-6 border-b border-gray-800 pb-8 md:flex-row md:items-center">
            <div>
              <h3 className="text-lg font-medium text-white">{schoolName}</h3>
              {content && <SocialLinks content={content} variant="dark" className="mt-4" />}
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm font-light">
              <Link href="/#courses" className="transition-colors hover:text-white">คอร์สเรียน</Link>
              <Link href="/#coaches" className="transition-colors hover:text-white">บุคลากร</Link>
              <Link href="/#about" className="transition-colors hover:text-white">ติดต่อเรา</Link>
            </div>
          </div>
          <div className="flex flex-col items-center justify-between gap-3 pt-6 text-xs font-light sm:flex-row">
            <p>
              © {new Date().getFullYear()} <span className="text-gray-200">{schoolName}</span>. สงวนลิขสิทธิ์.
            </p>
            {(content?.privacy_policy || content?.terms_of_service) && (
              <div className="flex items-center gap-4">
                {content?.privacy_policy && (
                  <Link href="/privacy" className="transition-colors hover:text-white">นโยบายความเป็นส่วนตัว</Link>
                )}
                {content?.privacy_policy && content?.terms_of_service && <span className="text-gray-700">|</span>}
                {content?.terms_of_service && (
                  <Link href="/terms" className="transition-colors hover:text-white">ข้อกำหนดการใช้งาน</Link>
                )}
              </div>
            )}
          </div>
        </div>
      </footer>

      {/* ===== Modal รายละเอียดโค้ช ===== */}
      {selectedCoach && (() => {
        const c = selectedCoach;
        const img = c.home_image || c.profile_picture;
        const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ");
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setSelectedCoach(null)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div
              className="relative max-h-[90vh] w-full max-w-md overflow-y-auto bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
              style={kanitFont}
            >
              <button
                onClick={() => setSelectedCoach(null)}
                className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/80 text-gray-700 shadow transition hover:bg-white"
                aria-label="ปิด"
              >
                <X className="h-5 w-5" />
              </button>

              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt="" className="aspect-[3/4] w-full bg-gray-50 object-cover" />
              ) : (
                <div className="flex aspect-[3/4] w-full items-center justify-center bg-gray-100 text-gray-300">
                  <UserRound className="h-20 w-20" />
                </div>
              )}

              <div className="p-6">
                <h3 className="text-2xl font-medium text-gray-900">{c.nickname || fullName || `โค้ช #${c.id}`}</h3>
                {fullName && c.nickname && <p className="mt-0.5 text-sm font-light text-gray-400">{fullName}</p>}

                <div className="mt-3 flex flex-wrap gap-2">
                  {c.specialization && (
                    <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium" style={{ color: ACCENT }}>
                      ระดับ {c.specialization}
                    </span>
                  )}
                  {c.coach_license && (
                    <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
                      {c.coach_license}
                    </span>
                  )}
                </div>

                {c.bio?.trim() ? (
                  <p className="mt-4 whitespace-pre-line text-sm font-light leading-relaxed text-gray-600">{c.bio}</p>
                ) : (
                  <p className="mt-4 text-sm font-light text-gray-400">ยังไม่มีรายละเอียดเพิ่มเติม</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== Modal แกลเลอรีรูปประกาศทั้งหมด ===== */}
      {isGalleryOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setIsGalleryOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
            style={kanitFont}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-lg font-medium text-gray-900">รูปประกาศทั้งหมด</h3>
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
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin" style={{ color: ACCENT }} />
                </div>
              ) : galleryItems.length === 0 ? (
                <p className="py-16 text-center font-light text-gray-400">ยังไม่มีรูปประกาศ</p>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {galleryItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedNews(item)}
                      className="group flex flex-col overflow-hidden border border-gray-100 bg-white text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#CC0000]/40 hover:shadow-md"
                    >
                      <Poster src={item.image_url} alt={item.title} className="aspect-square w-full" />
                      <p className="line-clamp-2 px-2.5 py-2 text-xs font-light text-gray-700 group-hover:text-[#CC0000]">
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

      {/* ===== หน้าต่างอ่านข่าว ===== */}
      {selectedNews && <AnnouncementDetailModal announcement={selectedNews} onClose={() => setSelectedNews(null)} />}
    </div>
  );
}
