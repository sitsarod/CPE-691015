import React, { useState } from 'react';
import { Landmark, Pencil, Trash2, X, Copy, Check } from 'lucide-react';
import { BankAccount } from './types';
import { BANK_OPTIONS } from '@/types/coach';
import {
  toggleBankAccount,
  deleteBankAccount,
  createBankAccount,
  updateBankAccount
} from "@/services/paymentAPI";

export interface BankAccountsTabProps {
  bankAccounts: BankAccount[];
  onFetchData: () => void;
  onTriggerToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function BankAccountsTab({
  bankAccounts,
  onFetchData,
  onTriggerToast
}: BankAccountsTabProps) {
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);
  const [bankForm, setBankForm] = useState({
    bank_name: '',
    account_name: '',
    account_no: '',
    promptpay_id: '',
    is_active: false,
    auto_verify_enabled: false
  });
  const [submitting, setSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // คัดลอกเลขที่บัญชีไปยังคลิปบอร์ด
  const handleCopyAccountNo = async (e: React.MouseEvent, account: BankAccount) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(account.account_no);
      setCopiedId(account.ID);
      onTriggerToast(`คัดลอกเลขที่บัญชี ${account.account_no} แล้ว`, 'info');
      setTimeout(() => setCopiedId(prev => (prev === account.ID ? null : prev)), 2000);
    } catch {
      onTriggerToast('คัดลอกเลขที่บัญชีไม่สำเร็จ', 'error');
    }
  };

  // Toggle active status
  const handleToggleBank = async (bankId: number) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      const result = await toggleBankAccount(bankId, token || "");
      onTriggerToast(`เปลี่ยนบัญชีรับเงินหลักเป็น: ${result.data.bank_name} เรียบร้อยแล้ว`);
      onFetchData();
    } catch (err: unknown) {
      onTriggerToast(err instanceof Error ? err.message : 'สลับบัญชีไม่สำเร็จ', 'error');
    }
  };

  // Toggle SlipOK auto slip-verification for a bank account
  const handleToggleAutoVerify = async (e: React.MouseEvent, account: BankAccount) => {
    e.stopPropagation();
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      await updateBankAccount(account.ID, { auto_verify_enabled: !account.auto_verify_enabled }, token || "");
      onTriggerToast(
        !account.auto_verify_enabled
          ? `เปิดตรวจสลิปอัตโนมัติ (SlipOK) สำหรับ ${account.bank_name} แล้ว`
          : `ปิดตรวจสลิปอัตโนมัติ (SlipOK) สำหรับ ${account.bank_name} แล้ว`
      );
      onFetchData();
    } catch (err: unknown) {
      onTriggerToast(err instanceof Error ? err.message : 'สลับการตรวจสลิปอัตโนมัติไม่สำเร็จ', 'error');
    }
  };

  // Delete bank account
  const handleDeleteBank = async (e: React.MouseEvent, bankId: number) => {
    e.stopPropagation();

    const account = bankAccounts.find(acc => acc.ID === bankId);
    if (account?.is_active) {
      onTriggerToast("ไม่สามารถลบบัญชีธนาคารที่ตั้งเป็นบัญชีหลักได้", "error");
      return;
    }

    if (!window.confirm("คุณต้องการลบบัญชีธนาคารนี้อย่างถาวรใช่หรือไม่?")) {
      return;
    }

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      await deleteBankAccount(bankId, token || "");
      onTriggerToast("ลบบัญชีธนาคารสำเร็จเรียบร้อย");
      onFetchData();
    } catch (err: unknown) {
      onTriggerToast(err instanceof Error ? err.message : 'ลบบัญชีไม่สำเร็จ', 'error');
    }
  };

  // Create or Update bank account
  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankForm.bank_name || !bankForm.account_name || !bankForm.account_no) {
      onTriggerToast("กรุณากรอกข้อมูลให้ครบถ้วนทุกช่อง", 'error');
      return;
    }

    // เลขพร้อมเพย์ไม่บังคับ แต่ถ้ากรอกต้องเป็นตัวเลข 10, 13 หรือ 15 หลัก
    const promptPay = bankForm.promptpay_id.trim();
    if (promptPay && !/^(\d{10}|\d{13}|\d{15})$/.test(promptPay)) {
      onTriggerToast("เลขพร้อมเพย์ต้องเป็นตัวเลข 10 หลัก (เบอร์มือถือ), 13 หลัก (เลขบัตรประชาชน) หรือ 15 หลัก (e-Wallet)", 'error');
      return;
    }

    setSubmitting(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      const payload = {
        bank_name: bankForm.bank_name,
        account_name: bankForm.account_name,
        account_no: bankForm.account_no,
        promptpay_id: promptPay,
        ...(editingBank ? { is_active: bankForm.is_active, auto_verify_enabled: bankForm.auto_verify_enabled } : {})
      };

      if (editingBank) {
        await updateBankAccount(editingBank.ID, payload, token || "");
      } else {
        await createBankAccount(payload, token || "");
      }

      onTriggerToast(editingBank ? "แก้ไขบัญชีธนาคารสำเร็จเรียบร้อย" : "เพิ่มบัญชีธนาคารใหม่สำเร็จเรียบร้อย");
      setIsBankModalOpen(false);
      onFetchData();
    } catch (err: unknown) {
      onTriggerToast(err instanceof Error ? err.message : 'บันทึกบัญชีไม่สำเร็จ', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 animate-fadeIn">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {bankAccounts.map(account => {
          const isCopied = copiedId === account.ID;
          return (
            <div
              key={account.ID}
              className={`group relative rounded-3xl border bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md flex flex-col ${
                account.is_active ? 'border-red-200 ring-1 ring-red-100' : 'border-slate-200'
              }`}
            >
              {/* หัวการ์ด: ชื่อธนาคาร + ป้าย Primary */}
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-lg font-bold text-slate-900 truncate">{account.bank_name}</h4>
                {account.is_active && (
                  <span className="flex-shrink-0 text-[11px] font-bold text-[#CD0D13] bg-red-50 border border-red-100 px-2.5 py-1 rounded-full">
                    บัญชีหลัก
                  </span>
                )}
              </div>

              {/* แผงข้อมูลบัญชี */}
              <div className="mt-4 rounded-2xl bg-[#FFFFFF] p-5 space-y-3.5">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#CD0D13]">ชื่อบัญชี</span>
                  <p className="text-lg font-bold text-slate-900 mt-0.5 truncate">{account.account_name}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#CD0D13]">เลขที่บัญชี</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-lg font-bold text-slate-900 tabular-nums tracking-wider">{account.account_no}</p>
                    <button
                      type="button"
                      onClick={(e) => handleCopyAccountNo(e, account)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md text-slate-500 hover:bg-slate-200/70 hover:text-slate-700 cursor-pointer"
                      title="คัดลอกเลขที่บัญชีแบบเต็ม"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#CD0D13]">พร้อมเพย์ (QR)</span>
                  {account.promptpay_id ? (
                    <p className="text-lg font-bold text-slate-900 tabular-nums tracking-wider mt-0.5">{account.promptpay_id}</p>
                  ) : (
                    <p className="text-xs font-semibold text-amber-600 mt-1">ยังไม่ได้ตั้งค่า — สแกนจ่ายผ่าน QR ไม่ได้</p>
                  )}
                </div>
              </div>

              {/* สวิตช์ควบคุม */}
              <div className="mt-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800">รับเงินโอน</p>
                    <p className={`text-xs mt-0.5 ${account.is_active ? 'text-[#CD0D13] font-semibold' : 'text-slate-400'}`}>
                      {account.is_active ? 'บัญชีหลักรับเงินเข้า' : 'กำลังปิดรับอยู่'}
                    </p>
                  </div>
                  <div
                    role="switch"
                    aria-checked={account.is_active}
                    onClick={() => handleToggleBank(account.ID)}
                    className={`flex-shrink-0 w-11 h-6 rounded-full p-1 transition-colors duration-300 cursor-pointer ${account.is_active ? 'bg-[#CD0D13]' : 'bg-slate-200'}`}
                    title="ตั้งบัญชีนี้เป็นบัญชีหลักสำหรับรับเงินโอน"
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform duration-300 ${account.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800">ตรวจสลิปอัตโนมัติ</p>
                    <p className={`text-xs mt-0.5 ${account.auto_verify_enabled ? 'text-[#CD0D13] font-semibold' : 'text-slate-400'}`}>
                      ตรวจเฉพาะบัญชีที่มีข้อมูลใน SlipOK
                    </p>
                  </div>
                  <div
                    role="switch"
                    aria-checked={account.auto_verify_enabled}
                    onClick={(e) => handleToggleAutoVerify(e, account)}
                    className={`flex-shrink-0 w-11 h-6 rounded-full p-1 transition-colors duration-300 cursor-pointer ${account.auto_verify_enabled ? 'bg-[#CD0D13]' : 'bg-slate-200'}`}
                    title="เปิด/ปิดการตรวจสลิปอัตโนมัติผ่าน SlipOK สำหรับบัญชีนี้"
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform duration-300 ${account.auto_verify_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
              </div>

              {/* แถวปุ่มแก้ไข/ลบ */}
              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditingBank(account);
                    setBankForm({
                      bank_name: account.bank_name,
                      account_name: account.account_name,
                      account_no: account.account_no,
                      promptpay_id: account.promptpay_id || '',
                      is_active: account.is_active,
                      auto_verify_enabled: account.auto_verify_enabled
                    });
                    setIsBankModalOpen(true);
                  }}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="แก้ไขข้อมูลบัญชี"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDeleteBank(e, account.ID)}
                  className={`p-2 rounded-lg transition-colors cursor-pointer ${
                    account.is_active ? 'text-slate-300 cursor-not-allowed' : 'text-[#CD0D13] hover:bg-red-50'
                  }`}
                  title={account.is_active ? "ไม่สามารถลบบัญชีธนาคารหลักได้" : "ลบบัญชีธนาคาร"}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        {/* การ์ดเพิ่มบัญชีใหม่ */}
        <button
          type="button"
          onClick={() => {
            setEditingBank(null);
            setBankForm({ bank_name: '', account_name: '', account_no: '', promptpay_id: '', is_active: false, auto_verify_enabled: false });
            setIsBankModalOpen(true);
          }}
          className="group rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/40 hover:border-red-200 hover:bg-red-50/30 transition-all duration-300 flex flex-col items-center justify-center text-center p-8 min-h-[260px] cursor-pointer"
        >
          <div className="p-4 rounded-2xl bg-white shadow-sm text-slate-400 group-hover:text-[#CD0D13] transition-colors mb-4">
            <Landmark className="w-7 h-7" />
          </div>
          <span className="text-lg font-bold text-slate-800">เพิ่มบัญชีธนาคาร</span>
          <span className="text-xs text-slate-500 mt-1.5 max-w-[220px]">เพิ่มบัญชีใหม่เพื่อใช้รับเงินโอนในระบบ</span>
        </button>
      </div>

      {/* Bank Account Create/Edit Modal */}
      {isBankModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs transition-opacity duration-300">
          <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col p-6 relative border border-slate-200 animate-fadeIn">
            <button
              onClick={() => setIsBankModalOpen(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-800 mb-2">
              {editingBank ? "แก้ไขบัญชีธนาคาร" : "เพิ่มบัญชีธนาคารใหม่"}
            </h3>
            <p className="text-xs text-slate-500 mb-4">ระบุธนาคาร ชื่อเจ้าของบัญชี และเลขที่บัญชีเพื่อลงทะเบียนรับโอน</p>

            <form onSubmit={handleSaveBank} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 block">ชื่อธนาคาร</label>
                <select
                  value={bankForm.bank_name}
                  onChange={(e) => setBankForm(prev => ({ ...prev, bank_name: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-xs outline-none focus:bg-white text-slate-800"
                  required
                >
                  <option value="">-- เลือกธนาคาร --</option>
                  {/* รองรับค่าเดิมที่เคยพิมพ์เองและไม่มีในรายการ ให้ยังแสดง/เก็บค่าไว้ได้ */}
                  {bankForm.bank_name && !BANK_OPTIONS.some(b => b.value === bankForm.bank_name) && (
                    <option value={bankForm.bank_name}>{bankForm.bank_name}</option>
                  )}
                  {BANK_OPTIONS.map(b => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 block">ชื่อบัญชี</label>
                <input
                  type="text"
                  placeholder="ระบุชื่อภาษาไทย/อังกฤษ ตามหน้าสมุดบัญชี"
                  value={bankForm.account_name}
                  onChange={(e) => setBankForm(prev => ({ ...prev, account_name: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-xs outline-none focus:bg-white text-slate-800"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 block">เลขที่บัญชี</label>
                <input
                  type="text"
                  placeholder="ตัวอย่าง: 0123456789 (เฉพาะตัวเลขเท่านั้น)"
                  value={bankForm.account_no}
                  onChange={(e) => setBankForm(prev => ({ ...prev, account_no: e.target.value.replace(/\D/g, '') }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-xs outline-none focus:bg-white text-slate-800"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 block">
                  เลขพร้อมเพย์ (สำหรับ QR สแกนจ่าย)
                  <span className="font-normal text-slate-400"> — ไม่บังคับ</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="เบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน 13 หลัก"
                  value={bankForm.promptpay_id}
                  onChange={(e) => setBankForm(prev => ({ ...prev, promptpay_id: e.target.value.replace(/\D/g, '') }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-xs outline-none focus:bg-white text-slate-800"
                />
                <p className="text-[11px] text-slate-400 leading-snug">
                  ใช้เบอร์มือถือ/เลขบัตรที่ผูกพร้อมเพย์กับบัญชีนี้ ไม่ใช่เลขบัญชีธนาคาร หากเว้นว่างจะสแกนจ่ายผ่าน QR ไม่ได้ (ใช้โอนเงินได้ตามปกติ)
                </p>
              </div>

              {editingBank && (
                <div className="flex items-center space-x-2 py-2">
                  <input
                    type="checkbox"
                    id="bank-is-active"
                    checked={bankForm.is_active}
                    onChange={(e) => setBankForm(prev => ({ ...prev, is_active: e.target.checked }))}
                    className="w-4 h-4 text-[#CD0D13] rounded border-slate-350 focus:ring-[#CD0D13] accent-red-650"
                  />
                  <label htmlFor="bank-is-active" className="text-xs font-semibold text-slate-750">ตั้งเป็นบัญชีหลักสำหรับรับเงิน</label>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsBankModalOpen(false)}
                  className="px-4 py-2 border border-slate-250 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-[#CD0D13] hover:bg-[#A30A0E] text-white rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer"
                >
                  บันทึกข้อมูล
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
