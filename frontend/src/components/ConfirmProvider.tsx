"use client";

import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

export interface ConfirmOptions {
  message: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "danger" | "default";
}

type Confirm = (options: string | ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** ถามยืนยันแบบ await ได้ ใช้แทน window.confirm ซึ่งตัดข้อความยาวทิ้ง */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm ต้องถูกเรียกภายใต้ ConfirmProvider");
  return confirm;
}

/** วางกล่องยืนยันตัวเดียวไว้ที่ราก แล้วแจกฟังก์ชันถามผ่าน context */
export default function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((input) => {
    // ถ้ามีกล่องค้างอยู่ ต้องปลด promise เดิมก่อน ไม่งั้นฝั่งที่ await อยู่จะค้างตลอดไป
    resolveRef.current?.(false);

    setOptions(typeof input === "string" ? { message: input } : input);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    setOptions(null);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(ok);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={options !== null}
        title={options?.title}
        message={options?.message ?? ""}
        confirmText={options?.confirmText ?? "ยืนยัน"}
        cancelText={options?.cancelText ?? "ยกเลิก"}
        tone={options?.tone ?? "default"}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
}
