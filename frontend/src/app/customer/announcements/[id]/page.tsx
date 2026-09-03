'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { announcementAPI } from '@/services/announcementAPI';
import { Announcement } from '@/types/announcement';
import { ArrowLeft, Calendar, Eye, ExternalLink, User } from 'lucide-react';

export default function AnnouncementDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params?.id);

  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // ลิงก์ปลอดภัยเฉพาะ http/https — กัน scheme อันตราย (javascript:, data: ฯลฯ) ที่อาจหลุดผ่านมา
  // แม้แบ็กเอนด์จะ validate ไว้แล้ว (defense in depth ฝั่ง client)
  const isSafeLink = (link?: string) => !!link && (link.startsWith('http://') || link.startsWith('https://'));

  useEffect(() => {
    if (!id || Number.isNaN(id)) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    let active = true;
    (async () => {
      try {
        setLoading(true);
        const data = await announcementAPI.getAnnouncementById(id);
        if (active) setAnnouncement(data);

        // นับยอดเข้าชมแค่ครั้งแรกต่อเบราว์เซอร์ต่อประกาศ กัน endpoint (ไม่ต้องล็อกอิน) โดนยิงซ้ำ
        // เพื่อปั่นยอดวิว — เก็บรายการ id ที่นับไปแล้วไว้ใน localStorage
        try {
          const KEY = 'viewed_announcements';
          const raw = localStorage.getItem(KEY);
          const viewed: number[] = raw ? JSON.parse(raw) : [];
          if (!viewed.includes(id)) {
            announcementAPI.incrementViewCount(id).catch(() => {});
            localStorage.setItem(KEY, JSON.stringify([...viewed, id]));
          }
        } catch {
          // ถ้า localStorage ใช้งานไม่ได้ (private mode ฯลฯ) ก็ยังนับยอดวิวไปตามปกติ ไม่ block การแสดงผล
          announcementAPI.incrementViewCount(id).catch(() => {});
        }
      } catch (err) {
        console.error('Failed to load announcement:', err);
        if (active) setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#CC0000]"></div>
      </div>
    );
  }

  if (notFound || !announcement) {
    return (
      <div className="mx-auto max-w-4xl min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center">
        <p className="text-gray-500">ไม่พบประกาศที่คุณต้องการ หรือประกาศนี้อาจถูกลบไปแล้ว</p>
        <button
          onClick={() => router.push('/customer/dashboard')}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#CC0000] hover:bg-[#990000] text-white rounded-full font-medium transition-colors"
        >
          <ArrowLeft size={18} /> กลับหน้าประกาศ
        </button>
      </div>
    );
  }

  const startText = new Date(announcement.start_date).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const endText = new Date(announcement.end_date).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="mx-auto max-w-4xl pb-20">
      {/* ปุ่มย้อนกลับ */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-gray-600 hover:text-[#CC0000] font-medium mb-6 transition-colors"
      >
        <ArrowLeft size={20} /> ย้อนกลับ
      </button>

      <article className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* รูปเต็ม เห็นทั้งภาพชัด ๆ ไม่ครอป */}
        {announcement.image_url && (
          <div className="w-full bg-gray-100 flex items-center justify-center">
            <img
              src={announcement.image_url}
              alt={announcement.title}
              className="w-full max-h-[70vh] object-contain"
            />
          </div>
        )}

        <div className="p-6 md:p-10">
          {/* ป้ายหมวดหมู่ + ข้อมูลสรุป */}
          <div className="flex flex-wrap items-center gap-4 mb-6">
            {announcement.category?.name && (
              <span className="px-3 py-1 bg-[#FFF0F0] text-[#CC0000] text-xs font-bold uppercase tracking-wider rounded-md">
                {announcement.category.name}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-sm text-gray-500">
              <Calendar size={16} /> {startText}
            </span>
            <span className="flex items-center gap-1.5 text-sm text-gray-500 md:ml-auto">
              <Eye size={16} /> {announcement.view_count} ครั้ง
            </span>
          </div>

          <h1 className="text-3xl md:text-4xl font-extrabold mb-6 text-gray-900 leading-tight">
            {announcement.title}
          </h1>

          {/* เนื้อหาแบบเต็ม */}
          <div className="text-gray-700 leading-relaxed whitespace-pre-wrap text-[15px] md:text-base">
            {announcement.content}
          </div>

          {/* ปุ่มลิงก์ที่แนบมา (ถ้ามี) — กดแล้วไปที่ลิงก์นั้นเลย
              แสดงเฉพาะลิงก์ http/https เท่านั้น กัน scheme อันตราย (javascript:, data: ฯลฯ) */}
          {isSafeLink(announcement.link) && (
            <div className="mt-8">
              <a
                href={announcement.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#CC0000] hover:bg-[#990000] text-white font-semibold rounded-full shadow-md shadow-[#CC0000]/30 transition-all hover:scale-105"
              >
                <ExternalLink size={18} /> ไปยังลิงก์ที่เกี่ยวข้อง
              </a>
            </div>
          )}

          {/* ผู้ประกาศ + ช่วงเวลาที่แสดง */}
          <div className="mt-10 pt-6 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-gray-500">
            <p className="flex items-center gap-1.5">
              <User size={15} /> ประกาศโดย: {announcement.user?.firstName} {announcement.user?.lastName}
            </p>
            <p>แสดงถึง: {endText}</p>
          </div>
        </div>
      </article>
    </div>
  );
}
