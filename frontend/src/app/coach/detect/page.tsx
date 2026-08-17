'use client';

import React, { useRef, useState } from 'react';
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
import { MOCK_STUDENTS } from '../_mock/students';

// หน้า "จำแนกผู้เรียน" ฝั่งโค้ช — โยนภาพ/รูป/วิดีโอให้ AI ช่วยจำแนกว่ามีผู้เรียนคนไหนอยู่ในสื่อบ้าง
// โค้ชตรวจทานผลแล้วกดยืนยันความถูกต้องทีละรายการ ถ้า AI จำแนกผิดหรือมีคนอื่นอีก
// ก็แก้ไข/เพิ่มได้เอง โดยเลือกจากรายชื่อเล่นของผู้เรียน
//
// หมายเหตุ: หน้านี้เป็น UI/UX เท่านั้น ผลการจำแนกเป็นข้อมูลตัวอย่าง ยังไม่เชื่อมต่อ API จริง
type DetectionStatus = 'pending' | 'confirmed' | 'edited';

interface Detection {
  uid: string;
  predictedNickname: string | null; // ชื่อที่ AI คาดเดา (null = โค้ชเพิ่มเองภายหลัง)
  confidence: number | null; // ความมั่นใจของ AI (%) — null ถ้าเพิ่มเอง
  studentId: number | ''; // ผู้เรียนที่ผูกไว้ตอนนี้ (หลังยืนยัน/แก้ไข)
  status: DetectionStatus;
}

let uidCounter = 0;
const nextUid = () => `d-${++uidCounter}`;

// สุ่มผลลัพธ์การจำแนกจำลอง — ของจริงจะมาจาก API วิเคราะห์ภาพ/วิดีโอ
function mockDetect(): Detection[] {
  const picks = [MOCK_STUDENTS[0], MOCK_STUDENTS[2], MOCK_STUDENTS[3]];
  const confidences = [96, 58, 84];
  return picks.map((s, i) => ({
    uid: nextUid(),
    predictedNickname: s.nickname,
    confidence: confidences[i],
    studentId: s.id,
    status: 'pending' as DetectionStatus,
  }));
}

