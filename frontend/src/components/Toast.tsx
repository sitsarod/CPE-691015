import React from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose?: () => void;
}

export default function Toast({ message, type = 'success', onClose }: ToastProps) {
  return (
    <div className={`fixed bottom-5 right-5 z-[100] flex items-center space-x-2 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold animate-slideIn bg-white ${
      type === 'success' ? 'text-emerald-600 border-emerald-100 bg-emerald-50/90' :
      type === 'error' ? 'text-rose-600 border-rose-100 bg-rose-50/90' :
      'text-blue-600 border-blue-100 bg-blue-50/90'
    }`}>
      {type === 'success' && <CheckCircle2 className="w-4 h-4" />}
      {type === 'error' && <AlertTriangle className="w-4 h-4" />}
      {type === 'info' && <Info className="w-4 h-4" />}
      <span>{message}</span>
      {onClose && (
        <button onClick={onClose} className="ml-2 hover:opacity-75 cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
