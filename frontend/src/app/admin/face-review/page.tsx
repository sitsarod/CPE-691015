"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  Folder,
  ImageOff,
  Loader2,
  ScanFace,
  ShieldAlert,
  User,
  Users,
  X,
  XCircle,
} from "lucide-react";
import {
  AdminFaceImage,
  FaceImageStatus,
  POSE_LABEL,
  STATUS_LABEL,
} from "@/types/faceImage";
import { fetchFaceImagesForAdmin, reviewFaceImage } from "@/services/faceImageAPI";
import FaceImageThumb from "@/components/face/FaceImageThumb";

const STATUS_STYLE: Record<FaceImageStatus, { icon: typeof Clock; className: string }> = {
  pending: { icon: Clock, className: "text-amber-600 bg-amber-50" },
  awaiting_review: { icon: Clock, className: "text-blue-600 bg-blue-50" },
  ready: { icon: CheckCircle2, className: "text-green-700 bg-green-50" },
  rejected: { icon: XCircle, className: "text-[#CC0000] bg-red-50" },
};

const FILTERS: { value: FaceImageStatus | ""; label: string }[] = [
  { value: "", label: "ทั้งหมด" },
  { value: "pending", label: "กำลังประมวลผล" },
  { value: "awaiting_review", label: "รอตรวจสอบ" },
  { value: "ready", label: "พร้อมใช้งาน" },
  { value: "rejected", label: "ไม่ผ่าน" },
];

interface Folder {
  key: string;
  kind: "customer" | "coach";
  nickname: string;
  memberCode: string;
  images: AdminFaceImage[];
  counts: Partial<Record<FaceImageStatus, number>>;
}

function groupByOwner(images: AdminFaceImage[]): Folder[] {
  const map = new Map<string, Folder>();

  for (const img of images) {
    const key = `${img.subject_kind}-${img.coach_id ?? img.customer_id}`;
    let f = map.get(key);
    if (!f) {
      f = {
        key,
        kind: img.subject_kind,
        nickname: img.nickname || "ไม่ทราบชื่อ",
        memberCode: img.member_code,
        images: [],
        counts: {},
      };
      map.set(key, f);
    }
    f.images.push(img);
    f.counts[img.status] = (f.counts[img.status] ?? 0) + 1;
  }

  const waiting = (f: Folder) => (f.counts.awaiting_review ?? 0) + (f.counts.pending ?? 0);
  return [...map.values()].sort(
    (a, b) => waiting(b) - waiting(a) || a.nickname.localeCompare(b.nickname, "th")
  );
}

