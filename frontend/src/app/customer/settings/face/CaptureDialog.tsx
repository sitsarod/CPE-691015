"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, RotateCcw, X, Check } from "lucide-react";
import { FacePose, POSE_HINT, POSE_LABEL } from "@/types/faceImage";

/** ย่อรูปให้ด้านยาวสุดไม่เกินค่านี้ก่อนส่ง — พอสำหรับโมเดลและไม่กินแบนด์วิดท์ */
const MAX_EDGE = 640;
const COUNTDOWN_SECONDS = 3;

interface Props {
  pose: FacePose;
  onCancel: () => void;
  /** ส่ง JPEG ที่ถ่ายได้ออกไปให้หน้าหลักอัปโหลด — throw ได้ถ้าอัปไม่สำเร็จ */
  onConfirm: (photo: Blob) => Promise<void>;
}

export default function CaptureDialog({ pose, onCancel, onConfirm }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      // getUserMedia ใช้ได้เฉพาะ secure context — เปิดผ่าน IP ใน LAN จะไม่ได้เลย
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          "เบราว์เซอร์ใช้กล้องไม่ได้ที่หน้านี้ — ต้องเปิดผ่าน HTTPS หรือ localhost เท่านั้น"
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        setCameraError("เปิดกล้องไม่สำเร็จ — กรุณาอนุญาตให้เว็บไซต์ใช้กล้องแล้วลองใหม่");
      }
    };

    start();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [stopCamera]);

  // เก็บกวาด object URL ของรูปตัวอย่าง ไม่งั้นค้างในหน่วยความจำ
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const grabFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setPreview({ url: URL.createObjectURL(blob), blob });
        stopCamera();
      },
      "image/jpeg",
      0.9
    );
  }, [stopCamera]);

  // นับถอยหลังให้ผู้ใช้จัดท่า
  // ⚠️ setState ต้องอยู่ใน callback ของ setTimeout (rule react-hooks/set-state-in-effect)
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;

    const timer = setTimeout(() => {
      if (countdown === 1) {
        grabFrame();
        setCountdown(null);
      } else {
        setCountdown(countdown - 1);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, grabFrame]);

  // grabFrame ปิดกล้องไปแล้ว ถ่ายใหม่จึงต้องเปิดกลับมาเอง
  const handleRetake = async () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setUploadError(null);
    setCountdown(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setCameraError("เปิดกล้องไม่สำเร็จ");
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      await onConfirm(preview.blob);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">ถ่ายรูป: {POSE_LABEL[pose]}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{POSE_HINT[pose]}</p>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
            aria-label="ปิด"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative bg-gray-900 aspect-[4/3]">
          {cameraError ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              <p className="text-sm text-white/90">{cameraError}</p>
            </div>
          ) : preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob URL ใช้ next/image ไม่ได้
            <img src={preview.url} alt="รูปที่ถ่ายได้" className="w-full h-full object-cover" />
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                // กลับด้านให้เหมือนส่องกระจก ผู้ใช้จัดท่าง่ายกว่า (รูปที่ส่งไม่ได้กลับด้าน)
                className="w-full h-full object-cover [transform:scaleX(-1)]"
              />
              {/* กรอบวงรีนำสายตา ให้วางใบหน้าตรงกลาง */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-[55%] h-[75%] rounded-[50%] border-2 border-white/70" />
              </div>
              {countdown !== null && countdown > 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white text-7xl font-bold drop-shadow-lg">{countdown}</span>
                </div>
              )}
            </>
          )}
        </div>

        {uploadError && (
          <div className="px-5 pt-4">
            <p className="text-sm text-[#CC0000] bg-red-50 rounded-lg px-3 py-2">{uploadError}</p>
          </div>
        )}

        <div className="px-5 py-4 flex gap-3 justify-end">
          {preview ? (
            <>
              <button
                onClick={handleRetake}
                disabled={isUploading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                ถ่ายใหม่
              </button>
              <button
                onClick={handleConfirm}
                disabled={isUploading}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white bg-[#CC0000] hover:bg-[#a50000] disabled:opacity-50"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                ใช้รูปนี้
              </button>
            </>
          ) : (
            <button
              onClick={() => setCountdown(COUNTDOWN_SECONDS)}
              disabled={!!cameraError || countdown !== null}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white bg-[#CC0000] hover:bg-[#a50000] disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              {countdown !== null ? "กำลังนับถอยหลัง..." : "ถ่ายรูป"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
