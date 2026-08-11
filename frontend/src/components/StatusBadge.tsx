import React from 'react';
import { Clock, CheckCircle, AlertCircle, Wallet, CalendarX } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  switch (status?.toLowerCase()) {
    case 'pending':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800">
          <Clock className="w-3 h-3 mr-1" /> รอดำเนินการ
        </span>
      );
    case 'active':
    case 'approved':
    case 'success':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" /> active
        </span>
      );
    case 'awaiting_payment':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
          <Wallet className="w-3 h-3 mr-1" /> รอชำระเงิน
        </span>
      );
    case 'expired':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
          <CalendarX className="w-3 h-3 mr-1" /> หมดอายุ
        </span>
      );
    case 'rejected':
    case 'cancelled':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">
          <AlertCircle className="w-3 h-3 mr-1" /> ยกเลิก/ปฏิเสธ
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-800">
          {status || '-'}
        </span>
      );
  }
}