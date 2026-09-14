'use client';

import React from 'react';
// ใช้ component ชุดเดียวกับหน้า coach/detect ทุกอย่าง (useDetect/DetectDesktop/DetectMobile ไม่ได้
// อ้างอิง role เลย เรียก API ที่รองรับทั้งโค้ชและแอดมินอยู่แล้ว) ไม่ต้อง copy โค้ดมาซ้ำอีกชุด
import { useDetect, DetectDesktop, DetectMobile } from '@/app/coach/detect/components';
import { useIsMobile } from '@/hooks/useIsMobile';

export default function AdminDetectPage() {
  const manager = useDetect();
  const isMobile = useIsMobile();

  return isMobile ? <DetectMobile manager={manager} /> : <DetectDesktop manager={manager} />;
}
