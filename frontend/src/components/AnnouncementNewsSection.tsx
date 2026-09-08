"use client";

import { useState } from "react";
import { Announcement } from "@/types/announcement";
import { Calendar, ArrowRight } from "lucide-react";
import AnnouncementDetailModal, { Poster } from "@/components/AnnouncementDetailModal";

interface Props {
  announcements: Announcement[];
  /** เปิดแกลเลอรีรวมประกาศทั้งหมด (ปุ่ม "ดูข่าวทั้งหมด") */
  onOpenGallery?: () => void;
}

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });

// ส่วนข่าว/ประกาศหน้าแรก สไตล์คล้าย BWF — ข่าวเด่นใหญ่ 1 ชิ้น + การ์ดรอง 3 ชิ้น
// รูปทุกชิ้นแสดงเต็มภาพไม่ตัดขอบ คลิกแล้วเปิดหน้าต่างรายละเอียด (สำหรับผู้เยี่ยมชมที่ยังไม่ล็อกอิน)
export default function AnnouncementNewsSection({ announcements, onOpenGallery }: Props) {
  const [selected, setSelected] = useState<Announcement | null>(null);

  const withImage = announcements.filter((a) => !!a.image_url);
  if (withImage.length === 0) return null;

  const featured = withImage[0];
  const secondary = withImage.slice(1, 4);

  return (
    <section className="w-full bg-gradient-to-b from-gray-50 to-white py-10 sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ข่าวเด่น — ห่อเป็นการ์ดสีขาว มีขอบ/เงา ให้ดูเป็นกล่องไม่ลอยบนพื้นขาว */}
        <button
          type="button"
          onClick={() => setSelected(featured)}
          className="group grid w-full gap-5 overflow-hidden rounded-2xl border border-gray-100 bg-white p-3 text-left shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md sm:p-4 lg:grid-cols-5 lg:gap-6"
        >
          <div className="lg:col-span-3">
            <Poster
              src={featured.image_url}
              alt={featured.title}
              className="aspect-[16/10] w-full rounded-xl"
            />
          </div>
          <div className="flex flex-col justify-center px-2 pb-2 lg:col-span-2 lg:px-2">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-[#CC0000] px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-white">
                ข่าวเด่น
              </span>
              {featured.category?.name && (
                <span className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-gray-600">
                  {featured.category.name}
                </span>
              )}
            </div>
            <h3 className="text-2xl font-extrabold leading-tight text-gray-900 transition-colors group-hover:text-[#CC0000] sm:text-3xl">
              {featured.title}
            </h3>
            <p className="mt-3 line-clamp-3 text-gray-600">{featured.content}</p>
            <div className="mt-4 flex items-center gap-4 text-sm text-gray-400">
              <span className="flex items-center gap-1.5">
                <Calendar size={15} /> {fmtDate(featured.start_date)}
              </span>
            </div>
            <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#CC0000]">
              อ่านเพิ่มเติม <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </button>

        {/* ข่าวรอง */}
        {secondary.length > 0 && (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {secondary.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item)}
                className="group flex flex-col overflow-hidden rounded-xl border border-gray-100 bg-white text-left shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
              >
                <Poster src={item.image_url} alt={item.title} className="aspect-[16/10] w-full" />
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-center gap-2">
                    {item.category?.name && (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-gray-600">
                        {item.category.name}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Calendar size={13} /> {fmtDate(item.start_date)}
                    </span>
                  </div>
                  <h4 className="mt-2 line-clamp-2 text-lg font-bold leading-snug text-gray-900 transition-colors group-hover:text-[#CC0000]">
                    {item.title}
                  </h4>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ปุ่มดูข่าวทั้งหมด — ย้ายมาไว้มุมขวาล่างของส่วนข่าว */}
        {onOpenGallery && (
          <div className="mt-8 flex justify-end">
            <button
              onClick={onOpenGallery}
              className="group inline-flex items-center gap-1.5 rounded-full border border-[#CC0000]/30 bg-white px-5 py-2.5 text-sm font-semibold text-[#CC0000] shadow-sm transition-all hover:bg-[#CC0000] hover:text-white"
            >
              ดูข่าวทั้งหมด
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        )}
      </div>

      {/* หน้าต่างรายละเอียด — ใช้คอมโพเนนต์กลางร่วมกับแกลเลอรี */}
      {selected && <AnnouncementDetailModal announcement={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
