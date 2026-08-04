"use client";

import { useEffect, useState } from "react";
import {
  ScanFace,
  Loader2,
  Check,
  X,
  ShieldCheck,
  QrCode,
  Clock,
  Ban,
  Users,
  Scale,
  Building2,
  LogOut,
} from "lucide-react";
import { FaceConsentPolicy, FaceConsentDecision } from "@/types/consent";
import { fetchFaceConsentPolicy } from "@/services/consentAPI";

interface FaceConsentModalProps {
  open: boolean;
  /** เรียกเมื่อผู้ใช้ตัดสินใจแล้ว — component แม่เป็นผู้ยิง API บันทึกและปิด modal เอง */
  onDecision: (action: FaceConsentDecision) => void | Promise<void>;
  /** ปิดโดยไม่ตัดสินใจ — ส่ง undefined ถ้าไม่อนุญาตให้ปิด */
  onDismiss?: () => void;
  isSubmitting?: boolean;
}

/**
 * Modal ขอความยินยอมเก็บข้อมูลใบหน้าตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล
 *
 * หลักการที่ต้องคงไว้เวลาแก้ component นี้:
 * 1. เนื้อหาประกาศต้องดึงจาก backend เสมอ ห้ามฮาร์ดโค้ดไว้ที่นี่
 *    เพราะเวอร์ชันของประกาศถูกบันทึกเป็นหลักฐานคู่กับการกดยินยอม
 * 2. ปุ่ม "ไม่ยินยอม" ต้องเด่นเท่าปุ่ม "ยินยอม" — ความยินยอมต้องให้โดยอิสระ
 *    ถ้าออกแบบให้ปุ่มปฏิเสธหายากหรือจางกว่า จะเข้าข่ายบีบให้ยินยอม
 * 3. ต้องบอกให้ชัดว่าถ้าไม่ยินยอมก็ยังใช้บริการได้ตามปกติ
 */
