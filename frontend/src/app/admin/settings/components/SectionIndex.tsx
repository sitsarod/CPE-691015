'use client';

import React from 'react';
import { HomeContent, HeroSlide, PublicCoach } from '@/types/homeContent';
import { SectionId } from '../useHomeContentDraft';
import { SECTIONS, SectionGroup, sectionChip } from '../registry';

const GROUP_LABEL: Record<SectionGroup, string> = {
  content: 'เนื้อหาหน้าแรก',
  legal: 'ติดต่อและกฎหมาย',
};

export function SectionIndex({
  activeId,
  dirtyBySection,
  draft,
  slides,
  coaches,
  onSelect,
}: {
  activeId: SectionId;
  dirtyBySection: Record<SectionId, boolean>;
  draft: HomeContent;
  slides: HeroSlide[];
  coaches: PublicCoach[];
  onSelect: (id: SectionId) => void;
}) {
  const groups: SectionGroup[] = ['content', 'legal'];

  return (
    <nav className="flex flex-col gap-6">
      {groups.map((g) => (
        <div key={g} className="flex flex-col gap-2">
          <span className="px-3 text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400">
            {GROUP_LABEL[g]}
          </span>
          <div className="flex flex-col border-t border-gray-100">
            {SECTIONS.filter((s) => s.group === g).map((s) => {
              const active = s.id === activeId;
              const dirty = dirtyBySection[s.id];
              const chip = sectionChip(s.id, draft, slides, coaches);
              return (
                <button
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  className={`flex items-center gap-3 border-b border-gray-100 px-3 py-2.5 text-left transition-colors ${
                    active ? 'bg-[#CC0000] text-white' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span
                    className={`text-[11px] font-medium tabular-nums tracking-[0.14em] ${
                      active ? 'text-white/80' : 'text-gray-400'
                    }`}
                  >
                    {s.number}
                  </span>
                  <span
                    className={`flex-1 truncate text-[13.5px] ${
                      active ? 'font-semibold' : 'font-normal'
                    }`}
                  >
                    {s.label}
                  </span>
                  {dirty && (
                    <span
                      className={`h-1.5 w-1.5 flex-none rounded-full ${
                        active ? 'bg-white' : 'bg-amber-500'
                      }`}
                      title="แก้ไขแล้ว ยังไม่บันทึก"
                    />
                  )}
                  {chip.text && (
                    <span
                      className={`flex-none text-[11.5px] tabular-nums ${
                        active
                          ? 'text-white/80'
                          : chip.warn
                            ? 'text-amber-600'
                            : 'text-gray-400'
                      }`}
                    >
                      {chip.text}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
