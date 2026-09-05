"use client";

import { useEffect, useState } from "react";
import {
  ScanFace,
  Loader2,
  ShieldCheck,
  ShieldOff,
  QrCode,
  AlertTriangle,
} from "lucide-react";
import { FaceConsentStatus, FaceConsentDecision } from "@/types/consent";
import {
  fetchMyFaceConsent,
  recordFaceConsent,
  withdrawFaceConsent,
} from "@/services/consentAPI";
import FaceConsentModal from "@/components/FaceConsentModal";

/**
 * หน้าจัดการความยินยอมเก็บข้อมูลใบหน้า (PDPA) ใช้ร่วมกันทั้งนักเรียนและโค้ช
 *
 * ทั้งสองบทบาทใช้ endpoint ชุดเดียวกัน (/consents/face/*) เพราะ backend
 * แยกเองจาก JWT ว่าความยินยอมนี้เป็นของนักเรียนหรือโค้ช component นี้จึงไม่ต้อง
 * ส่ง id ใด ๆ ไป — ป้องกันการบันทึกความยินยอมแทนคนอื่นไปในตัว
 *
 * prop role ใช้แค่ปรับ "ถ้อยคำ" ให้ตรงบริบทเท่านั้น (เข้าเรียน vs เข้างาน)
 * ไม่ได้ใช้ตัดสินสิทธิ์ใด ๆ — สิทธิ์ตัดสินที่ backend ฝั่งเดียว
 */
interface Props {
  role: "customer" | "coach";
}

export default function PrivacySettings({ role }: Props) {
  const [consent, setConsent] = useState<FaceConsentStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isConsentOpen, setIsConsentOpen] = useState(false);
  const [isConfirmingWithdraw, setIsConfirmingWithdraw] = useState(false);

  const isCoach = role === "coach";

  // ข้อความที่ต่างกันตามบทบาท รวมไว้ที่เดียวจะได้ไม่ต้องมี ternary กระจายทั้งไฟล์
  const copy = {
    purpose: isCoach
      ? "ใช้สำหรับยืนยันตัวตนตอนเช็คชื่อเข้างาน"
      : "ใช้สำหรับยืนยันตัวตนตอนเช็คชื่อเข้าเรียน และวิเคราะห์วิดีโอการฝึกซ้อม",
    faceMethodLabel: isCoach ? "เช็คชื่อเข้างานด้วยการสแกนใบหน้า" : "เช็คชื่อด้วยการสแกนใบหน้า",
    withdrawImpact: isCoach
      ? "และไม่กระทบสถานะการจ้างงาน ค่าจ้าง หรือประวัติการเช็คชื่อที่บันทึกไว้ก่อนหน้า"
      : "และไม่กระทบสถานะการเป็นนักเรียนหรือสิทธิในคอร์สที่สมัครไว้",
  };

  const loadConsent = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setConsent(await fetchMyFaceConsent());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ไม่สามารถโหลดสถานะความยินยอมได้");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConsent();
  }, []);

  const handleDecision = async (action: FaceConsentDecision) => {
    setIsSaving(true);
    try {
      setConsent(await recordFaceConsent(action));
      setIsConsentOpen(false);
      setNotice(
        action === "granted"
          ? "บันทึกความยินยอมเรียบร้อยแล้ว ท่านจะเช็คชื่อได้ทั้งการสแกนใบหน้าและ QR code"
          : "รับทราบแล้ว ระบบจะไม่เก็บข้อมูลใบหน้าของท่าน"
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ไม่สามารถบันทึกการตัดสินใจได้");
    } finally {
      setIsSaving(false);
    }
  };

  const handleWithdraw = async () => {
    setIsSaving(true);
    try {
      setConsent(await withdrawFaceConsent());
      setIsConfirmingWithdraw(false);
      setNotice("ถอนความยินยอมเรียบร้อยแล้ว ระบบจะใช้ QR code ส่วนบุคคลในการเช็คชื่อแทน");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ไม่สามารถถอนความยินยอมได้");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-[50vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#CC0000]" />
      </div>
    );
  }

  const status = consent?.status ?? "unknown";
  const isGranted = status === "granted";

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">ความเป็นส่วนตัว</h1>
      <p className="text-gray-500 text-sm mb-8">
        จัดการความยินยอมในการเก็บข้อมูลส่วนบุคคลของท่าน
      </p>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm">
          {notice}
        </div>
      )}

      <div className="border border-gray-200 rounded-2xl overflow-hidden">
        <div className="p-6 flex items-start gap-4">
          <div className={`p-3 rounded-xl flex-shrink-0 ${isGranted ? "bg-red-50" : "bg-gray-100"}`}>
            <ScanFace className={`w-6 h-6 ${isGranted ? "text-[#CC0000]" : "text-gray-400"}`} />
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900">การเก็บข้อมูลภาพใบหน้า</h2>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              {copy.purpose}
              {" "}
              ภาพใบหน้าเป็นข้อมูลชีวภาพซึ่งกฎหมายจัดเป็นข้อมูลส่วนบุคคลอ่อนไหว
              จึงต้องได้รับความยินยอมโดยชัดแจ้งจากท่านก่อน
            </p>

            <div className="mt-4">
              <StatusBadge status={status} />
            </div>

            {/* วิธีเช็คชื่อที่ใช้ได้ในตอนนี้ — ยินยอมแล้วใช้ได้ทั้งสองวิธี ไม่ใช่เลือกอย่างใดอย่างหนึ่ง */}
            <div className="mt-4 flex flex-wrap gap-2">
              <MethodChip
                icon={<QrCode className="w-3.5 h-3.5" />}
                label="เช็คชื่อด้วย QR code"
                enabled
              />
              <MethodChip
                icon={<ScanFace className="w-3.5 h-3.5" />}
                label={copy.faceMethodLabel}
                enabled={isGranted}
              />
            </div>

            {/* ประกาศถูกแก้หลังจากที่ผู้ใช้กดยินยอม — ต้องบอกว่าเกิดอะไรขึ้น
                ไม่ใช่ปล่อยให้เห็นแค่ว่าสแกนใบหน้าใช้ไม่ได้เฉย ๆ */}
            {consent?.policy_outdated && (
              <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p className="leading-relaxed">
                  ประกาศการเก็บข้อมูลใบหน้ามีการแก้ไขหลังจากที่ท่านให้ความยินยอมไว้
                  กรุณาอ่านและยืนยันใหม่อีกครั้ง — ระหว่างนี้ระบบปิดการสแกนใบหน้าไว้
                  ท่านยังเช็คชื่อด้วย QR code ได้ตามปกติ
                </p>
              </div>
            )}

            {consent?.acted_at && (
              <p className="text-xs text-gray-400 mt-3">
                ตอบล่าสุดเมื่อ{" "}
                {new Date(consent.acted_at).toLocaleString("th-TH", {
                  dateStyle: "long",
                  timeStyle: "short",
                })}
                {consent.policy_version ? ` · ตามประกาศเวอร์ชัน ${consent.policy_version}` : ""}
              </p>
            )}
          </div>
        </div>

        {/* แถบการกระทำ */}
        <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
          {isGranted ? (
            isConfirmingWithdraw ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2.5 text-sm text-gray-700">
                  <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    เมื่อถอนความยินยอม ระบบจะลบภาพใบหน้าและข้อมูลที่เกี่ยวข้องทั้งหมด
                    ท่านจะเช็คชื่อด้วยการสแกนใบหน้าไม่ได้อีก แต่ยังเช็คชื่อด้วย QR code
                    ส่วนบุคคลได้ตามปกติ {copy.withdrawImpact} ยืนยันหรือไม่?
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsConfirmingWithdraw(false)}
                    disabled={isSaving}
                    className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg text-sm hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={handleWithdraw}
                    disabled={isSaving}
                    className="px-5 py-2.5 bg-[#CC0000] text-white font-semibold rounded-lg text-sm hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                    ยืนยันการถอนความยินยอม
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirmingWithdraw(true)}
                className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg text-sm hover:bg-gray-100 transition-colors flex items-center gap-2"
              >
                <ShieldOff className="w-4 h-4" />
                ถอนความยินยอม
              </button>
            )
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-start gap-2.5 text-sm text-gray-500 flex-1">
                <QrCode className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  ขณะนี้เช็คชื่อด้วย QR code ส่วนบุคคล — ให้ความยินยอมเพื่อเพิ่มการสแกนใบหน้าเป็นอีกช่องทาง
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsConsentOpen(true)}
                className="px-5 py-2.5 bg-[#CC0000] text-white font-semibold rounded-lg text-sm hover:bg-red-700 transition-colors flex items-center justify-center gap-2 flex-shrink-0"
              >
                <ShieldCheck className="w-4 h-4" />
                ให้ความยินยอม
              </button>
            </div>
          )}
        </div>
      </div>

      <FaceConsentModal
        open={isConsentOpen}
        isSubmitting={isSaving}
        onDecision={handleDecision}
        onDismiss={() => setIsConsentOpen(false)}
      />
    </div>
  );
}

