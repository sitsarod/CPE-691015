import { MobilePlaceholder } from "@/components/admin/shared/AdminPageShell";
import React from 'react';
import { DetectManager } from './useDetect';

export function DetectMobile({ manager }: { manager: DetectManager }) {
  return <MobilePlaceholder />;
}
