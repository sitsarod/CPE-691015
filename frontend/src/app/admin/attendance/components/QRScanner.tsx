"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, CameraOff, Loader2, Timer } from "lucide-react";



const CDN_URL = "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js";
const ELEMENT_ID = "attendance-qr-reader";


const QR_CODE_FORMAT = 0;

interface Html5QrcodeInstance {
  start(
    camera: { facingMode: string } | string,
    config: {
      fps: number;
      qrbox?: { width: number; height: number };
      disableFlip?: boolean;
    },
    onSuccess: (decodedText: string) => void,
    onError?: (message: string) => void
  ): Promise<void>;
  stop(): Promise<void>;
  pause(shouldPauseVideo?: boolean): void;
  resume(): void;
  getState(): number;
}

type Html5QrcodeCtor = new (
  elementId: string,
  config?: {
    verbose?: boolean;
    formatsToSupport?: number[];
    experimentalFeatures?: { useBarCodeDetectorIfSupported?: boolean };
  }
) => Html5QrcodeInstance;

declare global {
  interface Window {
    Html5Qrcode?: Html5QrcodeCtor;
  }
}

function loadHtml5Qrcode(): Promise<Html5QrcodeCtor> {
  if (window.Html5Qrcode) return Promise.resolve(window.Html5Qrcode);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CDN_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () =>
        window.Html5Qrcode ? resolve(window.Html5Qrcode) : reject(new Error("โหลดไลบรารีอ่าน QR ไม่สำเร็จ"))
      );
      existing.addEventListener("error", () => reject(new Error("โหลดไลบรารีอ่าน QR ไม่สำเร็จ")));
      return;
    }

    const script = document.createElement("script");
    script.src = CDN_URL;
    script.async = true;
    script.onload = () =>
      window.Html5Qrcode ? resolve(window.Html5Qrcode) : reject(new Error("โหลดไลบรารีอ่าน QR ไม่สำเร็จ"));
    script.onerror = () => reject(new Error("โหลดไลบรารีอ่าน QR ไม่สำเร็จ"));
    document.body.appendChild(script);
  });
}


function ScanFrame({ paused }: { paused: boolean }) {
  const corner = `absolute h-9 w-9 drop-shadow-[0_0_3px_rgba(0,0,0,0.9)] transition-colors ${
    paused ? "border-amber-400" : "border-white"
  }`;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div
        className="relative aspect-square w-[62%] max-w-[300px] rounded-3xl"
        style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.22)" }}
      >
        <span className={`${corner} left-0 top-0 rounded-tl-3xl border-l-4 border-t-4`} />
        <span className={`${corner} right-0 top-0 rounded-tr-3xl border-r-4 border-t-4`} />
        <span className={`${corner} bottom-0 left-0 rounded-bl-3xl border-b-4 border-l-4`} />
        <span className={`${corner} bottom-0 right-0 rounded-br-3xl border-b-4 border-r-4`} />
      </div>

      <p
        className="absolute bottom-[9%] w-full text-center text-xs font-medium text-white"
        style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}
      >
        เล็งตรงกรอบ หรือมุมไหนของจอก็ได้
      </p>
    </div>
  );
}

// ทุกกี่มิลลิวินาทีจะดึงเฟรมไปให้ backend ทายว่าเป็นใคร
//
// 1.5 วิ เป็นจุดสมดุล: ถี่กว่านี้เปลืองแบนด์วิดท์และ CPU ของ face-service
// โดยไม่ได้ช่วยให้เร็วขึ้นจริง (คนต้องยืนนิ่งอยู่แล้ว) ห่างกว่านี้รู้สึกหน่วง
const FACE_FRAME_INTERVAL_MS = 1500;

// ย่อด้านยาวสุดก่อนส่ง — โมเดลไม่ได้ใช้ความละเอียดเกินนี้ และลดเวลาอัปโหลดมาก
const FACE_FRAME_MAX_EDGE = 640;

interface Props {
  onScan: (code: string) => void;

  paused: boolean;

  pausedReason?: string;

  overlay?: ReactNode;

  frameClassName?: string;

  /**
   * รับเฟรมจากกล้องเป็นระยะเพื่อส่งไปทายใบหน้า
   *
   * ⚠️ ใช้ <video> ตัวเดียวกับที่ html5-qrcode เปิดไว้แล้ว ไม่เปิดกล้องซ้ำ
   * เบราว์เซอร์ให้เปิดกล้องตัวเดียวกันพร้อมกันสองที่ไม่ได้ และผู้ใช้จะเห็นภาพซ้อน
   *
   * ไม่ส่ง prop นี้มา = ปิดการสแกนใบหน้า (QR ทำงานตามปกติ)
   */
  onFaceFrame?: (frame: Blob) => void;
}

