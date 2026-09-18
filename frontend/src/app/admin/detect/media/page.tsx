'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, ImageIcon, ImageOff, Loader2, Search, UserRound, Video } from 'lucide-react';
import { fetchStudentsMediaSummary } from '@/services/evaluationAPI';
import { fetchStudentPosts } from '@/services/postAPI';
import type { StudentMediaSummary } from '@/types/evaluation';
import type { PostItem } from '@/types/post';
import AdminPostMediaThumb from '@/components/AdminPostMediaThumb';
import PostViewerModal from '@/components/PostViewerModal';

// หน้าดูรูป/วิดีโอที่นักเรียนถูกแท็กไว้ "แยกเป็นรายคน" (โฟลเดอร์เสมือน) — ไม่ได้แยกไฟล์จริงบน
// storage เลย (ยังกองอยู่ที่เดิมเหมือนเดิม รูปเดียวแท็กได้หลายคนพร้อมกัน แยกไฟล์จริงจะต้อง copy
// ซ้ำ) แค่จัดกลุ่ม "มุมมอง" ตามนักเรียนจากฐานข้อมูลแทน ให้แอดมินดูง่ายขึ้นโดยไม่เปลี่ยน storage
export default function AdminDetectMediaPage() {
  const [students, setStudents] = useState<StudentMediaSummary[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [selected, setSelected] = useState<StudentMediaSummary | null>(null);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStudentsMediaSummary()
      .then((list) => {
        if (!cancelled) setStudents(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setStudentsError(err instanceof Error ? err.message : 'ไม่สามารถดึงรายชื่อนักเรียนได้');
      })
      .finally(() => {
        if (!cancelled) setStudentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setPostsLoading(true);
    setPostsError(null);
    fetchStudentPosts(selected.customer_id)
      .then((list) => {
        if (!cancelled) setPosts(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setPostsError(err instanceof Error ? err.message : 'ไม่สามารถดึงข้อมูลโพสต์ได้');
      })
      .finally(() => {
        if (!cancelled) setPostsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.nickname.toLowerCase().includes(q));
  }, [students, search]);

  // ยังไม่ได้เลือกใคร — โชว์ลิสต์ "โฟลเดอร์" นักเรียนทั้งหมด
  if (!selected) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 animate-in fade-in duration-500">
        <div>
          <div className="flex items-center gap-2 text-[#CC0000]">
            <span className="h-px w-7 bg-[#CC0000]" />
            <span className="text-xs font-black uppercase tracking-[0.25em]">AI Classification</span>
          </div>
          <h1 className="mt-2.5 text-3xl font-black tracking-tight text-gray-900">ดูรูป/วิดีโอแยกรายคน</h1>
          <p className="mt-2 text-sm text-gray-500">เลือกนักเรียนเพื่อดูรูปและวิดีโอทั้งหมดที่เขาถูกแท็กไว้</p>
          <div className="mt-6 h-px bg-gray-200" />
        </div>

        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อนักเรียน..."
            className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20"
          />
        </div>

        {studentsLoading ? (
          <p className="py-10 text-center text-sm text-gray-400">กำลังโหลดรายชื่อนักเรียน...</p>
        ) : studentsError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{studentsError}</div>
        ) : filteredStudents.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">
            {students.length === 0 ? 'ยังไม่มีนักเรียนที่ลงทะเบียนเรียนอยู่' : 'ไม่พบนักเรียนที่ค้นหา'}
          </p>
        ) : (
          <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200">
            {filteredStudents.map((s) => (
              <button
                key={s.customer_id}
                type="button"
                onClick={() => setSelected(s)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#FFF0F0]"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                  <UserRound size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-800">{s.nickname}</p>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <ImageIcon size={12} />
                      {s.photo_count}
                    </span>
                    <span className="flex items-center gap-1">
                      <Video size={12} />
                      {s.video_count}
                    </span>
                  </div>
                </div>
                <ChevronRight size={18} className="flex-shrink-0 text-gray-300" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // เลือกนักเรียนแล้ว — โชว์รูป/วิดีโอของคนนั้นเป็นกริด (เหมือนแท็บ Posts ในโปรไฟล์ แต่ดูของคนอื่นได้)
  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:border-[#CC0000] hover:text-[#CC0000]"
          title="กลับไปรายชื่อนักเรียน"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-black text-gray-900">{selected.nickname}</h1>
      </div>

      {postsLoading ? (
        <p className="py-14 text-center text-sm text-gray-400">
          <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
          กำลังโหลดโพสต์...
        </p>
      ) : postsError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{postsError}</div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center text-gray-400">
          <ImageOff className="h-9 w-9 text-gray-300" />
          <p className="text-sm">ยังไม่มีรูปหรือวิดีโอที่นักเรียนคนนี้ถูกแท็กไว้</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 sm:gap-2">
          {posts.map((post, i) => (
            <div key={`${post.type}-${post.id}`} className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
              <AdminPostMediaThumb post={post} onOpen={() => setViewingIndex(i)} />
              {post.type === 'video' && (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  วิดีโอ
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {viewingIndex !== null && (
        <PostViewerModal
          posts={posts}
          index={viewingIndex}
          onClose={() => setViewingIndex(null)}
          onNavigate={setViewingIndex}
        />
      )}

      <Link href="/admin/detect" className="inline-block text-xs font-semibold text-gray-400 hover:text-[#CC0000]">
        ← กลับไปหน้าอัปโหลด/จำแนกผู้เรียน
      </Link>
    </div>
  );
}
