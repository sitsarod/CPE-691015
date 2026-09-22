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
import {
  DetectManager,
  DetectStudent,
  Detection,
  BatchItem,
  MAX_BATCH_FILES,
  AUTO_CONFIRM_THRESHOLD,
  MAX_VIDEO_DURATION_MINUTES,
} from './useDetect';

export function DetectDesktop({ manager }: { manager: DetectManager }) {
  const {
    inputRef,
    students,
    items,
    dragActive,
    setDragActive,
    analyzingAll,
    savingAll,
    batchError,
    readyToAnalyzeCount,
    pickFiles,
    handleDrop,
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

  // ⚠️ ลูกศรซ้าย/ขวาบนแป้นพิมพ์ตอนนี้ผูกกับการเลื่อน "ระหว่างคนที่ตรวจพบในไฟล์เดียวกัน" แทน
  // (ดู ItemReviewPanel) เพราะละเอียดกว่าและใช้บ่อยกว่าการเลื่อนไฟล์ — เลื่อนไฟล์ยังใช้ปุ่ม ‹ ›
  // กับลากด้วยเมาส์/นิ้วได้เหมือนเดิม แค่ไม่ผูกคีย์บอร์ดซ้ำกันเพื่อกันชนกัน

  // ลากด้วยเมาส์/นิ้วเพื่อเลื่อนรูป — ตามเมาส์แบบ real-time ระหว่างลาก แล้วค่อยตัดสินว่าจะ
  // เปลี่ยนรูปหรือเด้งกลับตอนปล่อย (เกินสัดส่วนที่กำหนดของความกว้างการ์ดถึงจะเปลี่ยนรูป)
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStartXRef = useRef(0);
  const [isSlideDragging, setIsSlideDragging] = useState(false);
  const [slideDragOffset, setSlideDragOffset] = useState(0);

  const handleSlidePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (analyzedItems.length <= 1) return;
    // ไม่แย่งลากถ้ากดโดนปุ่ม/dropdown/ลิงก์ ให้มันทำงานปกติของมันไป
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
    const threshold = width * 0.15; // ลากผ่าน 15% ของความกว้างการ์ดถึงจะเปลี่ยนรูป
    if (slideDragOffset < -threshold) goNext();
    else if (slideDragOffset > threshold) goPrev();
    setSlideDragOffset(0);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-[#CC0000]">
        </div>
        <h1 className="mt-2.5 text-3xl font-black tracking-tight text-gray-900 md:text-4xl">
          จำแนกผู้เรียน
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          อัปโหลดภาพหรือวิดีโอ (สูงสุด {MAX_BATCH_FILES} ไฟล์ต่อครั้ง) แล้วให้ AI ช่วยจำแนกว่ามีผู้เรียนคนไหนอยู่ในสื่อนี้บ้าง
        </p>
        <div className="mt-6 h-px bg-gray-200" />
      </div>

      {batchError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{batchError}</div>
      )}

      {/* Upload card */}
      <div className="rounded-2xl border-2 border-[#CC0000]/80 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900">จำแนกผู้เรียนอัตโนมัติด้วย AI</h2>
        <p className="mt-1 text-sm text-gray-500">
          รองรับทั้งภาพนิ่งและวิดีโอ — AI จะตรวจจับใบหน้าและจับคู่กับรายชื่อผู้เรียนให้อัตโนมัติ
        </p>

        {/* Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`mt-5 flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-4 transition-colors ${
            dragActive
              ? 'border-[#CC0000] bg-[#FFF0F0]'
              : 'border-gray-300 bg-gray-50/60 hover:border-gray-400 hover:bg-gray-50'
          }`}
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
            <Video size={22} />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-600">
              <span className="text-[#CC0000]">คลิกเพื่อเลือกไฟล์</span> หรือลากรูปภาพ/วิดีโอมาวางที่นี่ (เลือกหลายไฟล์ได้)
            </p>
            <p className="mt-1 text-xs text-gray-400">รองรับ JPG, PNG, MP4, MOV, WEBM — สูงสุด {MAX_BATCH_FILES} ไฟล์</p>
            <p className="mt-0.5 text-xs text-gray-400">
              วิดีโอที่ยาวเกิน {MAX_VIDEO_DURATION_MINUTES} นาที ยังอัปโหลดได้ปกติ แต่ AI จะไม่จำแนกให้ — ต้องแท็กเอง
            </p>
          </div>
        </div>

        {/* รายการไฟล์ที่เลือกไว้ */}
        {items.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-500">เลือกไว้ {items.length}/{MAX_BATCH_FILES} ไฟล์</p>
              <button type="button" onClick={clearAll} className="text-xs font-semibold text-gray-400 hover:text-[#CC0000]">
                ล้างทั้งหมด
              </button>
            </div>
            {items.map((item) => (
              <div
                key={item.uid}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5"
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
                    className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={analyzeAll}
            disabled={readyToAnalyzeCount === 0 || analyzingAll}
            className="flex items-center gap-2 rounded-xl bg-[#CC0000] px-6 py-2.5 font-bold text-white shadow-md shadow-[#CC0000]/20 transition-colors hover:bg-[#990000] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {analyzingAll ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {analyzingAll ? 'กำลังวิเคราะห์...' : `วิเคราะห์ทั้งหมด${readyToAnalyzeCount > 0 ? ` (${readyToAnalyzeCount} ไฟล์)` : ''}`}
          </button>
        </div>
      </div>

      {/* ผลการจำแนกของแต่ละไฟล์ — เลื่อนดูทีละรูป + ยืนยัน/บันทึกทั้งชุดในคลิกเดียว */}
      {analyzedItems.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goPrev}
                disabled={activeIndex === 0}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:border-[#CC0000] hover:text-[#CC0000] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="min-w-[72px] text-center text-sm font-bold text-gray-600">
                รูปที่ {activeIndex + 1} / {analyzedItems.length}
              </span>
              <button
                type="button"
                onClick={goNext}
                disabled={activeIndex === analyzedItems.length - 1}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:border-[#CC0000] hover:text-[#CC0000] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* ยืนยันรายการที่ยังค้าง "รอตรวจสอบ" ของทุกไฟล์ในชุด แล้วบันทึกให้ทีเดียวจบ */}
            <button
              type="button"
              onClick={confirmAndSaveAll}
              disabled={savingAll}
              className="flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingAll ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {savingAll ? 'กำลังยืนยัน+บันทึก...' : `ยืนยัน + บันทึกทั้งหมด (${analyzedItems.length} ไฟล์)`}
            </button>
          </div>

          <div ref={viewportRef} className="overflow-hidden">
            <div
              className={`flex cursor-grab touch-pan-y select-none active:cursor-grabbing ${
                isSlideDragging ? '' : 'transition-transform duration-300 ease-out'
              }`}
              style={{ transform: `translateX(calc(-${activeIndex * 100}% + ${slideDragOffset}px))` }}
              onPointerDown={handleSlidePointerDown}
              onPointerMove={handleSlidePointerMove}
              onPointerUp={endSlideDrag}
              onPointerLeave={endSlideDrag}
              onPointerCancel={endSlideDrag}
            >
              {analyzedItems.map((item, i) => (
                <div key={item.uid} className="w-full flex-shrink-0">
                  <ItemReviewPanel
                    item={item}
                    students={students}
                    isActive={i === activeIndex}
                    onConfirm={(detectionUid) => confirmDetection(item.uid, detectionUid)}
                    onConfirmAllPending={() => confirmAllPending(item.uid)}
                    onReassign={(detectionUid, studentId) => reassignDetection(item.uid, detectionUid, studentId)}
                    onRemove={(detectionUid) => removeDetection(item.uid, detectionUid)}
                    onAddMissed={() => addMissedStudent(item.uid)}
                    onSave={() => saveItem(item.uid)}
                    allReviewed={isItemReviewed(item)}
                    onGoPrevFile={goPrev}
                    onGoNextFile={goNext}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {analyzedItems.length === 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-5 text-sm text-gray-500">
          <UploadCloud size={18} className="mt-0.5 flex-shrink-0 text-gray-400" />
          <p>
            หลังวิเคราะห์เสร็จ ระบบจะแสดงรายชื่อผู้เรียนที่ตรวจพบให้ตรวจทานทีละคน หากมีคนอื่นที่ AI มองข้าม
            หรือจำแนกผิด สามารถแก้ไข/เพิ่มเองได้ก่อนยืนยันผลลัพธ์ (เลื่อนดูได้ทีละรูป ยืนยันทีละไฟล์หรือทั้งชุดพร้อมกันก็ได้)
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
  isActive,
  onConfirm,
  onConfirmAllPending,
  onReassign,
  onRemove,
  onAddMissed,
  onSave,
  allReviewed,
  onGoPrevFile,
  onGoNextFile,
}: {
  item: BatchItem;
  students: DetectStudent[];
  // true เฉพาะไฟล์ที่กำลังโชว์อยู่บนสไลด์ตอนนี้ — กันไม่ให้ลูกศรคีย์บอร์ดของไฟล์ที่ซ่อนอยู่
  // (ทุกไฟล์ mount ค้างไว้หมดในสไลด์ ไม่ได้ unmount ตอนเลื่อนผ่าน) ทำงานพร้อมกันหมดทุกไฟล์
  isActive: boolean;
  onConfirm: (detectionUid: string) => void;
  onConfirmAllPending: () => void;
  onReassign: (detectionUid: string, studentId: number) => void;
  onRemove: (detectionUid: string) => void;
  onAddMissed: () => void;
  onSave: () => void;
  allReviewed: boolean;
  // เลื่อนไฟล์ (สไลด์นอกสุด) ด้วยลูกศรเดียวกัน เฉพาะตอนไม่มีคนให้เลื่อนดูในไฟล์นี้แล้ว (≤1 คน)
  // กันไม่ให้ลูกศรทำสองอย่างพร้อมกัน — มีคนให้เลื่อนก็เลื่อนคนก่อนเสมอ ไม่มีคนแล้วค่อยเลื่อนไฟล์แทน
  onGoPrevFile: () => void;
  onGoNextFile: () => void;
}) {
  const detections = item.detections ?? [];
  const pendingCount = detections.filter((d) => d.status === 'pending').length;

  // เลื่อนดูทีละคนที่ตรวจพบ (เหมือนสไลด์เลื่อนไฟล์ด้านนอก แต่ระดับ "คนในไฟล์เดียวกัน")
  const [activeDetectionIndex, setActiveDetectionIndex] = useState(0);
  useEffect(() => {
    setActiveDetectionIndex((i) => Math.min(i, Math.max(0, detections.length - 1)));
  }, [detections.length]);

  const goPrevDetection = () => setActiveDetectionIndex((i) => Math.max(0, i - 1));
  const goNextDetection = () => setActiveDetectionIndex((i) => Math.min(detections.length - 1, i + 1));

  // ลูกศรซ้าย/ขวาผูกกับ "คนในไฟล์นี้" เป็นหลัก — ถ้าไฟล์นี้เหลือคนเดียวหรือไม่มีคนให้เลื่อนแล้ว
  // (ไม่มีอะไรให้ลูกศรทำในระดับนี้) ถือว่าลูกศรว่าง เลยยกให้ไปเลื่อน "ไฟล์" แทน กันปุ่มเดียวกันไม่ทำอะไรเลย
  // ทำงานเฉพาะไฟล์ที่กำลังแอคทีฟอยู่เท่านั้น
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (detections.length > 1) {
        if (e.key === 'ArrowLeft') goPrevDetection();
        else goNextDetection();
      } else {
        if (e.key === 'ArrowLeft') onGoPrevFile();
        else onGoNextFile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, detections.length, onGoPrevFile, onGoNextFile]);

  // เพิ่มคนที่ตกหล่นแล้วเลื่อนไปโชว์รายการที่เพิ่งเพิ่มทันที (ต่อท้ายลิสต์เสมอ)
  const handleAddMissed = () => {
    onAddMissed();
    setActiveDetectionIndex(detections.length);
  };

  const activeDetection: Detection | null = detections[activeDetectionIndex] ?? null;

  // ลากด้วยเมาส์/นิ้วเพื่อเลื่อนดูคนถัดไป (โดยเฉพาะเฟรมวิดีโอที่แคปมาโชว์) เหมือนสไลด์เลื่อนไฟล์
  // ด้านนอกทุกอย่าง แค่ทำงานแค่ "ระดับคน" เท่านั้น — ต้อง stopPropagation ตอนกดลงไป กันไม่ให้สไลด์ไฟล์
  // ด้านนอกแย่งลากไปพร้อมกัน (ไม่งั้นจะเลื่อนทั้งไฟล์และคนพร้อมกันในลากเดียว)
  const detectionViewportRef = useRef<HTMLDivElement>(null);
  const detectionDragStartXRef = useRef(0);
  const [isDetectionDragging, setIsDetectionDragging] = useState(false);
  const [detectionDragOffset, setDetectionDragOffset] = useState(0);

  const handleDetectionPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (detections.length <= 1) return;
    if ((e.target as HTMLElement).closest('button, select, input, a, textarea')) return;
    e.stopPropagation();
    setIsDetectionDragging(true);
    detectionDragStartXRef.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleDetectionPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDetectionDragging) return;
    setDetectionDragOffset(e.clientX - detectionDragStartXRef.current);
  };

  const endDetectionDrag = () => {
    if (!isDetectionDragging) return;
    setIsDetectionDragging(false);
    const width = detectionViewportRef.current?.offsetWidth || 1;
    const threshold = width * 0.15;
    if (detectionDragOffset < -threshold) goNextDetection();
    else if (detectionDragOffset > threshold) goPrevDetection();
    setDetectionDragOffset(0);
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">ผลการจำแนก — {item.file.name}</h2>
          <p className="mt-1 text-sm text-gray-500">
            คนที่ AI มั่นใจสูง (≥{AUTO_CONFIRM_THRESHOLD}%) ยืนยันให้อัตโนมัติแล้ว ที่เหลือกด &quot;ถูกต้อง&quot;
            เพื่อยืนยัน หรือเลือกชื่อใหม่ถ้า AI จำแนกผิด
          </p>
          {/* บอกให้รู้ว่ามีหน้าที่ระบบเห็นแต่จับคู่ไม่ได้ จะได้ไม่เข้าใจผิดว่าเจอครบแล้ว
              (วิดีโอนับใบหน้าซ้ำได้ถ้าคนเดิมโผล่หลายเฟรมที่สุ่มตรวจ ไม่ใช่จำนวนคนจริงเป๊ะ) */}
          {item.faceCount > detections.length && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-600">
              <CircleAlert size={13} />
              เจอ {item.faceCount} ใบหน้า{item.isVideo ? '' : 'ในรูป'} แต่จับคู่กับผู้เรียนได้ {detections.length} คน —
              ที่เหลือต้องเพิ่มเองด้านล่าง (อาจเป็นคนที่ยังไม่ได้ลงทะเบียนใบหน้า หรือไม่ได้อยู่ในคอร์สนี้)
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500">
            {detections.filter((d) => d.status !== 'pending').length}/{detections.length} ตรวจแล้ว
          </span>
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={onConfirmAllPending}
              className="whitespace-nowrap rounded-full bg-gray-900 px-3 py-1 text-xs font-bold text-white hover:bg-gray-800"
            >
              ยืนยันทั้งหมด ({pendingCount})
            </button>
          )}
        </div>
      </div>

      {item.error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{item.error}</div>
      )}

      {/* รูปที่อัปโหลดพร้อมกรอบ+ชื่อทับใบหน้าที่ตรวจพบ — ไว้ตรวจทานเท่านั้น ตัวไฟล์จริงไม่ถูกแก้ */}
      {!item.isVideo && (
        <PhotoPreviewWithMarks file={item.file} detections={detections} activeDetectionUid={activeDetection?.uid ?? null} />
      )}

      {detections.length > 0 && (
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={goPrevDetection}
              disabled={activeDetectionIndex === 0}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:border-[#CC0000] hover:text-[#CC0000] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[64px] text-center text-xs font-bold text-gray-500">
              คนที่ {activeDetectionIndex + 1} / {detections.length}
            </span>
            <button
              type="button"
              onClick={goNextDetection}
              disabled={activeDetectionIndex === detections.length - 1}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:border-[#CC0000] hover:text-[#CC0000] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div ref={detectionViewportRef} className="overflow-hidden">
            <div
              className={`flex cursor-grab touch-pan-y select-none active:cursor-grabbing ${
                isDetectionDragging ? '' : 'transition-transform duration-300 ease-out'
              }`}
              style={{ transform: `translateX(calc(-${activeDetectionIndex * 100}% + ${detectionDragOffset}px))` }}
              onPointerDown={handleDetectionPointerDown}
              onPointerMove={handleDetectionPointerMove}
              onPointerUp={endDetectionDrag}
              onPointerLeave={endDetectionDrag}
              onPointerCancel={endDetectionDrag}
            >
              {detections.map((d) => (
                <div key={d.uid} className="w-full flex-shrink-0">
                  <DetectionRow
                    detection={d}
                    students={students}
                    onConfirm={() => onConfirm(d.uid)}
                    onReassign={(studentId) => onReassign(d.uid, studentId)}
                    onRemove={() => onRemove(d.uid)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* เพิ่มผู้เรียนที่ตกหล่น */}
      <button
        type="button"
        onClick={handleAddMissed}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-3 text-sm font-semibold text-gray-500 transition-colors hover:border-[#CC0000]/40 hover:text-[#CC0000]"
      >
        <Plus size={16} />
        เพิ่มผู้เรียนที่ระบบตกหล่น
      </button>

      {item.savedAt ? (
        <div className="mt-5 flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-600">
            <CheckCircle2 size={16} />
            บันทึกผลการจำแนกเรียบร้อยแล้ว พร้อมนำไปประเมินผู้เรียนต่อได้
          </div>
          {item.skippedCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700">
              <CircleAlert size={14} />
              ข้าม {item.skippedCount} คน เพราะยังไม่ได้ยินยอมเก็บข้อมูลใบหน้า
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
          {!allReviewed && (
            <span className="mr-auto flex items-center gap-1.5 text-xs font-medium text-amber-600">
              <CircleAlert size={14} />
              ยังมีรายการที่ยังไม่ได้ตรวจทาน
            </span>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={!allReviewed || item.saving}
            className="rounded-xl bg-[#CC0000] px-6 py-2.5 font-bold text-white shadow-md shadow-[#CC0000]/20 transition-colors hover:bg-[#990000] disabled:cursor-not-allowed disabled:opacity-50"
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
// เพื่อวางกรอบให้ตรงตำแหน่งไม่ว่ารูปจะถูกย่อแสดงผลเล็กแค่ไหนบนจอ
//
// ไฮไลต์เฉพาะคนที่กำลังตรวจทานอยู่ตอนนี้ (activeDetectionUid) ด้วยกรอบแดง+ชื่อเต็ม ส่วนคนอื่นที่
// เจอในรูปเดียวกันแสดงแค่กรอบจางๆ ไว้ให้เห็นว่ายังมีคนอื่นอยู่ ไม่แย่งความสนใจจากคนที่กำลังโฟกัส —
// ให้ประสบการณ์ตรงกับฝั่งวิดีโอที่โฟกัสทีละคนต่อการ์ดด้านล่างเหมือนกัน
function PhotoPreviewWithMarks({
  file,
  detections,
  activeDetectionUid,
}: {
  file: File;
  detections: Detection[];
  activeDetectionUid: string | null;
}) {
  const previewUrl = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const marked = detections.filter((d): d is Detection & { bbox: [number, number, number, number] } => !!d.bbox);

  return (
    <div className="relative mt-4 overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
      {/* ⚠️ ห้ามใส่ max-height/object-contain ตรงนี้ — ถ้ากล่องรูปเล็กกว่ารูปจริงจะเกิดขอบว่าง
          (letterbox) ทำให้กรอบ % เพี้ยนไปจากใบหน้าจริง ต้องปล่อยให้รูปเต็มความกว้างเสมอ
          เพื่อให้กล่องที่ห่อรูปมีขนาดเท่ารูปที่แสดงผลจริงพอดี ตำแหน่ง % จะได้ตรงเป๊ะ */}
      <img
        src={previewUrl}
        alt=""
        draggable={false}
        className="block w-full select-none"
        onLoad={(e) => setNaturalSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
      />
      {naturalSize &&
        marked.map((d) => {
          // bbox จาก face-service แนบไปกับใบหน้าเป๊ะ (คิ้วถึงคาง) ขยายออกอีกหน่อยให้วงคลุม
          // ทั้งหน้ารวมผมด้วย ไม่งั้นวงจะรัดแน่นจนดูเหมือนเล็งผิดตำแหน่ง
          const [bx1, by1, bx2, by2] = d.bbox;
          const padX = (bx2 - bx1) * 0.35;
          const padY = (by2 - by1) * 0.15;
          const x1 = Math.max(0, bx1 - padX);
          const y1 = Math.max(0, by1 - padY);
          const x2 = Math.min(naturalSize.w, bx2 + padX);
          const y2 = Math.min(naturalSize.h, by2 + padY);
          const isActive = d.uid === activeDetectionUid;
          // ไม่ทราบชื่อ (จับคู่กับใครในรายชื่อไม่ได้) = กรอบสีเทาแทนแดง ให้ต่างจากคนที่มีในฐานข้อมูล
          // ชัดเจนตั้งแต่มองภาพเดียว — โค้ชจะได้รู้ทันทีว่าอันไหนต้องระบุเอง อันไหนระบบยืนยันให้แล้ว
          // (จะระบุเองหรือปล่อยผ่านก็ได้ ไม่บังคับ ดู isSkippableUnmatched)
          const isUnmatched = !d.predictedNickname;
          const label = d.predictedNickname ?? 'ไม่ทราบชื่อ';
          const confidenceLabel = d.confidence != null ? `${label} ${d.confidence}%` : label;
          const markColorClass = isUnmatched ? 'border-gray-400' : 'border-[#CC0000]';
          const solidColorClass = isUnmatched ? 'bg-gray-500' : 'bg-[#CC0000]';

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
              {/* โชว์กรอบ+ชื่อ+% ของทุกคนพร้อมกันเสมอ ไม่ใช่แค่คนที่กำลังโฟกัสในการ์ดด้านล่าง —
                  คนที่กำลังโฟกัสอยู่แค่กรอบหนาขึ้นนิดหน่อยให้เห็นว่าตรงกับการ์ดไหน ไม่ใช่ซ่อนคนอื่น */}
              <div
                className={`absolute inset-0 rounded-md shadow-[0_0_0_1.5px_rgba(255,255,255,0.85)] ${markColorClass} ${
                  isActive ? 'border-[3px]' : 'border-2'
                }`}
              />
              {/* ป้ายชื่อไว้ด้านล่างกรอบแทนด้านบน — กันชนขอบบนของรูปเวลาใบหน้าอยู่ริมภาพ */}
              <div className={`absolute bottom-0 left-1/2 h-4 w-0.5 -translate-x-1/2 translate-y-full ${solidColorClass}`} />
              <span
                className={`absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[calc(100%+1rem)] whitespace-nowrap rounded-md border-2 border-white px-2.5 py-1 text-sm font-black text-white shadow-md ${solidColorClass}`}
              >
                {confidenceLabel}
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
      className={`flex flex-col gap-3 rounded-xl border p-4 ${
        status === 'confirmed'
          ? 'border-emerald-200 bg-emerald-50/50'
          : status === 'edited'
          ? 'border-blue-200 bg-blue-50/50'
          : 'border-gray-200 bg-white'
      }`}
    >
      {/* เฟรมวิดีโอที่แมตช์ได้ พร้อมกรอบมาร์กแบบเดียวกับฝั่งรูป — ให้โค้ชเห็นภาพจริงยืนยัน
          แทนที่จะเห็นแค่เปอร์เซ็นต์มั่นใจลอย ๆ (bbox เป็น null ได้ถ้าไม่เจอใบหน้าเลยสักหน้าเดียว —
          VideoFrameMark จะโชว์แค่เฟรมตัวแทนเฉย ๆ ไม่มีกรอบ ดูคอมเมนต์ในนั้น) */}
      {frameImage && (
        <VideoFrameMark frameImage={frameImage} bbox={bbox} label={predictedNickname} confidence={confidence} />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white text-gray-400 shadow-sm ring-1 ring-gray-100">
            <UserRound size={22} />
          </div>
          <div>
            {predictedNickname ? (
              <p className="text-sm font-semibold text-gray-800">
                AI คาดว่าคือ <span className="text-gray-900">{predictedNickname}</span>
              </p>
            ) : bbox ? (
              // AI เจอหน้าคนชัดพอ แต่จับคู่กับรายชื่อไม่ได้เลย (ต่างจาก "เพิ่มโดยโค้ช" ที่ไม่มี
              // ภาพ/กรอบอ้างอิงเลย) — ยังโชว์ภาพที่เจอไว้ให้เลือกชื่อเอง ไม่ใช่มโนเพิ่มเอง
              <p className="text-sm font-semibold text-gray-800">AI ตรวจพบคน แต่จับคู่ไม่ได้ — เลือกชื่อเอง</p>
            ) : frameImage ? (
              // ไม่เจอใบหน้าเลยสักหน้าเดียวในทั้งคลิป (ต่างจากข้างบนที่เจอแต่จับคู่ไม่ได้) — มีแค่
              // เฟรมตัวแทนจากคลิปให้ดูเป็นหลักฐาน ไม่มีกรอบเพราะไม่เจอตำแหน่งใบหน้าเลย
              // (ดู FaceTaggingService.DetectStudentsInVideo)
              <p className="text-sm font-semibold text-gray-800">AI ไม่พบใบหน้าในคลิปนี้เลย — ดูภาพแล้วระบุคนเอง</p>
            ) : (
              <p className="text-sm font-semibold text-gray-800">เพิ่มโดยโค้ช</p>
            )}
            <div className="mt-1 flex items-center gap-2">
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

        <div className="flex items-center gap-2 sm:flex-shrink-0">
          {status !== 'confirmed' && predictedNickname && (
            <button
              type="button"
              onClick={onConfirm}
              className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-bold text-white hover:bg-gray-800"
            >
              <BadgeCheck size={14} />
              ถูกต้อง
            </button>
          )}

          <select
            value={currentStudent?.id ?? ''}
            onChange={(e) => onReassign(Number(e.target.value))}
            className="rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-semibold text-gray-600 outline-none focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20"
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
            className="rounded-lg p-2 text-gray-400 hover:bg-rose-50 hover:text-rose-500"
            title="ไม่ใช่ผู้เรียน / ลบรายการนี้"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== เฟรมวิดีโอพร้อมกรอบมาร์ก (สำหรับ detection แถวหนึ่งในวิดีโอ) ====================
// ต่างจาก PhotoPreviewWithMarks ตรงที่ภาพนี้เป็นของ "การจับคู่หนึ่งรายการ" ไม่ใช่ภาพเดียวที่ใช้ร่วมกัน
// ทั้งไฟล์ — เพราะแต่ละคนที่ตรวจพบในวิดีโออาจมาจากคนละเฟรมกัน bbox ที่ backend ส่งมาสเกลตาม
// frameImage นี้แล้ว (ไม่ใช่เฟรมต้นฉบับก่อนย่อ) จึงคำนวณตำแหน่ง % แบบเดียวกับฝั่งรูปได้ตรงเป๊ะ
function VideoFrameMark({
  frameImage,
  bbox,
  label,
  confidence,
}: {
  frameImage: string;
  bbox: [number, number, number, number] | null;
  label: string | null;
  confidence?: number | null;
}) {
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

  // ไม่เจอใบหน้าเลยสักหน้าเดียวในทั้งคลิป (ดู FaceTaggingService.DetectStudentsInVideo) — ไม่มี
  // ตำแหน่งให้วาดกรอบเลย โชว์ได้แค่เฟรมตัวแทนเฉย ๆ พร้อมคำอธิบายว่าทำไมไม่มีกรอบ กันโค้ชสับสนว่า
  // ทำไมภาพนี้ถึงต่างจากการ์ดอื่นที่มีกรอบแดง/เทา
  if (!bbox) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URI จาก base64 ใช้ next/image ไม่ได้ */}
        <img src={`data:image/jpeg;base64,${frameImage}`} alt="" draggable={false} className="block w-full select-none" />
        <div className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-2 text-center text-xs font-semibold text-white">
          AI ไม่พบใบหน้าในคลิปนี้เลย — นี่คือภาพตัวอย่างจากคลิป
        </div>
      </div>
    );
  }

  const [bx1, by1, bx2, by2] = bbox;
  // ไม่ทราบชื่อ = กรอบสีเทาแทนแดง ให้ตรงกับฝั่งรูป (ดูคอมเมนต์ isUnmatched ใน PhotoPreviewWithMarks)
  const isUnmatched = !label;
  const displayLabel = label ?? 'ไม่ทราบชื่อ';
  const confidenceLabel = confidence != null ? `${displayLabel} ${confidence}%` : displayLabel;
  const markColorClass = isUnmatched ? 'border-gray-400' : 'border-[#CC0000]';
  const solidColorClass = isUnmatched ? 'bg-gray-500' : 'bg-[#CC0000]';

  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
      {/* ⚠️ ห้ามใส่ max-height/object-contain ตรงนี้ — จะเกิดขอบว่าง (letterbox) ทำให้กรอบ %
          เพี้ยนไปจากใบหน้าจริง เหตุผลเดียวกับ PhotoPreviewWithMarks */}
      {/* eslint-disable-next-line @next/next/no-img-element -- data URI จาก base64 ใช้ next/image ไม่ได้ */}
      <img
        src={`data:image/jpeg;base64,${frameImage}`}
        alt=""
        draggable={false}
        className="block w-full select-none"
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
              <div className={`absolute inset-0 rounded-md border-[3px] shadow-[0_0_0_1.5px_rgba(255,255,255,0.85)] ${markColorClass}`} />
              <div className={`absolute bottom-0 left-1/2 h-4 w-0.5 -translate-x-1/2 translate-y-full ${solidColorClass}`} />
              <span
                className={`absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[calc(100%+1rem)] whitespace-nowrap rounded-md border-2 border-white px-2.5 py-1 text-sm font-black text-white shadow-md ${solidColorClass}`}
              >
                {confidenceLabel}
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
