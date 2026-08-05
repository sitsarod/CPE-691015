'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { reviewAPI } from '@/services/reviewAPI';
import { Review, UpdateReviewReq } from '@/types/review';
import Toast from '@/components/Toast';
import {
  Star,
  Search,
  Trash2,
  Pencil,
  X,
  BookOpen,
  UserRound,
  MessageSquareMore,
  Sparkles,
  Loader2,
  List,
} from 'lucide-react';

type FilterTab = 'all' | 'featured' | 'course' | 'coach';

// ==================== Star Rating ====================
function StarRating({
  value,
  size = 16,
  onChange,
}: {
  value: number;
  size?: number;
  onChange?: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const interactive = typeof onChange === 'function';

  return (
    <div className="flex items-center gap-0.5">
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

// ==================== Page ====================
export default function AdminFeedbackPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // แก้ไขรีวิว
  const [editing, setEditing] = useState<Review | null>(null);
  const [editRating, setEditRating] = useState(0);
  const [editComment, setEditComment] = useState('');
  const [saving, setSaving] = useState(false);

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
      const data = await reviewAPI.getAllReviews();
      setReviews(data || []);
    } catch (error) {
      console.error('Error fetching reviews:', error);
      triggerToast('ไม่สามารถโหลดข้อมูลรีวิวได้ โปรดตรวจสอบการเชื่อมต่อของคุณ', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ---------- Stats ----------
  const stats = useMemo(() => {
    const total = reviews.length;
    const featured = reviews.filter((r) => r.is_featured).length;
    const avg = total > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / total : 0;
    return { total, featured, avg };
  }, [reviews]);

  // ---------- Filtering ----------
  const counts = useMemo(
    () => ({
      all: reviews.length,
      featured: reviews.filter((r) => r.is_featured).length,
      course: reviews.filter((r) => r.course_id).length,
      coach: reviews.filter((r) => r.coach_id).length,
    }),
    [reviews]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reviews.filter((r) => {
      if (tab === 'featured' && !r.is_featured) return false;
      if (tab === 'course' && !r.course_id) return false;
      if (tab === 'coach' && !r.coach_id) return false;

      if (!q) return true;
      const name = customerName(r).toLowerCase();
      return (
        name.includes(q) ||
        r.comment.toLowerCase().includes(q) ||
        (r.course?.course_name.toLowerCase().includes(q) ?? false) ||
        (r.coach?.nickname.toLowerCase().includes(q) ?? false)
      );
    });
  }, [reviews, tab, search]);

  // ---------- Actions ----------
  const handleToggleFeatured = async (review: Review) => {
    // อัปเดตแบบ optimistic เพื่อให้ปุ่มตอบสนองทันที
    const next = !review.is_featured;
    setReviews((prev) => prev.map((r) => (r.id === review.id ? { ...r, is_featured: next } : r)));
    try {
      await reviewAPI.setFeatured(review.id, next);
      triggerToast(next ? 'เพิ่มรีวิวไปแสดงหน้าแรกแล้ว' : 'นำรีวิวออกจากหน้าแรกแล้ว');
    } catch (error: any) {
      // ย้อนกลับถ้าล้มเหลว
      setReviews((prev) => prev.map((r) => (r.id === review.id ? { ...r, is_featured: !next } : r)));
      triggerToast(`ไม่สามารถอัปเดตสถานะการแสดงผลได้: ${error.message}`, 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบรีวิวนี้? การกระทำนี้ไม่สามารถยกเลิกได้')) return;
    try {
      await reviewAPI.deleteReview(id);
      setReviews((prev) => prev.filter((r) => r.id !== id));
      triggerToast('ลบรีวิวเรียบร้อยแล้ว');
    } catch (error: any) {
      triggerToast(`เกิดข้อผิดพลาดในการลบรีวิว: ${error.message}`, 'error');
    }
  };

  const openEdit = (review: Review) => {
    setEditing(review);
    setEditRating(review.rating);
    setEditComment(review.comment);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      setSaving(true);
      const payload: UpdateReviewReq = { rating: editRating, comment: editComment };
      const updated = await reviewAPI.updateReview(editing.id, payload);
      setReviews((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setEditing(null);
      triggerToast('บันทึกรีวิวเรียบร้อยแล้ว');
    } catch (error: any) {
      triggerToast(`เกิดข้อผิดพลาดในการบันทึกรีวิว: ${error.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const tabs: { key: FilterTab; label: string; icon: React.ElementType }[] = [
    { key: 'all', label: 'ทั้งหมด', icon: List },
    { key: 'featured', label: 'แสดงหน้าแรก', icon: Sparkles },
    { key: 'course', label: 'รีวิวคอร์ส', icon: BookOpen },
    { key: 'coach', label: 'รีวิวโค้ช', icon: UserRound },
  ];

  return (
    <div className="w-full">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">รีวิวและคะแนน (Reviews)</h1>
        <p className="text-sm text-slate-500 mt-1">
          รีวิวคอร์สและโค้ชจากลูกค้าที่ลงทะเบียนเรียน — เลือกรีวิวเพื่อแสดงในหน้าแรกของระบบ
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
          label="แสดงหน้าแรก"
          value={stats.featured.toString()}
          icon={<Sparkles size={22} />}
          tone="red"
        />
      </div>

      {/* Filter tabs + search */}
      <div className="bg-white border-b border-slate-200 rounded-xl mb-6 shadow-sm overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
          <div className="flex overflow-x-auto">
            {tabs.map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 px-6 py-4 border-b-2 font-medium text-sm transition-all whitespace-nowrap ${
                    isActive
                      ? 'border-[#CC0000] text-[#CC0000] bg-rose-50/50 font-bold'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#CC0000]' : 'text-slate-400'}`} />
                  <span>{t.label}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-[#CC0000] text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {counts[t.key]}
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
              placeholder="ค้นหาชื่อลูกค้า, คอร์ส, โค้ช..."
              className="w-full md:w-72 pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* Loading / Review grid */}
      {loading ? (
        <div className="bg-white/50 backdrop-blur-xs flex items-center justify-center p-12 rounded-2xl border border-slate-200">
          <div className="text-slate-500 font-bold text-xs animate-pulse">กำลังโหลดข้อมูลรีวิว...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 py-16 text-center text-gray-400">
          <MessageSquareMore size={40} className="mx-auto mb-3 opacity-40" />
          ไม่พบรีวิวที่ตรงกับเงื่อนไข
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              onToggleFeatured={() => handleToggleFeatured(review)}
              onEdit={() => openEdit(review)}
              onDelete={() => handleDelete(review.id)}
            />
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-800">แก้ไขรีวิว</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 flex flex-col gap-5">
              <div>
                <p className="text-sm text-gray-500 mb-1">โดย</p>
                <p className="font-medium text-gray-800">{customerName(editing)}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">คะแนน</label>
                <div className="flex items-center gap-3">
                  <StarRating value={editRating} size={28} onChange={setEditRating} />
                  <span className="text-sm font-semibold text-gray-600">{editRating}.0</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ข้อความรีวิว</label>
                <textarea
                  required
                  rows={5}
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-all resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving || editRating < 1}
                  className="flex items-center gap-2 px-5 py-2 bg-[#CC0000] hover:bg-[#990000] disabled:opacity-50 text-white rounded-lg font-medium shadow-md shadow-[#CC0000]/20 transition-colors"
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  บันทึก
                </button>
              </div>
            </form>
          </div>
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

function ReviewCard({
  review,
  onToggleFeatured,
  onEdit,
  onDelete,
}: {
  review: Review;
  onToggleFeatured: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`bg-white rounded-2xl border p-5 flex flex-col gap-4 transition-shadow hover:shadow-md ${
        review.is_featured ? 'border-[#CC0000]/30 ring-1 ring-[#CC0000]/10' : 'border-gray-200 shadow-sm'
      }`}
    >
      {/* Top row: reviewer + featured badge */}
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
        {review.is_featured && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-[#CC0000] flex-shrink-0">
            <Sparkles size={12} />
            หน้าแรก
          </span>
        )}
      </div>

      {/* Target badges */}
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

      {/* Rating */}
      <div className="flex items-center gap-2">
        <StarRating value={review.rating} size={18} />
        <span className="text-sm font-semibold text-gray-500">{review.rating}.0</span>
      </div>

      {/* Comment */}
      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{review.comment}</p>

      {/* Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <button
          onClick={onToggleFeatured}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            review.is_featured
              ? 'bg-[#CC0000] text-white hover:bg-[#990000]'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Sparkles size={15} />
          {review.is_featured ? 'ยกเลิกหน้าแรก' : 'แสดงหน้าแรก'}
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="แก้ไข"
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="ลบ"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
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
