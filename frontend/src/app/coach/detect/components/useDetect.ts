import { useState, useRef } from 'react';
import { MOCK_STUDENTS } from '../../_mock/students';

export type DetectionStatus = 'pending' | 'confirmed' | 'edited';

export interface Detection {
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

export function useDetect() {
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

  return {
    inputRef,
    file,
    dragActive,
    setDragActive,
    analyzing,
    detections,
    saving,
    savedAt,
    isVideo,
    pickFile,
    handleDrop,
    handleAnalyze,
    clearFile,
    confirmDetection,
    reassignDetection,
    removeDetection,
    addMissedStudent,
    allReviewed,
    handleConfirmAll,
  };
}

export type DetectManager = ReturnType<typeof useDetect>;
