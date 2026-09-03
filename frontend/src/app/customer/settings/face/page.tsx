"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Camera,
  CheckCircle2,
  Clock,
  Loader2,
  ScanFace,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  FACE_POSES,
  FaceImage,
  FaceImageStatus,
  FacePose,
  POSE_HINT,
  POSE_LABEL,
  STATUS_LABEL,
} from "@/types/faceImage";
import {
  deleteFaceImage,
  fetchMyFaceImages,
  uploadFaceImage,
} from "@/services/faceImageAPI";
import { fetchMyFaceConsent } from "@/services/consentAPI";
import { FaceConsentStatus } from "@/types/consent";
import CaptureDialog from "./CaptureDialog";
import FaceImageThumb from "@/components/face/FaceImageThumb";

const STATUS_STYLE: Record<FaceImageStatus, { icon: typeof Clock; className: string }> = {
  pending: { icon: Clock, className: "text-amber-600 bg-amber-50" },
  awaiting_review: { icon: Clock, className: "text-blue-600 bg-blue-50" },
  ready: { icon: CheckCircle2, className: "text-green-700 bg-green-50" },
  rejected: { icon: XCircle, className: "text-[#CC0000] bg-red-50" },
};

export default function FaceEnrollmentPage() {
  const [consent, setConsent] = useState<FaceConsentStatus | null>(null);
  const [images, setImages] = useState<FaceImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [capturingPose, setCapturingPose] = useState<FacePose | null>(null);
  const [deletingID, setDeletingID] = useState<number | null>(null);

  // ⚠️ setState ต้องอยู่หลัง await + เช็ค cancelled เสมอ
  // เรียกตรง ๆ ใน effect body จะติด rule react-hooks/set-state-in-effect
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const status = await fetchMyFaceConsent();
        if (cancelled) return;
        setConsent(status);
        if (status.status === "granted") {
          const list = await fetchMyFaceImages();
          if (cancelled) return;
          setImages(list);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpload = async (pose: FacePose, photo: Blob) => {
    await uploadFaceImage(pose, photo); // ถ้า throw CaptureDialog จะโชว์ error เอง
    setCapturingPose(null);
    setImages(await fetchMyFaceImages());
  };

  const handleDelete = async (id: number) => {
    setDeletingID(id);
    try {
      await deleteFaceImage(id);
      setImages(await fetchMyFaceImages());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ลบรูปไม่สำเร็จ");
    } finally {
      setDeletingID(null);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-[50vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#CC0000]" />
      </div>
    );
  }

  const isGranted = consent?.status === "granted";
  const byPose = new Map(images.map((img) => [img.pose, img]));
  const readyCount = images.filter((img) => img.status === "ready").length;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">ลงทะเบียนใบหน้า</h1>
      <p className="text-gray-500 text-sm mb-8">
        ถ่ายรูป 3 ท่าเพื่อใช้เช็คชื่อเข้าเรียนด้วยการสแกนใบหน้า
      </p>

      {error && (
        <div className="mb-6 flex items-start gap-2 text-sm text-[#CC0000] bg-red-50 rounded-xl px-4 py-3">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!isGranted ? (
        <div className="rounded-2xl border border-gray-200 p-6">
          <div className="flex items-start gap-3">
            <ScanFace className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold text-gray-900 mb-1">
                ต้องให้ความยินยอมก่อนจึงจะถ่ายรูปได้
              </p>
              <p className="text-sm text-gray-500 mb-4">
                ภาพใบหน้าเป็นข้อมูลชีวภาพตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล
                ระบบจะเก็บได้ต่อเมื่อท่านกดยินยอมแล้วเท่านั้น
                และท่านถอนความยินยอมได้ทุกเมื่อ
              </p>
              <Link
                href="/customer/settings/privacy"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-[#CC0000] hover:bg-[#a50000]"
              >
                ไปหน้าความเป็นส่วนตัว
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-6 text-sm text-gray-500">
            ถ่ายแล้ว{" "}
            <span className="font-bold text-gray-900">
              {images.length}/{FACE_POSES.length}
            </span>{" "}
            ท่า · พร้อมใช้งาน{" "}
            <span className="font-bold text-gray-900">{readyCount}</span> รูป
          </div>

          <div className="space-y-3">
            {FACE_POSES.map((pose) => {
              const image = byPose.get(pose);
              const style = image ? STATUS_STYLE[image.status] : null;
              const StatusIcon = style?.icon;

              return (
                <div
                  key={pose}
                  className="flex items-center gap-4 rounded-2xl border border-gray-200 p-4"
                >
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                    {image ? (
                      <FaceImageThumb id={image.id} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <Camera className="w-6 h-6" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900">{POSE_LABEL[pose]}</p>
                    {image ? (
                      <>
                        <span
                          className={`inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-lg text-xs font-medium ${style!.className}`}
                        >
                          {StatusIcon && <StatusIcon className="w-3 h-3" />}
                          {STATUS_LABEL[image.status]}
                        </span>
                        {image.status === "rejected" && image.reject_reason && (
                          <p className="text-xs text-gray-500 mt-1">
                            เหตุผล: {image.reject_reason}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-gray-500 mt-1">{POSE_HINT[pose]}</p>
                    )}
                  </div>

                  {image ? (
                    <button
                      onClick={() => handleDelete(image.id)}
                      disabled={deletingID === image.id}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 shrink-0"
                    >
                      {deletingID === image.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                      ลบ
                    </button>
                  ) : (
                    <button
                      onClick={() => setCapturingPose(pose)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-[#CC0000] hover:bg-[#a50000] shrink-0"
                    >
                      <Camera className="w-4 h-4" />
                      ถ่ายรูป
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <p className="mt-6 text-xs text-gray-400 leading-relaxed">
            รูปที่ถ่ายจะถูกเก็บแบบเข้าถึงได้เฉพาะท่านและเจ้าหน้าที่ที่ตรวจสอบเท่านั้น
            ไม่เปิดเป็นลิงก์สาธารณะ · เมื่อถอนความยินยอม ระบบจะลบรูปทั้งหมดทิ้งทันที
          </p>
        </>
      )}

      {capturingPose && (
        <CaptureDialog
          pose={capturingPose}
          onCancel={() => setCapturingPose(null)}
          onConfirm={(photo) => handleUpload(capturingPose, photo)}
        />
      )}
    </div>
  );
}
