"use client";

import React, { createContext, useContext } from "react";
import Toast from "./Toast";
import { useToast, type ToastType } from "@/hooks/useToast";

type ShowToast = (message: string, type?: ToastType) => void;

const ToastContext = createContext<ShowToast | null>(null);

/** เรียกแจ้งเตือนแบบ toast ได้จากทุกที่ในแอป รวมถึง hook ที่ไม่ได้ render JSX เอง */
export function useGlobalToast(): ShowToast {
  const showToast = useContext(ToastContext);
  if (!showToast) throw new Error("useGlobalToast ต้องถูกเรียกภายใต้ ToastProvider");
  return showToast;
}

/** วาง toast ตัวเดียวไว้ที่ราก แล้วแจกฟังก์ชันเรียกใช้ผ่าน context */
export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const { toast, showToast, clearToast } = useToast();

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}
    </ToastContext.Provider>
  );
}
