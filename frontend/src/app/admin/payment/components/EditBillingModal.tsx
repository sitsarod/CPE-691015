import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { BillingDTO } from './types';

const BILLING_TYPES = [
  { id: 1, name: "ค่าเรียน / คอร์สเรียน" },
  { id: 2, name: "ค่าเช่าสนาม" },
  { id: 3, name: "ค่าอุปกรณ์" },
  { id: 4, name: "ค่าสมาชิก" },
  { id: 5, name: "อื่นๆ" }
];

export interface EditBillingModalProps {
  isOpen: boolean;
  onClose: () => void;
  billing: BillingDTO | null;
  onSave: (
    billingId: number,
    form: { billingdescription: string; billingamount: string; billingdue_date: string; billingtype_id: string }
  ) => Promise<void>;
}

export default function EditBillingModal({
  isOpen,
  onClose,
  billing,
  onSave
}: EditBillingModalProps) {
  const [form, setForm] = useState({
    billingdescription: '',
    billingamount: '',
    billingdue_date: '',
    billingtype_id: ''
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (billing) {
      setForm({
        billingdescription: billing.billingdescription || '',
        billingamount: billing.billingamount?.toString() || '',
        billingdue_date: billing.billingdue_date?.split('T')[0] || '',
        billingtype_id: billing.billingtype_id?.toString() || ''
      });
    }
  }, [billing]);

  if (!isOpen || !billing) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSave(billing.id, form);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs transition-opacity duration-300">
      <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col p-6 relative border border-slate-200 animate-fadeIn">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-bold text-slate-800 mb-2">แก้ไขข้อมูลใบเรียกเก็บเงิน</h3>
        <p className="text-xs text-slate-500 mb-4">คุณสามารถแก้ไขรายละเอียดของบิลที่ยังไม่ได้ชำระเงินได้ที่นี่</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 block">ประเภทค่าใช้จ่าย</label>
            <select
              value={form.billingtype_id}
              onChange={(e) => setForm(prev => ({ ...prev, billingtype_id: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-xs outline-none focus:bg-white text-slate-800 font-medium"
              required
            >
              <option value="">-- เลือกประเภทค่าใช้จ่าย --</option>
              {BILLING_TYPES.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 block">รายละเอียดบิล</label>
            <input
              type="text"
              value={form.billingdescription}
              onChange={(e) => setForm(prev => ({ ...prev, billingdescription: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-xs outline-none focus:bg-white text-slate-800"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 block">ยอดเรียกเก็บ (บาท)</label>
            <input
              type="number"
              step="0.01"
              value={form.billingamount}
              onChange={(e) => setForm(prev => ({ ...prev, billingamount: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-xs outline-none focus:bg-white text-slate-800"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 block">วันที่ครบกำหนดชำระ</label>
            <input
              type="date"
              value={form.billingdue_date}
              onChange={(e) => setForm(prev => ({ ...prev, billingdue_date: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-xs outline-none focus:bg-white text-slate-800"
              required
            />
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-250 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-[#CD0D13] hover:bg-[#A30A0E] text-white rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer"
            >
              บันทึกการแก้ไข
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