/** ชิปแสดงว่าวิธีเช็คชื่อแต่ละแบบใช้ได้หรือยัง
 *  QR ใช้ได้เสมอ ส่วนการสแกนใบหน้าจะเปิดเพิ่มเมื่อให้ความยินยอม — ไม่ใช่มาแทนที่ QR */
function MethodChip({
  icon,
  label,
  enabled,
}: {
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
        enabled
          ? "bg-green-50 text-green-700 border-green-200"
          : "bg-gray-50 text-gray-400 border-gray-200"
      }`}
    >
      {icon}
      {label}
      <span className={enabled ? "text-green-600" : "text-gray-400"}>
        {enabled ? "· ใช้ได้" : "· ยังใช้ไม่ได้"}
      </span>
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    granted: {
      label: "ให้ความยินยอมแล้ว",
      className: "bg-green-50 text-green-700 border-green-200",
    },
    declined: {
      label: "ไม่ให้ความยินยอม",
      className: "bg-gray-100 text-gray-600 border-gray-200",
    },
    withdrawn: {
      label: "ถอนความยินยอมแล้ว",
      className: "bg-amber-50 text-amber-700 border-amber-200",
    },
    unknown: {
      label: "ยังไม่ได้ตอบ",
      className: "bg-blue-50 text-blue-700 border-blue-200",
    },
  };

  const item = config[status] ?? config.unknown;

  return (
    <span className={`inline-block px-3 py-1 rounded-full border text-xs font-bold ${item.className}`}>
      {item.label}
    </span>
  );
}
