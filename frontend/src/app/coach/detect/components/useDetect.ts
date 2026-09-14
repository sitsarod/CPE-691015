import { useEffect, useRef, useState } from 'react';
import { fetchAllActiveStudents } from '@/services/evaluationAPI';
import {
  assignPhotoStudents,
  assignVideoStudents,
  uploadDetectPhoto,
  uploadDetectVideo,
} from '@/services/detectAPI';

export type DetectionStatus = 'pending' | 'confirmed' | 'edited';

export interface DetectStudent {
  id: number;
  nickname: string;
}

export interface Detection {
  uid: string;
  predictedNickname: string | null; // ชื่อที่ AI คาดเดา (null = โค้ชเพิ่มเองภายหลัง)
  confidence: number | null; // null เฉพาะรายการที่โค้ชเพิ่มเอง (AI เดาให้เสมอมีคะแนน ทั้งรูปและวิดีโอ)
  studentId: number | ''; // ผู้เรียนที่ผูกไว้ตอนนี้ (หลังยืนยัน/แก้ไข)
  status: DetectionStatus;
  /** กรอบใบหน้า [x1, y1, x2, y2] พิกเซล — ของไฟล์รูปต้นฉบับ (ฝั่งรูป) หรือของ frameImage
   * ด้านล่าง (ฝั่งวิดีโอ) ใช้วาดกรอบ/ชื่อทับตอนตรวจทานเท่านั้น ไม่มีถ้าโค้ชเพิ่มเอง */
  bbox: [number, number, number, number] | null;
  /** เฟรมวิดีโอที่ย่อขนาดแล้ว (JPEG base64 ไม่มี data URL prefix) ที่แมตช์ได้ — มีเฉพาะวิดีโอ
   * (รูปไม่ต้องใช้ เพราะมีไฟล์ต้นฉบับอยู่แล้ว) วาดกรอบทับด้วย bbox ข้างบนได้เหมือนฝั่งรูปทุกอย่าง */
  frameImage: string | null;
}

// MAX_BATCH_FILES จำกัดจำนวนไฟล์ต่อการอัปโหลดหนึ่งครั้ง — วิเคราะห์ทีละไฟล์ผ่าน face-service
// รูปกินเวลา 1-3 วิ/ไฟล์ ส่วนวิดีโอช้ากว่ามาก (ถอดหลายเฟรมมาตรวจ อาจถึงหลักสิบวิ/ไฟล์)
// ถ้าไม่จำกัดโค้ชเลือกทีละหลายสิบไฟล์แล้วเครื่อง (โดยเฉพาะโน้ตบุ๊คที่ไม่แรง) จะค้างรอนานเกินไป
export const MAX_BATCH_FILES = 10;

// AUTO_CONFIRM_THRESHOLD — ผลจำแนกที่มั่นใจตั้งแต่ % นี้ขึ้นไปจะ "ยืนยันให้อัตโนมัติ" โดยไม่ต้องกด
// (ลดงานกดของโค้ชในเคสที่ชัดเจน) ใช้เกณฑ์เดียวกันทั้งรูปและวิดีโอ ที่เหลือ (ต่ำกว่านี้)
// ยังต้องตรวจทานเองอยู่ — เป็นค่าเริ่มต้นที่ยังไม่เคย calibrate จากข้อมูลจริง ปรับได้ถ้าเดาพลาดบ่อยไป
export const AUTO_CONFIRM_THRESHOLD = 65;

// BatchItem คือไฟล์หนึ่งไฟล์ในชุดที่เลือกมาพร้อมกัน — แต่ละไฟล์มีสถานะ/ผลวิเคราะห์/การยืนยันแยกจากกัน
// ไม่ต้องเลือกคอร์สก่อนอัปโหลดแล้ว — ระบบจำแนกใบหน้าเทียบกับนักเรียนทั้งโรงเรียนให้เอง
export interface BatchItem {
  uid: string;
  file: File;
  isVideo: boolean;
  analyzing: boolean;
  detections: Detection[] | null; // null = ยังไม่ได้วิเคราะห์
  rawId: number | null; // raw_photo_id หรือ raw_video_id — ได้มาหลังวิเคราะห์สำเร็จ
  error: string | null;
  saving: boolean;
  savedAt: number | null;
  skippedCount: number;
  faceCount: number;
}

