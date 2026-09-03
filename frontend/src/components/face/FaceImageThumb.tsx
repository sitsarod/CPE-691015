"use client";

import { useEffect, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { fetchFaceImageObjectURL } from "@/services/faceImageAPI";

/** รูปตัวอย่างหนึ่งใบ — โหลดเป็น blob เองเพราะ /raw ต้องแนบ token ที่ img ทำไม่ได้ */
export default function FaceImageThumb({ id }: { id: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectURL: string | null = null;
    let cancelled = false;

    fetchFaceImageObjectURL(id)
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
  }, [id]);

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
  return <img src={url} alt="รูปใบหน้าที่ลงทะเบียนไว้" className="w-full h-full object-cover" />;
}
