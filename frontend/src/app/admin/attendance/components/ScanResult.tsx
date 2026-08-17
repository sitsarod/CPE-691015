"use client";

import { useEffect } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

const AUTO_DISMISS_MS = 3000;

export type ScanOutcome = {
  ok: boolean;
  title: string;
  detail?: string;
};

interface Props {
  outcome: ScanOutcome;
  onDismiss: () => void;

  variant?: "banner" | "overlay";
}

function beep(ok: boolean) {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // สำเร็จ = เสียงสูงสั้น · ล้มเหลว = เสียงต่ำยาว แยกออกจากกันโดยไม่ต้องมอง
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.15;

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.4));

    osc.onended = () => ctx.close();
  } catch {
  }
}

export default function ScanResultBanner({
  outcome,
  onDismiss,
  variant = "banner",
}: Props) {
  useEffect(() => {
    beep(outcome.ok);
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [outcome, onDismiss]);

  const tone = outcome.ok ? "bg-green-600" : "bg-red-600";
  const Icon = outcome.ok ? CheckCircle2 : XCircle;

  if (variant === "overlay") {
    return (
      <button
        onClick={onDismiss}
        aria-live="assertive"
        className={`flex max-w-full items-center gap-2.5 rounded-xl px-4 py-2.5 text-left text-white shadow-lg transition ${tone}`}
      >
        <Icon className="h-6 w-6 shrink-0" strokeWidth={2.5} />

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
      className={`flex w-full items-center gap-4 rounded-2xl border-b-4 p-6 text-left text-white transition ${tone} ${
        outcome.ok ? "border-green-700" : "border-red-700"
      }`}
    >
      <Icon className="h-12 w-12 shrink-0" />

      <div className="min-w-0">
        <p className="truncate text-3xl font-bold leading-tight">{outcome.title}</p>
        {outcome.detail && (
          <p className="mt-1 text-lg text-white/90">{outcome.detail}</p>
        )}
      </div>
    </button>
  );
}
