'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, ChevronRight, ChevronLeft, ExternalLink } from 'lucide-react';
import { useHomeContentDraft, SectionId } from './useHomeContentDraft';
import { SECTIONS, SectionGroup, sectionChip, sectionHint } from './registry';
import { SectionIndex } from './components/SectionIndex';
import { HeroPreview } from './components/HeroPreview';
import { SectionBody, SectionCtx } from './components/sections';

const GROUP_LABEL: Record<SectionGroup, string> = {
  content: 'เนื้อหาหน้าแรก',
  legal: 'ติดต่อและกฎหมาย',
};

function SaveButton({
  saving,
  savedFlash,
  onSave,
  className = '',
}: {
  saving: boolean;
  savedFlash: boolean;
  onSave: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onSave}
      disabled={saving}
      className={`bg-[#CC0000] text-sm font-bold text-white transition-all hover:bg-[#990000] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 ${className}`}
    >
      {saving ? 'กำลังบันทึก...' : savedFlash ? 'บันทึกแล้ว ✓' : 'บันทึกการเปลี่ยนแปลง'}
    </button>
  );
}

function UnsavedIndicator({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="h-[7px] w-[7px] flex-none bg-amber-500" />
      <span className="text-[12.5px] text-amber-600 whitespace-nowrap">
        แก้ไขแล้ว {count} จุด ยังไม่บันทึก
      </span>
    </div>
  );
}

