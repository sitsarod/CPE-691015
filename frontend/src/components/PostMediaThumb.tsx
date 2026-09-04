"use client";

import { useEffect, useState } from "react";
import { ImageOff, Loader2, PlayCircle } from "lucide-react";
import { fetchPostObjectURL } from "@/services/postAPI";
import type { PostItem } from "@/types/post";

/**
 * รูปหนึ่งชิ้นในแท็บ Posts — โหลดเป็น blob เองเพราะ /raw ต้องแนบ token ที่ img src ทำไม่ได้
 *
 * ⚠️ วิดีโอไม่ดึงเนื้อไฟล์มาทำ thumbnail — endpoint /videos/:id/raw ตอบแบบ private
 * (Cache-Control: no-store) ไม่รองรับ Range request ทาง blob fetch จึงต้องโหลดวิดีโอทั้งไฟล์
 * (สูงสุด 200MB) มาแค่โชว์กรอบเล็กๆ ในกริด ซึ่งหนักเกินไปโดยเฉพาะบนมือถือ — โชว์แค่ไอคอนแทน
 * ตัววิดีโอจริงเปิดดูได้ตอนกดเข้าไปดูทีละอันเท่านั้น (ยังไม่มีหน้ารายละเอียดตอนนี้)
 */
export default function PostMediaThumb({ post }: { post: PostItem }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

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

  if (post.type === "video") {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900 text-white">
        <PlayCircle className="w-8 h-8" />
      </div>
    );
  }

  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
        <ImageOff className="w-6 h-6" />
      </div>
    );
  }

  if (!url) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element -- blob URL ใช้ next/image ไม่ได้
  return <img src={url} alt="โพสต์" className="h-full w-full object-cover" />;
}
