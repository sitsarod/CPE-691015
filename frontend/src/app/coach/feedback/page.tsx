'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { reviewAPI } from '@/services/reviewAPI';
import { Review } from '@/types/review';
import Toast from '@/components/Toast';
import { Star, Search, MessageSquareMore, BookOpen, Loader2 } from 'lucide-react';

// ==================== Star Rating (read-only) ====================
function StarRating({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= value;
        return (
          <Star
            key={star}
            size={size}
            className={filled ? 'text-amber-400' : 'text-gray-300'}
            fill={filled ? 'currentColor' : 'none'}
          />
        );
      })}
    </div>
  );
}

// ==================== Page ====================
export default function CoachFeedbackPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [starFilter, setStarFilter] = useState<number>(0); // 0 = ทั้งหมด
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const triggerToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const data = await reviewAPI.getCoachReviews();
      setReviews(data || []);
    } catch (error) {
      console.error('Error fetching coach reviews:', error);
      triggerToast('ไม่สามารถโหลดข้อมูลรีวิวได้ โปรดตรวจสอบการเชื่อมต่อของคุณ', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ---------- Stats ----------
  const stats = useMemo(() => {
    const total = reviews.length;
    const avg = total > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / total : 0;
    const fiveStar = reviews.filter((r) => r.rating === 5).length;
    return { total, avg, fiveStar };
  }, [reviews]);

  // ---------- Rating filter counts ----------
  const counts = useMemo(() => {
    const byStar: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach((r) => {
      byStar[r.rating] = (byStar[r.rating] || 0) + 1;
    });
    return byStar;
  }, [reviews]);

  // ---------- Filtering ----------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reviews.filter((r) => {
      if (starFilter !== 0 && r.rating !== starFilter) return false;
      if (!q) return true;
      const name = customerName(r).toLowerCase();
      return (
        name.includes(q) ||
        r.comment.toLowerCase().includes(q) ||
        (r.course?.course_name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [reviews, starFilter, search]);

  const filterTabs: { key: number; label: string }[] = [
    { key: 0, label: 'ทั้งหมด' },
    { key: 5, label: '5 ดาว' },
    { key: 4, label: '4 ดาว' },
    { key: 3, label: '3 ดาว' },
    { key: 2, label: '2 ดาว' },
    { key: 1, label: '1 ดาว' },
  ];

  return (
    <div className="w-full">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">รีวิวของฉัน (Reviews)</h1>
        <p className="text-sm text-slate-500 mt-1">
          ความคิดเห็นและคะแนนจากลูกค้าที่รีวิวถึงคุณ — ใช้เป็นแนวทางในการพัฒนาการสอน
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="รีวิวทั้งหมด"
          value={stats.total.toString()}
          icon={<MessageSquareMore size={22} />}
          tone="gray"
        />
        <StatCard
          label="คะแนนเฉลี่ย"
          value={stats.total > 0 ? stats.avg.toFixed(1) : '-'}
          icon={<Star size={22} fill="currentColor" />}
          tone="amber"
        />
        <StatCard
          label="รีวิว 5 ดาว"
          value={stats.fiveStar.toString()}
          icon={<Star size={22} fill="currentColor" />}
          tone="red"
        />
      </div>

      {/* Filter tabs + search */}
      <div className="bg-white border-b border-slate-200 rounded-xl mb-6 shadow-sm overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
          <div className="flex overflow-x-auto">
            {filterTabs.map((t) => {
              const isActive = starFilter === t.key;
              const count = t.key === 0 ? reviews.length : counts[t.key] || 0;
              return (
                <button
                  key={t.key}
                  onClick={() => setStarFilter(t.key)}
                  className={`flex items-center gap-2 px-6 py-4 border-b-2 font-medium text-sm transition-all whitespace-nowrap ${
                    isActive
                      ? 'border-[#CC0000] text-[#CC0000] bg-rose-50/50 font-bold'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {t.key !== 0 && (
                    <Star
                      size={14}
                      className={isActive ? 'text-amber-400' : 'text-slate-400'}
                      fill="currentColor"
                    />
                  )}
                  <span>{t.label}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-[#CC0000] text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative px-4 pb-3 md:pb-0 md:pr-4">
            <Search size={18} className="absolute left-7 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อลูกค้า, คอร์ส, ข้อความ..."
              className="w-full md:w-72 pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* Loading / Review grid */}
      {loading ? (
        <div className="bg-white/50 backdrop-blur-xs flex items-center justify-center p-12 rounded-2xl border border-slate-200">
          <div className="text-slate-500 font-bold text-xs animate-pulse flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            กำลังโหลดข้อมูลรีวิว...
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 py-16 text-center text-gray-400">
          <MessageSquareMore size={40} className="mx-auto mb-3 opacity-40" />
          {reviews.length === 0 ? 'ยังไม่มีลูกค้ารีวิวถึงคุณ' : 'ไม่พบรีวิวที่ตรงกับเงื่อนไข'}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== Sub-components ====================
function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: 'gray' | 'amber' | 'red';
}) {
  const tones = {
    gray: 'bg-gray-100 text-gray-600',
    amber: 'bg-amber-50 text-amber-500',
    red: 'bg-rose-50 text-[#CC0000]',
  };
  return (
    <div className="flex items-center gap-4 p-5 rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className={`p-3 rounded-lg ${tones[tone]}`}>{icon}</div>
      <div>
        <p className="text-2xl font-black text-gray-900 leading-tight">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4 transition-shadow hover:shadow-md">
      {/* Top row: reviewer */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-rose-50 text-[#CC0000] flex items-center justify-center font-bold flex-shrink-0">
            {initial(review)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{customerName(review)}</p>
            <p className="text-xs text-gray-400">{formatDate(review.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StarRating value={review.rating} size={16} />
          <span className="text-sm font-semibold text-gray-500">{review.rating}.0</span>
        </div>
      </div>

      {/* Course badge (ถ้ารีวิวผูกกับคอร์สด้วย) */}
      {review.course && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700">
            <BookOpen size={13} />
            {review.course.course_name}
          </span>
        </div>
      )}

      {/* Comment */}
      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{review.comment}</p>
    </div>
  );
}

// ==================== Helpers ====================
function customerName(r: Review): string {
  if (!r.customer) return 'ผู้ใช้ที่ถูกลบ';
  const full = [r.customer.firstName, r.customer.lastName].filter(Boolean).join(' ');
  if (r.customer.nickname) {
    return full ? `${r.customer.nickname} (${full})` : r.customer.nickname;
  }
  return full || 'ไม่ระบุชื่อ';
}

function initial(r: Review): string {
  const name = r.customer?.nickname || r.customer?.firstName || '?';
  return name.charAt(0).toUpperCase();
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