export default function QRScanner({
  onScan,
  paused,
  pausedReason,
  overlay,
  frameClassName = "aspect-[4/3] max-h-[52vh]",
  onFaceFrame,
}: Props) {
  const scannerRef = useRef<Html5QrcodeInstance | null>(null);
  const onScanRef = useRef(onScan);
  const onFaceFrameRef = useRef(onFaceFrame);
  const [status, setStatus] = useState<"idle" | "starting" | "running" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // เก็บใน ref เพื่อไม่ให้ interval ถูกสร้างใหม่ทุกครั้งที่ผู้เรียก re-render
  useEffect(() => {
    onFaceFrameRef.current = onFaceFrame;
  }, [onFaceFrame]);

  useEffect(() => {
    let cancelled = false;
    let instance: Html5QrcodeInstance | null = null;

    let startPromise: Promise<void> | null = null;

    const boot = async () => {
      setStatus("starting");
      try {
        const Ctor = await loadHtml5Qrcode();
        if (cancelled) return;

        instance = new Ctor(ELEMENT_ID, {
          verbose: false,

          formatsToSupport: [QR_CODE_FORMAT],

          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        });
        scannerRef.current = instance;

        startPromise = instance.start(
          { facingMode: "environment" },
          {
            fps: 20,
            disableFlip: true,
          },
          (decodedText) => {
            try {
              scannerRef.current?.pause(false);
            } catch {
            }
            onScanRef.current(decodedText);
          },
          () => {
          }
        );
        await startPromise;

        if (!cancelled) setStatus("running");
      } catch (err: unknown) {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "เปิดกล้องไม่ได้ — ตรวจว่าเปิดหน้านี้ผ่าน https หรือ localhost และอนุญาตให้ใช้กล้องแล้ว"
        );
      }
    };

    boot();

    return () => {
      cancelled = true;
      const active = instance;
      scannerRef.current = null;
      if (!active) return;

      // ⚠️ ต้องรอ start() จบก่อนค่อย stop() — หยุดกลางคันแล้วไลบรารีจะโยน AbortError ทิ้งไว้
      Promise.resolve(startPromise)
        .catch(() => {})
        .then(() => active.stop())
        .catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (status !== "running") return;
    const scanner = scannerRef.current;
    if (!scanner) return;

    try {
      if (paused) scanner.pause(false);
      else scanner.resume();
    } catch {
    }
  }, [paused, status]);

  // ดึงเฟรมไปทายใบหน้าคู่ขนานกับการอ่าน QR — ไม่มีปุ่มสลับโหมด ทำสองอย่างพร้อมกัน
  //
  // หยุดตอน paused ด้วยเหตุผลเดียวกับที่หยุดอ่าน QR: มีการ์ดยืนยันค้างอยู่
  // หรือกำลังบันทึก ยิงต่อไปก็มีแต่จะได้คนเดิมซ้ำ ๆ
  useEffect(() => {
    if (status !== "running" || paused || !onFaceFrame) return;

    const timer = setInterval(() => {
      const video = document.querySelector<HTMLVideoElement>(`#${ELEMENT_ID} video`);
      if (!video || !video.videoWidth) return;

      const scale = Math.min(1, FACE_FRAME_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (blob) onFaceFrameRef.current?.(blob);
        },
        "image/jpeg",
        0.85
      );
    }, FACE_FRAME_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [status, paused, onFaceFrame]);

  return (
    <div className="space-y-3">
    
      <div className={`relative w-full overflow-hidden rounded-2xl bg-black ${frameClassName}`}>
        <div
          id={ELEMENT_ID}
          className="absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
        />

        {status === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-400">
            <Loader2 className="h-10 w-10 animate-spin" />
            <p className="text-sm">กำลังเปิดกล้อง...</p>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-500">
            <CameraOff className="h-12 w-12" strokeWidth={1.5} />
            <p className="text-lg font-semibold text-gray-400">เปิดกล้องไม่ได้</p>
          </div>
        )}

        {status === "running" && <ScanFrame paused={paused} />}

        {overlay && status === "running" && (
          <div className="absolute inset-x-0 bottom-0 flex justify-center p-3">
            {overlay}
          </div>
        )}
      </div>


      {overlay && status !== "running" && (
        <div className="flex justify-center">{overlay}</div>
      )}

      {status === "starting" && (
        <p className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          กำลังเปิดกล้อง...
        </p>
      )}

      {status === "running" && (
        <p
          className={`flex items-center gap-2 ${paused ? "text-amber-600" : "text-green-600"}`}
        >
          {paused ? <Timer className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          {paused
            ? (pausedReason ?? "หยุดอ่านชั่วคราว")
            : "ยกกล้องส่อง QR ของนักเรียน"}
        </p>
      )}

      {status === "error" && (
        <p className="flex items-start gap-2 text-amber-700">
          <CameraOff className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {errorMessage}
            <span className="block text-sm text-amber-600">
              เช็คชื่อจากรายชื่อได้เลย — กด &quot;เช็คให้&quot; ท้ายชื่อนักเรียน
            </span>
          </span>
        </p>
      )}
    </div>
  );
}