export default function FaceReviewPage() {
  const [images, setImages] = useState<AdminFaceImage[]>([]);
  const [filter, setFilter] = useState<FaceImageStatus | "">("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyID, setBusyID] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  // เก็บเป็นลิสต์เสมอ ปฏิเสธรูปเดียวคือลิสต์ที่มีสมาชิกตัวเดียว
  // ทั้งสองทางจึงผ่านช่องกรอกเหตุผลอันเดียวกัน ไม่ต้องมี modal สองชุด
  const [rejectTargets, setRejectTargets] = useState<AdminFaceImage[] | null>(null);
  const [reason, setReason] = useState("");

  const [openKey, setOpenKey] = useState<string | null>(null);

  const folders = useMemo(() => groupByOwner(images), [images]);
  const openFolder = folders.find((f) => f.key === openKey) ?? null;

  // อนุมัติทั้งหมดจงใจข้ามรูปที่ยัง "กำลังประมวลผล"
  //
  // รูปสถานะนั้นยังไม่มี embedding และ worker หยิบเฉพาะแถว pending พอกดอนุมัติ
  // สถานะกลายเป็น ready แล้ว worker จะไม่มาเก็บอีกเลย ได้รูปที่ขึ้นว่าพร้อมใช้งาน
  // แต่สแกนหน้าไม่มีวันเจอ และแก้ไม่ได้นอกจากลบทิ้งถ่ายใหม่
  // กดทีละใบยังพลาดแบบนั้นได้เหมือนเดิม แต่ปุ่มชุดไม่ควรทำให้พลาดทีเดียวหลายใบ
  const approvable = openFolder?.images.filter((i) => i.status === "awaiting_review") ?? [];
  const rejectable = openFolder?.images.filter((i) => i.status !== "rejected") ?? [];

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const list = await fetchFaceImagesForAdmin(filter || undefined);
        if (cancelled) return;
        setError(null);
        setImages(list);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filter]);

  const refresh = async () => {
    try {
      setImages(await fetchFaceImagesForAdmin(filter || undefined));
      // ไม่เคลียร์ = พลาดครั้งเดียวแล้วแบนเนอร์แดงค้างตลอด ทั้งที่ครั้งต่อ ๆ ไปสำเร็จ
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    }
  };

  const handleApprove = async (image: AdminFaceImage) => {
    setBusyID(image.id);
    try {
      await reviewFaceImage(image.id, "approve");
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "อนุมัติไม่สำเร็จ");
    } finally {
      setBusyID(null);
    }
  };

  // ยิงทีละรูปเพราะ backend ไม่มี endpoint แบบชุด — ทำทีละใบทำให้รู้ว่าใบไหนพลาด
  // แล้วรายงานเป็นจำนวน แทนที่จะล้มทั้งชุดเพราะใบเดียว
  const runBulk = async (
    targets: AdminFaceImage[],
    action: "approve" | "reject",
    why?: string
  ) => {
    setBulkBusy(true);
    let failed = 0;
    for (const image of targets) {
      try {
        await reviewFaceImage(image.id, action, why);
      } catch {
        failed++;
      }
    }
    await refresh();
    // ต้องตั้งหลัง refresh เพราะ refresh เคลียร์ error เป็น null เมื่อโหลดสำเร็จ
    if (failed > 0) {
      setError(`ทำรายการไม่สำเร็จ ${failed} จาก ${targets.length} รูป`);
    }
    setBulkBusy(false);
  };

  const handleReject = async () => {
    if (!rejectTargets) return;
    const targets = rejectTargets;
    const why = reason;
    setRejectTargets(null);
    setReason("");
    await runBulk(targets, "reject", why);
  };

  return (
    <div className="p-6 md:p-10">
      {openFolder ? (
        <div className="mb-6">
          <button
            onClick={() => setOpenKey(null)}
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            แฟ้มทั้งหมด
          </button>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            {openFolder.kind === "coach" ? (
              <Users className="h-6 w-6 text-[#CC0000]" />
            ) : (
              <User className="h-6 w-6 text-[#CC0000]" />
            )}
            {openFolder.nickname}
            {openFolder.memberCode && (
              <span className="text-base font-normal text-gray-400">{openFolder.memberCode}</span>
            )}
          </h1>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-500">
              {openFolder.kind === "coach" ? "โค้ช" : "นักเรียน"} · {openFolder.images.length} รูป
            </p>

            {(approvable.length > 0 || rejectable.length > 0) && (
              <div className="flex gap-2">
                {approvable.length > 0 && (
                  <button
                    onClick={() => runBulk(approvable, "approve")}
                    disabled={bulkBusy || busyID !== null}
                    className="flex items-center gap-1.5 rounded-xl bg-green-700 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-green-800 disabled:opacity-40"
                  >
                    {bulkBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCheck className="h-4 w-4" />
                    )}
                    อนุมัติทั้งหมด ({approvable.length})
                  </button>
                )}

                {rejectable.length > 0 && (
                  <button
                    onClick={() => {
                      setRejectTargets(rejectable);
                      setReason("");
                    }}
                    disabled={bulkBusy || busyID !== null}
                    className="flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-[#CC0000] transition-colors hover:bg-red-100 disabled:opacity-40"
                  >
                    <X className="h-4 w-4" />
                    ปฏิเสธทั้งหมด ({rejectable.length})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">ตรวจสอบรูปใบหน้า</h1>
          <p className="text-gray-500 text-sm mb-6">
            รวมรูปเป็นแฟ้มรายคน กดเข้าไปเพื่อดูและตรวจทีละรูป
          </p>
        </>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value || "all"}
            onClick={() => {
              setFilter(f.value);
              setOpenKey(null);
            }}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
              filter === f.value
                ? "bg-[#CC0000] text-white"
                : "bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 text-sm text-[#CC0000] bg-red-50 rounded-xl px-4 py-3">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="h-[40vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#CC0000]" />
        </div>
      ) : images.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 p-10 text-center">
          <ScanFace className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">ไม่มีรูปในสถานะนี้</p>
        </div>
      ) : !openFolder ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((f) => {
            const waiting = (f.counts.awaiting_review ?? 0) + (f.counts.pending ?? 0);
            return (
              <button
                key={f.key}
                onClick={() => setOpenKey(f.key)}
                className="flex items-center gap-4 rounded-2xl border border-gray-200 p-4 text-left transition-colors hover:border-gray-300 hover:bg-gray-50"
              >
                <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gray-100">
                  <Folder className="h-6 w-6 text-gray-400" />
                  {waiting > 0 && (
                    <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#CC0000] px-1 text-[11px] font-bold text-white">
                      {waiting}
                    </span>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    {f.kind === "coach" ? (
                      <Users className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    ) : (
                      <User className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    )}
                    <span className="truncate font-bold text-gray-900">{f.nickname}</span>
                    {f.memberCode && (
                      <span className="shrink-0 text-xs font-normal text-gray-400">
                        {f.memberCode}
                      </span>
                    )}
                  </span>

                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    {(Object.keys(STATUS_STYLE) as FaceImageStatus[])
                      .filter((st) => f.counts[st])
                      .map((st) => (
                        <span
                          key={st}
                          className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[st].className}`}
                        >
                          {STATUS_LABEL[st]} {f.counts[st]}
                        </span>
                      ))}
                  </span>
                </span>

                <ChevronRight className="h-5 w-5 shrink-0 text-gray-300" />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {openFolder.images.map((image) => {
            const style = STATUS_STYLE[image.status];
            const StatusIcon = style.icon;
            const canReview = image.status !== "rejected";

            return (
              <div key={image.id} className="rounded-2xl border border-gray-200 overflow-hidden">
                <div className="aspect-square bg-gray-100">
                  {image.has_file ? (
                    <FaceImageThumb id={image.id} />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 gap-2">
                      <ImageOff className="w-7 h-7" />
                      <span className="text-xs">ไฟล์ถูกลบแล้ว</span>
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <p className="font-bold text-gray-900 truncate">
                    {image.nickname || "ไม่ทราบชื่อ"}
                    {image.member_code && (
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        {image.member_code}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">ท่า: {POSE_LABEL[image.pose]}</p>

                  <span
                    className={`inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded-lg text-xs font-medium ${style.className}`}
                  >
                    <StatusIcon className="w-3 h-3" />
                    {STATUS_LABEL[image.status]}
                  </span>

                  {image.status === "rejected" && image.reject_reason && (
                    <p className="text-xs text-gray-500 mt-2">เหตุผล: {image.reject_reason}</p>
                  )}

                  {canReview && (
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => handleApprove(image)}
                        disabled={busyID === image.id || bulkBusy || image.status === "ready"}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold text-white bg-green-700 hover:bg-green-800 disabled:opacity-40"
                      >
                        {busyID === image.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                        อนุมัติ
                      </button>
                      <button
                        onClick={() => {
                          setRejectTargets([image]);
                          setReason("");
                        }}
                        disabled={busyID === image.id || bulkBusy}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold text-[#CC0000] bg-red-50 hover:bg-red-100 disabled:opacity-40"
                      >
                        <X className="w-4 h-4" />
                        ปฏิเสธ
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rejectTargets && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5">
            <h2 className="font-bold text-gray-900 mb-1">
              {rejectTargets.length > 1
                ? `ปฏิเสธ ${rejectTargets.length} รูปของ ${rejectTargets[0].nickname || "คนนี้"}`
                : `ปฏิเสธรูปของ ${
                    rejectTargets[0].nickname ||
                    (rejectTargets[0].subject_kind === "coach" ? "โค้ช" : "นักเรียน")
                  }`}
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              ไฟล์รูปจะถูกลบออกจากระบบทันที เหลือไว้แต่เหตุผลให้เจ้าตัวเห็นเพื่อถ่ายใหม่
              {rejectTargets.some((i) => i.status === "ready") &&
                " · มีรูปที่ใช้เช็คชื่ออยู่ตอนนี้รวมอยู่ด้วย ปฏิเสธแล้วจะสแกนหน้าไม่ได้จนกว่าจะถ่ายใหม่"}
            </p>

            {rejectTargets.length > 1 && (
              <p className="mb-3 text-xs text-gray-500">เหตุผลนี้จะถูกใช้กับทุกรูปที่เลือก</p>
            )}

            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="เช่น ภาพเบลอเกินไป / ไม่ใช่ใบหน้าเจ้าของบัญชี / มีคนมากกว่าหนึ่งคนในภาพ"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#CC0000]"
            />

            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => setRejectTargets(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleReject}
                disabled={!reason.trim() || bulkBusy}
                className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-[#CC0000] hover:bg-[#a50000] disabled:opacity-40"
              >
                {rejectTargets.length > 1 ? `ยืนยันปฏิเสธ ${rejectTargets.length} รูป` : "ยืนยันปฏิเสธ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
