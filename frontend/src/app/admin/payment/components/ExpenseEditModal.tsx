import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Expense } from './types';
import { UpdateExpenseReq } from '@/types/payment';
import DateField from '@/components/DateField';

// ป้ายชื่อประเภทรายจ่าย (แสดงอย่างเดียว — ห้ามเปลี่ยนประเภทตอนแก้ไข)
const EXPENSE_TYPE_LABEL: Record<string, string> = {
  court_rental: 'ค่าเช่าสนาม',
  coach_wages: 'ค่าจ้างโค้ช',
  coach_other: 'รายได้อื่น (โค้ช)',
  equipment: 'ค่าอุปกรณ์',
  advertising: 'ค่าโฆษณา',
  other: 'อื่นๆ',
};

export interface ExpenseEditModalProps {
  isOpen: boolean;
  expense: Expense | null;
  onClose: () => void;
  onSave: (id: number, payload: UpdateExpenseReq) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export default function ExpenseEditModal({
  isOpen,
  expense,
  onClose,
  onSave,
  onDelete,
}: ExpenseEditModalProps) {
  const [form, setForm] = useState({
    expenseamount: '',
    expensedescription: '',
    expensedate: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (expense) {
      setForm({
        expenseamount: expense.expenseamount?.toString() || '',
        expensedescription: expense.expensedescription || '',
        expensedate: expense.expensedate?.split('T')[0] || '',
      });
    }
  }, [expense]);

  if (!isOpen || !expense) return null;

  // รายการของโค้ช (ค่าจ้าง/รายได้อื่น) แก้ไขไม่ได้ กระทบการคำนวณค่าจ้าง → ลบได้อย่างเดียว
  const isCoachExpense = expense.expensetype === 'coach_wages' || expense.expensetype === 'coach_other';
  const isWages = expense.expensetype === 'coach_wages'; // เฉพาะค่าจ้างที่ลบแล้วยอดค้างจ่ายจะกลับมา
  const typeLabel = EXPENSE_TYPE_LABEL[expense.expensetype] || 'อื่นๆ';
  const busy = submitting || deleting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || isCoachExpense) return;
    setSubmitting(true);
    try {
      // ส่งเฉพาะฟิลด์ที่แก้ได้ (ไม่เปลี่ยนประเภท ไม่เปลี่ยนโค้ช)
      const payload: UpdateExpenseReq = {
        expenseamount: parseFloat(form.expenseamount) || 0,
        expensedescription: form.expensedescription.trim(),
        expensedate: new Date(form.expensedate).toISOString(),
      };
      await onSave(expense.id, payload);
      onClose();
    } catch {
      // error แสดงผ่าน toast ของ parent แล้ว — คง modal ไว้ให้แก้ต่อ
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (busy) return;
    setDeleting(true);
    try {
      await onDelete(expense.id);
      onClose();
    } catch {
      // parent จัดการ toast / ผู้ใช้กดยกเลิก — ไม่ปิด modal
    } finally {
      setDeleting(false);
    }
  };