export default function FaceConsentModal({
  open,
  onDecision,
  onDismiss,
  isSubmitting = false,
}: FaceConsentModalProps) {
  const [policy, setPolicy] = useState<FaceConsentPolicy | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const loadPolicy = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await fetchFaceConsentPolicy();
        if (!cancelled) setPolicy(data);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "ไม่สามารถโหลดรายละเอียดได้"
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadPolicy();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* หัว modal */}
        <div className="bg-[#CC0000] px-6 py-5 text-white flex items-start gap-4 relative">
          <div className="bg-white/20 p-2.5 rounded-xl border border-white/10 flex-shrink-0">
            <ScanFace className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold leading-snug">
              {policy?.title ?? "การเก็บและใช้ข้อมูลภาพใบหน้า"}
            </h3>
            <p className="text-white/80 text-xs mt-1">
              โปรดอ่านรายละเอียดก่อนตัดสินใจ
              {policy?.version ? ` · ประกาศเวอร์ชัน ${policy.version}` : ""}
            </p>
          </div>
          {onDismiss && !isSubmitting && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="ปิด"
              className="text-white/70 hover:text-white transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* เนื้อหาประกาศ */}
        <div className="p-6 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin text-[#CC0000] mb-3" />
              <span className="text-sm">กำลังโหลดรายละเอียด...</span>
            </div>
          ) : error ? (
            <div className="py-10 text-center">
              <p className="text-red-600 font-semibold mb-2">{error}</p>
              <p className="text-gray-500 text-sm">
                กรุณาลองใหม่อีกครั้ง หรือติดต่อเจ้าหน้าที่
              </p>
            </div>
          ) : policy ? (
            <div className="space-y-6">
              <p className="text-gray-700 text-sm leading-relaxed">
                {policy.summary}
              </p>

              <PolicySection
                icon={<ScanFace className="w-4 h-4 text-[#CC0000]" />}
                title="ข้อมูลที่จัดเก็บ"
                items={policy.data_collected}
              />

              <PolicySection
                icon={<ShieldCheck className="w-4 h-4 text-[#CC0000]" />}
                title="วัตถุประสงค์การใช้งาน"
                items={policy.purposes}
              />

              <PolicySection
                icon={<Ban className="w-4 h-4 text-gray-500" />}
                title="สิ่งที่เราจะไม่ทำ"
                items={policy.not_used_for}
                muted
              />

              {/* ม.23(4) — ผู้ที่อาจได้รับข้อมูล */}
              <PolicySection
                icon={<Users className="w-4 h-4 text-[#CC0000]" />}
                title="ผู้ที่อาจได้รับข้อมูล"
                items={policy.disclosure}
              />

              {/* ม.23(3) — ระยะเวลาจัดเก็บ */}
              <div>
                <SectionHeading
                  icon={<Clock className="w-4 h-4 text-[#CC0000]" />}
                  title="ระยะเวลาจัดเก็บ"
                />
                <p className="text-sm text-gray-600 leading-relaxed pl-6">
                  {policy.retention}
                </p>
              </div>

              {/* ม.23(6) — สิทธิของเจ้าของข้อมูล */}
              <PolicySection
                icon={<ShieldCheck className="w-4 h-4 text-[#CC0000]" />}
                title="สิทธิของท่าน"
                items={policy.rights}
              />

              {/* ม.19 วรรคหก — ต้องแจ้งผลกระทบของการถอนความยินยอม */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <h4 className="flex items-center gap-2 text-sm font-bold text-amber-900 mb-1.5">
                  <LogOut className="w-4 h-4" />
                  ผลของการถอนความยินยอม
                </h4>
                <p className="text-sm text-amber-800 leading-relaxed">
                  {policy.withdrawal_notice}
                </p>
              </div>

              {/* ม.23(2) + ม.19 วรรคสี่ — ปฏิเสธได้โดยไม่เสียสิทธิ ส่วนนี้ห้ามตัดออก */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                <QrCode className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800 leading-relaxed">
                  {policy.decline_notice}
                </p>
              </div>

              {/* ม.23(5) — ข้อมูลติดต่อผู้ควบคุมข้อมูลส่วนบุคคล */}
              {policy.controller && (
                <div className="border-t border-gray-200 pt-5">
                  <SectionHeading
                    icon={<Building2 className="w-4 h-4 text-gray-500" />}
                    title="ผู้ควบคุมข้อมูลส่วนบุคคล"
                  />
                  <div className="pl-6 text-sm text-gray-600 space-y-0.5">
                    <p className="font-semibold text-gray-800">
                      {policy.controller.name}
                    </p>
                    {policy.controller.address && <p>{policy.controller.address}</p>}
                    {policy.controller.email && <p>อีเมล: {policy.controller.email}</p>}
                    {policy.controller.phone && <p>โทร: {policy.controller.phone}</p>}
                  </div>
                </div>
              )}

              {/* อ้างอิงมาตรากฎหมายที่รองรับประกาศฉบับนี้ */}
              {policy.legal_references?.length > 0 && (
                <div className="border-t border-gray-200 pt-5">
                  <SectionHeading
                    icon={<Scale className="w-4 h-4 text-gray-500" />}
                    title="กฎหมายที่เกี่ยวข้อง"
                  />
                  <ul className="pl-6 space-y-2.5">
                    {policy.legal_references.map((ref, idx) => (
                      <li key={`legal-${idx}`} className="text-xs leading-relaxed">
                        <span className="font-bold text-gray-800">
                          {ref.section}
                        </span>
                        <span className="text-gray-400"> · {ref.law}</span>
                        <p className="text-gray-500 mt-0.5">{ref.description}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* ปุ่มตัดสินใจ — สองปุ่มน้ำหนักเท่ากันโดยตั้งใจ */}
        <div className="border-t border-gray-200 p-5 bg-gray-50 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => onDecision("declined")}
            disabled={isSubmitting || isLoading || !!error}
            className="flex-1 py-3.5 px-4 bg-white border-2 border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-100 hover:border-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" />
            ไม่ยินยอม
          </button>
          <button
            type="button"
            onClick={() => onDecision("granted")}
            disabled={isSubmitting || isLoading || !!error}
            className="flex-1 py-3.5 px-4 bg-[#CC0000] border-2 border-[#CC0000] text-white font-bold rounded-xl hover:bg-red-700 hover:border-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md shadow-red-200"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            ยินยอม
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <h4 className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-2">
      {icon}
      {title}
    </h4>
  );
}

function PolicySection({
  icon,
  title,
  items,
  muted = false,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  muted?: boolean;
}) {
  if (!items || items.length === 0) return null;

  return (
    <div>
      <SectionHeading icon={icon} title={title} />
      <ul className="space-y-1.5 pl-6">
        {items.map((item, idx) => (
          <li
            key={`${title}-${idx}`}
            className={`text-sm leading-relaxed flex items-start gap-2 ${
              muted ? "text-gray-500" : "text-gray-600"
            }`}
          >
            <span
              className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                muted ? "bg-gray-300" : "bg-[#CC0000]"
              }`}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
