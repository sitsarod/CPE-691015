import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image as ImageIcon,
  Video,
  UploadCloud,
  X,
  Loader2,
  CheckCircle2,
  Sparkles,
  UserRound,
  Plus,
  Trash2,
  BadgeCheck,
  PencilLine,
  CircleAlert,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { DetectManager, DetectStudent, Detection, BatchItem, MAX_BATCH_FILES, AUTO_CONFIRM_THRESHOLD } from './useDetect';

export function DetectMobile({ manager }: { manager: DetectManager }) {
  const {
    inputRef,
    courses,
    coursesLoading,
    selectedCourseId,
    setSelectedCourseId,
    students,
    items,
    analyzingAll,
    savingAll,
    batchError,
    readyToAnalyzeCount,
    pickFiles,
    removeItem,
    clearAll,
    analyzeAll,
    confirmDetection,
    confirmAllPending,
    reassignDetection,
    removeDetection,
    addMissedStudent,
    saveItem,
    confirmAndSaveAll,
    isItemReviewed,
  } = manager;

  // เฉพาะไฟล์ที่วิเคราะห์เสร็จแล้วเท่านั้นที่โชว์ในสไลด์ตรวจทาน — ที่เหลือยังอยู่ในคิวรออัปโหลด/วิเคราะห์
  const analyzedItems = items.filter((item) => item.detections !== null);
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, analyzedItems.length - 1)));
  }, [analyzedItems.length]);

  const goPrev = () => setActiveIndex((i) => Math.max(0, i - 1));
  const goNext = () => setActiveIndex((i) => Math.min(analyzedItems.length - 1, i + 1));

  // ปัดนิ้วซ้าย/ขวาเพื่อเลื่อนรูป — ตามนิ้วแบบ real-time ระหว่างลาก แล้วค่อยตัดสินว่าจะ
  // เปลี่ยนรูปหรือเด้งกลับตอนปล่อย (เกินสัดส่วนที่กำหนดของความกว้างจอถึงจะเปลี่ยนรูป)
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStartXRef = useRef(0);
  const [isSlideDragging, setIsSlideDragging] = useState(false);
  const [slideDragOffset, setSlideDragOffset] = useState(0);

  const handleSlidePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (analyzedItems.length <= 1) return;
    // ไม่แย่งลากถ้ากดโดนปุ่ม/dropdown ให้มันทำงานปกติของมันไป
    if ((e.target as HTMLElement).closest('button, select, input, a, textarea')) return;
    setIsSlideDragging(true);
    dragStartXRef.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleSlidePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSlideDragging) return;
    setSlideDragOffset(e.clientX - dragStartXRef.current);
  };

  const endSlideDrag = () => {
    if (!isSlideDragging) return;
    setIsSlideDragging(false);
    const width = viewportRef.current?.offsetWidth || 1;
    const threshold = width * 0.15; // ปัดผ่าน 15% ของความกว้างจอถึงจะเปลี่ยนรูป
    if (slideDragOffset < -threshold) goNext();
    else if (slideDragOffset > threshold) goPrev();
    setSlideDragOffset(0);
  };

  return (
    <div className="space-y-5 px-4 pb-8 pt-4 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-[#CC0000]">
          <span className="h-px w-6 bg-[#CC0000]" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">AI Classification</span>
        </div>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-gray-900">จำแนกผู้เรียน</h1>
        <p className="mt-1 text-xs text-gray-500">
          อัปโหลดภาพหรือวิดีโอ (สูงสุด {MAX_BATCH_FILES} ไฟล์ต่อครั้ง) แล้วให้ AI ช่วยจำแนกว่ามีผู้เรียนคนไหนอยู่ในสื่อนี้บ้าง
        </p>
      </div>

      {batchError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{batchError}</div>
      )}

      {/* Upload card */}
      <div className="rounded-2xl border-2 border-[#CC0000]/80 bg-white p-4 shadow-sm">
        {/* เลือกคอร์สก่อนเสมอ — ทุกไฟล์ในชุดเดียวกันผูกกับคอร์สเดียวกัน กันรายชื่อทุกคอร์สปนกันตอนแท็ก */}
        <div>
          <label className="mb-1 block text-sm font-bold text-gray-700">คอร์ส</label>
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value ? Number(e.target.value) : '')}
            disabled={coursesLoading}
            className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition-all focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="" disabled>
              {coursesLoading ? 'กำลังโหลดคอร์ส...' : 'เลือกคอร์สที่ถ่ายรูป/วิดีโอนี้มา...'}
            </option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {!coursesLoading && courses.length === 0 && (
            <p className="mt-1.5 text-xs text-amber-600">ยังไม่พบคอร์สที่คุณมีตารางสอนอยู่</p>
          )}
        </div>

        {/* แตะเพื่อเลือกไฟล์ — มือถือไม่มีลากวางไฟล์ ใช้ปุ่มแตะเปิดตัวเลือกไฟล์/แกลเลอรีแทน */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/60 p-6 text-center transition-colors active:bg-gray-100"
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              pickFiles(e.target.files);
              e.target.value = ''; // เลือกไฟล์เดิมซ้ำได้ (เช่นลบออกแล้วอยากเพิ่มกลับ)
            }}
          />
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-400 shadow-sm">
            <UploadCloud size={22} />
          </div>
          <p className="text-sm font-semibold text-[#CC0000]">แตะเพื่อเลือกไฟล์</p>
          <p className="text-xs text-gray-400">รองรับ JPG, PNG, MP4, MOV, WEBM — สูงสุด {MAX_BATCH_FILES} ไฟล์</p>
        </button>

        {/* รายการไฟล์ที่เลือกไว้ */}
        {items.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-500">
                เลือกไว้ {items.length}/{MAX_BATCH_FILES} ไฟล์
              </p>
              <button type="button" onClick={clearAll} className="text-xs font-semibold text-gray-400 active:text-[#CC0000]">
                ล้างทั้งหมด
              </button>
            </div>
            {items.map((item) => (
              <div
                key={item.uid}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#FFF0F0] text-[#CC0000]">
                    {item.isVideo ? <Video size={16} /> : <ImageIcon size={16} />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-800">{item.file.name}</p>
                    <p className="text-xs text-gray-400">{formatSize(item.file.size)}</p>
                  </div>
                </div>
                {item.analyzing ? (
                  <Loader2 size={16} className="flex-shrink-0 animate-spin text-[#CC0000]" />
                ) : (
                  <button
                    type="button"
                    onClick={() => removeItem(item.uid)}
                    className="flex-shrink-0 rounded-lg p-2 text-gray-400 active:bg-gray-100 active:text-gray-600"
                    title="เอาไฟล์ออก"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Action */}
        <button
          type="button"
          onClick={analyzeAll}
          disabled={readyToAnalyzeCount === 0 || analyzingAll || selectedCourseId === ''}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#CC0000] py-3.5 text-base font-bold text-white shadow-md shadow-[#CC0000]/20 transition-colors active:bg-[#990000] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {analyzingAll ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
          {analyzingAll ? 'กำลังวิเคราะห์...' : `วิเคราะห์ทั้งหมด${readyToAnalyzeCount > 0 ? ` (${readyToAnalyzeCount} ไฟล์)` : ''}`}
        </button>
      </div>

      {/* ผลการจำแนกของแต่ละไฟล์ — ปัดดูทีละรูป + ยืนยัน/บันทึกทั้งชุดในแตะเดียว */}
      {analyzedItems.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goPrev}
                disabled={activeIndex === 0}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="min-w-[64px] text-center text-sm font-bold text-gray-600">
                {activeIndex + 1} / {analyzedItems.length}
              </span>
              <button
                type="button"
                onClick={goNext}
                disabled={activeIndex === analyzedItems.length - 1}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* ยืนยันรายการที่ยังค้าง "รอตรวจสอบ" ของทุกไฟล์ในชุด แล้วบันทึกให้ทีเดียวจบ */}
          <button
            type="button"
            onClick={confirmAndSaveAll}
            disabled={savingAll}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-3 text-sm font-bold text-white active:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingAll ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {savingAll ? 'กำลังยืนยัน+บันทึก...' : `ยืนยัน + บันทึกทั้งหมด (${analyzedItems.length} ไฟล์)`}
          </button>

          <div ref={viewportRef} className="overflow-hidden">
            <div
              className={`flex touch-pan-y select-none ${
                isSlideDragging ? '' : 'transition-transform duration-300 ease-out'
              }`}
              style={{ transform: `translateX(calc(-${activeIndex * 100}% + ${slideDragOffset}px))` }}
              onPointerDown={handleSlidePointerDown}
              onPointerMove={handleSlidePointerMove}
              onPointerUp={endSlideDrag}
              onPointerLeave={endSlideDrag}
              onPointerCancel={endSlideDrag}
            >
              {analyzedItems.map((item) => (
                <div key={item.uid} className="w-full flex-shrink-0">
                  <ItemReviewPanel
                    item={item}
                    students={students}
                    onConfirm={(detectionUid) => confirmDetection(item.uid, detectionUid)}
                    onConfirmAllPending={() => confirmAllPending(item.uid)}
                    onReassign={(detectionUid, studentId) => reassignDetection(item.uid, detectionUid, studentId)}
                    onRemove={(detectionUid) => removeDetection(item.uid, detectionUid)}
                    onAddMissed={() => addMissedStudent(item.uid)}
                    onSave={() => saveItem(item.uid)}
                    allReviewed={isItemReviewed(item)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-4 text-xs text-gray-500">
          <UploadCloud size={16} className="mt-0.5 flex-shrink-0 text-gray-400" />
          <p>
            หลังวิเคราะห์เสร็จ ระบบจะแสดงรายชื่อผู้เรียนที่ตรวจพบให้ตรวจทานทีละรูป ปัดซ้าย/ขวาเพื่อเลื่อนดูรูปอื่นได้
            หากมีคนที่ AI มองข้ามหรือจำแนกผิด แก้ไข/เพิ่มเองได้ก่อนยืนยัน (ยืนยันทีละไฟล์หรือทั้งชุดพร้อมกันก็ได้)
          </p>
        </div>
      )}
    </div>
  );
}

// ==================== ผลการจำแนกของไฟล์หนึ่งไฟล์ ====================
function ItemReviewPanel({
  item,
  students,
  onConfirm,
  onConfirmAllPending,
  onReassign,
  onRemove,
  onAddMissed,
  onSave,
  allReviewed,
}: {
  item: BatchItem;
  students: DetectStudent[];
  onConfirm: (detectionUid: string) => void;
  onConfirmAllPending: () => void;
  onReassign: (detectionUid: string, studentId: number) => void;
  onRemove: (detectionUid: string) => void;
  onAddMissed: () => void;
  onSave: () => void;
  allReviewed: boolean;
}) {
  const detections = item.detections ?? [];
  const pendingCount = detections.filter((d) => d.status === 'pending').length;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-gray-900">{item.file.name}</h2>
          <p className="mt-1 text-xs text-gray-500">
            AI มั่นใจสูง (≥{AUTO_CONFIRM_THRESHOLD}%) ยืนยันให้อัตโนมัติแล้ว ที่เหลือแตะ &quot;ถูกต้อง&quot; หรือเลือกชื่อใหม่
          </p>
        </div>
        <span className="flex-shrink-0 whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-500">
          {detections.filter((d) => d.status !== 'pending').length}/{detections.length}
        </span>
      </div>

      {/* บอกให้รู้ว่ามีหน้าที่ระบบเห็นแต่จับคู่ไม่ได้ จะได้ไม่เข้าใจผิดว่าเจอครบแล้ว
          (วิดีโอนับใบหน้าซ้ำได้ถ้าคนเดิมโผล่หลายเฟรมที่สุ่มตรวจ ไม่ใช่จำนวนคนจริงเป๊ะ) */}
      {item.faceCount > detections.length && (
        <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-amber-600">
          <CircleAlert size={13} className="mt-0.5 flex-shrink-0" />
          เจอ {item.faceCount} ใบหน้า{item.isVideo ? '' : 'ในรูป'} แต่จับคู่ได้ {detections.length} คน — ที่เหลือเพิ่มเองด้านล่างได้
        </p>
      )}

      {item.error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">
          {item.error}
        </div>
      )}

      {/* รูปที่อัปโหลดพร้อมกรอบ+ชื่อทับใบหน้าที่ตรวจพบ — ไว้ตรวจทานเท่านั้น ตัวไฟล์จริงไม่ถูกแก้ */}
      {!item.isVideo && <PhotoPreviewWithMarks file={item.file} detections={detections} />}

      {pendingCount > 0 && (
        <button
          type="button"
          onClick={onConfirmAllPending}
          className="mt-4 w-full whitespace-nowrap rounded-xl bg-gray-900 py-2.5 text-sm font-bold text-white active:bg-gray-800"
        >
          ยืนยันทั้งหมด ({pendingCount})
        </button>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {detections.map((d) => (
          <DetectionRow
            key={d.uid}
            detection={d}
            students={students}
            onConfirm={() => onConfirm(d.uid)}
            onReassign={(studentId) => onReassign(d.uid, studentId)}
            onRemove={() => onRemove(d.uid)}
          />
        ))}
      </div>

      {/* เพิ่มผู้เรียนที่ตกหล่น */}
      <button
        type="button"
        onClick={onAddMissed}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-3 text-sm font-semibold text-gray-500 transition-colors active:border-[#CC0000]/40 active:text-[#CC0000]"
      >
        <Plus size={16} />
        เพิ่มผู้เรียนที่ระบบตกหล่น
      </button>

      {item.savedAt ? (
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-600">
            <CheckCircle2 size={16} className="flex-shrink-0" />
            บันทึกผลการจำแนกเรียบร้อยแล้ว
          </div>
          {item.skippedCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-700">
              <CircleAlert size={14} className="flex-shrink-0" />
              ข้าม {item.skippedCount} คน เพราะยังไม่ได้ยินยอมเก็บข้อมูลใบหน้า
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-4">
          {!allReviewed && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
              <CircleAlert size={14} className="flex-shrink-0" />
              ยังมีรายการที่ยังไม่ได้ตรวจทาน
            </span>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={!allReviewed || item.saving}
            className="w-full rounded-xl bg-[#CC0000] py-3 text-base font-bold text-white shadow-md shadow-[#CC0000]/20 transition-colors active:bg-[#990000] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {item.saving ? 'กำลังบันทึก...' : 'ยืนยันผลลัพธ์'}
          </button>
        </div>
      )}
    </div>
  );
}

// ==================== รูปพร้อมกรอบ+ชื่อทับใบหน้า (เฉพาะตอนตรวจทาน) ====================
// bbox ที่ backend ส่งมาเป็นพิกเซลของรูปต้นฉบับ — แปลงเป็น % ของขนาดจริง (naturalWidth/Height)
// เพื่อวางกรอบให้ตรงตำแหน่งไม่ว่ารูปจะถูกย่อแสดงผลเล็กแค่ไหนบนจอ (ตรรกะเดียวกับฝั่งคอม)
function PhotoPreviewWithMarks({ file, detections }: { file: File; detections: Detection[] }) {
  const previewUrl = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const marked = detections.filter((d): d is Detection & { bbox: [number, number, number, number] } => !!d.bbox);

  return (
    <div className="relative mt-3 overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
      {/* ⚠️ ห้ามใส่ max-height/object-contain ตรงนี้ — จะเกิดขอบว่าง (letterbox) ทำให้กรอบ %
          เพี้ยนไปจากใบหน้าจริง ต้องปล่อยให้รูปเต็มความกว้างเสมอ (ดูคอมเมนต์เต็มที่ DetectDesktop.tsx) */}
      <img
        src={previewUrl}
        alt=""
        className="block w-full"
        onLoad={(e) => setNaturalSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
      />
      {naturalSize &&
        marked.map((d) => {
          const [bx1, by1, bx2, by2] = d.bbox;
          const padX = (bx2 - bx1) * 0.35;
          const padY = (by2 - by1) * 0.15;
          const x1 = Math.max(0, bx1 - padX);
          const y1 = Math.max(0, by1 - padY);
          const x2 = Math.min(naturalSize.w, bx2 + padX);
          const y2 = Math.min(naturalSize.h, by2 + padY);

          return (
            <div
              key={d.uid}
              className="absolute"
              style={{
                left: `${(x1 / naturalSize.w) * 100}%`,
                top: `${(y1 / naturalSize.h) * 100}%`,
                width: `${((x2 - x1) / naturalSize.w) * 100}%`,
                height: `${((y2 - y1) / naturalSize.h) * 100}%`,
              }}
            >
              <div className="absolute inset-0 rounded-md border-[3px] border-[#CC0000] shadow-[0_0_0_1.5px_rgba(255,255,255,0.85)]" />
              <div className="absolute bottom-0 left-1/2 h-4 w-0.5 -translate-x-1/2 translate-y-full bg-[#CC0000]" />
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[calc(100%+1rem)] whitespace-nowrap rounded-md border-2 border-white bg-[#CC0000] px-2 py-1 text-xs font-black text-white shadow-md">
                {d.predictedNickname ?? 'ไม่ทราบชื่อ'}
              </span>
            </div>
          );
        })}
    </div>
  );
}

// ==================== Detection row ====================
function DetectionRow({
  detection,
  students,
  onConfirm,
  onReassign,
  onRemove,
}: {
  detection: Detection;
  students: DetectStudent[];
  onConfirm: () => void;
  onReassign: (studentId: number) => void;
  onRemove: () => void;
}) {
  const { predictedNickname, confidence, studentId, status, bbox, frameImage } = detection;
  const currentStudent = students.find((s) => s.id === studentId) ?? null;

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border p-3 ${
        status === 'confirmed'
          ? 'border-emerald-200 bg-emerald-50/50'
          : status === 'edited'
          ? 'border-blue-200 bg-blue-50/50'
          : 'border-gray-200 bg-white'
      }`}
    >
      {/* เฟรมวิดีโอที่แมตช์ได้ พร้อมกรอบมาร์กแบบเดียวกับฝั่งรูป — ให้โค้ชเห็นภาพจริงยืนยัน
          แทนที่จะเห็นแค่เปอร์เซ็นต์มั่นใจลอย ๆ */}
      {frameImage && bbox && <VideoFrameMark frameImage={frameImage} bbox={bbox} label={predictedNickname} />}

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white text-gray-400 shadow-sm ring-1 ring-gray-100">
          <UserRound size={20} />
        </div>
        <div className="min-w-0">
          {predictedNickname ? (
            <p className="truncate text-sm font-semibold text-gray-800">
              AI คาดว่าคือ <span className="text-gray-900">{predictedNickname}</span>
            </p>
          ) : (
            <p className="text-sm font-semibold text-gray-800">เพิ่มโดยโค้ช</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {confidence != null && (
              <span
                className={`text-xs font-bold ${
                  confidence >= 80 ? 'text-emerald-600' : confidence >= 60 ? 'text-amber-600' : 'text-rose-500'
                }`}
              >
                ความมั่นใจ {confidence}%
              </span>
            )}
            {status === 'confirmed' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                <BadgeCheck size={11} />
                ยืนยันแล้ว
              </span>
            )}
            {status === 'edited' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                <PencilLine size={11} />
                แก้ไขแล้ว
              </span>
            )}
            {status === 'pending' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                รอตรวจสอบ
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {status !== 'confirmed' && predictedNickname && (
          <button
            type="button"
            onClick={onConfirm}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-bold text-white active:bg-gray-800"
          >
            <BadgeCheck size={14} />
            ถูกต้อง
          </button>
        )}

        <select
          value={currentStudent?.id ?? ''}
          onChange={(e) => onReassign(Number(e.target.value))}
          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-semibold text-gray-600 outline-none focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20"
        >
          <option value="" disabled>
            {predictedNickname ? 'เลือกชื่อใหม่...' : 'เลือกผู้เรียน...'}
          </option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nickname}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onRemove}
          className="flex-shrink-0 rounded-lg p-2 text-gray-400 active:bg-rose-50 active:text-rose-500"
          title="ไม่ใช่ผู้เรียน / ลบรายการนี้"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

// ==================== เฟรมวิดีโอพร้อมกรอบมาร์ก (สำหรับ detection แถวหนึ่งในวิดีโอ) ====================
// bbox ที่ backend ส่งมาสเกลตาม frameImage นี้แล้ว (ไม่ใช่เฟรมต้นฉบับก่อนย่อ) — ตรรกะเดียวกับ
// PhotoPreviewWithMarks ฝั่งรูป แค่ต่อภาพหนึ่งภาพต่อการจับคู่หนึ่งรายการ ไม่ใช่ภาพเดียวใช้ร่วมกัน
function VideoFrameMark({
  frameImage,
  bbox,
  label,
}: {
  frameImage: string;
  bbox: [number, number, number, number];
  label: string | null;
}) {
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [bx1, by1, bx2, by2] = bbox;

  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
      {/* ⚠️ ห้ามใส่ max-height/object-contain — จะเกิด letterbox ทำให้กรอบ % เพี้ยน (เหตุผลเดียวกับ
          PhotoPreviewWithMarks) */}
      {/* eslint-disable-next-line @next/next/no-img-element -- data URI จาก base64 ใช้ next/image ไม่ได้ */}
      <img
        src={`data:image/jpeg;base64,${frameImage}`}
        alt=""
        className="block w-full"
        onLoad={(e) => setNaturalSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
      />
      {naturalSize &&
        (() => {
          const padX = (bx2 - bx1) * 0.35;
          const padY = (by2 - by1) * 0.15;
          const x1 = Math.max(0, bx1 - padX);
          const y1 = Math.max(0, by1 - padY);
          const x2 = Math.min(naturalSize.w, bx2 + padX);
          const y2 = Math.min(naturalSize.h, by2 + padY);

          return (
            <div
              className="absolute"
              style={{
                left: `${(x1 / naturalSize.w) * 100}%`,
                top: `${(y1 / naturalSize.h) * 100}%`,
                width: `${((x2 - x1) / naturalSize.w) * 100}%`,
                height: `${((y2 - y1) / naturalSize.h) * 100}%`,
              }}
            >
              <div className="absolute inset-0 rounded-md border-[3px] border-[#CC0000] shadow-[0_0_0_1.5px_rgba(255,255,255,0.85)]" />
              <div className="absolute bottom-0 left-1/2 h-4 w-0.5 -translate-x-1/2 translate-y-full bg-[#CC0000]" />
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[calc(100%+1rem)] whitespace-nowrap rounded-md border-2 border-white bg-[#CC0000] px-2 py-1 text-xs font-black text-white shadow-md">
                {label ?? 'ไม่ทราบชื่อ'}
              </span>
            </div>
          );
        })()}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
