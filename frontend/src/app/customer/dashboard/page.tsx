'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { announcementAPI } from '@/services/announcementAPI';
import { reviewAPI } from '@/services/reviewAPI';
import { Announcement, Category } from '@/types/announcement';
import { Review } from '@/types/review';
import { ChevronLeft, ChevronRight, Calendar, Star, Quote, BookOpen, UserRound, CalendarClock } from 'lucide-react';
import { fetchCustomerEnrollments } from '@/services/enrollmentAPI';
import type { Enrollment } from '@/types/enrollment';
import {
  describeExpiry,
  EXPIRY_WARNING_DAYS,
} from '@/components/course/expiryUtils';
import WelcomeOnboardingModal from './components/WelcomeOnboardingModal';
import { Poster } from '@/components/AnnouncementDetailModal';

export default function CustomerDashboardPage() {
  const router = useRouter();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [featuredReviews, setFeaturedReviews] = useState<Review[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Hero Carousel State
  const [currentSlide, setCurrentSlide] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  /** คอร์สที่กำลังเรียนอยู่และใกล้หมดอายุภายใน 7 วัน */
  const [expiringSoon, setExpiringSoon] = useState<Enrollment[]>([]);

  /** ป็อปอัพต้อนรับ — โชว์ครั้งเดียวตอนลูกค้าล็อกอินเข้ามาครั้งแรกและยังไม่มีคอร์ส */
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  // คีย์กันโชว์ซ้ำ ผูกกับ user_id เพื่อให้แต่ละบัญชีนับครั้งแรกของตัวเอง
  const welcomeSeenKey = (customerId: string) => `koyama_welcomed_${customerId}`;

  const goEnroll = () => {
    const customerId = localStorage.getItem('user_id');
    if (customerId) localStorage.setItem(welcomeSeenKey(customerId), '1');
    setShowWelcome(false);
    router.push('/customer/enrollment');
  };

  const dismissWelcome = () => {
    const customerId = localStorage.getItem('user_id');
    if (customerId) localStorage.setItem(welcomeSeenKey(customerId), '1');
    setShowWelcome(false);
  };

  async function fetchData() {
    try {
      setLoading(true);
      const [annData, catData] = await Promise.all([
        // ฝั่งลูกค้าใช้ endpoint สาธารณะ (เห็นเฉพาะประกาศที่กำลังแสดงผล)
        // ไม่ใช่ /admin/announcements ที่จำกัดเฉพาะแอดมิน (จะได้ 403)
        announcementAPI.getPublicAnnouncements('member'),
        announcementAPI.getAllCategories(),
      ]);
      setAnnouncements(annData || []);
      setCategories(catData || []);
    } catch (error) {
      console.error('Failed to fetch announcements:', error);
    } finally {
      setLoading(false);
    }

    // รีวิวเด่นเป็นส่วนเสริม โหลดแยกและกลืน error เพื่อไม่ให้กระทบหน้าประกาศ
    try {
      const reviews = await reviewAPI.getFeaturedReviews();
      setFeaturedReviews(reviews || []);
    } catch (error) {
      console.error('Failed to fetch featured reviews:', error);
    }
    try {
      const token = localStorage.getItem('token');
      const customerId = localStorage.getItem('user_id');
      if (token && customerId) {
        const data = await fetchCustomerEnrollments(Number(customerId), token);
        setExpiringSoon(
          data.filter(
            (e) =>
              e.status === 'active' &&
              // ต้องเทียบ null ตรง ๆ — 0 แปลว่าหมดวันนี้ ซึ่งต้องเตือนด้วย
              e.days_left !== null &&
              e.days_left <= EXPIRY_WARNING_DAYS
          )
        );

        // ครั้งแรกที่ล็อกอิน (ยังไม่เคยเห็นป็อปอัพ) และยังไม่มีคอร์สเลย → ชวนไปสมัครคอร์ส
        // เช็ก data.length === 0 ด้วย เพื่อไม่รบกวนคนที่มีคอร์สอยู่แล้วแต่มาเปิดเครื่องใหม่
        const seen = localStorage.getItem(welcomeSeenKey(customerId));
        if (!seen && data.length === 0) {
          setShowWelcome(true);
        }
      }
    } catch (error) {
      console.error('Failed to fetch enrollments:', error);
    }
  };

  // Carousel auto-slide logic
  const featuredAnnouncements = announcements.slice(0, 5); // top 5 for hero
  
  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrentSlide((prev) => (prev === featuredAnnouncements.length - 1 ? 0 : prev + 1));
    }, 5000);
  };

  useEffect(() => {
    if (featuredAnnouncements.length > 0) {
      resetTimer();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [featuredAnnouncements.length, currentSlide]);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev === featuredAnnouncements.length - 1 ? 0 : prev + 1));
    resetTimer();
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev === 0 ? featuredAnnouncements.length - 1 : prev - 1));
    resetTimer();
  };

  // เปิดหน้ารายละเอียดข่าวแยกของประกาศนั้น (ไม่ใช้หน้าต่างลอยแล้ว)
  const openDetail = (announcement: Announcement) => {
    router.push(`/customer/announcements/${announcement.id}`);
  };

  const displayedAnnouncements = selectedCategory
    ? announcements.filter((a) => a.category_id === selectedCategory)
    : announcements;

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl min-h-screen bg-gray-50 flex items-center justify-center rounded-2xl">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#CC0000]"></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl min-h-[calc(100vh-80px)] bg-gray-50 text-gray-900 font-sans selection:bg-[#CC0000] selection:text-white pb-20 rounded-2xl overflow-hidden shadow-sm">

      {showWelcome && (
        <WelcomeOnboardingModal
          firstName={typeof window !== 'undefined' ? localStorage.getItem('firstName') ?? undefined : undefined}
          onStart={goEnroll}
          onClose={dismissWelcome}
        />
      )}

      {/* Hero Cinematic Section (Kept Dark for Image Visibility) */}
      <div className="relative w-full h-[55vh] md:h-[60vh] overflow-hidden group bg-black">
        {featuredAnnouncements.length > 0 ? (
          <>
            {/* Slides */}
            {featuredAnnouncements.map((ann, idx) => (
              <div
                key={ann.id}
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                  idx === currentSlide ? 'opacity-100 z-10' : 'opacity-0 z-0'
                }`}
              >
                {/* Background Image or Gradient */}
                {ann.image_url ? (
                  <>
                    {/* พื้นหลังเบลอจากรูปเดียวกัน เติมขอบ (letterbox) แทนแถบดำว่าง */}
                    <img src={ann.image_url} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50" />
                    {/* รูปจริง — object-contain เพื่อโชว์เต็มทั้งภาพไม่ตัดขอบ */}
                    <img src={ann.image_url} alt="Cover" className="absolute inset-0 w-full h-full object-contain" />
                  </>
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" />
                )}

                {/* overlay ให้อ่านตัวหนังสือด้านล่างได้ แต่เบาลงเพื่อให้รูปสว่างขึ้น */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                
                <div className="absolute bottom-0 left-0 w-full p-8 md:p-16 flex flex-col items-start justify-end h-full">
                  <span className="px-3 py-1 bg-white text-gray-900 text-xs font-bold uppercase tracking-wider rounded-md mb-4 shadow-sm">
                    {ann.category?.name || 'Announcement'}
                  </span>
                  <h1 className="text-4xl md:text-5xl font-extrabold mb-4 max-w-4xl leading-tight text-white drop-shadow-lg">
                    {ann.title}
                  </h1>
                  <p className="text-gray-200 text-lg md:text-xl max-w-2xl mb-8 line-clamp-2 drop-shadow-md">
                    {ann.content}
                  </p>
                  <button
                    onClick={() => openDetail(ann)}
                    className="flex items-center gap-2 px-8 py-3 bg-[#CC0000] hover:bg-[#990000] transition-all duration-300 text-white font-semibold rounded-full shadow-lg shadow-[#CC0000]/30 hover:scale-105"
                  >
                    อ่านเพิ่มเติม
                  </button>
                </div>
              </div>
            ))}

            {/* Navigation Arrows */}
            <button
              onClick={prevSlide}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/30 hover:bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-sm border border-white/20"
            >
              <ChevronLeft size={32} />
            </button>
            <button
              onClick={nextSlide}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/30 hover:bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-sm border border-white/20"
            >
              <ChevronRight size={32} />
            </button>

            {/* Indicators */}
            <div className="absolute bottom-6 right-8 z-20 flex gap-2">
              {featuredAnnouncements.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCurrentSlide(idx);
                    resetTimer();
                  }}
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    idx === currentSlide ? 'w-8 bg-[#CC0000]' : 'w-4 bg-white/60 hover:bg-white'
                  }`}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 bg-gray-100">
            ไม่มีประกาศในขณะนี้
          </div>
        )}
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-30">
        {/* Category Filters */}
        <div className="flex items-center gap-3 overflow-x-auto py-6 no-scrollbar">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`whitespace-nowrap px-6 py-2 rounded-full font-medium transition-colors duration-300 ${
              selectedCategory === null
                ? 'bg-[#CC0000] text-white shadow-md shadow-[#CC0000]/30'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            ประกาศทั้งหมด
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`whitespace-nowrap px-6 py-2 rounded-full font-medium transition-colors duration-300 ${
                selectedCategory === cat.id
                  ? 'bg-[#CC0000] text-white shadow-md shadow-[#CC0000]/30'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Announcements Grid */}
        <div className="mt-8">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-gray-900">
            <span className="text-[#CC0000]">|</span> ประกาศอื่นๆ ที่น่าสนใจ
          </h2>
          
          {displayedAnnouncements.length > 0 ? (
            <>
              <div className="grid gap-6 lg:grid-cols-5">
                {/* ข่าวเด่น */}
                {(() => {
                  const featured = displayedAnnouncements[0];
                  return (
                    <div
                      onClick={() => openDetail(featured)}
                      className={`group cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:shadow-lg lg:col-span-3 ${
                        displayedAnnouncements.length === 1 ? 'lg:col-start-2' : ''
                      }`}
                    >
                      {featured.image_url ? (
                        <Poster src={featured.image_url} alt={featured.title} className="aspect-[16/9] w-full" />
                      ) : (
                        <div className="aspect-[16/9] w-full bg-gradient-to-br from-gray-800 to-gray-900" />
                      )}
                      <div className="p-5 sm:p-6">
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                          {featured.category?.name && (
                            <span className="rounded-md bg-[#FFF0F0] px-2.5 py-1 font-bold uppercase tracking-wider text-[#CC0000]">
                              {featured.category.name}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-gray-400">
                            <Calendar size={13} />
                            {new Date(featured.start_date).toLocaleDateString('th-TH', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                        <h3 className="text-xl font-bold leading-snug text-gray-900 transition-colors group-hover:text-[#CC0000] sm:text-2xl line-clamp-2">
                          {featured.title}
                        </h3>
                        <p className="mt-2 line-clamp-2 text-sm text-gray-600">{featured.content}</p>
                      </div>
                    </div>
                  );
                })()}

                {/* รายการข่าวย่อยทางขวา — ข่าวที่เหลือทั้งหมดอยู่ในนี้แล้วเลื่อนดู
                    มือถือ/iPad: ปัดแนวนอน (snap) กัน scroll ซ้อนกับหน้า · คอม: เลื่อนแนวตั้งข้างข่าวเด่น
                    แสดงเฉพาะเมื่อมีข่าวย่อย (มากกว่า 1 ข่าว) — ถ้ามีข่าวเดียวจะจัดข่าวเด่นไว้กลางแทน */}
                {displayedAnnouncements.length > 1 && (
                <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 lg:col-span-2 lg:snap-none lg:flex-col lg:self-start lg:overflow-x-hidden lg:overflow-y-auto lg:pb-0 lg:pr-1 lg:max-h-[496px]">
                  {displayedAnnouncements.slice(1).map((ann) => (
                    <div
                      key={ann.id}
                      onClick={() => openDetail(ann)}
                      className="group flex w-72 shrink-0 snap-start cursor-pointer gap-3 overflow-hidden rounded-xl border border-gray-100 bg-white p-2 shadow-sm transition-all duration-300 hover:shadow-md sm:w-80 lg:h-[112px] lg:w-full lg:shrink-0"
                    >
                      {ann.image_url ? (
                        <Poster src={ann.image_url} alt={ann.title} className="h-20 w-28 shrink-0 rounded-lg sm:h-24 sm:w-32" />
                      ) : (
                        <div className="h-20 w-28 shrink-0 rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 sm:h-24 sm:w-32" />
                      )}
                      <div className="flex min-w-0 flex-1 flex-col justify-center py-0.5 pr-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                          {ann.category?.name && (
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 font-bold uppercase tracking-wider text-gray-600">
                              {ann.category.name}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Calendar size={11} />
                            {new Date(ann.start_date).toLocaleDateString('th-TH', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                        <h4 className="line-clamp-2 text-sm font-bold leading-snug text-gray-900 transition-colors group-hover:text-[#CC0000]">
                          {ann.title}
                        </h4>
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-20 text-gray-500 bg-white rounded-2xl border border-gray-100 shadow-sm">
              ไม่พบประกาศในหมวดหมู่นี้
            </div>
          )}
        </div>

        {/* Reviews Section */}
        {featuredReviews.length > 0 && (
          <div className="mt-16">
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2 text-gray-900">
              <span className="text-[#CC0000]">|</span> เสียงจากผู้เรียนของเรา
            </h2>
            <p className="text-gray-500 text-sm mb-6">รีวิวจริงจากลูกค้าที่ลงทะเบียนเรียนกับเรา</p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredReviews.map((review) => (
                <div
                  key={review.id}
                  className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col gap-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          size={18}
                          className={s <= review.rating ? 'text-amber-400' : 'text-gray-200'}
                          fill={s <= review.rating ? 'currentColor' : 'none'}
                        />
                      ))}
                    </div>
                    <Quote size={24} className="text-[#CC0000]/20" />
                  </div>

                  <p className="text-gray-700 text-sm leading-relaxed flex-grow line-clamp-5 whitespace-pre-line">
                    {review.comment}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {review.course && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700">
                        <BookOpen size={13} />
                        {review.course.course_name}
                      </span>
                    )}
                    {review.coach && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-50 text-purple-700">
                        <UserRound size={13} />
                        โค้ช {review.coach.nickname}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                    <div className="w-10 h-10 rounded-full bg-[#FFF0F0] text-[#CC0000] flex items-center justify-center font-bold flex-shrink-0">
                      {reviewerInitial(review)}
                    </div>
                    <p className="font-semibold text-gray-800 text-sm truncate">{reviewerName(review)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ---------- Review helpers ----------
function reviewerName(r: Review): string {
  if (!r.customer) return 'ผู้เรียน';
  if (r.customer.nickname) return r.customer.nickname;
  const full = [r.customer.firstName, r.customer.lastName].filter(Boolean).join(' ');
  return full || 'ผู้เรียน';
}

function reviewerInitial(r: Review): string {
  const name = r.customer?.nickname || r.customer?.firstName || '?';
  return name.charAt(0).toUpperCase();
}