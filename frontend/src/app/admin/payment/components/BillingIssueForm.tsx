import React, { useState, useMemo } from 'react';
import { User, Users, Search, Tag, Check, Pencil } from 'lucide-react';
import { BackendUser, BillingDTO } from './types';
import { createBilling } from "@/services/paymentAPI";
import DateField from '@/components/DateField';

// enum ประเภทค่าใช้จ่าย (เดิมในโค้ด — ไม่ hardcode ในดีไซน์)
const BILLING_TYPES = [
  { id: 1, name: "ค่าเรียน / คอร์สเรียน" },
  { id: 2, name: "ค่าเช่าสนาม" },
  { id: 3, name: "ค่าอุปกรณ์" },
  { id: 4, name: "ค่าสมาชิก" },
  { id: 5, name: "อื่นๆ" }
];

const getNextWeekDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
};

export interface BillingIssueFormProps {
  students: BackendUser[];
  billings: BillingDTO[];
  onFetchData: () => void;
  onTriggerToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onOpenEditBilling: (b: BillingDTO) => void;
}

export default function BillingIssueForm({
  students,
  billings,
  onFetchData,
  onTriggerToast,
  onOpenEditBilling
}: BillingIssueFormProps) {
  const [billingMode, setBillingMode] = useState<'individual' | 'group'>('individual');
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [selectedBillingTypeId, setSelectedBillingTypeId] = useState('');
  const [price, setPrice] = useState('');
  const [hours, setHours] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [billingDescription, setBillingDescription] = useState('');
  const [dueDate, setDueDate] = useState(getNextWeekDate());
  const [submitted, setSubmitted] = useState(false);   // แตะปุ่มส่งแล้วหรือยัง (ใช้โชว์ validation ใต้ฟิลด์)
  const [submitting, setSubmitting] = useState(false);

  // ยอดหารเฉลี่ยแบบกลุ่ม — ถ้ามีเศษให้ปัดขึ้นเป็นจำนวนเต็มบาท
  const groupTotal = (parseFloat(hours) || 0) * (parseFloat(hourlyRate) || 0);
  const perPersonRaw = selectedStudentIds.length > 0 ? groupTotal / selectedStudentIds.length : 0;
  const perPersonRounded = Math.ceil(perPersonRaw);
  const hasRounding = perPersonRounded !== perPersonRaw;

  // ราคารวมทั้งหมด = ยอดต่อคน × จำนวนคนที่เลือก (คำนวณสดฝั่ง client เพื่อแสดงผลเท่านั้น)
  const grandTotal = billingMode === 'individual'
    ? (parseFloat(price) || 0) * selectedStudentIds.length
    : perPersonRounded * selectedStudentIds.length;

  // กรองรายชื่อผู้เรียนตามคำค้น
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const fullName = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase();
      const nickname = (s.nickname || '').toLowerCase();
      const email = (s.email || '').toLowerCase();
      const query = studentSearchQuery.toLowerCase();
      return fullName.includes(query) || nickname.includes(query) || email.includes(query);
    });
  }, [students, studentSearchQuery]);

  const toggleSelectStudent = (id: number) => {
    setSelectedStudentIds(prev =>
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredStudents.map(s => s.id);
    const areAllSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedStudentIds.includes(id));
    if (areAllSelected) {
      setSelectedStudentIds(selectedStudentIds.filter(id => !allFilteredIds.includes(id)));
    } else {
      const newSelection = [...selectedStudentIds];
      allFilteredIds.forEach(id => { if (!newSelection.includes(id)) newSelection.push(id); });
      setSelectedStudentIds(newSelection);
    }
  };

  // ── validation ต่อฟิลด์ (แสดงหลังกดส่ง ไม่ใช้ alert) ─────────
  const errStudents = submitted && selectedStudentIds.length === 0;
  const errType = submitted && !selectedBillingTypeId;
  const errDue = submitted && !dueDate;
  const errDesc = submitted && !billingDescription.trim();
  const errPrice = submitted && billingMode === 'individual' && !price;
  const errHours = submitted && billingMode === 'group' && !hours;
  const errRate = submitted && billingMode === 'group' && !hourlyRate;
  const hasError = errStudents || errType || errDue || errDesc || errPrice || errHours || errRate;

  const fieldBorder = (hasErr: boolean) =>
    hasErr ? 'border-rose-400 focus:border-rose-500' : 'border-gray-300 focus:border-[#CD0D13]';

  const handleCreateBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);

    // เช็คความครบถ้วนแบบสด (ไม่พึ่ง state ที่เพิ่ง set)
    const invalid =
      selectedStudentIds.length === 0 || !selectedBillingTypeId || !dueDate || !billingDescription.trim() ||
      (billingMode === 'individual' ? !price : (!hours || !hourlyRate));
    if (invalid) return;

    setSubmitting(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;

      const calculatedAmount = billingMode === 'individual' ? parseFloat(price) : perPersonRounded;

      // ไม่ส่ง admin_id — backend อ้างคนออกบิลจาก JWT ให้เอง
      const payload = {
        customer_ids: selectedStudentIds,
        billingtype_id: parseInt(selectedBillingTypeId),
        billingdescription: billingDescription,
        billingamount: calculatedAmount,
        billingdue_date: new Date(dueDate).toISOString()
      };

      await createBilling(payload, token || "");
      onTriggerToast(`ออกบิลเรียกเก็บเงินสำเร็จจำนวน ${selectedStudentIds.length} รายการ`);

      // เคลียร์ฟอร์ม — คงประเภทและวันครบกำหนดไว้ให้ออกบิลชุดถัดไปต่อได้เลย
      setSelectedStudentIds([]);
      setPrice('');
      setHours('');
      setHourlyRate('');
      setBillingDescription('');
      setStudentSearchQuery('');
      setSubmitted(false);

      onFetchData();
    } catch (err: unknown) {
      onTriggerToast(err instanceof Error ? err.message : 'ออกบิลไม่สำเร็จ', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const req = <span className="text-rose-500">*</span>;

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1.65fr_1fr] lg:gap-[34px]">

      {/* ───────── คอลัมน์ซ้าย: ฟอร์มออกบิล ───────── */}
      <div className="min-w-0 border border-gray-200 bg-white p-6">
        <form onSubmit={handleCreateBilling} className="space-y-5" noValidate>

          {/* 1) เลือกผู้เรียน + ลิงก์เลือกทั้งหมด */}
          <div>
            <div className="mb-2 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <label className="block text-sm text-slate-700">เลือกผู้เรียน (เลือกพร้อมกันได้หลายคน) {req}</label>
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="text-left text-[12.5px] font-semibold text-[#CD0D13] hover:underline sm:text-right"
              >
                เลือกทั้งหมดตามตัวกรอง
              </button>
            </div>

            {/* 2) ช่องค้นหา */}
            <div className="relative mb-3">
              <input
                type="text"
                placeholder="ค้นหารายชื่อผู้เรียน..."
                value={studentSearchQuery}
                onChange={(e) => setStudentSearchQuery(e.target.value)}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-4 text-sm text-slate-800 outline-none transition-all focus:border-[#CD0D13]"
              />
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>

            {/* 3) ลิสต์ผู้เรียน (scroll ในกล่อง) */}
            <div className={`max-h-[236px] overflow-y-auto no-scrollbar border ${errStudents ? 'border-rose-400' : 'border-gray-200'}`}>
              {filteredStudents.length === 0 ? (
                <div className="flex min-h-[120px] items-center justify-center px-4 text-center text-xs text-slate-500">
                  ไม่พบผู้เรียนที่ตรงกับคำค้นหา
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredStudents.map(s => {
                    const isChecked = selectedStudentIds.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className={`flex cursor-pointer items-center gap-3 px-4 py-[13px] transition-colors ${isChecked ? 'bg-rose-50/50' : 'hover:bg-slate-50'}`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectStudent(s.id)}
                          className="sr-only"
                        />
                        <span className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
                          isChecked ? 'border-[#CD0D13] bg-[#CD0D13]' : 'border-[1.6px] border-gray-300 bg-white'
                        }`}>
                          {isChecked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                        </span>
                        <span className={`min-w-0 flex-1 truncate text-[13.5px] ${isChecked ? 'font-medium text-slate-900' : 'text-slate-600'}`}>
                          {s.firstName} {s.lastName}{s.nickname ? ` (${s.nickname})` : ''}
                        </span>
                        <span className="shrink-0 truncate text-[11.5px] text-slate-400">{s.email}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4) บรรทัดสรุปการเลือก */}
            <p className="mt-2 text-[12.5px] text-[#CD0D13]">
              เลือกไว้ทั้งหมด {selectedStudentIds.length} คน — {billingMode === 'individual'
                ? 'ออกบิลคนละใบด้วยยอดเท่ากัน'
                : 'หารยอดรวมเฉลี่ยตามจำนวนคนที่เลือก'}
            </p>
            {errStudents && <p className="mt-1 text-[11.5px] text-rose-500">กรุณาเลือกผู้เรียนอย่างน้อยหนึ่งคน</p>}
          </div>

          {/* 5) ประเภทค่าใช้จ่าย + วันครบกำหนด */}
          <div className="grid grid-cols-1 gap-[22px] md:grid-cols-2">
            <div className="min-w-0">
              <label className="mb-1.5 block text-sm text-slate-700">ประเภทค่าใช้จ่าย {req}</label>
              <div className="relative">
                <select
                  value={selectedBillingTypeId}
                  onChange={(e) => setSelectedBillingTypeId(e.target.value)}
                  className={`h-[46px] w-full appearance-none rounded-lg border bg-white pl-10 pr-8 text-sm text-slate-800 outline-none transition-all ${fieldBorder(errType)}`}
                >
                  <option value="">-- เลือกประเภท --</option>
                  {BILLING_TYPES.map(type => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
                <Tag className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <div className="pointer-events-none absolute right-3.5 top-1/2 h-0 w-0 -translate-y-1/2 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-500" />
              </div>
              {errType && <p className="mt-1 text-[11.5px] text-rose-500">กรุณาเลือกประเภทค่าใช้จ่าย</p>}
            </div>
            <div className="min-w-0">
              <label className="mb-1.5 block text-sm text-slate-700">วันครบกำหนดชำระเงิน {req}</label>
              <DateField
                value={dueDate}
                onChange={(val) => setDueDate(val)}
                buttonClassName={`h-[46px] rounded-lg border bg-white px-4 text-sm text-slate-800 outline-none transition-all ${fieldBorder(errDue)}`}
              />
              {errDue && <p className="mt-1 text-[11.5px] text-rose-500">กรุณาเลือกวันครบกำหนดชำระ</p>}
            </div>
          </div>

          {/* 6) โหมดคิดยอด (segmented) */}
          <div className="flex max-w-md border border-gray-200 p-1">
            <button
              type="button"
              onClick={() => setBillingMode('individual')}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2 px-4 text-xs font-bold transition-all ${
                billingMode === 'individual' ? 'bg-[#FFF0F0] text-[#CD0D13]' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>ยอดต่อคน</span>
            </button>
            <button
              type="button"
              onClick={() => setBillingMode('group')}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2 px-4 text-xs font-bold transition-all ${
                billingMode === 'group' ? 'bg-[#FFF0F0] text-[#CD0D13]' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>จำนวน × อัตรา</span>
            </button>
          </div>

          {/* จำนวนเงิน + กล่องราคารวม */}
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
            {billingMode === 'individual' ? (
              <div>
                <label className="mb-1.5 block text-sm text-slate-700">จำนวนเงินเรียกเก็บต่อคน (บาท) {req}</label>
                <div className="relative">
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="ตัวอย่าง: 1500"
                    min="1"
                    className={`h-[46px] w-full rounded-lg border bg-white pl-10 pr-4 text-sm text-slate-800 outline-none transition-all ${fieldBorder(errPrice)}`}
                  />
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">฿</span>
                </div>
                {errPrice && <p className="mt-1 text-[11.5px] text-rose-500">กรุณากรอกจำนวนเงินต่อคน</p>}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1.5 block text-xs text-slate-700">จำนวน {req}</label>
                  <input
                    type="number"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    placeholder="เช่น 10"
                    min="0.1"
                    step="any"
                    className={`h-[46px] w-full rounded-lg border bg-white px-3 text-sm text-slate-800 outline-none transition-all ${fieldBorder(errHours)}`}
                  />
                  {errHours && <p className="mt-1 text-[11.5px] text-rose-500">กรุณากรอกจำนวน</p>}
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-slate-700">อัตรา (บาท/จำนวน) {req}</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(e.target.value)}
                      placeholder="เช่น 100"
                      min="1"
                      className={`h-[46px] w-full rounded-lg border bg-white pl-7 pr-2 text-sm text-slate-800 outline-none transition-all ${fieldBorder(errRate)}`}
                    />
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">฿</span>
                  </div>
                  {errRate && <p className="mt-1 text-[11.5px] text-rose-500">กรุณากรอกอัตรา</p>}
                </div>
              </div>
            )}

            {/* กล่องราคารวมทั้งหมด */}
            <div className="flex flex-col justify-center border border-gray-200 bg-gray-50 px-4 py-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">ราคารวมทั้งหมด</span>
              <span className="mt-0.5 text-[22px] font-bold tabular-nums text-[#CD0D13]">
                ฿{grandTotal.toLocaleString('th-TH')}
              </span>
              {billingMode === 'group' && selectedStudentIds.length > 0 && (
                <span className="mt-0.5 text-[11px] text-slate-500">
                  หารเฉลี่ยคนละ ฿{perPersonRounded.toLocaleString('th-TH')}
                  {hasRounding && (
                    <> · ปัดขึ้นเป็นจำนวนเต็มบาทจาก ฿{perPersonRaw.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    {' '}(เก็บรวม ฿{grandTotal.toLocaleString('th-TH')} จากต้นทุน ฿{groupTotal.toLocaleString('th-TH')} — ส่วนต่าง ฿{(grandTotal - groupTotal).toLocaleString('th-TH', { maximumFractionDigits: 2 })} เข้าสถาบัน)</>
                  )}
                </span>
              )}
            </div>
          </div>

          {/* 7) คำอธิบายรายละเอียดบิล */}
          <div>
            <label className="mb-1.5 block text-sm text-slate-700">คำอธิบายรายละเอียดบิล {req}</label>
            <textarea
              rows={2}
              value={billingDescription}
              onChange={(e) => setBillingDescription(e.target.value)}
              placeholder="เช่น ค่าลูกแบต หรือ ค่าเช่าสนาม"
              className={`w-full rounded-lg border bg-white p-4 text-sm text-slate-800 outline-none transition-all ${fieldBorder(errDesc)}`}
            />
            {errDesc && <p className="mt-1 text-[11.5px] text-rose-500">กรุณากรอกคำอธิบายรายละเอียดบิล</p>}
          </div>

          {/* 8) ปุ่มส่ง */}
          <button
            type="submit"
            disabled={selectedStudentIds.length === 0 || submitting || hasError}
            className="h-[52px] w-full rounded-xl bg-[#CD0D13] text-[15px] font-bold text-white transition-colors hover:bg-[#A30A0E] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting
              ? 'กำลังออกบิล…'
              : selectedStudentIds.length > 0
                ? `ออกบิลให้ผู้เรียน ${selectedStudentIds.length} คน`
                : 'เลือกผู้เรียนก่อน'}
          </button>
        </form>
      </div>

      {/* ───────── คอลัมน์ขวา: บิลที่ออกล่าสุด ───────── */}
      <div className="min-w-0 border border-gray-200 bg-white p-6">
        <div className="flex items-baseline justify-between gap-3 border-b border-gray-200 pb-4">
          <h3 className="text-lg font-semibold text-slate-900">บิลที่ออกล่าสุด</h3>
          {billings.length > 0 && (
            <span className="whitespace-nowrap text-xs text-slate-500">{billings.length} ใบ</span>
          )}
        </div>

        {billings.length === 0 ? (
          <div className="flex min-h-[160px] items-center justify-center text-center">
            <p className="text-xs text-slate-500">ยังไม่มีบิลที่ออก</p>
          </div>
        ) : (
          <div className="max-h-[560px] divide-y divide-gray-100 overflow-y-auto no-scrollbar">
            {billings.slice(0, 20).map(b => {
              const isPaid = b.billingstatus === 'paid';
              const isWait = b.billingstatus === 'waitcheck';
              const canEdit = !isPaid && !isWait;
              const chip = isPaid
                ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                : isWait
                  ? 'border-amber-200 bg-amber-50 text-amber-600'
                  : 'border-rose-200 bg-rose-50 text-rose-600';
              const chipText = isPaid ? 'ชำระแล้ว' : isWait ? 'รอตรวจสอบ' : 'ค้างชำระ';

              return (
                <div key={b.invoice_id ? `bill-${b.id}-inv-${b.invoice_id}` : `bill-${b.id}`} className="py-[15px]">
                  {/* บรรทัด 1: ชื่อ + chip */}
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-slate-900">
                      {b.customer ? `${b.customer.firstName} ${b.customer.lastName}` : "ผู้เรียน"}
                    </span>
                    <span className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${chip}`}>
                      {chipText}
                    </span>
                  </div>
                  {/* บรรทัด 2: คำอธิบาย · ประเภท */}
                  <p className="mt-0.5 truncate text-[11.5px] text-slate-500">
                    {b.billingdescription} · ประเภท: {b.billing_type?.billingtypename || "ทั่วไป"}
                  </p>
                  {/* บรรทัด 2.5: ผู้ออกบิล + ผู้แก้ไขล่าสุด */}
                  {b.admin && (
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">
                      ออกโดย {b.admin.firstName} {b.admin.lastName}
                    </p>
                  )}
                  {b.updated_by && (
                    <p className="truncate text-[11px] text-slate-400">
                      แก้ไขล่าสุดโดย {b.updated_by.firstName} {b.updated_by.lastName}
                    </p>
                  )}
                  {/* บรรทัด 3: ยอด + ลิงก์แก้ไข */}
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <span className="text-[14px] font-medium tabular-nums text-slate-900">
                      ฿{b.billingamount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </span>
                    <button
                      type="button"
                      onClick={() => canEdit && onOpenEditBilling(b)}
                      disabled={!canEdit}
                      title={canEdit ? "แก้ไขข้อมูลบิล" : "บิลที่ชำระแล้วหรือรอตรวจสอบแก้ไขไม่ได้"}
                      className={`flex items-center gap-0.5 text-[12px] ${canEdit ? 'text-[#CD0D13] hover:underline' : 'cursor-not-allowed text-slate-400'}`}
                    >
                      <Pencil className="h-2.5 w-2.5" />
                      <span>แก้ไข</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
