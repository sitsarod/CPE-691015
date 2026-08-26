'use client';

import React from 'react';
import { useDetect, DetectDesktop, DetectMobile } from './components';
import { useIsMobile } from '@/hooks/useIsMobile';

export default function CoachDetectPage() {
  const manager = useDetect();
  const isMobile = useIsMobile();

  return isMobile ? <DetectMobile manager={manager} /> : <DetectDesktop manager={manager} />;
}
