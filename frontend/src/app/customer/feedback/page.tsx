'use client';

import React, { useEffect, useState } from 'react';
import { reviewAPI } from '@/services/reviewAPI';
import { fetchCustomerEnrollments } from '@/services/enrollmentAPI';
import { Review, CourseCoach, CreateReviewReq, ReviewCategory } from '@/types/review';
import { Enrollment } from '@/types/enrollment';
import { Star, Send, Loader2, BookOpen, UserRound, Sparkles, MessageSquareText, MapPin, Wrench, MoreHorizontal } from 'lucide-react';

// ตัวเลือกหัวข้อรีวิว/ข้อเสนอแนะที่ลูกค้าเลือกได้
const CATEGORY_OPTIONS: { key: ReviewCategory; label: string; icon: React.ElementType }[] = [
  { key: 'course', label: 'คอร์ส', icon: BookOpen },
  { key: 'coach', label: 'โค้ช', icon: UserRound },
  { key: 'place', label: 'สถานที่', icon: MapPin },
  { key: 'service', label: 'บริการ', icon: Wrench },
  { key: 'other', label: 'อื่นๆ', icon: MoreHorizontal },
];

// ตัวเลือกคอร์สที่ลูกค้าลงทะเบียนไว้ (ตัดตัวซ้ำแล้ว)
interface CourseOption {
  id: number;
  name: string;
}

function StarRating({
  value,
  size = 20,
  onChange,
}: {
  value: number;
  size?: number;
  onChange?: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const interactive = typeof onChange === 'function';

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= (hover || value);
        return (
          <button
            key={star}
            type="button"
            disabled={!interactive}
            onClick={() => onChange?.(star)}
            onMouseEnter={() => interactive && setHover(star)}
            onMouseLeave={() => interactive && setHover(0)}
            className={interactive ? 'cursor-pointer transition-transform hover:scale-110' : 'cursor-default'}
          >
            <Star
              size={size}
              className={filled ? 'text-amber-400' : 'text-gray-300'}
              fill={filled ? 'currentColor' : 'none'}
            />
          </button>
        );
      })}
    </div>
  );
}

