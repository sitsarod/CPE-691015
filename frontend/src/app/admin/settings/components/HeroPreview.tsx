'use client';

import React from 'react';
import Link from 'next/link';
import { HomeContent, HeroSlide } from '@/types/homeContent';

// พรีวิว hero สด — เรนเดอร์จาก draft ทุกครั้งที่พิมพ์
export function HeroPreview({
  draft,
  slides,
}: {
  draft: HomeContent;
  slides: HeroSlide[];
}) {
  const bg = slides.find((s) => s.is_active)?.image_url ?? slides[0]?.image_url ?? '';
  const stats = (draft.hero_stats ?? []).filter((s) => s.value || s.label).slice(0, 4);
  const headlineLines = (draft.hero_headline ?? '').split('\n');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400">
          พรีวิว
        </span>
        <Link
          href="/"
          target="_blank"
          className="text-xs font-medium text-[#CC0000] hover:text-[#990000]"
        >
          เปิดแบบเต็มจอ
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200">
        <div className="relative h-52 bg-gray-800">
          {bg && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bg} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(90deg, rgba(17,17,17,.92), rgba(17,17,17,.5) 70%, rgba(17,17,17,.15))',
            }}
          />
          <div className="absolute inset-0 flex flex-col justify-end gap-2 p-4">
            {draft.hero_eyebrow && (
              <span className="text-[8px] font-light uppercase tracking-[0.18em] text-[#ff6a6a]">
                {draft.hero_eyebrow}
              </span>
            )}
            <span className="text-lg font-semibold leading-tight text-white">
              {headlineLines.map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  {i < headlineLines.length - 1 && <br />}
                </React.Fragment>
              ))}
            </span>
            {draft.hero_subtext && (
              <span className="max-w-[85%] text-[9px] font-light leading-relaxed text-gray-200 line-clamp-2">
                {draft.hero_subtext}
              </span>
            )}
          </div>
        </div>

        {stats.length > 0 && (
          <div className="flex divide-x divide-gray-200 border-t border-gray-200">
            {stats.map((s, i) => (
              <div key={i} className="flex flex-1 flex-col gap-0.5 px-3 py-2.5">
                <span className="text-sm font-bold text-[#CC0000] tabular-nums">{s.value || '—'}</span>
                <span className="truncate text-[8px] text-gray-500">{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11.5px] leading-relaxed text-gray-400">
        พรีวิวอัปเดตตามที่พิมพ์ · ผู้เข้าชมจะเห็นหลังกดบันทึก
      </p>
    </div>
  );
}
