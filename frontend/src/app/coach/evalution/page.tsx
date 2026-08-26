'use client';

import React from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useEvaluation, EvaluationDesktop, EvaluationMobile } from './components';

export default function CoachEvalutionPage() {
  const manager = useEvaluation();
  const isMobile = useIsMobile();

  return isMobile ? <EvaluationMobile manager={manager} /> : <EvaluationDesktop manager={manager} />;
}
