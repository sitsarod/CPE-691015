"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export type ToastType = "success" | "error" | "info";
export interface ToastState {
  message: string;
  type: ToastType;
}

const DEFAULT_DURATION = 4000;

/**
 * ข้อความแจ้งเตือนที่โผล่มาแล้วหายไปเอง
 *
 * ─── ปัญหาที่แก้ ───
 *
 * หน้ารีวิวของแอดมินกับของโค้ชเขียน triggerToast ของตัวเองคนละชุด เนื้อในเหมือนกัน
 * แต่ทั้งสองชุดมีบั๊กเดียวกัน: เรียก setTimeout แล้วไม่เคยยกเลิกเลย
 *
 * ผลคือถ้ามีข้อความใหม่โผล่มาก่อนอันเก่าหมดเวลา ตัวจับเวลาของอันเก่ายังทำงานอยู่
 * แล้วไปปิดอันใหม่ก่อนกำหนด ยิ่งกดถี่ ๆ ข้อความยิ่งหายไวขึ้นเรื่อย ๆ
 *
 * และถ้าผู้ใช้เปลี่ยนหน้าก่อนหมดเวลา ตัวจับเวลาจะยิง setState ใส่หน้าที่ถูกถอดไปแล้ว
 *
 * ตัวนี้เก็บตัวจับเวลาไว้ใน ref แล้วยกเลิกอันเก่าทุกครั้งที่มีอันใหม่ และยกเลิก
 * ตอนออกจากหน้าด้วย
 */
export function useToast(duration = DEFAULT_DURATION) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setToast(null);
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "success") => {
      if (timerRef.current) clearTimeout(timerRef.current);

      setToast({ message, type });
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setToast(null);
      }, duration);
    },
    [duration],
  );

  // ยกเลิกตัวจับเวลาที่ค้างอยู่ตอนออกจากหน้า
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { toast, showToast, clearToast };
}
