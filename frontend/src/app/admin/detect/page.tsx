'use client';

import React from 'react';
import Link from 'next/link';
import { FolderOpen } from 'lucide-react';
// ใช้ component ชุดเดียวกับหน้า coach/detect ทุกอย่าง (useDetect/DetectDesktop/DetectMobile ไม่ได้
// อ้างอิง role เลย เรียก API ที่รองรับทั้งโค้ชและแอดมินอยู่แล้ว) ไม่ต้อง copy โค้ดมาซ้ำอีกชุด
import { useDetect, DetectDesktop, DetectMobile } from '@/app/coach/detect/components';
import { useIsMobile } from '@/hooks/useIsMobile';

export default function AdminDetectPage() {
  const manager = useDetect();
  const isMobile = useIsMobile();

  return (
    <div>
      <div className="mx-auto mb-4 flex max-w-7xl justify-end">
        <Link
          href="/admin/detect/media"
          className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:border-[#CC0000]/40 hover:text-[#CC0000]"
        >
          <FolderOpen size={16} />
          ดูรูป/วิดีโอแยกรายคน
        </Link>
      </div>
      {isMobile ? <DetectMobile manager={manager} /> : <DetectDesktop manager={manager} />}
    </div>
  );
}
