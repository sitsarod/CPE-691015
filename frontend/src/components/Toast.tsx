import React from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose?: () => void;
}

export default function Toast({ message, type = 'success', onClose }: ToastProps) {
  return (
    <div className={`fixed z-[100] left-4 right-4 sm:left-auto sm:right-5 sm:max-w-sm bottom-[calc(6rem+env(safe-area-inset-bottom))] flex items-start gap-2 px-4 py-3 rounded-xl shadow-lg border text-[13px] sm:text-xs font-semibold animate-slideIn bg-white ${
      type === 'success' ? 'text-emerald-600 border-emerald-100 bg-emerald-50/90' :
      type === 'error' ? 'text-rose-600 border-rose-100 bg-rose-50/90' :
      'text-blue-600 border-blue-100 bg-blue-50/90'
    }`}>
      {type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />}
      {type === 'error' && <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />}
      {type === 'info' && <Info className="w-4 h-4 shrink-0 mt-px" />}
      <span className="min-w-0 flex-1 whitespace-pre-line break-words leading-relaxed">{message}</span>
      {onClose && (
        <button onClick={onClose} aria-label="ปิด" className="-m-1.5 ml-1 shrink-0 p-1.5 hover:opacity-75 cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
