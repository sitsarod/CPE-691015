"use client";

import { useEffect, useState } from "react";
import { Download, ImageOff, Loader2, PlayCircle } from "lucide-react";
import { downloadPost, fetchPostObjectURL } from "@/services/postAPI";
import type { PostItem } from "@/types/post";

/**
 * เหมือน PostMediaThumb ทุกอย่าง แต่ตัดปุ่มลบออก — ใช้ตอนแอดมินดูรูป/วิดีโอของนักเรียนคนอื่น
 * (หน้า admin/detect/media) ซึ่งไม่ใช่เจ้าของโพสต์ ลบเองไม่ได้อยู่แล้ว (endpoint ลบเช็คว่าต้อง
 * เป็นนักเรียนที่ถูกแท็กเองเท่านั้น) ดู/ดาวน์โหลดยังทำได้ปกติเพราะแอดมินมีสิทธิ์ดูไฟล์ raw ทุกไฟล์
 */
export default function AdminPostMediaThumb({
  post,
  onOpen,
}: {
  post: PostItem;
  onOpen: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (post.type === "video") return;

    let objectURL: string | null = null;
    let cancelled = false;

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
  }, [post.type, post.raw_id]);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadPost(post.type, post.raw_id);
    } catch {
      // เงียบไว้พอ — กดดาวน์โหลดพลาดไม่ควรทำให้ทั้งการ์ดพัง กดใหม่ได้เสมอ
    } finally {
      setDownloading(false);
    }
  };

  let content: React.ReactNode;
  if (post.type === "video") {
    content = (
      <div className="w-full h-full flex items-center justify-center bg-gray-900 text-white">
        <PlayCircle className="w-8 h-8" />
      </div>
    );
  } else if (failed) {
    content = (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
        <ImageOff className="w-6 h-6" />
      </div>
    );
  } else if (!url) {
    content = (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  } else {
    // eslint-disable-next-line @next/next/no-img-element -- blob URL ใช้ next/image ไม่ได้
    content = <img src={url} alt="โพสต์" className="h-full w-full object-cover" />;
  }

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        disabled={failed}
        className="block h-full w-full cursor-pointer appearance-none border-0 bg-transparent p-0 text-left disabled:cursor-default"
        title="ดูรูป/วิดีโอเต็มขนาด"
      >
        {content}
      </button>

      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        title="ดาวน์โหลด (โพสต์นี้จะถูกลบอัตโนมัติใน 7 วัน)"
        className="absolute bottom-1.5 left-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
      </button>
    </>
  );
}
