import React from 'react';
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
} from 'lucide-react';
import { DetectManager, DetectStudent, Detection, BatchItem, MAX_BATCH_FILES, AUTO_CONFIRM_THRESHOLD } from './useDetect';

export function DetectDesktop({ manager }: { manager: DetectManager }) {
  const {
    inputRef,
    courses,
    coursesLoading,
    selectedCourseId,
    setSelectedCourseId,
    students,
    items,
    dragActive,
    setDragActive,
    analyzingAll,
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
    isItemReviewed,
  } = manager;

  return (
    <div className="mx-auto max-w-7xl space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-[#CC0000]">
          <span className="h-px w-7 bg-[#CC0000]" />
          <span className="text-xs font-black uppercase tracking-[0.25em]">AI Classification</span>
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

        {/* เลือกคอร์สก่อนเสมอ — ทุกไฟล์ในชุดเดียวกันผูกกับคอร์สเดียวกัน กันรายชื่อทุกคอร์สปนกันตอนแท็ก */}
        <div className="mt-5">
          <label className="mb-1 block text-sm font-bold text-gray-700">คอร์ส</label>
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value ? Number(e.target.value) : '')}
            disabled={coursesLoading}
            className="w-full max-w-md rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20 disabled:cursor-not-allowed disabled:opacity-50"
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
            disabled={readyToAnalyzeCount === 0 || analyzingAll || selectedCourseId === ''}
            className="flex items-center gap-2 rounded-xl bg-[#CC0000] px-6 py-2.5 font-bold text-white shadow-md shadow-[#CC0000]/20 transition-colors hover:bg-[#990000] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {analyzingAll ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {analyzingAll ? 'กำลังวิเคราะห์...' : `วิเคราะห์ทั้งหมด${readyToAnalyzeCount > 0 ? ` (${readyToAnalyzeCount} ไฟล์)` : ''}`}
          </button>
        </div>
      </div>

      {/* ผลการจำแนกของแต่ละไฟล์ */}
      {items.map(
        (item) =>
          item.detections !== null && (
            <ItemReviewPanel
              key={item.uid}
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
          )
      )}

      {items.every((item) => item.detections === null) && (
        <div className="flex items-start gap-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-5 text-sm text-gray-500">
          <UploadCloud size={18} className="mt-0.5 flex-shrink-0 text-gray-400" />
          <p>
            หลังวิเคราะห์เสร็จ ระบบจะแสดงรายชื่อผู้เรียนที่ตรวจพบให้ตรวจทานทีละคน หากมีคนอื่นที่ AI มองข้าม
            หรือจำแนกผิด สามารถแก้ไข/เพิ่มเองได้ก่อนยืนยันผลลัพธ์ (แต่ละไฟล์ยืนยันแยกกัน)
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
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">ผลการจำแนก — {item.file.name}</h2>
          <p className="mt-1 text-sm text-gray-500">
            คนที่ AI มั่นใจสูง (≥{AUTO_CONFIRM_THRESHOLD}%) ยืนยันให้อัตโนมัติแล้ว ที่เหลือกด &quot;ถูกต้อง&quot;
            เพื่อยืนยัน หรือเลือกชื่อใหม่ถ้า AI จำแนกผิด
          </p>
          {/* บอกให้รู้ว่ามีหน้าที่ระบบเห็นแต่จับคู่ไม่ได้ จะได้ไม่เข้าใจผิดว่าเจอครบแล้ว */}
          {item.faceCount > detections.length && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-600">
              <CircleAlert size={13} />
              เจอ {item.faceCount} ใบหน้าในรูป แต่จับคู่กับผู้เรียนได้ {detections.length} คน —
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

      <div className="mt-5 flex flex-col gap-3">
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
  const { predictedNickname, confidence, studentId, status } = detection;
  const currentStudent = students.find((s) => s.id === studentId) ?? null;

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
        status === 'confirmed'
          ? 'border-emerald-200 bg-emerald-50/50'
          : status === 'edited'
          ? 'border-blue-200 bg-blue-50/50'
          : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white text-gray-400 shadow-sm ring-1 ring-gray-100">
          <UserRound size={22} />
        </div>
        <div>
          {predictedNickname ? (
            <p className="text-sm font-semibold text-gray-800">
              AI คาดว่าคือ <span className="text-gray-900">{predictedNickname}</span>
            </p>
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
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
