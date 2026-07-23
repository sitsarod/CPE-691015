import React, { useState } from 'react';
import { Landmark, PlusCircle, Pencil, Trash2, X } from 'lucide-react';
import { BankAccount } from './types';
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
    is_active: false,
    auto_verify_enabled: false
  });
  const [submitting, setSubmitting] = useState(false);

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

    setSubmitting(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      const payload = {
        bank_name: bankForm.bank_name,
        account_name: bankForm.account_name,
        account_no: bankForm.account_no,
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
      <div className="mb-6 pb-4 border-b border-slate-150 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">เปิด-ปิดบัญชีรับเงินโอน</h3>
          <p className="text-sm text-slate-500">เลือกบัญชีธนาคารหลักที่จะให้ผู้เรียนโอนเข้า หรือเพิ่ม/แก้ไขข้อมูลบัญชีธนาคารในระบบ</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingBank(null);
            setBankForm({ bank_name: '', account_name: '', account_no: '', is_active: false, auto_verify_enabled: false });
            setIsBankModalOpen(true);
          }}
          className="bg-[#CD0D13] hover:bg-[#A30A0E] text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center space-x-1.5 cursor-pointer self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>เพิ่มบัญชีธนาคาร</span>
        </button>
      </div>

      {bankAccounts.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Landmark className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">ยังไม่มีบัญชีธนาคารในระบบ</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {bankAccounts.map(account => {
            let colorClass = "bg-slate-600";
            const nameUpper = account.bank_name.toUpperCase();
            if (account.bank_name.includes("กสิกร") || nameUpper.includes("KBANK")) {
              colorClass = "bg-[#00a859]";
            } else if (account.bank_name.includes("ไทยพาณิชย์") || nameUpper.includes("SCB")) {
              colorClass = "bg-[#4e2a84]";
            } else if (account.bank_name.includes("กรุงเทพ") || nameUpper.includes("BBL")) {
              colorClass = "bg-[#1e3a8a]";
            } else if (account.bank_name.includes("กรุงไทย") || nameUpper.includes("KTB")) {
              colorClass = "bg-[#007ad0]";
            }

            return (
              <div
                key={account.ID}
                onClick={() => handleToggleBank(account.ID)}
                className={`relative rounded-3xl p-6 text-white shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-0.5 transition-all select-none overflow-hidden ${colorClass} ${
                  account.is_active ? 'ring-4 ring-offset-2 ring-red-150 scale-[1.02]' : 'opacity-85'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs opacity-75 font-semibold uppercase tracking-wider block">{account.bank_name}</span>
                    <span className="text-md font-black tracking-wide mt-1 block">{account.account_name}</span>
                  </div>
                  <div className="flex space-x-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBank(account);
                        setBankForm({
                          bank_name: account.bank_name,
                          account_name: account.account_name,
                          account_no: account.account_no,
                          is_active: account.is_active,
                          auto_verify_enabled: account.auto_verify_enabled
                        });
                        setIsBankModalOpen(true);
                      }}
                      className="p-1 rounded-full bg-white/20 hover:bg-white/35 text-white transition-colors cursor-pointer"
                      title="แก้ไขข้อมูลบัญชี"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteBank(e, account.ID)}
                      className={`p-1 rounded-full bg-white/20 text-white transition-colors cursor-pointer ${
                        account.is_active ? 'opacity-40 cursor-not-allowed' : 'hover:bg-red-650'
                      }`}
                      title={account.is_active ? "ไม่สามารถลบบัญชีธนาคารหลักได้" : "ลบบัญชีธนาคาร"}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-12">
                  <span className="text-xs opacity-75 block uppercase font-medium">เลขที่บัญชี</span>
                  <span className="text-xl font-bold tracking-widest mt-1 block">{account.account_no}</span>
                </div>

                <div className="mt-6 flex justify-between items-center border-t border-white/20 pt-4">
                  <span className="text-[10px] opacity-75 font-semibold">คลิกเพื่อตั้งเป็นบัญชีหลัก</span>
                  <div className="flex items-center">
                    <div className={`w-9 h-5 rounded-full p-0.5 transition-all duration-300 ${account.is_active ? 'bg-white' : 'bg-white/20'}`}>
                      <div className={`w-4 h-4 rounded-full transition-transform duration-300 ${
                        account.is_active 
                          ? 'translate-x-4 bg-[#CD0D13]' 
                          : 'translate-x-0 bg-white/70'
                      }`} />
                    </div>
                  </div>
                </div>

                <div
                  className="mt-3 flex justify-between items-center border-t border-white/20 pt-3 cursor-pointer"
                  onClick={(e) => handleToggleAutoVerify(e, account)}
                  title="เปิด/ปิดการตรวจสลิปอัตโนมัติผ่าน SlipOK สำหรับบัญชีนี้"
                >
                  <span className="text-[10px] opacity-75 font-semibold">ตรวจสลิปอัตโนมัติ (SlipOK)</span>
                  <div className={`w-9 h-5 rounded-full p-0.5 transition-all duration-300 ${account.auto_verify_enabled ? 'bg-white' : 'bg-white/20'}`}>
                    <div className={`w-4 h-4 rounded-full transition-transform duration-300 ${
                      account.auto_verify_enabled
                        ? 'translate-x-4 bg-[#CD0D13]'
                        : 'translate-x-0 bg-white/70'
                    }`} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
                <input
                  type="text"
                  placeholder="ตัวอย่าง: ธนาคารกสิกรไทย (KBANK)"
                  value={bankForm.bank_name}
                  onChange={(e) => setBankForm(prev => ({ ...prev, bank_name: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-xs outline-none focus:bg-white text-slate-800"
                  required
                />
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
