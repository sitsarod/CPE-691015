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

interface Props {
  onScan: (code: string) => void;

  paused: boolean;

  pausedReason?: string;

  overlay?: ReactNode;
}

export default function QRScanner({ onScan, paused, pausedReason, overlay }: Props) {
  const scannerRef = useRef<Html5QrcodeInstance | null>(null);
  const onScanRef = useRef(onScan);
  const [status, setStatus] = useState<"idle" | "starting" | "running" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let cancelled = false;
    let instance: Html5QrcodeInstance | null = null;

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

        await instance.start(
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
      if (active) {
        active.stop().catch(() => {
        });
      }
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

  return (
    <div className="space-y-3">
    
      <div className="relative aspect-[4/3] max-h-[52vh] w-full overflow-hidden rounded-2xl bg-black">
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
