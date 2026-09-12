"use client";

import { useEffect } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

const AUTO_DISMISS_MS = 2000;

export type ScanOutcome = {
  ok: boolean;
  title: string;
  detail?: string;
  repeat?: boolean;
};

const BEEP_TIMES_DEFAULT = 1;
const BEEP_TIMES_REPEAT = 3;

interface Props {
  outcome: ScanOutcome;
  onDismiss: () => void;

  variant?: "banner" | "overlay" | "fullscreen";
}

const BEEP_GAP_SECONDS = 0.09;

function beep(ok: boolean, times: number) {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();

    // สำเร็จ = เสียงสูงสั้น · ล้มเหลว = เสียงต่ำยาว แยกออกจากกันโดยไม่ต้องมอง
    const duration = ok ? 0.12 : 0.4;

    for (let i = 0; i < times; i++) {
      const startAt = ctx.currentTime + i * (duration + BEEP_GAP_SECONDS);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.frequency.value = ok ? 880 : 220;
      gain.gain.value = 0.15;

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + duration);

      if (i === times - 1) {
        osc.onended = () => ctx.close();
      }
    }
  } catch {
  }
}

let lastBeepedOutcome: ScanOutcome | null = null;

export default function ScanResultBanner({
  outcome,
  onDismiss,
  variant = "banner",
}: Props) {
  useEffect(() => {
    if (lastBeepedOutcome !== outcome) {
      lastBeepedOutcome = outcome;
      beep(outcome.ok, outcome.repeat ? BEEP_TIMES_REPEAT : BEEP_TIMES_DEFAULT);
    }
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [outcome, onDismiss]);

  const tone = outcome.ok ? "bg-green-600" : "bg-red-600";
  const Icon = outcome.ok ? CheckCircle2 : XCircle;

  if (variant === "fullscreen") {
    return (
      <button
        onClick={onDismiss}
        aria-live="assertive"
        className={`fixed inset-0 z-[80] flex flex-col items-center justify-center gap-6 px-8 text-center text-white ${tone}`}
      >
        <Icon className="h-24 w-24 sm:h-32 sm:w-32" strokeWidth={2} />

        <p className="text-balance text-4xl font-bold leading-tight sm:text-6xl">
          {outcome.title}
        </p>
        {outcome.detail && (
          <p className="text-balance text-xl text-white/90 sm:text-3xl">{outcome.detail}</p>
        )}
      </button>
    );
  }

  if (variant === "overlay") {
    // ลอยทับภาพจากกล้อง จึงกว้างเท่าข้อความและใช้ตัวเล็ก ให้บังหน้าคนที่ยื่น QR น้อยที่สุด
    return (
      <button
        onClick={onDismiss}
        aria-live="assertive"
        className={`flex max-w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-white shadow-lg transition ${tone}`}
      >
        <Icon className="h-5 w-5 shrink-0" strokeWidth={2.5} />

        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-snug">{outcome.title}</p>
          {outcome.detail && (
            <p className="truncate text-xs text-white/90">{outcome.detail}</p>
          )}
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onDismiss}
      aria-live="assertive"
      className={`flex w-full items-center gap-3 rounded-xl border-b-2 px-4 py-3 text-left text-white transition ${tone} ${
        outcome.ok ? "border-green-700" : "border-red-700"
      }`}
    >
      <Icon className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" />

      <div className="min-w-0">
        <p className="truncate text-base font-bold leading-snug sm:text-lg">{outcome.title}</p>
        {outcome.detail && (
          <p className="truncate text-sm text-white/90">{outcome.detail}</p>
        )}
      </div>
    </button>
  );
}
