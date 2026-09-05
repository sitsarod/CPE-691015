"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { Camera, CameraOff, Lock, ShieldCheck } from "lucide-react";
import QRScanner from "./QRScanner";
import ScanResultBanner, { type ScanOutcome } from "./ScanResult";
import FaceConfirmCard from "./FaceConfirmCard";
import type { CoachRosterItem, FaceLookup } from "@/types/attendance";

const MIN_PIN_LENGTH = 4;
const MAX_PIN_LENGTH = 8;

// z สูงกว่าแถบเมนูล่างของ AdminSideBar (z-[60]) — ไม่งั้นบนมือถือจะยังกดเข้าหน้าอื่นได้
const KIOSK_Z = "z-[70]";

// สูงกว่าผลสแกนเต็มจอ (z-[80]) — ไม่งั้นผลที่ค้างอยู่จะบังกล่องใส่ PIN
const PIN_Z = "z-[90]";

function onlyDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, MAX_PIN_LENGTH);
}

function PinDialog({
  title,
  description,
  confirmLabel,
  masked,
  error,
  onSubmit,
  onCancel,
}: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  masked: boolean;
  error?: string;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const tooShort = pin.length < MIN_PIN_LENGTH;

  return (
    <div
      className={`fixed inset-0 ${PIN_Z} flex items-center justify-center bg-gray-950/70 p-4 backdrop-blur-sm`}
    >
      <div className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-2xl">
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        <div className="mt-1 text-sm text-gray-500">{description}</div>

        <input
          autoFocus
          value={pin}
          onChange={(e) => setPin(onlyDigits(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !tooShort) onSubmit(pin);
          }}
          type={masked ? "password" : "text"}
          inputMode="numeric"
          autoComplete="off"
          placeholder={`${MIN_PIN_LENGTH}–${MAX_PIN_LENGTH} หลัก`}
          className="mt-5 w-full rounded-2xl border border-gray-300 bg-gray-50 p-4 text-center text-3xl tracking-[0.4em] text-gray-900 outline-none transition focus:border-[#CC0000] focus:bg-white focus:ring-4 focus:ring-[#CC0000]/15"
        />

        {error && <p className="mt-2 text-center text-sm text-[#CC0000]">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            className="min-h-11 flex-1 rounded-2xl border border-gray-300 py-3 font-medium text-gray-700 transition hover:bg-gray-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={() => onSubmit(pin)}
            disabled={tooShort}
            className="min-h-11 flex-1 rounded-2xl bg-[#CC0000] py-3 font-semibold text-white transition hover:bg-[#A30A0E] disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// KioskSetupDialog ตั้ง PIN ก่อนเข้าโหมดสนาม — โชว์ตัวเลขที่พิมพ์ กันตั้งผิดแล้วล็อกตัวเอง
export function KioskSetupDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: (pin: string) => void;
  onCancel: () => void;
}) {
  return (
    <PinDialog
      title="ตั้ง PIN ก่อนเข้าโหมดสนาม"
      description="ใช้ PIN นี้ตอนออกจากโหมด · จำให้ได้ ถ้าลืมต้องปิดแท็บแล้วเข้าใหม่"
      confirmLabel="เข้าโหมดสนาม"
      masked={false}
      onSubmit={onConfirm}
      onCancel={onCancel}
    />
  );
}

// ⚠️ ทุกสถานะของการ์ดกลางจอต้องใช้สองคลาสนี้ ไม่งั้นสลับเปิด/ปิดกล้องแล้วขนาดเด้ง
const CARD_CLASS =
  "w-full max-w-3xl rounded-[28px] bg-white p-3 shadow-2xl shadow-gray-400/25 ring-1 ring-gray-200/80";
const FRAME_CLASS = "aspect-[4/3] max-h-[52vh]";

// FrameCard คือการ์ดของสถานะที่ไม่มีกล้อง วางโครงให้ตรงกับของ QRScanner
function FrameCard({ children, status }: { children: ReactNode; status: ReactNode }) {
  return (
    <div className={CARD_CLASS}>
      <div className="space-y-3">
        <div
          className={`flex w-full flex-col items-center justify-center gap-5 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 ${FRAME_CLASS}`}
        >
          {children}
        </div>
        {status}
      </div>
    </div>
  );
}

// นาฬิกาบอกว่าจอยังไม่ค้าง
function Clock() {
  const [now, setNow] = useState("");

  useEffect(() => {
    const id = setInterval(
      () =>
        setNow(
          new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
        ),
      1000
    );
    return () => clearInterval(id);
  }, []);

  return <span className="text-2xl font-semibold tabular-nums text-gray-400">{now}</span>;
}

// CoachStrip บอกว่าโค้ชคนไหนเช็คชื่อแล้ว/ยัง
//
// จอนี้ตั้งใจให้โล่ง แต่คนคุมเครื่องต้องตอบได้ว่าใครยังไม่มา
// จึงย่อเหลือชิปชื่อเล่นแถวเดียว ไม่ใช่ยกรายชื่อเต็มมาวาง
function CoachStrip({ coaches }: { coaches: CoachRosterItem[] }) {
  if (coaches.length === 0) return null;

  const checkedIn = coaches.filter((c) => c.status === "present").length;

  return (
    <div className="relative flex shrink-0 flex-wrap items-center justify-center gap-2 px-6 pb-3 text-sm">
      <span className="font-medium text-gray-400">
        โค้ช {checkedIn}/{coaches.length}
      </span>
      {coaches.map((c) => {
        const present = c.status === "present";
        return (
          <span
            key={c.coach_id}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${
              present ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${present ? "bg-green-500" : "bg-gray-400"}`}
            />
            {c.nickname || c.full_name.trim() || `#${c.coach_id}`}
          </span>
        );
      })}
    </div>
  );
}

interface Props {
  pin: string;
  canScan: boolean;
  onScan: (code: string) => void;
  paused: boolean;
  pausedReason?: string;
  outcome: ScanOutcome | null;
  onDismissOutcome: () => void;
  onExit: () => void;

  coaches: CoachRosterItem[];

  notice?: string;

  // ─── สแกนใบหน้า (ไม่ส่งมา = ปิดฟีเจอร์ QR ยังทำงานปกติ) ───
  onFaceFrame?: (frame: Blob) => void;
  faceCandidate?: FaceLookup | null;
  isConfirmingFace?: boolean;
  onConfirmFace?: () => void;
  onCancelFace?: () => void;
}

// KioskMode คือจอที่เปิดทิ้งไว้ที่สนามโดยไม่มีคนคุม
//
// ⚠️ กันระดับหน้าจอเท่านั้น ไม่ใช่ระดับสิทธิ์ — JWT แอดมินยังอยู่บนเครื่องนั้น
// ต้องล็อกที่ตัวเครื่องคู่กันเสมอ (iPad: Guided Access · Chrome: --kiosk)
export default function KioskMode({
  pin,
  canScan,
  onScan,
  paused,
  pausedReason,
  outcome,
  onDismissOutcome,
  onExit,
  coaches,
  notice = "หมดเวลาเช็คชื่อของคาบนี้แล้ว",
  onFaceFrame,
  faceCandidate,
  isConfirmingFace = false,
  onConfirmFace,
  onCancelFace,
}: Props) {
  const [askingPin, setAskingPin] = useState(false);
  const [pinError, setPinError] = useState<string>();

  // ไม่จำลง localStorage ตั้งใจ — รีโหลดแล้วกลับมาเปิดกล้องเสมอ
  const [cameraOn, setCameraOn] = useState(true);

  const showCamera = canScan && cameraOn;

  const headline = !canScan
    ? "เช็คชื่อเข้าเรียน"
    : cameraOn
      ? "สแกน QR เพื่อเช็คชื่อ"
      : "กล้องปิดอยู่";

  // ⚠️ ต้องมีทุกสถานะ ปล่อยว่างเมื่อไหร่หัวข้อจะเลื่อนตอนสลับสถานะ
  const subline = !canScan
    ? notice
    : cameraOn
      ? "ยกบัตรประจำตัวให้อยู่ในกรอบ"
      : "กดปุ่มด้านล่างเพื่อเปิดกล้องแล้วเริ่มเช็คชื่อ";

  const handleSubmit = (entered: string) => {
    if (entered !== pin) {
      setPinError("PIN ไม่ถูกต้อง");
      return;
    }
    setAskingPin(false);
    setPinError(undefined);
    onExit();
  };

  return (
    <>
      <div
        className={`fixed inset-0 ${KIOSK_Z} flex flex-col overflow-hidden bg-gradient-to-b from-white via-white to-gray-100`}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/3 h-[80vh] w-[80vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#CC0000]/[0.04] blur-3xl"
        />

        <header className="relative flex shrink-0 items-center justify-between px-6 py-5 sm:px-10">
          <Image
            src="/logo.png"
            alt="Koyama"
            width={180}
            height={50}
            className="h-9 w-auto object-contain sm:h-11"
            priority
          />
          <Clock />
        </header>

        <main className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6 pb-4">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-5xl">
              {headline}
            </h1>
            <p className="mt-2 text-base text-gray-500 sm:text-xl">{subline}</p>
          </div>

          {showCamera ? (
            <div className={CARD_CLASS}>
              <QRScanner
                onScan={onScan}
                paused={paused}
                pausedReason={pausedReason}
                frameClassName={FRAME_CLASS}
                onFaceFrame={onFaceFrame}
              />
            </div>
          ) : canScan ? (
            <FrameCard
              status={
                <p className="flex items-center gap-2 text-gray-500">
                  <CameraOff className="h-4 w-4" />
                  ปิดกล้องไว้ — กดเปิดกล้องเพื่อเริ่มเช็คชื่อ
                </p>
              }
            >
              <div className="rounded-full bg-gray-100 p-5">
                <CameraOff className="h-10 w-10 text-gray-400" strokeWidth={1.5} />
              </div>

              <button
                onClick={() => setCameraOn(true)}
                className="inline-flex min-h-14 items-center gap-2.5 rounded-2xl bg-[#CC0000] px-8 text-lg font-semibold text-white shadow-lg shadow-[#CC0000]/20 transition hover:bg-[#A30A0E]"
              >
                <Camera className="h-6 w-6" />
                เปิดกล้อง
              </button>
            </FrameCard>
          ) : (
            <FrameCard
              status={
                <p className="flex items-center gap-2 text-gray-500">
                  <Lock className="h-4 w-4" />
                  ปิดรับการเช็คชื่อของคาบนี้แล้ว
                </p>
              }
            >
              <div className="rounded-full bg-gray-100 p-5">
                <Lock className="h-10 w-10 text-gray-400" strokeWidth={1.5} />
              </div>
            </FrameCard>
          )}
        </main>

        <CoachStrip coaches={coaches} />

        <footer className="relative flex shrink-0 items-center justify-between gap-3 px-6 pb-5 sm:px-10">
          {canScan ? (
            <button
              onClick={() => setCameraOn((v) => !v)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-gray-300 bg-white px-5 font-medium text-gray-600 shadow-sm transition hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900"
            >
              {cameraOn ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              {cameraOn ? "ปิดกล้อง" : "เปิดกล้อง"}
            </button>
          ) : (
            <span />
          )}

          <button
            onClick={() => {
              setPinError(undefined);
              setAskingPin(true);
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-gray-300 bg-white px-5 font-medium text-gray-600 shadow-sm transition hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900"
          >
            <ShieldCheck className="h-4 w-4" />
            ออกจากโหมดสนาม
          </button>
        </footer>
      </div>

      {outcome && (
        <ScanResultBanner
          variant="fullscreen"
          outcome={outcome}
          onDismiss={onDismissOutcome}
        />
      )}

      {/* การ์ดยืนยันมาก่อนผลลัพธ์เสมอ — ถ้ามีทั้งคู่แปลว่ากำลังจะบันทึกรายถัดไป */}
      {faceCandidate && onConfirmFace && onCancelFace && (
        <FaceConfirmCard
          candidate={faceCandidate}
          isSubmitting={isConfirmingFace}
          onConfirm={onConfirmFace}
          onCancel={onCancelFace}
        />
      )}

      {askingPin && (
        <PinDialog
          title="ใส่ PIN เพื่อออกจากโหมดสนาม"
          description="ออกแล้วจะกลับไปหน้าเช็คชื่อของแอดมิน"
          confirmLabel="ออกจากโหมด"
          masked
          error={pinError}
          onSubmit={handleSubmit}
          onCancel={() => {
            setAskingPin(false);
            setPinError(undefined);
          }}
        />
      )}
    </>
  );
}
