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
import { priceRange } from "@/components/course/courseUtils";
import { PublicHome, PublicCoach, FacilityTile } from "@/types/homeContent";
import { Review } from "@/types/review";
import { Announcement } from "@/types/announcement";
import { Loader2, Star, UserRound, MapPin, Phone, Mail, Clock, X, ArrowRight, ArrowUpRight, Plus, Minus, Images } from "lucide-react";

// โทนสี/ฟอนต์ของดีไซน์ 2b แต่คงโทนสีเดิมของเว็บ (ขาว + แดง #CC0000) และใช้ฟอนต์ Kanit
const ACCENT = "#CC0000";


// สีเน้น (red accent) แบบ Tailwind arbitrary value — ใช้ซ้ำหลายที่
const kanitFont = { fontFamily: "var(--font-kanit), system-ui, sans-serif" } as const;

// ---- ตัวช่วยสรุปข้อมูลแพ็กเกจสำหรับตารางค่าเรียนสไตล์ editorial ----

// แพ็กเกจตัวแทนของคอร์ส = ราคาถูกสุดที่ตั้งราคาแล้ว (ถ้าไม่มีก็ใช้ตัวแรก)
function representativePackage(course: CourseDTO): CoursePackageDTO | null {
  // แพ็กเกจทดลอง (1 ครั้ง ราคา 0) ไม่ใช่ตัวแทนของคอร์ส — จะทำให้ขึ้น "เริ่มต้น 1 ครั้ง"
  const pkgs = (course.packages ?? []).filter((p) => !p.is_trial);
  if (pkgs.length === 0) return null;
  const priced = pkgs.filter((p) => p.price > 0);
  const pool = priced.length > 0 ? priced : pkgs;
  return pool.reduce((min, p) => (p.price < min.price ? p : min), pool[0]);
}

