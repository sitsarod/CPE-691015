'use client';

import React, { useEffect, useState } from 'react';
import { reviewAPI } from '@/services/reviewAPI';
import { fetchCustomerEnrollments } from '@/services/enrollmentAPI';
import { Review, CourseCoach, CreateReviewReq } from '@/types/review';
import { Enrollment } from '@/types/enrollment';
import { Star, Send, Loader2, BookOpen, UserRound, Sparkles } from 'lucide-react';

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
  const [target, setTarget] = useState<'course' | 'coach'>('course');
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
    (target === 'course' || coachId !== '') &&
    !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      setSubmitting(true);
      // แนบ course_id เสมอเป็นบริบท และแนบ coach_id เมื่อเลือกรีวิวโค้ช
      const payload: CreateReviewReq = {
        course_id: Number(courseId),
        rating,
        comment: comment.trim(),
      };
      if (target === 'coach' && coachId !== '') {
        payload.coach_id = Number(coachId);
      }

      const created = await reviewAPI.createReview(payload);
      // เพิ่มรีวิวใหม่ไว้บนสุด และล้างฟอร์ม
      setMyReviews((prev) => [created, ...prev]);
      setCourseId('');
      setTarget('course');
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
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#CC0000]"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">รีวิวของฉัน</h1>
        <p className="text-gray-500 text-sm mt-1">
          ให้คะแนนและรีวิวคอร์สและโค้ชที่คุณลงทะเบียนเรียน — รีวิวได้ไม่จำกัดจำนวนครั้ง
        </p>
      </div>

      {/* Review form */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-5">เขียนรีวิวใหม่</h2>

        {courses.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            คุณยังไม่มีคอร์สที่ลงทะเบียนเรียน จึงยังเขียนรีวิวไม่ได้
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
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-all"
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

            {/* Review target: course or coach */}
            {courseId !== '' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">ต้องการรีวิวอะไร</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTarget('course')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                      target === 'course'
                        ? 'bg-[#FFF0F0] border-[#CC0000] text-[#CC0000]'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <BookOpen size={16} />
                    รีวิวคอร์ส
                  </button>
                  <button
                    type="button"
                    onClick={() => setTarget('coach')}
                    disabled={!loadingCoaches && coaches.length === 0}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      target === 'coach'
                        ? 'bg-[#FFF0F0] border-[#CC0000] text-[#CC0000]'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <UserRound size={16} />
                    รีวิวโค้ช
                  </button>
                </div>
                {!loadingCoaches && coaches.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1.5">คอร์สนี้ยังไม่มีโค้ชที่มีตารางสอน จึงรีวิวได้เฉพาะคอร์ส</p>
                )}
              </div>
            )}

            {/* Coach select (เมื่อเลือกรีวิวโค้ช) */}
            {courseId !== '' && target === 'coach' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เลือกโค้ช</label>
                <select
                  required
                  value={coachId}
                  onChange={(e) => setCoachId(e.target.value === '' ? '' : Number(e.target.value))}
                  disabled={loadingCoaches}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-all disabled:bg-gray-50"
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
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-all resize-none"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!canSubmit}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#CC0000] hover:bg-[#990000] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium shadow-md shadow-[#CC0000]/20 transition-colors"
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                ส่งรีวิว
              </button>
            </div>
          </form>
        )}
      </div>

      {/* My reviews */}
      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-4">รีวิวที่เคยส่ง ({myReviews.length})</h2>

        {myReviews.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 py-12 text-center text-gray-400">
            คุณยังไม่เคยส่งรีวิว
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {myReviews.map((review) => (
              <div
                key={review.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
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

// ---------- Helpers ----------
function dedupeCourses(enrollments: Enrollment[]): CourseOption[] {
  const map = new Map<number, string>();
  for (const e of enrollments) {
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