export default function CoachDetectPage() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [detections, setDetections] = useState<Detection[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const isVideo = file?.type.startsWith('video/');

  const pickFile = (f: File | null) => {
    setDetections(null);
    setSavedAt(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (!f.type.startsWith('video/') && !f.type.startsWith('image/')) {
      alert('กรุณาเลือกไฟล์รูปภาพหรือวิดีโอเท่านั้น');
      return;
    }
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    pickFile(e.dataTransfer.files?.[0] ?? null);
  };

  const handleAnalyze = () => {
    if (!file || analyzing) return;
    setAnalyzing(true);
    setDetections(null);
    setSavedAt(null);
    // จำลองการวิเคราะห์ฝั่งไคลเอนต์ — ของจริงจะยิงไปยัง API จำแนกผู้เรียนภายหลัง
    setTimeout(() => {
      setAnalyzing(false);
      setDetections(mockDetect());
    }, 1800);
  };

  const clearFile = () => {
    setFile(null);
    setDetections(null);
    setSavedAt(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const confirmDetection = (uid: string) => {
    setDetections((prev) =>
      prev ? prev.map((d) => (d.uid === uid ? { ...d, status: 'confirmed' } : d)) : prev
    );
  };

  const reassignDetection = (uid: string, studentId: number) => {
    setDetections((prev) =>
      prev ? prev.map((d) => (d.uid === uid ? { ...d, studentId, status: 'edited' } : d)) : prev
    );
  };

  const removeDetection = (uid: string) => {
    setDetections((prev) => (prev ? prev.filter((d) => d.uid !== uid) : prev));
  };

  const addMissedStudent = () => {
    setDetections((prev) => [
      ...(prev ?? []),
      { uid: nextUid(), predictedNickname: null, confidence: null, studentId: '', status: 'pending' },
    ]);
  };

  const allReviewed = !!detections && detections.length > 0 && detections.every((d) => d.status !== 'pending');

  const handleConfirmAll = () => {
    if (!allReviewed || saving) return;
    setSaving(true);
    // จำลองการบันทึกผลการจำแนก — ของจริงจะยิงไปยัง API ภายหลัง
    setTimeout(() => {
      setSaving(false);
      setSavedAt(Date.now());
    }, 900);
  };

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
          อัปโหลดภาพหรือวิดีโอ แล้วให้ AI ช่วยจำแนกว่ามีผู้เรียนคนไหนอยู่ในสื่อนี้บ้าง
        </p>
        <div className="mt-6 h-px bg-gray-200" />
      </div>

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
          className={`mt-5 flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors ${
            dragActive
              ? 'border-[#CC0000] bg-[#FFF0F0]'
              : 'border-gray-300 bg-gray-50/60 hover:border-gray-400 hover:bg-gray-50'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />

          {!file ? (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-gray-400 shadow-sm">
                <Video size={26} />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-600">
                  <span className="text-[#CC0000]">คลิกเพื่อเลือกไฟล์</span> หรือลากรูปภาพ/วิดีโอมาวางที่นี่
                </p>
                <p className="mt-1 text-xs text-gray-400">รองรับ JPG, PNG, MP4, MOV, WEBM</p>
              </div>
            </>
          ) : (
            <div
              className="flex w-full max-w-md items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#FFF0F0] text-[#CC0000]">
                  {isVideo ? <Video size={18} /> : <ImageIcon size={18} />}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-800">{file.name}</p>
                  <p className="text-xs text-gray-400">{formatSize(file.size)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearFile}
                className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="เอาไฟล์ออก"
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Status line */}
        {analyzing && (
          <div className="mt-4 flex items-center gap-2 text-sm font-medium text-gray-500">
            <Loader2 size={16} className="animate-spin text-[#CC0000]" />
            กำลังตรวจจับและจับคู่ใบหน้ากับรายชื่อผู้เรียน...
          </div>
        )}

        {/* Action */}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!file || analyzing}
            className="flex items-center gap-2 rounded-xl bg-[#CC0000] px-6 py-2.5 font-bold text-white shadow-md shadow-[#CC0000]/20 transition-colors hover:bg-[#990000] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {analyzing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            วิเคราะห์
          </button>
        </div>
      </div>

      {/* Detection review list */}
      {detections && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">ผลการจำแนก</h2>
              <p className="mt-1 text-sm text-gray-500">
                ตรวจทานทีละรายการ กด &quot;ถูกต้อง&quot; เพื่อยืนยัน หรือเลือกชื่อใหม่ถ้า AI จำแนกผิด
              </p>
            </div>
            <span className="flex-shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500">
              {detections.filter((d) => d.status !== 'pending').length}/{detections.length} ตรวจแล้ว
            </span>
          </div>

          <div className="mt-5 flex flex-col gap-3">
            {detections.map((d) => (
              <DetectionRow
                key={d.uid}
                detection={d}
                onConfirm={() => confirmDetection(d.uid)}
                onReassign={(studentId) => reassignDetection(d.uid, studentId)}
                onRemove={() => removeDetection(d.uid)}
              />
            ))}
          </div>

          {/* เพิ่มผู้เรียนที่ตกหล่น */}
          <button
            type="button"
            onClick={addMissedStudent}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-3 text-sm font-semibold text-gray-500 transition-colors hover:border-[#CC0000]/40 hover:text-[#CC0000]"
          >
            <Plus size={16} />
            เพิ่มผู้เรียนที่ระบบตกหล่น
          </button>

          {savedAt ? (
            <div className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-600">
              <CheckCircle2 size={16} />
              บันทึกผลการจำแนกเรียบร้อยแล้ว พร้อมนำไปประเมินผู้เรียนต่อได้
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
                onClick={handleConfirmAll}
                disabled={!allReviewed || saving}
                className="rounded-xl bg-[#CC0000] px-6 py-2.5 font-bold text-white shadow-md shadow-[#CC0000]/20 transition-colors hover:bg-[#990000] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'กำลังบันทึก...' : 'ยืนยันผลลัพธ์ทั้งหมด'}
              </button>
            </div>
          )}
        </div>
      )}

      {!detections && (
        <div className="flex items-start gap-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-5 text-sm text-gray-500">
          <UploadCloud size={18} className="mt-0.5 flex-shrink-0 text-gray-400" />
          <p>
            หลังวิเคราะห์เสร็จ ระบบจะแสดงรายชื่อผู้เรียนที่ตรวจพบให้ตรวจทานทีละคน หากมีคนอื่นที่ AI มองข้าม
            หรือจำแนกผิด สามารถแก้ไข/เพิ่มเองได้ก่อนยืนยันผลลัพธ์
          </p>
        </div>
      )}
    </div>
  );
}

// ==================== Detection row ====================
function DetectionRow({
  detection,
  onConfirm,
  onReassign,
  onRemove,
}: {
  detection: Detection;
  onConfirm: () => void;
  onReassign: (studentId: number) => void;
  onRemove: () => void;
}) {
  const { predictedNickname, confidence, studentId, status } = detection;
  const currentStudent = MOCK_STUDENTS.find((s) => s.id === studentId) ?? null;

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
          {MOCK_STUDENTS.map((s) => (
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