  const fmtBaht = (n: number) => `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-fadeIn">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
          aria-label="ปิด"
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="mb-2 text-lg font-bold text-slate-800">
          {isCoachExpense ? 'รายการค่าใช้จ่าย' : 'แก้ไขรายการค่าใช้จ่าย'}
        </h3>
        <p className="mb-4 text-xs text-slate-500">
          {isCoachExpense
            ? 'รายการของโค้ชแก้ไขไม่ได้ เพราะกระทบการคำนวณค่าจ้าง — หากกรอกผิดให้ลบแล้วบันทึกใหม่'
            : 'แก้ไขจำนวนเงิน วันที่ หรือรายละเอียด (เปลี่ยนประเภทไม่ได้) หรือจะลบรายการนี้ก็ได้'}
        </p>

        {/* คำเตือนผลกระทบของการลบ — เน้นเฉพาะค่าจ้างโค้ชที่ยอดค้างจ่ายจะกลับมา */}
        {isCoachExpense && (
          <div className={`mb-4 border px-3.5 py-3 ${isWages ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
            {isWages ? (
              <>
                <p className="text-[12px] font-medium text-amber-800">
                  เมื่อลบ ยอด “ค่าจ้างค้างจ่าย” ของโค้ชจะกลับมาเพิ่มเท่ายอดนี้ ({fmtBaht(expense.expenseamount)})
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-amber-700">
                  ⚠️ ลบเฉพาะกรณี “กรอกผิด” เท่านั้น — อย่าลบถ้าจ่ายเงินให้โค้ชจริงไปแล้ว เพราะระบบจะคิดว่ายังค้างจ่าย เสี่ยงจ่ายซ้ำ · เป็นการลบถาวร กู้คืนไม่ได้
                </p>
              </>
            ) : (
              <p className="text-[11.5px] leading-relaxed text-slate-600">
                รายได้อื่น/โบนัสไม่ถูกนับในยอด “ค่าจ้างค้างจ่าย” — ลบแล้ว<span className="font-medium">ไม่กระทบการคำนวณค่าจ้าง</span> (กระทบแค่ยอดรวมรายจ่ายในหน้าสรุป) · เป็นการลบถาวร กู้คืนไม่ได้
              </p>
            )}
          </div>
        )}

        {/* ประเภท — แสดงอย่างเดียว ห้ามเปลี่ยน */}
        <div className="mb-4 flex items-center justify-between gap-3 border border-gray-200 bg-slate-50 px-3.5 py-2.5">
          <span className="text-xs text-slate-500">ประเภทรายจ่าย</span>
          <span className="text-sm font-semibold text-slate-800">{typeLabel}</span>
        </div>

        {isCoachExpense ? (
          // โหมดลบอย่างเดียว — สรุปข้อมูลแบบอ่านอย่างเดียว
          <div className="space-y-3">
            <dl className="divide-y divide-gray-100 border-y border-gray-200">
              {expense.coach && (
                <div className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-xs text-slate-500">โค้ช (ผู้รับเงิน)</dt>
                  <dd className="text-[13.5px] font-medium text-slate-800">{expense.coach.nickname}</dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-xs text-slate-500">จำนวนเงิน</dt>
                <dd className="text-[13.5px] font-medium tabular-nums text-slate-900">{fmtBaht(expense.expenseamount)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-xs text-slate-500">วันที่ทำรายการ</dt>
                <dd className="text-[13.5px] tabular-nums text-slate-800">{expense.expensedate?.split('T')[0]}</dd>
              </div>
              {expense.expensedescription && (
                <div className="flex items-start justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-xs text-slate-500">รายละเอียด</dt>
                  <dd className="text-right text-[13.5px] text-slate-700">{expense.expensedescription}</dd>
                </div>
              )}
            </dl>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className="rounded-xl border border-[#CD0D13]/40 px-4 py-2 text-xs font-bold text-[#CD0D13] transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {deleting ? 'กำลังลบ…' : 'ลบรายการ'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-xl border border-slate-250 px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed cursor-pointer"
              >
                ปิด
              </button>
            </div>
          </div>
        ) : (
          // โหมดแก้ไข (ประเภทที่ไม่ใช่ของโค้ช) — แก้จำนวนเงิน/วันที่/รายละเอียด
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600">จำนวนเงิน (บาท)</label>
              <input
                type="number"
                step="0.01"
                value={form.expenseamount}
                onChange={(e) => setForm(prev => ({ ...prev, expenseamount: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#CD0D13]"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600">วันที่ทำรายการ</label>
              <DateField
                value={form.expensedate}
                onChange={(val) => setForm(prev => ({ ...prev, expensedate: val }))}
                buttonClassName="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#CD0D13]"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600">รายละเอียด / คำอธิบาย</label>
              <input
                type="text"
                value={form.expensedescription}
                onChange={(e) => setForm(prev => ({ ...prev, expensedescription: e.target.value }))}
                placeholder="ระบุข้อความคำอธิบายค่าใช้จ่าย..."
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#CD0D13]"
              />
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className="rounded-xl border border-[#CD0D13]/40 px-4 py-2 text-xs font-bold text-[#CD0D13] transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {deleting ? 'กำลังลบ…' : 'ลบรายการ'}
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="rounded-xl border border-slate-250 px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-[#CD0D13] px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-[#A30A0E] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
