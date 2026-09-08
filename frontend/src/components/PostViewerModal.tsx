"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { fetchPostObjectURL } from "@/services/postAPI";
import type { PostItem } from "@/types/post";

/**
 * เปิดดูโพสต์เต็มขนาด — เลื่อนดูโพสต์ก่อนหน้า/ถัดไปในชุดเดียวกันได้โดยไม่ต้องปิดแล้วเปิดใหม่
 * (ลูกศรซ้าย/ขวาบนแป้นพิมพ์, ปุ่ม ‹ ›, หรือลากด้วยเมาส์/นิ้ว — เหมือนสไลด์ตรวจทานฝั่งโค้ช)
 *
 * โหลดเนื้อไฟล์ทีละโพสต์ตามที่กำลังดูอยู่เท่านั้น (ไม่พรีโหลดทั้งชุด) เพราะวิดีโอโพสต์อาจหนักถึง 200MB
 */
export default function PostViewerModal({
  posts,
  index,
  onClose,
  onNavigate,
}: {
  posts: PostItem[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const post = posts[index];
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!post) return;
    let objectURL: string | null = null;
    let cancelled = false;
    setUrl(null);
    setFailed(false);

    fetchPostObjectURL(post.type, post.raw_id)
      .then((u) => {
        objectURL = u;
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [post]);

  const goPrev = () => onNavigate(Math.max(0, index - 1));
  const goNext = () => onNavigate(Math.min(posts.length - 1, index + 1));

  // ลูกศรซ้าย/ขวาเลื่อนโพสต์ Esc ปิดหน้าต่าง
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goPrev/goNext ผูกกับ index/posts.length อยู่แล้วผ่าน closure ด้านล่าง
  }, [index, posts.length]);

  // ลากด้วยเมาส์/นิ้วเพื่อเลื่อนโพสต์ — ลากผ่าน 15% ของความกว้างจอถึงจะเปลี่ยนโพสต์ ไม่งั้นไม่ทำอะไร
  const dragStartXRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (posts.length <= 1) return;
    if ((e.target as HTMLElement).closest("button, video")) return;
    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    const delta = e.clientX - dragStartXRef.current;
    const width = e.currentTarget.offsetWidth || 1;
    const threshold = width * 0.15;
    if (delta < -threshold) goNext();
    else if (delta > threshold) goPrev();
  };

  if (!post) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        title="ปิด"
      >
        <X size={20} />
      </button>

      {posts.length > 1 && (
        <>
          <span className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white">
            {index + 1} / {posts.length}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            disabled={index === 0}
            className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30 sm:left-4"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            disabled={index === posts.length - 1}
            className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30 sm:right-4"
          >
            <ChevronRight size={22} />
          </button>
        </>
      )}

      <div
        className="flex h-full w-full cursor-grab select-none items-center justify-center touch-pan-y active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {failed ? (
          <p className="text-sm text-white">โหลดไฟล์นี้ไม่สำเร็จ</p>
        ) : !url ? (
          <Loader2 className="h-8 w-8 animate-spin text-white" />
        ) : post.type === "video" ? (
          <video key={url} src={url} controls autoPlay className="max-h-full max-w-full rounded-lg" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- blob URL ใช้ next/image ไม่ได้
          <img src={url} alt="โพสต์" className="max-h-full max-w-full rounded-lg object-contain" draggable={false} />
        )}
      </div>
    </div>
  );
}