function formatEdited(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function AdminSettingsPage() {
  const c = useHomeContentDraft();
  const [activeId, setActiveId] = useState<SectionId>('hero');
  const [mobileSection, setMobileSection] = useState<SectionId | null>(null);
  const [isDesktop, setIsDesktop] = useState(true);

  const sectionRefs = useRef<Partial<Record<SectionId, HTMLElement | null>>>({});

  // ตรวจขนาดจอเพื่อเลือกเลย์เอาต์ (desktop = สารบัญ+แผงแก้ไข, mobile = ลิสต์→หน้าย่อย)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // scrollspy — ไฮไลต์หมวดที่กำลังดูอยู่ (เฉพาะ desktop)
  useEffect(() => {
    if (!isDesktop || c.loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id.replace('section-', '') as SectionId);
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    );
    SECTIONS.forEach((s) => {
      const el = sectionRefs.current[s.id];
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [isDesktop, c.loading]);

  const scrollToSection = useCallback((id: SectionId) => {
    setActiveId(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const ctx: SectionCtx | null = useMemo(() => {
    if (!c.draft) return null;
    return {
      draft: c.draft,
      setField: c.setField,
      dirtyBySection: c.dirtyBySection,
      slides: c.slides,
      uploadingSlide: c.uploadingSlide,
      uploadSlide: c.uploadSlide,
      toggleSlide: c.toggleSlide,
      deleteSlide: c.deleteSlide,
      moveSlide: c.moveSlide,
      coaches: c.coaches,
      toggleCoach: c.toggleCoach,
      setHeadCoach: c.setHeadCoach,
    };
  }, [c]);

  if (c.loading || !c.draft || !ctx) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-[#CC0000]" />
      </div>
    );
  }

  const editedMeta = formatEdited(c.saved?.updated_at);

  // ---------- MOBILE ----------
  if (!isDesktop) {
    // หน้าย่อยของหมวดที่เลือก
    if (mobileSection) {
      const meta = SECTIONS.find((s) => s.id === mobileSection)!;
      return (
        <div className="mx-auto max-w-3xl">
          <button
            onClick={() => setMobileSection(null)}
            className="mb-4 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
          >
            <ChevronLeft size={18} /> จัดการหน้าแรก
          </button>
          <SectionBody meta={meta} ctx={ctx} />

          {/* แถบบันทึก (อยู่เหนือแถบเมนูล่างของแอดมิน) */}
          <div className="mt-8 flex gap-3 border-t border-gray-200 pt-4">
            <Link
              href="/"
              target="_blank"
              className="flex-none rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-600"
            >
              ดูหน้าแรก
            </Link>
            <SaveButton
              saving={c.saving}
              savedFlash={c.savedFlash}
              onSave={c.save}
              className="flex-1 rounded-xl px-6 py-3"
            />
          </div>
        </div>
      );
    }

    // ลิสต์สารบัญ (หน้าหลักมือถือ)
    const groups: SectionGroup[] = ['content', 'legal'];
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-4">
          <h1 className="text-2xl font-black tracking-tight text-gray-900">จัดการหน้าแรก</h1>
          {editedMeta && <p className="mt-1 text-xs text-gray-500">แก้ไขล่าสุด {editedMeta}</p>}
        </div>

        {c.unsavedCount > 0 && (
          <div className="mb-5 flex items-center gap-2.5 border border-amber-300 bg-amber-50 px-3.5 py-3">
            <span className="h-[7px] w-[7px] flex-none bg-amber-500" />
            <span className="text-[12.5px] font-medium text-amber-600">
              แก้ไขแล้ว {c.unsavedCount} จุด ยังไม่บันทึก
            </span>
          </div>
        )}

        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <div key={g} className="flex flex-col gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400">
                {GROUP_LABEL[g]}
              </span>
              <div className="flex flex-col border-t border-gray-100">
                {SECTIONS.filter((s) => s.group === g).map((s) => {
                  const chip = sectionChip(s.id, c.draft!, c.slides, c.coaches);
                  return (
                    <button
                      key={s.id}
                      onClick={() => setMobileSection(s.id)}
                      className="flex items-center gap-3.5 border-b border-gray-100 py-3.5 text-left"
                    >
                      <span className="text-[11px] font-medium tabular-nums tracking-[0.14em] text-gray-400">
                        {s.number}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14.5px] font-medium text-gray-800">{s.label}</p>
                        <p className={`text-[11.5px] ${chip.warn ? 'text-amber-600' : 'text-gray-500'}`}>
                          {sectionHint(s.id, c.draft!, c.slides, c.coaches)}
                        </p>
                      </div>
                      {c.dirtyBySection[s.id] && (
                        <span className="h-1.5 w-1.5 flex-none rounded-full bg-amber-500" />
                      )}
                      <ChevronRight size={16} className="flex-none text-gray-300" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* พรีวิวหน้าแรก */}
        <div className="mt-6">
          <HeroPreview draft={c.draft} slides={c.slides} />
        </div>

        <div className="mt-8 flex gap-3 border-t border-gray-200 pt-4">
          <Link
            href="/"
            target="_blank"
            className="flex-none rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-600"
          >
            ดูหน้าแรก
          </Link>
          <SaveButton
            saving={c.saving}
            savedFlash={c.savedFlash}
            onSave={c.save}
            className="flex-1 rounded-xl px-6 py-3"
          />
        </div>
      </div>
    );
  }

  // ---------- DESKTOP ----------
  return (
    <div className="mx-auto max-w-[1400px]">
      {/* header */}
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="mt-1.5 text-3xl font-black tracking-tight text-gray-900">จัดการหน้าแรก</h1>
          <p className="mt-1.5 text-[13.5px] text-gray-500">
            เนื้อหาที่ผู้เข้าชมเห็นก่อนเข้าสู่ระบบ{editedMeta && ` · แก้ไขล่าสุด ${editedMeta}`}
          </p>
        </div>
        <div className="flex items-center gap-5">
          <UnsavedIndicator count={c.unsavedCount} />
          <Link
            href="/"
            target="_blank"
            className="flex items-center gap-1.5 rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            ดูหน้าแรก <ExternalLink size={15} />
          </Link>
          <SaveButton
            saving={c.saving}
            savedFlash={c.savedFlash}
            onSave={c.save}
            className="min-w-[180px] rounded-xl px-6 py-2.5"
          />
        </div>
      </div>

      {/* body: สารบัญ + แผงแก้ไข */}
      <div className="flex gap-8 pt-6">
        <aside className="sticky top-28 hidden h-fit w-[240px] flex-none lg:block">
          <SectionIndex
            activeId={activeId}
            dirtyBySection={c.dirtyBySection}
            draft={c.draft}
            slides={c.slides}
            coaches={c.coaches}
            onSelect={scrollToSection}
          />
        </aside>

        <div className="min-w-0 flex-1 flex flex-col gap-14">
          {SECTIONS.map((s) => (
            <section
              key={s.id}
              id={`section-${s.id}`}
              ref={(el) => {
                sectionRefs.current[s.id] = el;
              }}
              className="scroll-mt-28"
            >
              <SectionBody meta={s} ctx={ctx} />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