// ช่องภาพในส่วน "สนามและสิ่งอำนวยความสะดวก" (ดีไซน์ 2b — แถบเลื่อนแนวนอน)
// ยังไม่มีฟิลด์รูปสนามใน CMS จึงเป็น placeholder ตามดีไซน์ รอลูกค้าอัปโหลดภาพจริง
const FACILITY_TILES: FacilityTile[] = [
  { label: "คอร์ทหลัก มุมกว้าง", wide: true },
  { label: "โซนพักผู้ปกครอง" },
  { label: "ห้องเปลี่ยนเสื้อผ้า" },
  { label: "อุปกรณ์ฝึกซ้อม" },
  { label: "ที่จอดรถ" },
];

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
  const [showAllCoaches, setShowAllCoaches] = useState(false); // กางรายชื่อโค้ชที่เหลือในที่เดิม

  // ประกาศข่าวสารสำหรับผู้เยี่ยมชม (visibility: all/guest) — ใช้ในส่วนข่าว/ประกาศบนหน้าแรก
  const [guestAnnouncements, setGuestAnnouncements] = useState<Announcement[]>([]);
  // แกลเลอรีรูปประกาศทั้งหมด (รวมที่หมดอายุแล้ว) — เปิดจากปุ่ม "ดูข่าวทั้งหมด"
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  // แกลเลอรีภาพบรรยากาศ (facility) + lightbox รูปเดียวเต็มจอ
  const [isFacilityOpen, setIsFacilityOpen] = useState(false);
  const [facilityLightbox, setFacilityLightbox] = useState<string | null>(null);
  const [galleryItems, setGalleryItems] = useState<Announcement[]>([]);
  const [isGalleryLoading, setIsGalleryLoading] = useState(false);
  const [galleryLoaded, setGalleryLoaded] = useState(false); // โหลดครั้งแรกตอนกดปุ่มเท่านั้น
  const [selectedNews, setSelectedNews] = useState<Announcement | null>(null); // ประกาศที่กดอ่าน

  // ล็อกการเลื่อนของหน้าข้างหลังตอนเปิด modal
  //
  // ถ้าไม่ล็อก หมุนล้อบน modal แล้วพอเนื้อหาใน modal สุดทาง เบราว์เซอร์จะส่งต่อ
  // ไปเลื่อนหน้าข้างหลังแทน (scroll chaining) ปิด modal มาอีกทีอยู่คนละที่กับตอนกด
  //
  // ⚠️ ต้องชดเชยความกว้าง scrollbar ด้วย ไม่งั้นตอนซ่อน scrollbar เนื้อหาทั้งหน้า
  // จะกระตุกไปทางขวา 8px (เว็บนี้ตั้ง ::-webkit-scrollbar ไว้ 8px ใน globals.css)
  const isOverlayOpen = Boolean(
    selectedCoach || selectedNews || facilityLightbox || isGalleryOpen || isFacilityOpen
  );
  useEffect(() => {
    if (!isOverlayOpen) return;

    const { overflow, paddingRight } = document.body.style;
    const gap = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;

    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, [isOverlayOpen]);

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

  // สถิติใต้ hero — ใช้ค่าจาก CMS ถ้าแอดมินตั้งไว้ ไม่งั้น fallback ผสมข้อมูลจริง (จำนวนคอร์ส) ตาม mockup
  const stats =
    content?.hero_stats && content.hero_stats.length > 0
      ? content.hero_stats
      : [
          { value: "12", label: "เหรียญระดับจังหวัด" },
          { value: "450+", label: "นักเรียนที่ผ่านการฝึก" },
          { value: courses.length > 0 ? `${courses.length}` : "—", label: "คอร์สที่เปิดสอน" },
          { value: "7", label: "ปีที่เปิดสอน" },
        ];

  const licensedPct =
    coaches.length > 0
      ? Math.round((coaches.filter((c) => c.coach_license?.trim()).length / coaches.length) * 100)
      : 0;

  // สถิติส่วนโค้ช — CMS ถ้ามี ไม่งั้น fallback (ช่องแรกใช้จำนวนโค้ชจริง)
  const coachStats: { value: string; label: string }[] =
    content?.coach_stats && content.coach_stats.length > 0
      ? content.coach_stats
      : [
          { value: `${coaches.length}`, label: "โค้ชประจำ" },
          // คิดจากข้อมูลจริง ไม่ใช่ 100% ตายตัว — ตัวเลขบนหน้าขายต้องตรวจย้อนได้
          { value: `${licensedPct}%`, label: "มีใบรับรอง" },
        ];

  // ช่องภาพบรรยากาศ — CMS ถ้ามี ไม่งั้น fallback ค่าคงที่
  const facilityTiles = content?.facility_tiles && content.facility_tiles.length > 0
    ? content.facility_tiles
    : FACILITY_TILES;

  // คำถามที่พบบ่อย — CMS ถ้ามี (map เป็น {q,a}) ไม่งั้น fallback ค่าคงที่
  const faqItems =
    content?.faq_items && content.faq_items.length > 0
      ? content.faq_items.map((f) => ({ q: f.question, a: f.answer }))
      : FAQ_ITEMS;

  const startingPrice = (course: CourseDTO) => {
    const r = priceRange(course.packages);
    return r ? `เริ่มต้น ${r.min.toLocaleString("th-TH")} บาท` : "สอบถามราคา";
  };

  // ระหว่างรอข้อมูลจาก database แสดง skeleton ตามโครงหน้าจริง
  // ไม่โชว์ค่า fallback พื้นฐานให้เห็นก่อน
  if (isLoading) {
    return (
      <div style={kanitFont} className="min-h-screen animate-pulse bg-white">
        {/* hero */}
        <section className="relative h-[60vh] min-h-[380px] w-full overflow-hidden bg-gray-200">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/10 to-transparent" />
          <div className="absolute inset-0 mx-auto flex max-w-6xl flex-col justify-center gap-4 px-6 pb-14 md:px-10">
            <div className="h-3 w-40 rounded bg-gray-300/70" />
            <div className="h-9 w-3/4 max-w-lg rounded bg-gray-300 md:h-14" />
            <div className="h-9 w-2/3 max-w-md rounded bg-gray-300 md:h-14" />
            <div className="mt-2 h-4 w-full max-w-xl rounded bg-gray-300/60" />
            <div className="h-4 w-1/2 max-w-sm rounded bg-gray-300/60" />
            <div className="mt-3 flex gap-4">
              <div className="h-12 w-44 rounded bg-gray-300" />
              <div className="h-12 w-32 rounded bg-gray-300/60" />
            </div>
          </div>
        </section>

        {/* แถบสถิติ */}
        <div className="border-b border-gray-200 bg-white">
          <div className="mx-auto grid max-w-6xl grid-cols-2 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex flex-col gap-2 border-gray-200 px-5 py-5 [&:not(:nth-child(2n))]:border-r [&:nth-child(-n+2)]:border-b md:border-b-0 md:[&:not(:last-child)]:border-r"
              >
                <div className="h-7 w-16 rounded bg-gray-300" />
                <div className="h-3 w-24 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </div>

        {/* คอร์สเรียน */}
        <section className="mx-auto max-w-6xl px-6 py-14 md:px-10">
          <div className="mb-8 h-8 w-56 rounded bg-gray-200" />
          <div className="flex flex-col">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-4 border-b border-gray-100 py-5"
              >
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-48 rounded bg-gray-300" />
                  <div className="h-3 w-64 max-w-full rounded bg-gray-200" />
                </div>
                <div className="hidden gap-8 md:flex">
                  <div className="h-4 w-24 rounded bg-gray-200" />
                  <div className="h-4 w-24 rounded bg-gray-200" />
                  <div className="h-4 w-20 rounded bg-gray-200" />
                </div>
                <div className="h-10 w-28 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </section>

        {/* ส่วนโค้ช — ล้อโครงจริง หัวเรื่องซ้าย/สถิติขวา แล้วการ์ด 3 ใบเหลื่อมกัน
            ไม่งั้นพอข้อมูลมาถึงหน้าจะกระโดดยาวเท่าความสูงของส่วนนี้ทั้งส่วน */}
        <section className="border-t border-gray-200 py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <div className="mb-11 flex flex-col gap-9 md:flex-row md:items-end md:justify-between">
              <div className="flex max-w-[520px] flex-col gap-3.5">
                <div className="h-3 w-36 rounded bg-gray-200" />
                <div className="h-11 w-64 max-w-full rounded bg-gray-200 md:h-14" />
                <div className="h-3.5 w-80 max-w-full rounded bg-gray-100" />
              </div>
              <div className="flex flex-none divide-x divide-gray-200">
                {[0, 1].map((i) => (
                  <div key={i} className="flex flex-col gap-2 pr-6 first:pl-0 [&:not(:first-child)]:pl-6">
                    <div className="h-7 w-14 rounded bg-gray-200" />
                    <div className="h-3 w-20 rounded bg-gray-100" />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-start justify-center gap-7">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`flex basis-full flex-col sm:basis-[calc(50%-14px)] md:basis-[calc(33.333%-18.667px)] ${
                    ["md:mt-0", "md:mt-14", "md:mt-6"][i]
                  }`}
                >
                  <div className="aspect-[4/5] w-full bg-gray-200" />
                  <div className="flex flex-col gap-2 border-t border-gray-200 pt-4">
                    <div className="h-6 w-32 rounded bg-gray-200" />
                    <div className="h-3 w-40 rounded bg-gray-100" />
                    <div className="h-3 w-24 rounded bg-gray-100" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div style={kanitFont} className="min-h-screen bg-white pb-20 text-gray-900 lg:pb-0">

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
                {content?.hero_eyebrow || "สำหรับผู้ปกครอง · เปิดสอนตั้งแต่ปี 2562"}
              </span>
              <h1 className="whitespace-pre-line text-4xl font-semibold leading-[1.15] tracking-tight text-white drop-shadow-md md:text-6xl">
                {content?.hero_headline || "พื้นฐานที่ถูกต้อง\nสำคัญกว่าชนะเร็ว"}
              </h1>
              <p className="max-w-xl text-sm font-light leading-relaxed text-white/85 drop-shadow md:text-base">
                {content?.hero_subtext ||
                  "คลาสเยาวชนกลุ่มเล็ก โค้ชมีใบรับรอง และระบบที่ผู้ปกครองเข้าไปดูตารางเรียน ค่าเรียน และพัฒนาการของลูกได้ทุกเมื่อ"}
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
              <div className="hidden grid-cols-[1.8fr_1fr_1fr_1fr_150px] gap-4 border-b border-gray-200 pb-3 text-[11px] font-light tracking-[0.08em] text-gray-400 md:grid">
                <span>คอร์ส</span>
                <span>จำนวนครั้ง</span>
                <span>เวลาเรียน</span>
                <span>ราคา</span>
                <span />
              </div>

              {courses.slice(0, 3).map((course) => {
                const pkg = representativePackage(course);
                const sessionsText =
                  pkg && pkg.sessions_count ? `เริ่มต้น ${pkg.sessions_count} ครั้ง` : "รายชั่วโมง";
                const hoursText =
                  pkg && pkg.hours_count ? `เริ่มต้น ${pkg.hours_count} ชั่วโมง` : "—";
                const priceText = startingPrice(course);
                return (
                  <div
                    key={course.id}
                    className="border-b border-gray-100 py-5 transition-colors hover:bg-[#CC0000]/[0.03]"
                  >
                    {/* มือถือ: รายละเอียดซ้าย · ราคา+ปุ่มชิดขวา */}
                    <div className="flex items-start justify-between gap-4 md:hidden">
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="text-base font-normal text-gray-900">{course.course_name}</span>
                        {course.description && (
                          <span className="line-clamp-2 text-xs font-light text-gray-400">{course.description}</span>
                        )}
                        <div className="mt-1 flex flex-col gap-0.5 text-sm font-light text-gray-600">
                          <span>{sessionsText}</span>
                          <span>{hoursText}</span>
                        </div>
                      </div>
                      <div className="flex flex-none flex-col items-end gap-2">
                        <span className="whitespace-nowrap text-base font-medium text-gray-900">{priceText}</span>
                        <Link
                          href={`/courses/${course.id}`}
                          className="inline-flex w-fit items-center gap-1 border border-[#CC0000] bg-[#CC0000] px-4 py-2 text-[13px] font-normal text-white transition-colors hover:border-[#A30A0E] hover:bg-[#A30A0E]"
                        >
                          เลือกคอร์ส
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>

                    {/* จอใหญ่: ตารางแนวนอน */}
                    <div className="hidden grid-cols-[1.8fr_1fr_1fr_1fr_150px] items-center gap-4 md:grid">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-base font-normal text-gray-900">{course.course_name}</span>
                        {course.description && (
                          <span className="line-clamp-1 text-xs font-light text-gray-400">{course.description}</span>
                        )}
                      </div>
                      <span className="text-sm font-light text-gray-600">{sessionsText}</span>
                      <span className="text-sm font-light text-gray-600">{hoursText}</span>
                      <span className="text-base font-medium text-gray-900">{priceText}</span>
                      <Link
                        href={`/courses/${course.id}`}
                        className="inline-flex w-fit items-center gap-1 border border-[#CC0000] bg-[#CC0000] px-4 py-2 text-[13px] font-normal text-white transition-colors hover:border-[#A30A0E] hover:bg-[#A30A0E] md:justify-self-end"
                      >
                        เลือกคอร์ส
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
              {courses.length > 3 && (
                <div className="mt-6 flex justify-center">
                  <Link
                    href="/courses"
                    className="inline-flex items-center gap-1.5 border border-gray-300 px-6 py-3 text-sm font-light text-gray-700 transition-colors hover:border-[#CC0000] hover:text-[#CC0000]"
                  >
                    ดูคอร์สทั้งหมด ({courses.length})
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
              <p className="mt-4 text-xs font-light text-gray-400">
                {content?.courses_footnote || "รวมค่าคอร์ทและลูกขนไก่ · ยืมไม้ฟรีตลอดคอร์ส · แบ่งชำระ 2 งวดได้"}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ===== 02 บุคลากร =====
          แถบพื้นเข้มเต็มความกว้าง ตัดกับส่วนอื่นของหน้าที่เป็นพื้นขาว เพื่อให้หน้ามีจังหวะ
          สีแดงบนพื้นเข้มใช้ ACCENT ไม่ใช่ ACCENT เพราะ #CC0000 บนพื้นดำอ่านไม่ออก */}
      <section id="coaches" className="relative overflow-hidden border-t border-gray-200 bg-white py-16 md:py-20">

        <div className="relative mx-auto max-w-6xl px-6 md:px-10">
          {coaches.length === 0 ? (
            <>
              <span className="flex items-center gap-2.5 text-[11px] font-normal tracking-[0.22em]" style={{ color: ACCENT }}>
                <span className="h-px w-6" style={{ backgroundColor: ACCENT }} />
                02 · OUR COACHES
              </span>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900 md:text-4xl">
                {content?.coaches_title || "ทีมโค้ชของเรา"}
              </h2>
              <p className="py-12 text-center font-light text-gray-400">เร็วๆ นี้</p>
            </>
          ) : (() => {
            // โชว์ได้ถึง 2 แถวเต็ม (6 คน) เกินกว่านั้นค่อยซ่อนหลังปุ่ม
            // โรงเรียนส่วนใหญ่มีโค้ชไม่ถึง 6 คน = เห็นครบทุกคนโดยไม่ต้องกดอะไร
            const VISIBLE = 6;
            const display = showAllCoaches ? coaches : coaches.slice(0, VISIBLE);
            const hiddenCount = coaches.length - display.length;

            // จำนวนคอลัมน์: ปกติ 3 แต่ถ้าหารแล้วเหลือเศษ 1 ให้ใช้ 4 แทน
            // เพราะเศษ 1 = แถวสุดท้ายมีการ์ดใบเดียวลอยอยู่กลางช่องว่างกว้าง ๆ
            // (4 คน → 4 คอลัมน์แถวเดียว · 7 คน → 4+3 · 10 คน → 4+4+2)
            const useFour = display.length > 3 && display.length % 3 === 1;
            const cols = useFour ? 4 : 3;

            // ต้องเป็นคลาสเต็มสตริง Tailwind ถึงจะเก็บไปคอมไพล์ ต่อสตริงเองไม่ได้
            const BASIS = useFour
              ? "md:basis-[calc(25%-21px)]"
              : "md:basis-[calc(33.333%-18.667px)]";

            // เหลื่อมการ์ดตามตำแหน่งในแถว — 4 คอลัมน์การ์ดแคบกว่า ระยะเหลื่อมจึงสั้นลง
            const OFFSET = useFour
              ? ["md:mt-0", "md:mt-10", "md:mt-4", "md:mt-12"]
              : ["md:mt-0", "md:mt-14", "md:mt-6"];

            return (
              <>
                {/* แถวหัว: หัวข้อซ้าย / สถิติขวา */}
                <div className="mb-11 flex flex-col gap-9 md:flex-row md:items-end md:justify-between">
                  <div className="flex max-w-[520px] flex-col gap-3.5">
                    <h2 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.025em] text-gray-900 md:text-[52px]">
                      {content?.coaches_title || "ทีมโค้ชของเรา"}
                    </h2>
                    <p className="text-sm font-light leading-relaxed text-gray-500">
                      {content?.coaches_subtitle ||
                        "โค้ชคือเหตุผลหลักที่ผู้ปกครองเลือกเรา ทุกคนมีใบรับรองผู้ฝึกสอน ผ่านการตรวจประวัติ และดูแลนักเรียนกลุ่มเล็ก"}
                    </p>
                  </div>

                  <div className="flex flex-none divide-x divide-gray-200">
                    {coachStats.map((s, i) => (
                      <div key={i} className="flex flex-col gap-1.5 pr-6 first:pl-0 [&:not(:first-child)]:pl-6">
                        <span className="text-[28px] font-semibold leading-none md:text-[34px]" style={{ color: ACCENT }}>
                          {s.value}
                        </span>
                        <span className="text-[11px] font-light text-gray-500">{s.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* การ์ดโค้ช — เหลื่อมกันบนจอกว้าง เรียงตรงบนจอเล็ก */}
                {/* ⚠️ flex-wrap + justify-center ไม่ใช่ grid โดยตั้งใจ
                    grid จะดันการ์ดของแถวสุดท้ายไปชิดซ้ายแล้วเหลือช่องว่างข้างเดียว
                    เช่นมีโค้ช 4 คน = แถวสองมีใบเดียวลอยอยู่ซ้ายสุด ดูเหมือนโหลดไม่ครบ
                    flex จัดกลางให้แทน แถวไหนไม่เต็มก็ยังดูตั้งใจ */}
                <div className="flex flex-wrap items-start justify-center gap-7">
                  {display.map((coach, i) => {
                    const img = coach.home_image || coach.profile_picture;
                    const name =
                      coach.nickname ||
                      [coach.firstName, coach.lastName].filter(Boolean).join(" ") ||
                      `โค้ช #${coach.id}`;
                    // ⚠️ ห้ามกลับไปเดาจากลำดับ (i === 0) — ลำดับเปลี่ยนเมื่อไหร่
                    // คนอื่นจะถูกป้ายว่าเป็นหัวหน้าโค้ชทันทีโดยไม่มีใครสั่ง
                    // ฟิลด์นี้แอดมินติ๊กเองที่หน้าตั้งค่า และ backend บังคับให้มีคนเดียว
                    const isHead = coach.is_head_coach;
                    const role = isHead ? "หัวหน้าผู้ฝึกสอน" : "ผู้ฝึกสอน";

                    return (
                      <button
                        key={coach.id}
                        type="button"
                        onClick={() => setSelectedCoach(coach)}
                        className={`group flex basis-full flex-col text-left sm:basis-[calc(50%-14px)] ${BASIS} ${OFFSET[i % cols]}`}
                      >
                        <div className="relative aspect-[4/5] w-full overflow-hidden bg-gray-100">
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={img}
                              alt={name}
                              className="h-full w-full object-cover object-top transition duration-700 group-hover:scale-[1.04]"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-gray-300">
                              <UserRound className="h-14 w-14" />
                            </div>
                          )}

                          {/* ⚠️ ไล่เฉดนี้ต้องติดอยู่ตลอด ไม่ใช่เฉพาะตอน hover
                              รูปโค้ชมาจากหลายแหล่ง บางใบพื้นขาวล้วน วางบนแถบเข้มแล้วเป็น
                              บล็อกขาวโพลนตัดกันแรงมาก เฉดนี้ทำให้ขอบล่างจมเข้าหาพื้นแถบ
                              รูปที่เข้มอยู่แล้วจะแทบไม่เห็นความต่าง */}
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-white via-white/45 to-transparent" />
                          <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-500 group-hover:bg-black/5" />

                          {isHead && (
                            <span
                              className="absolute bottom-0 left-0 px-3 py-1.5 text-[10px] font-medium tracking-[0.18em] text-white"
                              style={{ backgroundColor: ACCENT }}
                            >
                              HEAD COACH
                            </span>
                          )}

                        </div>

                        <div
                          className="flex flex-col gap-2 pt-4"
                          style={{ borderTop: isHead ? `2px solid ${ACCENT}` : "1px solid #e5e7eb" }}
                        >
                          {/* เลขลำดับเคยวางทับรูป ซึ่งคอนทราสต์ขึ้นอยู่กับรูปล้วน ๆ
                              เจอจริงคือ 03 บนรูปพื้นขาวหายสนิท ย้ายมาไว้บนพื้นแถบแทน */}
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-2xl font-semibold leading-tight text-gray-900">{name}</span>
                            <span
                              className="flex-none text-[34px] font-bold leading-none"
                              style={{ color: isHead ? ACCENT : "rgba(17,24,39,0.13)" }}
                            >
                              {String(i + 1).padStart(2, "0")}
                            </span>
                          </div>
                          <span className="text-xs font-light" style={{ color: ACCENT }}>
                            {role}
                            {coach.specialization ? ` · ระดับ ${coach.specialization}` : ""}
                          </span>
                          {coach.coach_license?.trim() && (
                            <span className="text-xs font-light text-gray-400">{coach.coach_license}</span>
                          )}
                          {coach.bio?.trim() && (
                            <span className="line-clamp-3 text-[12.5px] font-light leading-relaxed text-gray-500">
                              {coach.bio}
                            </span>
                          )}
                          <span
                            className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-light opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                            style={{ color: ACCENT }}
                          >
                            ดูรายละเอียด
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* แถวปิดท้าย — โผล่เฉพาะตอนมีโค้ชเกินที่แสดงอยู่
                    ไม่งั้นจะเหลือเส้นคาดกับที่ว่างลอย ๆ โดยไม่มีอะไรอยู่ในนั้น */}
                {(hiddenCount > 0 || showAllCoaches) && (
                  <div className="mt-12 flex justify-end border-t border-gray-200 pt-6">
                    <button
                      type="button"
                      onClick={() => setShowAllCoaches((v) => !v)}
                      className="group inline-flex flex-none items-center gap-2 px-5 py-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: ACCENT }}
                    >
                      {showAllCoaches ? "ย่อรายชื่อโค้ช" : `ดูโค้ชทั้ง ${coaches.length} คน`}
                      <ArrowRight
                        className={`h-4 w-4 transition-transform ${showAllCoaches ? "-rotate-90" : "group-hover:translate-x-0.5"}`}
                      />
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </section>

      {/* ===== ภาพบรรยากาศ ===== mosaic grid (ดีไซน์ Koyama) — ช่องแรกกว้างและสูง 2 แถว */}
      <section id="facility" className="border-t border-gray-200 bg-white py-14">
        <div className="mx-auto max-w-6xl px-6 md:px-10">
          <SectionHeading
            title={content?.facility_title || "ภาพบรรยากาศ"}
            right={
              <button
                type="button"
                onClick={() => setIsFacilityOpen(true)}
                className="whitespace-nowrap border-b border-gray-300 pb-1 text-sm font-light text-gray-500 transition-colors hover:border-[#CC0000] hover:text-[#CC0000]"
              >
                ดูรูปทั้งหมด
              </button>
            }
          />
          {/* มือถือ: ช่อง wide เต็มกว้าง ที่เหลือ 2 คอลัมน์ · md ขึ้นไป: 2fr 1fr 1fr สองแถว
              gutter 1px ใช้ gap-px บนพื้น bg-gray-200 */}
          <div className="grid auto-rows-[150px] grid-cols-2 gap-px bg-gray-200 md:auto-rows-[170px] md:grid-cols-[2fr_1fr_1fr]">
            {facilityTiles.map((tile, i) => (
              <div
                key={i}
                className={`relative flex items-end overflow-hidden ${
                  tile.wide ? "col-span-2 row-span-1 md:col-span-1 md:row-span-2" : ""
                }`}
                style={
                  tile.image_url
                    ? undefined
                    : { background: "repeating-linear-gradient(115deg,#efefec 0 10px,#f7f7f4 10px 20px)" }
                }
              >
                {tile.image_url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={tile.image_url}
                      alt={tile.label}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    {tile.label && (
                      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />
                    )}
                  </>
                ) : (
                  <Images className="absolute right-3 top-3 h-5 w-5 text-gray-300" />
                )}
                {tile.label && (
                  <span
                    className={`relative p-3.5 text-xs font-light ${
                      tile.image_url ? "text-white" : "text-gray-500"
                    }`}
                  >
                    {tile.label}
                  </span>
                )}
              </div>
            ))}
          </div>
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
            {faqItems.map((item, i) => {
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

      {/* ===== Footer (โครงตามดีไซน์ Koyama · คงธีมเข้ม/แดงเดิม) ===== CTA band → 4 คอลัมน์ → แถบลิขสิทธิ์ */}
      <footer className="border-t-2 bg-gray-900 text-gray-400" style={{ borderTopColor: ACCENT }}>
        <div className="mx-auto max-w-6xl px-6 md:px-10">
          {/* แถบ CTA */}
          <div className="flex flex-col items-start justify-between gap-8 py-14 md:flex-row md:items-end">
            <h2 className="max-w-[18ch] whitespace-pre-line text-3xl font-medium leading-[1.15] tracking-tight text-white md:text-[38px]">
              {content?.footer_cta_title || "พร้อมเริ่มเรียน\nกับเราแล้วหรือยัง?"}
            </h2>
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
              <span className="max-w-[24ch] text-xs font-light leading-relaxed text-gray-500">
                {content?.footer_cta_subtitle || "ทดลองเรียนฟรี 1 ครั้ง ไม่มีข้อผูกมัด · Free trial class"}
              </span>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/login"
                  className="inline-flex items-center px-7 py-4 text-[15px] font-medium text-white shadow-lg transition-colors hover:brightness-110"
                  style={{ backgroundColor: ACCENT }}
                >
                  ทดลองเรียนฟรี
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 border border-gray-600 px-7 py-4 text-[15px] font-light text-gray-200 transition-colors hover:border-white hover:text-white"
                >
                  สมัคร / เข้าสู่ระบบ
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>

          {/* กริด 4 คอลัมน์: แบรนด์ / คอร์สเรียน / โรงเรียน / ติดต่อ */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 border-t border-gray-800 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
            {/* แบรนด์ */}
            <div className="col-span-2 flex flex-col gap-4 md:col-span-1">
              <span className="text-lg font-medium text-white">{schoolName}</span>
              <p className="max-w-[34ch] text-[13px] font-light leading-relaxed text-gray-500">
                {content?.about_content?.trim() ||
                  "โรงเรียนสอนแบดมินตันสำหรับเยาวชนและผู้เริ่มต้น เปิดสอนตั้งแต่ปี 2562"}
              </p>
              {content && <SocialLinks content={content} variant="dark" className="pt-1" />}
            </div>

            {/* คอร์สเรียน */}
            <div className="flex flex-col gap-4">
              <span className="text-[11px] font-light tracking-[0.18em] text-gray-500">คอร์สเรียน</span>
              <div className="flex flex-col gap-2.5 text-[13px] font-light">
                {courses.slice(0, 4).map((course) => (
                  <Link
                    key={course.id}
                    href={`/courses/${course.id}`}
                    className="transition-colors hover:text-white"
                  >
                    {course.course_name}
                  </Link>
                ))}
                <Link href="/#courses" className="transition-colors hover:text-white">
                  ค่าเรียนและการชำระเงิน
                </Link>
              </div>
            </div>

            {/* โรงเรียน */}
            <div className="flex flex-col gap-4">
              <span className="text-[11px] font-light tracking-[0.18em] text-gray-500">โรงเรียน</span>
              <div className="flex flex-col gap-2.5 text-[13px] font-light">
                <Link href="/#coaches" className="transition-colors hover:text-white">โค้ชของเรา</Link>
                <Link href="/#facility" className="transition-colors hover:text-white">ภาพบรรยากาศ</Link>
                <Link href="/#news" className="transition-colors hover:text-white">ข่าวและประกาศ</Link>
                <Link href="/#faq" className="transition-colors hover:text-white">คำถามที่พบบ่อย</Link>
              </div>
            </div>

            {/* ติดต่อ */}
            <div className="flex flex-col gap-4">
              <span className="text-[11px] font-light tracking-[0.18em] text-gray-500">ติดต่อ</span>
              <div className="flex flex-col gap-2.5 text-[13px] font-light leading-relaxed">
                {content?.contact_address && (
                  <span className="whitespace-pre-line">{content.contact_address}</span>
                )}
                {content?.contact_phone && (
                  <a
                    href={`tel:${content.contact_phone.replace(/[^\d+]/g, "")}`}
                    className="transition-colors hover:text-white"
                  >
                    {content.contact_phone}
                  </a>
                )}
                {content?.line_url && (
                  <a
                    href={content.line_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-white"
                  >
                    LINE
                  </a>
                )}
                {content?.opening_hours && (
                  <span className="whitespace-pre-line">{content.opening_hours}</span>
                )}
              </div>
            </div>
          </div>

          {/* แถบลิขสิทธิ์ + เอกสารทางกฎหมาย */}
          <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-800 py-6 text-xs font-light sm:flex-row">
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

      {/* ===== Modal รายละเอียดโค้ช =====
          มุม 0 ไม่มีเงา เหมือนส่วนอื่นของหน้า
          เดิมเป็นกล่องมุมมนมีเงา + ชิปมนสีชมพู/ม่วง ซึ่งหลุดจากทั้งหน้า */}
      {selectedCoach && (() => {
        const c = selectedCoach;
        const img = c.home_image || c.profile_picture;
        const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ");
        const displayName = c.nickname || fullName || `โค้ช #${c.id}`;
        const details = [
          c.specialization && { label: "ระดับ", value: c.specialization },
          c.coach_license && { label: "ใบรับรอง", value: c.coach_license },
        ].filter(Boolean) as { label: string; value: string }[];

        return (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
            onClick={() => setSelectedCoach(null)}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

            {/* จอเล็กเรียงบนล่างแล้วเลื่อนทั้งกล่อง · จอ sm ขึ้นไปวางรูปซ้ายเนื้อหาขวา
                กล่องจะได้เป็นแนวนอน ไม่สูงจนต้องเลื่อนกว่าจะอ่านประวัติจบ */}
            <div
              className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden border border-gray-200 bg-white sm:grid sm:grid-cols-[300px_1fr]"
              onClick={(e) => e.stopPropagation()}
              style={kanitFont}
            >
              <button
                onClick={() => setSelectedCoach(null)}
                className="absolute right-0 top-0 z-10 grid h-10 w-10 place-items-center border-b border-l border-gray-200 bg-white/85 text-gray-400 transition-colors hover:text-gray-900"
                aria-label="ปิด"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="relative h-[280px] w-full flex-none bg-gray-100 sm:h-full">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt={displayName} className="h-full w-full object-cover object-top" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-300">
                    <UserRound className="h-16 w-16" />
                  </div>
                )}
                {/* เฉพาะจอเล็กที่รูปอยู่เหนือเนื้อหา — ให้ขอบล่างจมเข้าหาพื้นกล่อง */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent sm:hidden" />
              </div>

              {/* min-h-0 ขาดไม่ได้ — ลูกของ flex มีความสูงขั้นต่ำเท่าเนื้อหาโดยปริยาย
                  ถ้าไม่ปลดออก กล่องจะยืดตามเนื้อหาแทนที่จะให้ตรงนี้เลื่อน */}
              <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain p-7 sm:max-h-[88vh] sm:flex-none">
                <div className="flex flex-col gap-1.5 pr-10">
                  <span className="text-[30px] font-semibold leading-tight tracking-tight text-gray-900">
                    {displayName}
                  </span>
                  {fullName && c.nickname && (
                    <span className="text-sm font-light text-gray-400">{fullName}</span>
                  )}
                </div>

                {details.length > 0 && (
                  <dl className="flex flex-col divide-y divide-gray-200 border-y border-gray-200">
                    {details.map((d) => (
                      <div key={d.label} className="flex items-baseline gap-5 py-3">
                        <dt className="w-[72px] flex-none text-[11px] font-light tracking-[0.1em] text-gray-400">
                          {d.label}
                        </dt>
                        <dd className="text-sm font-normal text-gray-900">{d.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {c.bio?.trim() ? (
                  <p className="whitespace-pre-line text-[13.5px] font-light leading-[1.8] text-gray-600">
                    {c.bio}
                  </p>
                ) : (
                  <p className="text-[13.5px] font-light text-gray-400">ยังไม่มีรายละเอียดเพิ่มเติม</p>
                )}

                {/* ⚠️ ห้ามเขียนว่า "จองคลาสกับโค้ชคนนี้" — ระบบสมัครเรียนเลือกเป็นคอร์ส
                    ไม่มีทางเลือกโค้ชรายคน ปุ่มแบบนั้นสัญญาสิ่งที่กดแล้วทำไม่ได้จริง
                    พาไปหน้าคอร์สแทน ซึ่งเป็นก้าวถัดไปที่มีอยู่จริง */}
                <Link
                  href="/courses"
                  className="group mt-auto inline-flex w-fit items-center gap-2 px-5 py-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: ACCENT }}
                >
                  ดูคอร์สเรียนทั้งหมด
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
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

      {/* ===== แกลเลอรีภาพบรรยากาศ (facility) ===== */}
      {isFacilityOpen &&
        (() => {
          const photos = facilityTiles.filter((t) => t.image_url);
          return (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center p-4"
              onClick={() => setIsFacilityOpen(false)}
            >
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
              <div
                className="relative flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden bg-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
                style={kanitFont}
              >
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    {content?.facility_title || "ภาพบรรยากาศ"}
                  </h3>
                  <button
                    onClick={() => setIsFacilityOpen(false)}
                    className="grid h-9 w-9 place-items-center rounded-full bg-black/5 text-gray-600 transition hover:bg-black/10"
                    aria-label="ปิด"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="overflow-y-auto px-5 py-5">
                  {photos.length === 0 ? (
                    <p className="py-16 text-center font-light text-gray-400">
                      ยังไม่มีรูปภาพบรรยากาศ
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      {photos.map((tile, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setFacilityLightbox(tile.image_url!)}
                          className="group relative flex aspect-[4/3] overflow-hidden border border-gray-100 bg-gray-100"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={tile.image_url}
                            alt={tile.label}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                          {tile.label && (
                            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2 text-left text-xs font-light text-white">
                              {tile.label}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

      {/* lightbox รูปเดียวเต็มจอ */}
      {facilityLightbox && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          onClick={() => setFacilityLightbox(null)}
        >
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />
          <button
            onClick={() => setFacilityLightbox(null)}
            className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            aria-label="ปิด"
          >
            <X className="h-6 w-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={facilityLightbox}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[90vh] max-w-[90vw] object-contain"
          />
        </div>
      )}

      {/* ===== หน้าต่างอ่านข่าว ===== */}
      {selectedNews && <AnnouncementDetailModal announcement={selectedNews} onClose={() => setSelectedNews(null)} />}

      {/* ===== แถบปุ่มติดด้านล่าง (เฉพาะมือถือ) ===== ทดลองเรียนฟรี + LINE */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2.5 border-t border-gray-200 bg-white px-4 py-3 lg:hidden">
        <Link
          href="/login"
          className="flex min-h-[44px] flex-1 items-center justify-center text-[15px] font-medium text-white transition-colors hover:brightness-110"
          style={{ backgroundColor: ACCENT }}
        >
          ทดลองเรียนฟรี
        </Link>
        {content?.line_url && (
          <a
            href={content.line_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[44px] items-center justify-center border border-gray-300 px-5 text-[15px] font-light text-gray-700 transition-colors hover:border-[#CC0000] hover:text-[#CC0000]"
          >
            LINE
          </a>
        )}
      </div>
    </div>
  );
}
