import React, { useState } from 'react';
import { X } from 'lucide-react';
import { BankAccount } from './types';
import { BANK_OPTIONS } from '@/types/coach';
import {
  toggleBankAccount,
  deleteBankAccount,
  createBankAccount,
  updateBankAccount
} from "@/services/paymentAPI";

import { useConfirm } from "@/components/ConfirmProvider";
// โลโก้ธนาคาร: ตัวย่อ + สีประจำธนาคาร (fg ไว้ธนาคารพื้นอ่อนที่ต้องใช้ตัวหนังสือเข้ม)
// match แบบ "contains" กับทั้งชื่อไทยและตัวย่ออังกฤษ เพื่อทนกับ bank_name หลายรูปแบบ
// (เช่นเก็บเป็น "ธนาคารกรุงไทย", "KTB", หรือ "ธนาคารกรุงไทย (KTB)")
const BANK_BRAND: { keys: string[]; abbr: string; bg: string; fg?: string }[] = [
  { keys: ['กสิกร', 'kbank'],               abbr: 'KBANK', bg: '#138f2d' },
  { keys: ['ไทยพาณิชย์', 'scb'],            abbr: 'SCB',   bg: '#4e2e7f' },
  { keys: ['กรุงเทพ', 'bbl'],               abbr: 'BBL',   bg: '#1e4598' },
  { keys: ['กรุงไทย', 'ktb', 'krungthai'],  abbr: 'KTB',   bg: '#01a4e9' },
  { keys: ['กรุงศรี', 'อยุธยา', 'bay', 'krungsri'], abbr: 'BAY', bg: '#fec43b', fg: '#3d2b00' },
  { keys: ['ทหารไทย', 'ธนชาต', 'ttb', 'tmb'], abbr: 'ttb', bg: '#1279be' },
  { keys: ['ออมสิน', 'gsb'],                abbr: 'GSB',   bg: '#eb198d' },
  { keys: ['ธ.ก.ส', 'เกษตร', 'baac'],       abbr: 'BAAC',  bg: '#4b9b1d' },
  { keys: ['ซีไอเอ็มบี', 'cimb'],           abbr: 'CIMB',  bg: '#ec1c24' },
  { keys: ['ยูโอบี', 'uob'],                abbr: 'UOB',   bg: '#005eb8' },
  { keys: ['เกียรตินาคิน', 'ภัทร', 'kkp'],   abbr: 'KKP',   bg: '#012f5f' },
  { keys: ['ทิสโก้', 'tisco'],              abbr: 'TISCO', bg: '#12549f' },
  { keys: ['แลนด์', 'เฮ้าส์', 'lh'],         abbr: 'LHB',   bg: '#ee7f00' },
  { keys: ['อิสลาม', 'ibank', 'isbt'],      abbr: 'IBANK', bg: '#184c3a' },
];
const bankBrand = (name: string): { abbr: string; bg: string; fg?: string } => {
  const n = (name || '').toLowerCase();
  const hit = BANK_BRAND.find(b => b.keys.some(k => n.includes(k)));
  if (hit) return hit;
  // นอกลิสต์: ดึงตัวอักษรอังกฤษในชื่อมาทำตัวย่อก่อน ไม่โชว์ตัวไทย
  const latin = (name.match(/[A-Za-z]+/g) || []).join('').toUpperCase().slice(0, 5);
  return { abbr: latin || 'BANK', bg: '#64748b' };
};

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
  const confirmAction = useConfirm();
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
  const [primaryBusyId, setPrimaryBusyId] = useState<number | null>(null);   // กำลังสลับบัญชีหลัก
  const [verifyBusyId, setVerifyBusyId] = useState<number | null>(null);     // กำลังสลับตรวจสลิปอัตโนมัติ

  // บัญชีหลักมาก่อนเสมอ แล้วเรียงตามลำดับเดิมของ API
  const orderedAccounts = [...bankAccounts].sort((a, b) => (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0));

  const handleCopyAccountNo = async (account: BankAccount) => {
    try {
      await navigator.clipboard.writeText(account.account_no);
      setCopiedId(account.ID);
      onTriggerToast(`คัดลอกเลขที่บัญชี ${account.account_no} แล้ว`, 'info');
      setTimeout(() => setCopiedId(prev => (prev === account.ID ? null : prev)), 2000);
    } catch {
      onTriggerToast('คัดลอกเลขที่บัญชีไม่สำเร็จ', 'error');
    }
  };

  // ตั้งบัญชีนี้เป็นบัญชีหลัก (บัญชีหลักมีได้ทีละบัญชี) — ต้องยืนยันก่อน
  const handleSetPrimary = async (account: BankAccount) => {
    if (account.is_active || primaryBusyId !== null) return;
    if (!(await confirmAction(`ตั้ง "${account.bank_name}" เป็นบัญชีหลักรับเงินแทนบัญชีเดิมใช่หรือไม่?`))) return;

    setPrimaryBusyId(account.ID);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      const result = await toggleBankAccount(account.ID, token || "");
      onTriggerToast(`เปลี่ยนบัญชีรับเงินหลักเป็น: ${result.data.bank_name} เรียบร้อยแล้ว`);
      onFetchData();
    } catch (err: unknown) {
      onTriggerToast(err instanceof Error ? err.message : 'สลับบัญชีไม่สำเร็จ', 'error');
    } finally {
      setPrimaryBusyId(null);
    }
  };

  // เปิด/ปิดตรวจสลิปอัตโนมัติ (SlipOK) ของบัญชีนี้
  // ระบบไม่รู้ว่าบัญชีมีข้อมูลใน SlipOK จริงไหม จึงเตือน+ให้ยืนยันตอน "เปิด" แทนการ disable
  const handleToggleAutoVerify = async (account: BankAccount) => {
    if (verifyBusyId !== null) return;

    // เตือนเฉพาะตอนกำลังจะเปิด (ปิดไม่ต้องยืนยัน)
    if (!account.auto_verify_enabled) {
      const ok = await confirmAction(
        `เปิดตรวจสลิปอัตโนมัติ (SlipOK) สำหรับ "${account.bank_name}"?\n\n` +
        `ใช้ได้เฉพาะบัญชีที่ลงทะเบียนไว้ในระบบ SlipOK แล้วเท่านั้น ` +
        `หากบัญชีนี้ยังไม่มีข้อมูลใน SlipOK ระบบจะตรวจสลิปให้ไม่ได้ และสลิปจะตกไปให้แอดมินตรวจเองตามปกติ`
      );
      if (!ok) return;
    }

    setVerifyBusyId(account.ID);
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
    } finally {
      setVerifyBusyId(null);
    }
  };

  const handleDeleteBank = async (account: BankAccount) => {
    if (account.is_active) {
      onTriggerToast("ไม่สามารถลบบัญชีธนาคารที่ตั้งเป็นบัญชีหลักได้", "error");
      return;
    }
    if (!(await confirmAction({ message: "คุณต้องการลบบัญชีธนาคารนี้อย่างถาวรใช่หรือไม่?", tone: "danger" }))) return;

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      await deleteBankAccount(account.ID, token || "");
      onTriggerToast("ลบบัญชีธนาคารสำเร็จเรียบร้อย");
      onFetchData();
    } catch (err: unknown) {
      onTriggerToast(err instanceof Error ? err.message : 'ลบบัญชีไม่สำเร็จ', 'error');
    }
  };

  const openCreateModal = () => {
    setEditingBank(null);
    setBankForm({ bank_name: '', account_name: '', account_no: '', promptpay_id: '', is_active: false, auto_verify_enabled: false });
    setIsBankModalOpen(true);
  };

  const openEditModal = (account: BankAccount) => {
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
  };

  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankForm.bank_name || !bankForm.account_name || !bankForm.account_no) {
      onTriggerToast("กรุณากรอกข้อมูลให้ครบถ้วนทุกช่อง", 'error');
      return;
    }

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

  // สวิตช์สี่เหลี่ยม (spec: ไม่มี radius) — on = แดง/ปุ่มขาว ชิดขวา, off = ขอบ/ปุ่มเทา ชิดซ้าย
  const Switch = ({ on, busy, disabled, onToggle, title }: {
    on: boolean; busy?: boolean; disabled?: boolean; onToggle: () => void; title?: string;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy || disabled}
      onClick={onToggle}
      title={title}
      className={`flex h-6 w-11 shrink-0 items-center rounded-md p-[3px] transition-colors ${on ? 'justify-end bg-[#CD0D13]' : 'justify-start border border-slate-400 bg-slate-100'} ${(busy || disabled) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <span className={`block h-[18px] w-[18px] rounded-sm ${on ? 'bg-white' : 'bg-slate-500'}`} />
    </button>
  );

  const isEmpty = bankAccounts.length === 0;

  return (
    <div className="animate-fadeIn">
      {/* empty — ยังไม่มีบัญชีเลย: เตือน + เหลือแค่การ์ดเพิ่มบัญชี */}
      {isEmpty && (
        <div className="mb-5 border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-[12.5px] text-amber-800">ยังไม่มีบัญชีรับเงิน ลูกค้าจะยังโอนเงินไม่ได้</p>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-[22px] md:grid-cols-2 xl:grid-cols-3">
        {orderedAccounts.map(account => {
          const brand = bankBrand(account.bank_name);
          const primary = account.is_active;
          const isCopied = copiedId === account.ID;
          const labelClass = primary ? 'text-[#CD0D13]' : 'text-slate-400';

          return (
            <div
              key={account.ID}
              className={`flex flex-col border bg-white p-[22px] ${primary ? 'border-[#CD0D13]/50 ring-1 ring-red-100' : 'border-slate-200'}`}
            >
              {/* 1) หัวการ์ด: โลโก้ + chip */}
              <div className="flex items-start justify-between gap-3">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center px-1 text-[13px] font-semibold"
                  style={{ backgroundColor: brand.bg, color: brand.fg || '#ffffff' }}
                >
                  {brand.abbr}
                </div>
                {primary ? (
                  <span className="shrink-0 whitespace-nowrap rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-[10.5px] font-semibold text-[#CD0D13]">
                    บัญชีหลัก
                  </span>
                ) : (
                  <span className="shrink-0 whitespace-nowrap rounded-full border border-slate-300 px-2.5 py-1 text-[10.5px] text-slate-400">
                    กำลังปิดรับอยู่
                  </span>
                )}
              </div>

              {/* 2) ข้อมูลบัญชี */}
              <div className="mt-4 space-y-3.5">
                <div>
                  <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${labelClass}`}>ชื่อบัญชี</span>
                  <p className="mt-0.5 truncate text-sm font-medium text-slate-900" title={account.account_name}>{account.account_name}</p>
                </div>
                <div>
                  <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${labelClass}`}>เลขที่บัญชี</span>
                  <div className="mt-0.5 flex items-center gap-2.5">
                    <p className="text-base font-medium tabular-nums tracking-wide text-slate-900">{account.account_no}</p>
                    <button
                      type="button"
                      onClick={() => handleCopyAccountNo(account)}
                      className="shrink-0 text-[11.5px] font-medium text-[#CD0D13] hover:underline cursor-pointer"
                    >
                      {isCopied ? 'คัดลอกแล้ว' : 'คัดลอก'}
                    </button>
                  </div>
                </div>
                <div>
                  <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${labelClass}`}>พร้อมเพย์ (QR)</span>
                  {account.promptpay_id ? (
                    <p className="mt-0.5 text-sm font-medium tabular-nums tracking-wide text-slate-900">{account.promptpay_id}</p>
                  ) : (
                    <p className="mt-0.5 text-[13px] text-slate-400">ยังไม่ได้ตั้งค่า — สแกน QR ไม่ได้</p>
                  )}
                </div>
              </div>

              {/* 3) สวิตช์ */}
              <div className="mt-4 space-y-3.5 border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 text-[12.5px] font-medium text-slate-800">
                    {primary ? 'บัญชีหลักรับเงินเข้า' : 'ตั้งเป็นบัญชีหลัก'}
                  </p>
                  <Switch
                    on={primary}
                    busy={primaryBusyId === account.ID}
                    disabled={primary}
                    onToggle={() => handleSetPrimary(account)}
                    title={primary ? 'บัญชีนี้เป็นบัญชีหลักอยู่แล้ว' : 'ตั้งบัญชีนี้เป็นบัญชีหลักสำหรับรับเงินโอน'}
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-slate-800">ตรวจสลิปอัตโนมัติ</p>
                    <p className="mt-0.5 text-[10.5px] text-slate-400">ตรวจเฉพาะบัญชีที่มีข้อมูลใน SlipOK</p>
                  </div>
                  <Switch
                    on={account.auto_verify_enabled}
                    busy={verifyBusyId === account.ID}
                    onToggle={() => handleToggleAutoVerify(account)}
                    title="เปิด/ปิดการตรวจสลิปอัตโนมัติผ่าน SlipOK สำหรับบัญชีนี้"
                  />
                </div>
              </div>

              {/* 4) ปุ่มท้ายการ์ด */}
              <div className="mt-auto flex gap-2.5 pt-5">
                <button
                  type="button"
                  onClick={() => openEditModal(account)}
                  className="h-10 flex-1 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 cursor-pointer"
                >
                  แก้ไข
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteBank(account)}
                  disabled={primary}
                  title={primary ? 'ไม่สามารถลบบัญชีธนาคารหลักได้' : 'ลบบัญชีธนาคาร'}
                  className={`h-10 flex-1 rounded-lg border text-xs font-bold transition-colors ${
                    primary
                      ? 'cursor-not-allowed border-slate-200 text-slate-400'
                      : 'border-[#CD0D13]/40 text-[#CD0D13] hover:bg-red-50 cursor-pointer'
                  }`}
                >
                  ลบบัญชี
                </button>
              </div>
            </div>
          );
        })}

        {/* การ์ดเพิ่มบัญชีธนาคาร */}
        <button
          type="button"
          onClick={openCreateModal}
          className={`group flex min-h-[200px] flex-col items-center justify-center border border-dashed border-slate-300 bg-white p-8 text-center transition-colors hover:border-[#CD0D13]/50 hover:bg-red-50/30 cursor-pointer sm:min-h-[300px] ${isEmpty ? 'col-span-full' : ''}`}
        >
          <span className="flex h-11 w-11 items-center justify-center border-[1.6px] border-[#CD0D13] text-xl font-light text-[#CD0D13]">+</span>
          <span className="mt-4 text-[15px] font-medium text-slate-800">เพิ่มบัญชีธนาคาร</span>
          <span className="mt-1.5 max-w-[200px] text-xs leading-relaxed text-slate-500">
            ระบุธนาคาร ชื่อเจ้าของบัญชี และเลขที่บัญชีเพื่อลงทะเบียนรับโอน
          </span>
        </button>
      </div>

      {/* Bank Account Create/Edit Modal */}
      {isBankModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-fadeIn">
            <button
              onClick={() => setIsBankModalOpen(false)}
              className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              aria-label="ปิด"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="mb-2 text-lg font-bold text-slate-800">
              {editingBank ? "แก้ไขบัญชีธนาคาร" : "เพิ่มบัญชีธนาคารใหม่"}
            </h3>
            <p className="mb-4 text-xs text-slate-500">ระบุธนาคาร ชื่อเจ้าของบัญชี และเลขที่บัญชีเพื่อลงทะเบียนรับโอน</p>

            <form onSubmit={handleSaveBank} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">ชื่อธนาคาร</label>
                <select
                  value={bankForm.bank_name}
                  onChange={(e) => setBankForm(prev => ({ ...prev, bank_name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#CD0D13]"
                  required
                >
                  <option value="">-- เลือกธนาคาร --</option>
                  {bankForm.bank_name && !BANK_OPTIONS.some(b => b.value === bankForm.bank_name) && (
                    <option value={bankForm.bank_name}>{bankForm.bank_name}</option>
                  )}
                  {BANK_OPTIONS.map(b => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">ชื่อบัญชี</label>
                <input
                  type="text"
                  placeholder="ระบุชื่อภาษาไทย/อังกฤษ ตามหน้าสมุดบัญชี"
                  value={bankForm.account_name}
                  onChange={(e) => setBankForm(prev => ({ ...prev, account_name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#CD0D13]"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">เลขที่บัญชี</label>
                <input
                  type="text"
                  placeholder="ตัวอย่าง: 0123456789 (เฉพาะตัวเลขเท่านั้น)"
                  value={bankForm.account_no}
                  onChange={(e) => setBankForm(prev => ({ ...prev, account_no: e.target.value.replace(/\D/g, '') }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#CD0D13]"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">
                  เลขพร้อมเพย์ (สำหรับ QR สแกนจ่าย)
                  <span className="font-normal text-slate-400"> — ไม่บังคับ</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="เบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน 13 หลัก"
                  value={bankForm.promptpay_id}
                  onChange={(e) => setBankForm(prev => ({ ...prev, promptpay_id: e.target.value.replace(/\D/g, '') }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#CD0D13]"
                />
                <p className="text-[11px] leading-snug text-slate-400">
                  ใช้เบอร์มือถือ/เลขบัตรที่ผูกพร้อมเพย์กับบัญชีนี้ ไม่ใช่เลขบัญชีธนาคาร หากเว้นว่างจะสแกนจ่ายผ่าน QR ไม่ได้ (ใช้โอนเงินได้ตามปกติ)
                </p>
              </div>

              {editingBank && (
                <div className="flex items-center gap-2 py-2">
                  <input
                    type="checkbox"
                    id="bank-is-active"
                    checked={bankForm.is_active}
                    onChange={(e) => setBankForm(prev => ({ ...prev, is_active: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-350 accent-[#CD0D13]"
                  />
                  <label htmlFor="bank-is-active" className="text-xs font-semibold text-slate-700">ตั้งเป็นบัญชีหลักสำหรับรับเงิน</label>
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setIsBankModalOpen(false)}
                  className="rounded-xl border border-slate-250 px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-[#CD0D13] px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-[#A30A0E] disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'กำลังบันทึก…' : 'บันทึกข้อมูล'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
