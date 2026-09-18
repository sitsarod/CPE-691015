'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { announcementAPI } from '@/services/announcementAPI';
import { Announcement } from '@/types/announcement';
import { Poster } from '@/components/AnnouncementDetailModal';
import { ArrowLeft, Bookmark, BookmarkX, Calendar, Eye, Inbox } from 'lucide-react';

export default function SavedAnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await announcementAPI.getMyBookmarks();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load saved announcements', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRemove = async (id: number) => {
    setRemoving(id);
    try {
      await announcementAPI.removeBookmark(id);
      setItems((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error('Failed to remove bookmark', err);
    } finally {
      setRemoving(null);
    }
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

  return (
    <div className="mx-auto max-w-7xl pb-20">
      <Link
        href="/customer/dashboard"
        className="mb-6 inline-flex items-center gap-2 font-medium text-gray-600 transition-colors hover:text-[#CC0000]"
      >
        <ArrowLeft size={20} /> กลับหน้าประกาศ
      </Link>

      <div className="mb-6 flex items-center gap-2">
        <Bookmark className="fill-[#CC0000] text-[#CC0000]" size={24} />
        <h1 className="text-2xl font-bold text-gray-900">ประกาศที่บันทึกไว้</h1>
      </div>

      {loading ? (
        <div className="grid animate-pulse grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="h-40 w-full bg-gray-200/70" />
              <div className="space-y-3 p-4">
                <div className="h-5 w-3/4 rounded bg-gray-200/70" />
                <div className="h-4 w-1/2 rounded bg-gray-200/70" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-gray-100 text-gray-400">
            <Inbox size={28} />
          </div>
          <p className="text-gray-500">ยังไม่มีประกาศที่บันทึกไว้</p>
          <p className="text-sm text-gray-400">กดปุ่ม &quot;บันทึกไว้อ่านทีหลัง&quot; ในหน้ารายละเอียดประกาศเพื่อเก็บไว้ที่นี่</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((ann) => {
            const isExpired = new Date(ann.end_date) < new Date();
            return (
              <div key={ann.id} className="group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md">
                <Link href={`/customer/announcements/${ann.id}`} className="block">
                  <Poster src={ann.image_url} alt={ann.title} className="aspect-[16/9] w-full" />
                </Link>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {ann.category?.name && (
                      <span className="rounded-full bg-[#FFF0F0] px-2.5 py-0.5 text-xs font-medium text-[#CC0000]">
                        {ann.category.name}
                      </span>
                    )}
                    {isExpired && (
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                        หมดอายุแล้ว
                      </span>
                    )}
                  </div>
                  <Link href={`/customer/announcements/${ann.id}`}>
                    <h3 className="line-clamp-2 font-bold leading-snug text-gray-900 transition-colors group-hover:text-[#CC0000]">
                      {ann.title}
                    </h3>
                  </Link>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><Calendar size={12} /> {fmtDate(ann.start_date)}</span>
                    {ann.visibility !== 'guest' && (
                      <span className="flex items-center gap-1"><Eye size={12} /> {ann.view_count}</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemove(ann.id)}
                    disabled={removing === ann.id}
                    className="mt-auto flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-[#CC0000] hover:bg-[#FFF0F0] hover:text-[#CC0000] disabled:opacity-60"
                  >
                    <BookmarkX size={16} /> เอาออกจากที่บันทึก
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