export default function CustomerFeedbackPage() {
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  // ฟอร์ม
  const [courseId, setCourseId] = useState<number | ''>('');
  const [category, setCategory] = useState<ReviewCategory>('course');
  const [coachId, setCoachId] = useState<number | ''>('');
  const [coaches, setCoaches] = useState<CourseCoach[]>([]);
  const [loadingCoaches, setLoadingCoaches] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  // เมื่อเปลี่ยนคอร์ส: โหลดรายชื่อโค้ชของคอร์สนั้น และรีเซ็ตโค้ชที่เลือกไว้
  useEffect(() => {
    setCoachId('');
    setCoaches([]);
    if (courseId === '') return;

    let cancelled = false;
    (async () => {
      try {
        setLoadingCoaches(true);
        const list = await reviewAPI.getCourseCoaches(Number(courseId));
        if (!cancelled) setCoaches(list || []);
      } catch (error) {
        console.error('Error loading course coaches:', error);
      } finally {
        if (!cancelled) setLoadingCoaches(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const userId = localStorage.getItem('user_id');
      if (!token || !userId) return;

      const [enrollments, reviews] = await Promise.all([
        fetchCustomerEnrollments(userId, token),
        reviewAPI.getMyReviews(),
      ]);

      setCourses(dedupeCourses(enrollments));
      setMyReviews(reviews || []);
    } catch (error) {
      console.error('Error loading feedback data:', error);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    courseId !== '' &&
    rating >= 1 &&
    comment.trim().length > 0 &&
    (category !== 'coach' || coachId !== '') &&
    !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      setSubmitting(true);
      // แนบ course_id เสมอเป็นบริบท (ใช้ตรวจสิทธิ์ว่าเคยเรียนคอร์สนี้แล้ว)
      // และแนบ coach_id เมื่อเลือกหัวข้อ "โค้ช"
      const payload: CreateReviewReq = {
        category,
        course_id: Number(courseId),
        rating,
        comment: comment.trim(),
      };
      if (category === 'coach' && coachId !== '') {
        payload.coach_id = Number(coachId);
      }

      const created = await reviewAPI.createReview(payload);
      // เพิ่มรีวิวใหม่ไว้บนสุด และล้างฟอร์ม
      setMyReviews((prev) => [created, ...prev]);
      setCourseId('');
      setCategory('course');
      setCoachId('');
      setRating(0);
      setComment('');
    } catch (error: any) {
      alert(`ไม่สามารถส่งรีวิวได้: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <FeedbackSkeleton />;
  }

  // สรุปสถิติรีวิวของฉัน
  const reviewCount = myReviews.length;
  const avgRating =
    reviewCount > 0
      ? myReviews.reduce((s, r) => s + r.rating, 0) / reviewCount
      : 0;
  const featuredCount = myReviews.filter((r) => r.is_featured).length;

  return (
    <div className="mx-auto max-w-7xl space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-[#CC0000]">
          <span className="h-px w-7 bg-[#CC0000]" />
          <span className="text-xs font-black uppercase tracking-[0.25em]">ความคิดเห็นของฉัน</span>
        </div>
        <h1 className="mt-2.5 text-3xl font-black tracking-tight text-gray-900 md:text-4xl">
          รีวิวของฉัน
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          ให้คะแนนและรีวิวคอร์สและโค้ชที่คุณเข้าเรียนไปแล้วอย่างน้อย 1 ครั้ง — รีวิวได้ไม่จำกัดจำนวนครั้ง
        </p>
        <div className="mt-6 h-px bg-gray-200" />
      </div>

      {/* Stat summary */}
      {reviewCount > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* รีวิวทั้งหมด */}
          <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:border-gray-300 hover:shadow-md">
            <span className="absolute inset-y-0 left-0 w-1 bg-[#CC0000]" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#CC0000]" />
                <span className="text-sm font-bold text-gray-600">รีวิวทั้งหมด</span>
              </div>
              <MessageSquareText className="h-5 w-5 text-[#CC0000]" />
            </div>
            <p className="mt-5 text-3xl font-black tabular-nums text-gray-900">{reviewCount}</p>
            <div className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
              รีวิวที่คุณส่งทั้งหมด
            </div>
          </div>

          {/* คะแนนเฉลี่ยที่ให้ */}
          <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:border-gray-300 hover:shadow-md">
            <span className="absolute inset-y-0 left-0 w-1 bg-amber-400" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                <span className="text-sm font-bold text-gray-600">คะแนนเฉลี่ยที่ให้</span>
              </div>
              <Star className="h-5 w-5 text-amber-400" fill="currentColor" />
            </div>
            <div className="mt-5 flex items-center gap-2">
              <p className="text-3xl font-black tabular-nums text-gray-900">{avgRating.toFixed(1)}</p>
              <StarRating value={Math.round(avgRating)} size={16} />
            </div>
            <div className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
              จากทั้งหมด {reviewCount} รีวิว
            </div>
          </div>

          {/* แสดงหน้าแรก */}
          <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:border-gray-300 hover:shadow-md">
            <span className="absolute inset-y-0 left-0 w-1 bg-orange-400" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-orange-400" />
                <span className="text-sm font-bold text-gray-600">แสดงหน้าแรก</span>
              </div>
              <Sparkles className="h-5 w-5 text-orange-500" />
            </div>
            <p className="mt-5 text-3xl font-black tabular-nums text-gray-900">{featuredCount}</p>
            <div className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
              รีวิวที่ถูกเลือกโชว์หน้าแรก
            </div>
          </div>
        </div>
      )}

      {/* Review form */}
      <div>
        <h2 className="mb-4 flex items-center gap-2.5 text-lg font-bold text-gray-900">
          <span className="h-5 w-1 rounded-full bg-[#CC0000]" />
          เขียนรีวิวใหม่
        </h2>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        {courses.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 py-10 text-center text-sm text-gray-400">
            <BookOpen className="h-9 w-9 text-gray-300" />
            <p className="max-w-xs">ยังไม่มีคอร์สที่รีวิวได้ — เริ่มรีวิวได้เมื่อคุณเข้าเรียนไปแล้วอย่างน้อย 1 ครั้ง</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Course select */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เลือกคอร์สที่ต้องการรีวิว</label>
              <select
                required
                value={courseId}
                onChange={(e) => setCourseId(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-all"
              >
                <option value="" disabled>
                  -- เลือกคอร์ส --
                </option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* หัวข้อรีวิว/ข้อเสนอแนะ */}
            {courseId !== '' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">ต้องการรีวิว/เสนอแนะเรื่องอะไร</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const disabled = opt.key === 'coach' && !loadingCoaches && coaches.length === 0;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setCategory(opt.key)}
                        disabled={disabled}
                        className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          category === opt.key
                            ? 'bg-[#FFF0F0] border-[#CC0000] text-[#CC0000]'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Icon size={16} />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {category === 'coach' && !loadingCoaches && coaches.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1.5">คอร์สนี้ยังไม่มีโค้ชที่มีตารางสอน จึงรีวิวโค้ชไม่ได้</p>
                )}
                {(category === 'place' || category === 'service' || category === 'other') && (
                  <p className="text-xs text-gray-400 mt-1.5">
                    ข้อเสนอแนะนี้จะผูกกับคอร์ส &quot;{courses.find((c) => c.id === courseId)?.name}&quot; เป็นบริบท
                  </p>
                )}
              </div>
            )}

            {/* Coach select (เมื่อเลือกหัวข้อโค้ช) */}
            {courseId !== '' && category === 'coach' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เลือกโค้ช</label>
                <select
                  required
                  value={coachId}
                  onChange={(e) => setCoachId(e.target.value === '' ? '' : Number(e.target.value))}
                  disabled={loadingCoaches}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-all disabled:bg-gray-50"
                >
                  <option value="" disabled>
                    {loadingCoaches ? 'กำลังโหลดรายชื่อโค้ช...' : '-- เลือกโค้ช --'}
                  </option>
                  {coaches.map((coach) => (
                    <option key={coach.id} value={coach.id}>
                      {coach.nickname}
                      {coach.specialization ? ` — ${coach.specialization}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Rating */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">ให้คะแนน</label>
              <div className="flex items-center gap-3">
                <StarRating value={rating} size={30} onChange={setRating} />
                <span className="text-sm font-semibold text-gray-500">
                  {rating > 0 ? `${rating}.0` : 'ยังไม่ได้ให้คะแนน'}
                </span>
              </div>
            </div>

            {/* Comment */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ความคิดเห็น</label>
              <textarea
                required
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="บอกเล่าประสบการณ์การเรียนของคุณ..."
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-all resize-none"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!canSubmit}
                className="flex items-center gap-2 rounded-xl bg-[#CC0000] px-6 py-2.5 font-bold text-white shadow-md shadow-[#CC0000]/20 transition-colors hover:bg-[#990000] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                ส่งรีวิว
              </button>
            </div>
          </form>
        )}
        </div>
      </div>

      {/* My reviews */}
      <div>
        <h2 className="mb-4 flex items-center gap-2.5 text-lg font-bold text-gray-900">
          <span className="h-5 w-1 rounded-full bg-[#CC0000]" />
          รีวิวที่เคยส่ง
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-sm font-bold tabular-nums text-gray-500">
            {myReviews.length}
          </span>
        </h2>

        {myReviews.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white py-12 text-center text-gray-400">
            <MessageSquareText className="h-10 w-10 text-gray-300" />
            <p className="text-sm">คุณยังไม่เคยส่งรีวิว — เริ่มรีวิวคอร์สแรกของคุณได้เลย</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {myReviews.map((review) => (
              <div
                key={review.id}
                className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 pl-6 shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
              >
                <span className={`absolute inset-y-0 left-0 w-1 ${review.is_featured ? "bg-orange-400" : "bg-gray-200"}`} />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {(review.category === 'place' || review.category === 'service' || review.category === 'other') && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-700">
                        {categoryLabel(review.category)}
                      </span>
                    )}
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
                  {review.is_featured && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-600 flex-shrink-0">
                      <Sparkles size={12} />
                      แสดงหน้าแรก
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <StarRating value={review.rating} size={16} />
                  <span className="text-xs text-gray-400">{formatDate(review.created_at)}</span>
                </div>

                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{review.comment}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// โครงหน้าตอนโหลด — ล้อ layout จริง (header + การ์ดสถิติ + ฟอร์ม + รายการ)
function FeedbackSkeleton() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-8">
      {/* Header */}
      <div>
        <div className="h-3 w-32 rounded bg-gray-200" />
        <div className="mt-3 h-9 w-56 rounded-lg bg-gray-200" />
        <div className="mt-3 h-3 w-80 max-w-full rounded bg-gray-100" />
        <div className="mt-6 h-px bg-gray-200" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5">
            <span className="absolute inset-y-0 left-0 w-1 bg-gray-200" />
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-24 rounded bg-gray-200" />
              <div className="h-5 w-5 rounded bg-gray-200" />
            </div>
            <div className="mt-5 h-8 w-20 rounded-lg bg-gray-200" />
            <div className="mt-4 border-t border-gray-100 pt-3">
              <div className="h-3 w-28 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>

      {/* Form card */}
      <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
        <div className="h-5 w-40 rounded bg-gray-200" />
        <div className="h-11 w-full rounded-xl bg-gray-100" />
        <div className="h-24 w-full rounded-xl bg-gray-100" />
        <div className="flex justify-end">
          <div className="h-11 w-32 rounded-xl bg-gray-200" />
        </div>
      </div>

      {/* Reviews */}
      <div className="space-y-4">
        <div className="h-5 w-44 rounded bg-gray-200" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5">
            <span className="absolute inset-y-0 left-0 w-1 bg-gray-200" />
            <div className="h-5 w-40 rounded-full bg-gray-100" />
            <div className="mt-3 h-4 w-28 rounded bg-gray-200" />
            <div className="mt-3 h-3 w-full rounded bg-gray-100" />
            <div className="mt-2 h-3 w-2/3 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Helpers ----------
function dedupeCourses(enrollments: Enrollment[]): CourseOption[] {
  const map = new Map<number, string>();
  for (const e of enrollments) {
    // อนุญาตให้รีวิวได้เฉพาะคอร์สที่เข้าเรียนไปแล้วอย่างน้อย 1 ครั้ง
    if ((e.attended_sessions || 0) < 1) continue;
    const course = e.package?.course;
    if (course && !map.has(course.id)) {
      map.set(course.id, course.course_name);
    }
  }
  return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function categoryLabel(category: ReviewCategory): string {
  switch (category) {
    case 'place':
      return 'สถานที่';
    case 'service':
      return 'บริการ';
    case 'other':
      return 'อื่นๆ';
    default:
      return category;
  }
}
