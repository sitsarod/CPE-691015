import React, { useState, useMemo } from 'react';
import { User, Users, Search, CheckSquare, Tag, Calendar, PlusCircle, AlertCircle, Info, Pencil } from 'lucide-react';
import { BackendUser, BillingDTO } from './types';
import { createBilling } from "@/services/paymentAPI";

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

  // ยอดหารเฉลี่ยแบบกลุ่ม — ถ้ามีเศษให้ปัดขึ้นเป็นจำนวนเต็มบาท
  const groupTotal = (parseFloat(hours) || 0) * (parseFloat(hourlyRate) || 0);
  const perPersonRaw =
    selectedStudentIds.length > 0 ? groupTotal / selectedStudentIds.length : 0;
  const perPersonRounded = Math.ceil(perPersonRaw);
  const hasRounding = perPersonRounded !== perPersonRaw;

  // Filter students based on search query in the form checklist
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const fullName = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase();
      const nickname = (s.customer?.nickname || '').toLowerCase();
      const query = studentSearchQuery.toLowerCase();
      return fullName.includes(query) || nickname.includes(query);
    });
  }, [students, studentSearchQuery]);

  // Student checklist toggler
  const toggleSelectStudent = (id: number) => {
    if (selectedStudentIds.includes(id)) {
      setSelectedStudentIds(selectedStudentIds.filter(sid => sid !== id));
    } else {
      setSelectedStudentIds([...selectedStudentIds, id]);
    }
  };

  // Toggle select all filtered students
  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredStudents.map(s => s.ID);
    const areAllSelected = allFilteredIds.every(id => selectedStudentIds.includes(id));

    if (areAllSelected) {
      setSelectedStudentIds(selectedStudentIds.filter(id => !allFilteredIds.includes(id)));
    } else {
      const newSelection = [...selectedStudentIds];
      allFilteredIds.forEach(id => {
        if (!newSelection.includes(id)) {
          newSelection.push(id);
        }
      });
      setSelectedStudentIds(newSelection);
    }
  };

  const handleCreateBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStudentIds.length === 0) {
      onTriggerToast('กรุณาเลือกผู้เรียนอย่างน้อยหนึ่งคน', 'error');
      return;
    }

    if (billingMode === 'individual') {
      if (!selectedBillingTypeId || !price || !billingDescription || !dueDate) {
        onTriggerToast('กรุณากรอกข้อมูลให้ครบถ้วนทุกช่อง', 'error');
        return;
      }
    } else {
      if (!selectedBillingTypeId || !hours || !hourlyRate || !billingDescription || !dueDate) {
        onTriggerToast('กรุณากรอกข้อมูลให้ครบถ้วนทุกช่อง', 'error');
        return;
      }
    }

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      const adminIdStr = typeof window !== 'undefined' ? localStorage.getItem("user_id") : "1";
      const adminId = parseInt(adminIdStr || "1");

      let calculatedAmount = 0;
      if (billingMode === 'individual') {
        calculatedAmount = parseFloat(price);
      } else {
        // ปัดขึ้นเป็นจำนวนเต็มบาทให้ตรงกับที่แสดงในฟอร์ม
        calculatedAmount = perPersonRounded;
      }

      const payload = {
        customer_ids: selectedStudentIds,
        admin_id: adminId,
        billingtype_id: parseInt(selectedBillingTypeId),
        billingdescription: billingDescription,
        billingamount: calculatedAmount,
        billingdue_date: new Date(dueDate).toISOString()
      };

      await createBilling(payload, token || "");

      onTriggerToast(`ออกบิลเรียกเก็บเงินสำเร็จจำนวน ${selectedStudentIds.length} รายการ`);
      
      // Reset form
      setSelectedStudentIds([]);
      setSelectedBillingTypeId('');
      setPrice('');
      setHours('');
      setHourlyRate('');
      setBillingDescription('');
      setDueDate(getNextWeekDate());
      setStudentSearchQuery('');

      onFetchData();
    } catch (err: unknown) {
      onTriggerToast(err instanceof Error ? err.message : 'ออกบิลไม่สำเร็จ', 'error');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Form Column */}
      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="mb-6 pb-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800">สร้างใบแจ้งค่าใช้จ่ายใหม่</h3>
            <p className="text-xs text-slate-500 mt-0.5">กรอกข้อมูล เลือกประเภทเรียกเก็บเงิน และผู้เรียนปลายทางเพื่อส่งรายการเรียกเก็บ</p>
          </div>
        </div>

        {/* Billing Mode Switcher */}
        <div className="flex bg-slate-100 p-1.5 rounded-xl mb-6 max-w-md">
          <button
            type="button"
            onClick={() => setBillingMode('individual')}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center space-x-1.5 cursor-pointer ${
              billingMode === 'individual'
                ? 'bg-white text-[#CD0D13] shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>ออกบิลรายบุคคล</span>
          </button>
          <button
            type="button"
            onClick={() => setBillingMode('group')}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center space-x-1.5 cursor-pointer ${
              billingMode === 'group'
                ? 'bg-white text-[#CD0D13] shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>ออกบิลแบบกลุ่ม (หารเฉลี่ย)</span>
          </button>
        </div>

        <form onSubmit={handleCreateBilling} className="space-y-5">
          {/* Student Selection Checklist (Multi-select) */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
              <label className="block text-sm font-semibold text-slate-700">เลือกผู้เรียน (เลือกพร้อมกันได้หลายคน) <span className="text-red-500">*</span></label>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleSelectAllFiltered}
                  className="text-xs text-[#CD0D13] hover:text-[#A30A0E] font-bold flex items-center space-x-1 cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>เลือกทั้งหมดตามตัวกรอง</span>
                </button>
              </div>
            </div>

            {/* Search Bar for student list */}
            <div className="relative mb-3">
              <input
                type="text"
                placeholder="ค้นหารายชื่อผู้เรียน..."
                value={studentSearchQuery}
                onChange={(e) => setStudentSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#CD0D13] transition-all outline-none text-sm text-slate-850"
              />
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            </div>

            {/* Scrollable Checklist */}
            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 max-h-52 overflow-y-auto space-y-2">
              {filteredStudents.length === 0 ? (
                <div className="text-center text-slate-450 py-6 text-xs">
                  ไม่พบผู้เรียนที่ตรงกับคำค้นหา
                </div>
              ) : (
                filteredStudents.map(s => {
                  const isChecked = selectedStudentIds.includes(s.ID);
                  return (
                    <label
                      key={s.ID}
                      className={`flex items-center p-2.5 rounded-lg border cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-red-50/50 border-[#CD0D13] text-slate-900 shadow-sm font-semibold'
                          : 'bg-white border-slate-100 hover:border-slate-350 text-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelectStudent(s.ID)}
                        className="w-4 h-4 text-[#CD0D13] rounded border-slate-300 focus:ring-[#CD0D13] accent-red-650 mr-3"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm block truncate">
                          {s.firstName} {s.lastName}
                          {s.customer?.nickname && ` (${s.customer.nickname})`}
                        </span>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            <p className="text-xs text-slate-550 mt-1.5 flex items-center space-x-1">
              <Info className="w-3.5 h-3.5 text-slate-400" />
              <span>
                เลือกไว้ทั้งหมด {selectedStudentIds.length} คน 
                {billingMode === 'individual' 
                  ? ' (ระบบจะสร้างบิลเก็บเงินเต็มจำนวนแยกแต่ละคน)' 
                  : ' (ยอดเงินทั้งหมดจะถูกหารเฉลี่ยตามจำนวนผู้เรียนที่เลือก)'}
              </span>
            </p>
          </div>

          {/* Billing Type and Pricing Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">ประเภทค่าใช้จ่าย <span className="text-red-500">*</span></label>
              <div className="relative">
                <select
                  value={selectedBillingTypeId}
                  onChange={(e) => setSelectedBillingTypeId(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#CD0D13] focus:ring-2 focus:ring-red-100 transition-all outline-none text-slate-800 text-sm appearance-none"
                  required
                >
                  <option value="">-- เลือกประเภท --</option>
                  {BILLING_TYPES.map(type => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
                <Tag className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <div className="absolute right-3.5 top-4 pointer-events-none border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-500 w-0 h-0"></div>
              </div>
            </div>

            {billingMode === 'individual' ? (
              /* Individual Pricing */
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">จำนวนเงินเรียกเก็บต่อคน (บาท) <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="ตัวอย่าง: 1500"
                    min="1"
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#CD0D13] focus:ring-2 focus:ring-red-100 transition-all outline-none text-sm text-slate-800"
                    required
                  />
                  <span className="absolute left-3.5 top-3 text-slate-400 font-bold text-sm">฿</span>
                </div>
              </div>
            ) : (
              /* Group Pricing (Cost-Split Inputs) */
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">จำนวน <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    placeholder="เช่น 10"
                    min="0.1"
                    step="any"
                    className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#CD0D13] focus:ring-2 focus:ring-red-100 transition-all outline-none text-sm text-slate-800"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">อัตรา (บาท/จำนวน) <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input
                      type="number"
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(e.target.value)}
                      placeholder="เช่น 100"
                      min="1"
                      className="w-full pl-7 pr-2 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#CD0D13] focus:ring-2 focus:ring-red-100 transition-all outline-none text-sm text-slate-800"
                      required
                    />
                    <span className="absolute left-2.5 top-3.5 text-slate-400 font-bold text-xs">฿</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {billingMode === 'group' && (
            /* Cost-splitting visual calculations box */
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 grid grid-cols-3 gap-4 text-center">
              <div>
                <span className="text-xxs text-slate-400 block font-semibold uppercase tracking-wider">ราคารวมทั้งหมด</span>
                <span className="text-sm font-bold text-slate-850 mt-1 block">
                  ฿{((parseFloat(hours) || 0) * (parseFloat(hourlyRate) || 0)).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-xxs text-slate-400 block font-semibold uppercase tracking-wider">จำนวนผู้รับ</span>
                <span className="text-sm font-bold text-slate-850 mt-1 block">
                  {selectedStudentIds.length} คน
                </span>
              </div>
              <div>
                <span className="text-xxs text-[#CD0D13] block font-bold uppercase tracking-wider">หารเฉลี่ยตกคนละ</span>
                <span className="text-lg font-black text-[#CD0D13] mt-0.5 block">
                  ฿{perPersonRounded.toLocaleString('th-TH')}
                </span>
                {hasRounding && (
                  <span className="text-[10px] font-medium text-amber-600 block mt-0.5">
                    ปัดขึ้นจาก ฿{perPersonRaw.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">คำอธิบายรายละเอียดบิล <span className="text-red-500">*</span></label>
            <textarea
              rows={2}
              value={billingDescription}
              onChange={(e) => setBillingDescription(e.target.value)}
              placeholder="เช่น ค่าลูกแบต หรือ ค่าเช่าสนาม"
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#CD0D13] focus:ring-2 focus:ring-red-100 transition-all outline-none text-sm text-slate-800"
              required
            />
          </div>

          {/* Due Date Picker */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">วันครบกำหนดชำระเงิน <span className="text-red-500">*</span></label>
            <div className="relative">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#CD0D13] focus:ring-2 focus:ring-red-100 transition-all outline-none text-sm text-slate-800"
                required
              />
              <Calendar className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
            </div>
          </div>

          {/* Auto Calculated Summary Display */}
          <div className="bg-rose-50/50 rounded-2xl p-5 border border-red-100 flex flex-col sm:flex-row items-center justify-between">
            <div className="mb-4 sm:mb-0 text-center sm:text-left">
              <span className="text-xs font-semibold text-[#CD0D13] uppercase tracking-wider block">
                {billingMode === 'individual' ? 'ราคาเรียกเก็บต่อคน' : 'ราคาเฉลี่ยต่อคนหลังจากหาร'}
              </span>
              <h4 className="text-3xl font-extrabold text-slate-900 mt-1">
                {billingMode === 'individual'
                  ? (parseFloat(price) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })
                  : perPersonRounded.toLocaleString('th-TH')} <span className="text-sm font-semibold text-slate-500 font-normal">บาท</span>
              </h4>
              {billingMode === 'group' && hasRounding && (
                <span className="text-xs font-medium text-amber-600 mt-1 block">
                  * ปัดเศษขึ้นจาก ฿{perPersonRaw.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ต่อคน
                </span>
              )}
            </div>
            <button
              type="submit"
              className="w-full sm:w-auto bg-[#CD0D13] hover:bg-[#A30A0E] text-white font-bold px-8 py-3.5 rounded-xl transition-all shadow-md hover:shadow-lg shadow-red-200 flex items-center justify-center space-x-2 cursor-pointer"
            >
              <PlusCircle className="w-5 h-5" />
              <span>ออกบิลส่งบิลเก็บเงิน</span>
            </button>
          </div>
        </form>
      </div>

      {/* Invoices History Column */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col h-[600px] self-start">
        <div className="mb-4 pb-3 border-b border-slate-100">
          <h3 className="text-md font-bold text-slate-800">ประวัติออกบิลล่าสุด</h3>
          <p className="text-xs text-slate-500 mt-0.5">รายการเรียกเก็บเงินที่สร้างส่งให้นักเรียน</p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {billings.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-10">
              <AlertCircle className="w-8 h-8 mb-2" />
              <p className="text-xs">ยังไม่มีรายการออกบิล</p>
            </div>
          ) : (
            billings.slice(0, 15).map(b => (
              <div key={b.invoice_id ? `bill-${b.id}-inv-${b.invoice_id}` : `bill-${b.id}`} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:border-slate-350 transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0 pr-2">
                    <span className="text-[10px] font-bold text-slate-400 block">BILL-{b.id} • {b.billingdue_date?.split('T')[0]}</span>
                    <span className="text-sm font-bold text-slate-800 block truncate mt-0.5">
                      {b.customer ? `${b.customer.firstName} ${b.customer.lastName}` : "ผู้เรียน"}
                    </span>
                    <span className="text-xs text-slate-600 block truncate mt-0.5">{b.billingdescription}</span>
                  </div>
                  <div className="flex flex-col items-end space-y-1.5">
                    <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap ${
                      b.billingstatus === 'paid'
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-250'
                        : b.billingstatus === 'waitcheck'
                        ? 'bg-amber-50 text-amber-600 border border-amber-250'
                        : 'bg-rose-50 text-rose-600 border border-rose-250'
                    }`}>
                      {b.billingstatus === 'paid' ? 'ชำระแล้ว' : b.billingstatus === 'waitcheck' ? 'รอตรวจสอบ' : 'ค้างชำระ'}
                    </span>
                    {(b.billingstatus !== 'paid' && b.billingstatus !== 'waitcheck') && (
                      <button
                        type="button"
                        onClick={() => onOpenEditBilling(b)}
                        className="text-[10px] font-bold text-slate-405 text-slate-400 hover:text-[#CD0D13] flex items-center space-x-0.5 cursor-pointer mt-1"
                        title="แก้ไขข้อมูลบิล"
                      >
                        <Pencil className="w-2.5 h-2.5" />
                        <span>แก้ไข</span>
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="flex items-end justify-between mt-3 pt-2 border-t border-slate-100">
                  <span className="text-[10px] text-slate-500">ประเภท: {b.billing_type?.billingtypename || "ทั่วไป"}</span>
                  <span className="text-sm font-bold text-slate-800">฿{b.billingamount.toLocaleString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