let uidCounter = 0;
const nextUid = () => `d-${++uidCounter}`;

function isItemReviewed(item: BatchItem): boolean {
  return !!item.detections && item.detections.length > 0 && item.detections.every((d) => d.status !== 'pending');
}

function newBatchItem(file: File): BatchItem {
  return {
    uid: nextUid(),
    file,
    isVideo: file.type.startsWith('video/'),
    analyzing: false,
    detections: null,
    rawId: null,
    error: null,
    saving: false,
    savedAt: null,
    skippedCount: 0,
    faceCount: 0,
  };
}

export function useDetect() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [students, setStudents] = useState<DetectStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);

  const [items, setItems] = useState<BatchItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [analyzingAll, setAnalyzingAll] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  // นักเรียนทั้งโรงเรียนที่ลงทะเบียนเรียนอยู่จริง — ใช้ตอน "เพิ่มผู้เรียนที่ระบบตกหล่น" (dropdown เลือกชื่อ)
  // ไม่กรองตามคอร์ส เพราะไม่บังคับเลือกคอร์สก่อนอัปโหลดแล้ว
  useEffect(() => {
    let cancelled = false;
    fetchAllActiveStudents()
      .then((list) => {
        if (cancelled) return;
        setStudents(list.map((s) => ({ id: s.customer_id, nickname: s.nickname })));
      })
      .catch(() => {
        // เงียบไว้พอ — โหลดไม่สำเร็จแค่ทำให้ dropdown ว่างชั่วคราว ไม่ควรบล็อกการอัปโหลด/วิเคราะห์
      })
      .finally(() => {
        if (!cancelled) setStudentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateItem = (uid: string, patch: Partial<BatchItem>) => {
    setItems((prev) => prev.map((item) => (item.uid === uid ? { ...item, ...patch } : item)));
  };

  // pickFiles รับไฟล์ใหม่มาต่อท้ายชุดเดิม (ไม่ใช่แทนที่) เพราะโค้ชอาจลากเพิ่มทีละน้อยหลายรอบ
  const pickFiles = (fileList: FileList | File[] | null) => {
    if (!fileList) return;
    setBatchError(null);

    const incoming = Array.from(fileList);
    const rejected = incoming.filter((f) => !f.type.startsWith('video/') && !f.type.startsWith('image/'));
    const valid = incoming.filter((f) => f.type.startsWith('video/') || f.type.startsWith('image/'));

    if (rejected.length > 0) {
      alert('มีไฟล์ที่ไม่ใช่รูปภาพหรือวิดีโอถูกข้ามไป กรุณาเลือกเฉพาะรูปภาพ/วิดีโอเท่านั้น');
    }

    setItems((prev) => {
      const room = MAX_BATCH_FILES - prev.length;
      if (room <= 0) {
        setBatchError(`อัปโหลดได้สูงสุด ${MAX_BATCH_FILES} ไฟล์ต่อครั้ง กรุณาลบไฟล์เดิมออกก่อนเพิ่มใหม่`);
        return prev;
      }
      if (valid.length > room) {
        setBatchError(`เลือกได้อีกแค่ ${room} ไฟล์ (สูงสุด ${MAX_BATCH_FILES} ไฟล์ต่อครั้ง) — เพิ่มมาแค่ ${room} ไฟล์แรกให้`);
      }
      return [...prev, ...valid.slice(0, room).map(newBatchItem)];
    });
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    pickFiles(e.dataTransfer.files);
  };

  const removeItem = (uid: string) => {
    setItems((prev) => prev.filter((item) => item.uid !== uid));
  };

  const clearAll = () => {
    setItems([]);
    setBatchError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  // วิเคราะห์ทุกไฟล์ที่ยังไม่เคยวิเคราะห์ "ทีละไฟล์ตามลำดับ" (ไม่ขนาน) — เพราะ face-service
  // รันบนเครื่องที่อาจไม่แรง ยิงพร้อมกันหลายไฟล์เสี่ยงค้างทั้งหมดพร้อมกันแทนที่จะทยอยเสร็จ
  const analyzeAll = async () => {
    if (analyzingAll) return;
    const pending = items.filter((item) => item.detections === null && !item.analyzing);
    if (pending.length === 0) return;

    setAnalyzingAll(true);
    for (const item of pending) {
      updateItem(item.uid, { analyzing: true, error: null });
      try {
        // รูปและวิดีโอคืนผลลัพธ์รูปแบบเดียวกันแล้ว (face_count + students[]) — ต่างกันแค่ endpoint
        // และชื่อฟิลด์ raw id เท่านั้น ดึงมาเป็นรูปทรงเดียวกันก่อนใช้ต่อ (กัน TS union ไม่ narrow ให้)
        const { rawId, faceCount, students: detectedStudents } = item.isVideo
          ? await uploadDetectVideo(item.file).then((r) => ({
              rawId: r.raw_video_id,
              faceCount: r.face_count,
              students: r.students,
            }))
          : await uploadDetectPhoto(item.file).then((r) => ({
              rawId: r.raw_photo_id,
              faceCount: r.face_count,
              students: r.students,
            }));

        updateItem(item.uid, {
          analyzing: false,
          rawId,
          faceCount,
          detections: detectedStudents.map((s) => {
            const confidence = Math.round(s.confidence);
            return {
              uid: nextUid(),
              predictedNickname: s.nickname,
              confidence,
              studentId: s.customer_id,
              // มั่นใจสูงพอ = ยืนยันให้เลยอัตโนมัติ ไม่ต้องรอโค้ชกด (ยังกดแก้ไข/ลบทีหลังได้เหมือนเดิม)
              status: (confidence >= AUTO_CONFIRM_THRESHOLD ? 'confirmed' : 'pending') as DetectionStatus,
              // ฝั่งรูป bbox อ้างอิงไฟล์ต้นฉบับที่มีอยู่แล้ว ฝั่งวิดีโอ bbox อ้างอิง frameImage
              // ที่ backend ส่งมาคู่กันเสมอ (คนละรูปอ้างอิงกัน แยกไว้จะได้ไม่ใช้ผิดคู่กัน)
              bbox: s.bbox ?? null,
              frameImage: item.isVideo ? s.frame_image ?? null : null,
            };
          }),
        });
      } catch (err) {
        updateItem(item.uid, {
          analyzing: false,
          error: err instanceof Error ? err.message : 'วิเคราะห์ไม่สำเร็จ กรุณาลองใหม่',
        });
      }
    }
    setAnalyzingAll(false);
  };

  const confirmDetection = (itemUid: string, detectionUid: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.uid !== itemUid || !item.detections
          ? item
          : {
              ...item,
              detections: item.detections.map((d) => (d.uid === detectionUid ? { ...d, status: 'confirmed' } : d)),
            }
      )
    );
  };

  // ยืนยันทุกรายการที่ยังค้าง "รอตรวจสอบ" ในไฟล์นี้พร้อมกันทีเดียว — ลดจากกด N ครั้งเหลือกดครั้งเดียว
  // ไม่แตะรายการที่แก้ไข (edited) หรือยืนยันแล้ว (confirmed) อยู่แล้ว เพราะโค้ชตัดสินใจไปแล้วรอบหนึ่ง
  const confirmAllPending = (itemUid: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.uid !== itemUid || !item.detections
          ? item
          : {
              ...item,
              detections: item.detections.map((d) => (d.status === 'pending' ? { ...d, status: 'confirmed' } : d)),
            }
      )
    );
  };

  const reassignDetection = (itemUid: string, detectionUid: string, studentId: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.uid !== itemUid || !item.detections
          ? item
          : {
              ...item,
              detections: item.detections.map((d) =>
                d.uid === detectionUid ? { ...d, studentId, status: 'edited' } : d
              ),
            }
      )
    );
  };

  const removeDetection = (itemUid: string, detectionUid: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.uid !== itemUid || !item.detections
          ? item
          : { ...item, detections: item.detections.filter((d) => d.uid !== detectionUid) }
      )
    );
  };

  const addMissedStudent = (itemUid: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.uid !== itemUid
          ? item
          : {
              ...item,
              detections: [
                ...(item.detections ?? []),
                {
                  uid: nextUid(),
                  predictedNickname: null,
                  confidence: null,
                  studentId: '' as const,
                  status: 'pending' as DetectionStatus,
                  bbox: null,
                  frameImage: null,
                },
              ],
            }
      )
    );
  };

  // ยิง assign จริงของไฟล์หนึ่งไฟล์ — แยกออกมาให้ saveItem (ทีละไฟล์) และ confirmAndSaveAll
  // (ทั้งชุดคลิกเดียว) เรียกใช้ร่วมกัน ไม่ต้องเขียนตรรกะ assign ซ้ำสองที่
  const saveItemNow = async (item: BatchItem) => {
    if (!item.detections || item.rawId == null) return;
    updateItem(item.uid, { saving: true, error: null });
    try {
      const studentIds = item.detections.map((d) => d.studentId).filter((id): id is number => id !== '');
      const result = item.isVideo
        ? await assignVideoStudents(item.rawId, studentIds)
        : await assignPhotoStudents(item.rawId, studentIds);
      updateItem(item.uid, { saving: false, savedAt: Date.now(), skippedCount: result.skipped_no_consent?.length ?? 0 });
    } catch (err) {
      updateItem(item.uid, {
        saving: false,
        error: err instanceof Error ? err.message : 'บันทึกผลลัพธ์ไม่สำเร็จ กรุณาลองใหม่',
      });
    }
  };

  // บันทึกผลของไฟล์เดียว — แต่ละไฟล์ยืนยันแยกจากกัน ไม่ผูกกับไฟล์อื่นในชุดเดียวกัน
  const saveItem = async (itemUid: string) => {
    const item = items.find((it) => it.uid === itemUid);
    if (!item || !item.detections || item.saving || item.rawId == null || !isItemReviewed(item)) return;
    await saveItemNow(item);
  };

  // ยืนยันรายการ "รอตรวจสอบ" ที่เหลือของทุกไฟล์ในชุด แล้วบันทึกทีเดียวทั้งหมด
  // ให้โค้ชที่มั่นใจผลของ AI แล้วกดจบงานครั้งเดียว ไม่ต้องไล่ยืนยัน+บันทึกทีละไฟล์
  const confirmAndSaveAll = async () => {
    if (savingAll) return;

    // ยืนยันของทุกไฟล์พร้อมกันก่อนในสเตทเดียว จะได้ไม่เจอปัญหา state ที่ยังไม่อัปเดตทัน
    // ตอนเช็ค isItemReviewed ต่อ (setState เป็น async)
    const confirmed = items.map((item) =>
      !item.detections
        ? item
        : {
            ...item,
            detections: item.detections.map((d) =>
              d.status === 'pending' ? { ...d, status: 'confirmed' as DetectionStatus } : d
            ),
          }
    );
    setItems(confirmed);

    const toSave = confirmed.filter(
      (item) => item.detections && item.rawId != null && !item.saving && !item.savedAt && isItemReviewed(item)
    );
    if (toSave.length === 0) return;

    setSavingAll(true);
    await Promise.all(toSave.map((item) => saveItemNow(item)));
    setSavingAll(false);
  };

  const readyToAnalyzeCount = items.filter((item) => item.detections === null && !item.analyzing).length;

  return {
    inputRef,
    students,
    studentsLoading,
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
  };
}

export type DetectManager = ReturnType<typeof useDetect>;
