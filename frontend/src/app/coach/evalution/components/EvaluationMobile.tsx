'use client';

import { MobilePlaceholder } from "@/components/admin/shared/AdminPageShell";
import React from 'react';
import { EvaluationManager } from './useEvaluation';

export function EvaluationMobile({ manager }: { manager: EvaluationManager }) {
  return <MobilePlaceholder />;
}
