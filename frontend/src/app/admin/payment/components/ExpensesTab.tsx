import React, { useState } from 'react';
import { Trash2, Loader2, Calculator, Plus, X } from 'lucide-react';
import { Coach, Expense } from './types';
import SlipUploader from '@/components/SlipUploader';
import { createExpense, deleteExpense } from "@/services/paymentAPI";
import { fetchCoachById, fetchCoachSchedules } from "@/services/coachAPI";
import { CreateExpenseReq } from "@/types/payment";

// รายละเอียดการคำนวณค่าจ้างค้างจ่ายของโค้ชที่ถูกเลือก
interface CoachWageInfo {
  loading: boolean;
  error?: string;
  payRate: number;
  sessionsDone: number; // จำนวนคาบที่สอนไปแล้ว (วันสอนผ่านไปแล้ว)
  expected: number;     // ค่าจ้างที่ควรได้ทั้งหมด = sessionsDone * payRate
  alreadyPaid: number;  // ค่าจ้างที่จ่ายให้โค้ชคนนี้ไปแล้ว
  unpaid: number;       // ค้างจ่าย = expected - alreadyPaid (ไม่ต่ำกว่า 0)
}

export interface ExpensesTabProps {
  coaches: Coach[];
  expenses: Expense[];
  onFetchData: () => void;
  onTriggerToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function ExpensesTab({
  coaches,
  expenses,
  onFetchData,
  onTriggerToast
}: ExpensesTabProps) {
  const [expenseForm, setExpenseForm] = useState({
    expenseamount: '',
    expensetype: 'court_rental',
    expensedescription: '',
    expensedate: new Date().toISOString().split('T')[0],
    coach_id: '',
    receipturl: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  // รายการรายได้ส่วนอื่น ๆ (โบนัส/อื่น ๆ) แบบกรอกเอง เฉพาะตอนจ่ายค่าจ้างโค้ช
  // เพิ่มได้หลายรายการ แต่ละรายการมีคำอธิบายและจำนวนเงินของตัวเอง
  const [otherIncomes, setOtherIncomes] = useState<{ description: string; amount: string }[]>([]);
  const [wageInfo, setWageInfo] = useState<CoachWageInfo | null>(null);

  const addOtherIncome = () => {
    setOtherIncomes(prev => [...prev, { description: '', amount: '' }]);
  };

  const updateOtherIncome = (index: number, field: 'description' | 'amount', value: string) => {
    setOtherIncomes(prev => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const removeOtherIncome = (index: number) => {
    setOtherIncomes(prev => prev.filter((_, i) => i !== index));
  };

  // คำนวณค่าจ้างค้างจ่ายของโค้ชที่เลือก แล้วเติมยอดลงช่องจำนวนเงินแบบ fix
  const loadCoachWage = async (coachIdStr: string) => {
    if (!coachIdStr) {
      setWageInfo(null);
      setExpenseForm(prev => ({ ...prev, expenseamount: '' }));
      return;
    }
    const coachId = parseInt(coachIdStr);
    setWageInfo({ loading: true, payRate: 0, sessionsDone: 0, expected: 0, alreadyPaid: 0, unpaid: 0 });
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      const [coach, schedules] = await Promise.all([
        fetchCoachById(coachId, token || ""),
        fetchCoachSchedules(coachId, token || ""),
      ]);

      const payRate = coach.pay_rate_per_session || 0;
      const todayStr = new Date().toISOString().split('T')[0];
      // นับเฉพาะคาบที่วันสอนผ่านไปแล้ว (ยังไม่นับคาบที่ยังไม่ถึงวันสอน)
      const sessionsDone = schedules.filter(s => s.date && s.date.split('T')[0] < todayStr).length;
      const expected = sessionsDone * payRate;
      // ค่าจ้างที่จ่ายให้โค้ชคนนี้ไปแล้ว (จากรายการค่าใช้จ่ายประเภทค่าจ้างโค้ชที่มีอยู่)
      const alreadyPaid = expenses
        .filter(e => e.coach_id === coachId && e.expensetype === 'coach_wages')
        .reduce((sum, e) => sum + e.expenseamount, 0);
      const unpaid = Math.max(expected - alreadyPaid, 0);

      setWageInfo({ loading: false, payRate, sessionsDone, expected, alreadyPaid, unpaid });
      setExpenseForm(prev => ({ ...prev, expenseamount: String(unpaid) }));
    } catch (err: unknown) {
      setWageInfo({
        loading: false,
        error: err instanceof Error ? err.message : 'คำนวณค่าจ้างไม่สำเร็จ',
        payRate: 0, sessionsDone: 0, expected: 0, alreadyPaid: 0, unpaid: 0,
      });
      setExpenseForm(prev => ({ ...prev, expenseamount: '' }));
    }
  };

  // เปลี่ยนประเภทรายจ่าย: เคลียร์ข้อมูลที่ผูกกับการจ่ายค่าจ้างโค้ชทุกครั้ง
  const handleTypeChange = (newType: string) => {
    setWageInfo(null);
    setOtherIncomes([]);
    setExpenseForm(prev => ({ ...prev, expensetype: newType, coach_id: '', expenseamount: '' }));
  };

  const isCoachWages = expenseForm.expensetype === 'coach_wages';
  // สำหรับค่าจ้างโค้ช: ยอดจ่ายรวม = ค่าจ้างค้างจ่าย (fix) + รายได้ส่วนอื่น ๆ ทุกรายการ (กรอกเอง)
  const baseWage = parseFloat(expenseForm.expenseamount) || 0;
  const otherIncomeNum = otherIncomes.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  const totalCoachPayout = baseWage + otherIncomeNum;

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!expenseForm.expensedate) {
      onTriggerToast("กรุณาเลือกวันที่ทำรายการ", 'error');
      return;
    }

    const dateISO = new Date(expenseForm.expensedate).toISOString();
    const typedDesc = expenseForm.expensedescription.trim();

    // เก็บเป็นได้หลายรายการ: ค่าจ้าง fix กับรายได้ส่วนอื่น แยกกันคนละ record เพื่อทำ dashboard แยกหมวด
    const reqBodies: CreateExpenseReq[] = [];

    if (isCoachWages) {
      if (!expenseForm.coach_id) {
        onTriggerToast("กรุณาเลือกโค้ชสำหรับค่าใช้จ่ายค่าจ้างโค้ช", 'error');
        return;
      }
      const coachId = parseInt(expenseForm.coach_id);

      // รายการที่ 1: ค่าจ้างค้างจ่ายที่คำนวณอัตโนมัติ (fix)
      if (baseWage > 0) {
        reqBodies.push({
          expenseamount: baseWage,
          expensetype: 'coach_wages',
          expensedescription: typedDesc || (wageInfo && !wageInfo.error ? `ค่าจ้างค้างจ่าย ${wageInfo.sessionsDone} คาบ` : 'ค่าจ้างโค้ช'),
          expensedate: dateISO,
          receipturl: expenseForm.receipturl,
          coach_id: coachId,
        });
      }

      // รายการรายได้ส่วนอื่น ๆ ที่กรอกเอง แต่ละรายการแยกเป็นคนละ record พร้อมคำอธิบายของตัวเอง
      for (const item of otherIncomes) {
        const itemAmt = parseFloat(item.amount) || 0;
        if (itemAmt <= 0) continue;
        reqBodies.push({
          expenseamount: itemAmt,
          expensetype: 'coach_other',
          expensedescription: item.description.trim() || 'รายได้ส่วนอื่น ๆ',
          expensedate: dateISO,
          receipturl: expenseForm.receipturl,
          coach_id: coachId,
        });
      }

      if (reqBodies.length === 0) {
        onTriggerToast("กรุณากรอกจำนวนเงินค่าจ้างหรือรายได้ส่วนอื่นอย่างน้อยหนึ่งรายการ", 'error');
        return;
      }
    } else {
      const amt = parseFloat(expenseForm.expenseamount) || 0;
      if (!(amt > 0)) {
        onTriggerToast("กรุณากรอกจำนวนเงินให้ถูกต้อง", 'error');
        return;
      }
      reqBodies.push({
        expenseamount: amt,
        expensetype: expenseForm.expensetype,
        expensedescription: typedDesc,
        expensedate: dateISO,
        receipturl: expenseForm.receipturl,
      });
    }

    setIsSubmitting(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      for (const body of reqBodies) {
        await createExpense(body, token || "");
      }

      onTriggerToast(reqBodies.length > 1 ? "บันทึกค่าจ้างและรายได้ส่วนอื่นสำเร็จเรียบร้อย" : "บันทึกค่าใช้จ่ายสำเร็จเรียบร้อย");
      setOtherIncomes([]);
      setWageInfo(null);
      setExpenseForm({
        expenseamount: '',
        expensetype: 'court_rental',
        expensedescription: '',
        expensedate: new Date().toISOString().split('T')[0],
        coach_id: '',
        receipturl: ''
      });
      onFetchData();
    } catch (err: unknown) {
      onTriggerToast(err instanceof Error ? err.message : 'บันทึกค่าใช้จ่ายไม่สำเร็จ', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteExpense = async (id: number) => {
    if (!window.confirm("คุณแน่ใจหรือไม่ว่าต้องการลบรายการค่าใช้จ่ายนี้อย่างถาวร?")) return;

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      await deleteExpense(id, token || "");

      onTriggerToast("ลบรายการค่าใช้จ่ายสำเร็จเรียบร้อย");
      onFetchData();
    } catch (err: unknown) {
      onTriggerToast(err instanceof Error ? err.message : 'ลบรายการไม่สำเร็จ', 'error');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
      {/* Form Column */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 self-start">
        <div className="mb-5 pb-3 border-b border-slate-100">
          <h3 className="text-md font-bold text-slate-800">บันทึกค่าใช้จ่ายใหม่</h3>
          <p className="text-xs text-slate-500 mt-0.5">กรอกข้อมูลเพื่อบันทึกรายการใช้จ่ายในระบบ</p>
        </div>

        <form onSubmit={handleSaveExpense} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 block">ประเภทรายจ่าย</label>
            <select
              value={expenseForm.expensetype}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-xs outline-none focus:bg-white text-slate-800 font-medium"
            >
              <option value="court_rental">ค่าเช่าสนาม</option>
              <option value="coach_wages">ค่าจ้างโค้ช</option>
              <option value="equipment">ค่าอุปกรณ์</option>
              <option value="advertising">ค่าโฆษณา</option>
              <option value="other">อื่นๆ</option>
            </select>
          </div>

          {isCoachWages && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 block">เลือกโค้ช</label>
              <select
                value={expenseForm.coach_id}
                onChange={(e) => {
                  const coachId = e.target.value;
                  setExpenseForm(prev => ({ ...prev, coach_id: coachId }));
                  loadCoachWage(coachId);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-xs outline-none focus:bg-white text-slate-800 font-medium"
              >
                <option value="">-- กรุณาเลือกโค้ช --</option>
                {coaches.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nickname} ({c.firstName || ''} {c.lastName || ''})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* สรุปการคำนวณค่าจ้างค้างจ่าย — แสดงเมื่อเลือกโค้ชแล้ว */}
          {isCoachWages && expenseForm.coach_id && wageInfo && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-slate-700">
                <Calculator className="w-3.5 h-3.5 text-[#CD0D13]" />
                <span className="text-xs font-bold">การคำนวณค่าจ้างค้างจ่าย</span>
              </div>
              {wageInfo.loading ? (
                <div className="flex items-center gap-2 text-slate-500 text-xs py-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> กำลังคำนวณ...
                </div>
              ) : wageInfo.error ? (
                <p className="text-[11px] text-rose-600">{wageInfo.error}</p>
              ) : (
                <div className="text-[11px] text-slate-600 space-y-0.5">
                  <div className="flex justify-between">
                    <span>คาบที่สอนแล้ว × ค่าจ้างต่อคาบ</span>
                    <span className="font-semibold text-slate-800">{wageInfo.sessionsDone} × ฿{wageInfo.payRate.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ค่าจ้างที่ควรได้ทั้งหมด</span>
                    <span className="font-semibold text-slate-800">฿{wageInfo.expected.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1 mt-1">
                    <span className="font-bold text-slate-700">คงค้างจ่าย</span>
                    <span className="font-bold text-[#CD0D13]">฿{wageInfo.unpaid.toLocaleString()}</span>
                  </div>
                  {wageInfo.payRate === 0 && (
                    <p className="text-[10px] text-amber-600 pt-1">
                      ยังไม่ได้ตั้งค่าอัตราค่าจ้างต่อคาบของโค้ชคนนี้ ยอดจึงเป็น 0
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {isCoachWages ? (
            <>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 block">
                  ค่าจ้างค้างจ่าย (คำนวณอัตโนมัติ)
                </label>
                <input
                  type="number"
                  value={expenseForm.expenseamount}
                  readOnly
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-250 rounded-xl text-xs outline-none text-slate-800 font-semibold cursor-not-allowed"
                />
                <p className="text-[10px] text-slate-400">คำนวณจากค่าจ้างที่ยังไม่ได้จ่ายโดยอัตโนมัติ</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-600 block">รายได้ส่วนอื่น ๆ (กรอกเอง)</label>
                  <button
                    type="button"
                    onClick={addOtherIncome}
                    className="flex items-center gap-1 text-[11px] font-bold text-[#CD0D13] hover:text-[#A30A0E] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> เพิ่มรายการ
                  </button>
                </div>

                {otherIncomes.length === 0 ? (
                  <p className="text-[10px] text-slate-400">เช่น โบนัส หรือรายได้อื่นที่ต้องการจ่ายเพิ่ม กด &quot;เพิ่มรายการ&quot; เพื่อระบุได้หลายรายการ</p>
                ) : (
                  <div className="space-y-2">
                    {otherIncomes.map((item, index) => (
                      <div key={`other-income-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-500">รายการที่ {index + 1}</span>
                          <button
                            type="button"
                            onClick={() => removeOtherIncome(index)}
                            className="p-1 rounded-full text-slate-400 hover:bg-rose-50 hover:text-[#CD0D13] cursor-pointer"
                            title="ลบรายการนี้"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="รายละเอียด เช่น โบนัสผลงาน, ค่าเดินทาง"
                          value={item.description}
                          onChange={(e) => updateOtherIncome(index, 'description', e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-250 rounded-lg text-xs outline-none focus:bg-white text-slate-800"
                        />
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={item.amount}
                          onChange={(e) => updateOtherIncome(index, 'amount', e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-250 rounded-lg text-xs outline-none focus:bg-white text-slate-800"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-[#FFF0F0] border border-rose-100 px-3 py-2.5 space-y-0.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-700">รวมยอดจ่ายทั้งสิ้น</span>
                  <span className="text-sm font-black text-[#CD0D13]">฿{totalCoachPayout.toLocaleString()}</span>
                </div>
                {baseWage > 0 && otherIncomeNum > 0 && (
                  <p className="text-[10px] text-slate-400">จะบันทึกแยกเป็น {1 + otherIncomes.filter(i => (parseFloat(i.amount) || 0) > 0).length} รายการ: ค่าจ้าง ฿{baseWage.toLocaleString()} และรายได้ส่วนอื่นรวม ฿{otherIncomeNum.toLocaleString()}</p>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 block">จำนวนเงิน (บาท)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={expenseForm.expenseamount}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, expenseamount: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-xs outline-none focus:bg-white text-slate-800"
                required
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 block">วันที่ทำรายการ</label>
            <input
              type="date"
              value={expenseForm.expensedate}
              onChange={(e) => setExpenseForm(prev => ({ ...prev, expensedate: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-55 bg-slate-50 border border-slate-250 rounded-xl text-xs outline-none focus:bg-white text-slate-800"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 block">รายละเอียด / คำอธิบายเพิ่มเติม</label>
            <textarea
              rows={3}
              placeholder="ระบุข้อความคำอธิบายค่าใช้จ่าย..."
              value={expenseForm.expensedescription}
              onChange={(e) => setExpenseForm(prev => ({ ...prev, expensedescription: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-55 bg-slate-50 border border-slate-250 rounded-xl text-xs outline-none focus:bg-white text-slate-800 resize-none"
            />
          </div>

          {/* Using the Global Reusable SlipUploader Component */}
          <SlipUploader
            label="แนบหลักฐานชำระเงิน (ควรมี)"
            currentUrl={expenseForm.receipturl}
            onUploadSuccess={(url) => setExpenseForm(prev => ({ ...prev, receipturl: url }))}
            onError={(msg) => onTriggerToast(msg, 'error')}
          />

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#CD0D13] hover:bg-[#A30A0E] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-xs py-3 rounded-xl transition-all shadow-md hover:shadow-lg cursor-pointer text-center"
          >
            {isSubmitting ? 'กำลังบันทึก...' : 'บันทึกค่าใช้จ่าย'}
          </button>
        </form>
      </div>

      {/* List Column */}
      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col self-start">
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-md font-bold text-slate-800">รายการบันทึกค่าใช้จ่ายทั้งหมด</h3>
          <p className="text-xs text-slate-500 mt-0.5">รวมประวัติการทำรายการจ่ายเงินออกของสถาบัน</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-5">วันที่ทำรายการ</th>
                <th className="py-3 px-5">หมวดหมู่</th>
                <th className="py-3 px-5">รายละเอียด</th>
                <th className="py-3 px-5">ผู้รับเงิน (โค้ช)</th>
                <th className="py-3 px-5 text-right">ยอดจ่าย</th>
                <th className="py-3 px-5">หลักฐาน</th>
                <th className="py-3 px-5 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">
                    <p className="text-xs">ยังไม่มีรายการบันทึกค่าใช้จ่ายในขณะนี้</p>
                  </td>
                </tr>
              ) : (
                expenses.map(exp => {
                  let displayName = "อื่นๆ";
                  if (exp.expensetype === "coach_wages") displayName = "ค่าจ้างโค้ช";
                  else if (exp.expensetype === "coach_other") displayName = "รายได้อื่น (โค้ช)";
                  else if (exp.expensetype === "court_rental") displayName = "ค่าเช่าสนาม";
                  else if (exp.expensetype === "equipment") displayName = "ค่าอุปกรณ์";
                  else if (exp.expensetype === "advertising") displayName = "ค่าโฆษณา";
                  else if (exp.expensetype === "other") displayName = "อื่นๆ";

                  return (
                    <tr key={exp.id} className="hover:bg-slate-50/50 text-xs transition-colors">
                      <td className="py-3.5 px-5 text-slate-550 font-semibold">{exp.expensedate?.split('T')[0]}</td>
                      <td className="py-3.5 px-5 font-bold text-slate-700">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] ${
                          exp.expensetype === 'coach_wages'
                            ? 'bg-rose-50 text-rose-600 border border-rose-100'
                            : exp.expensetype === 'coach_other'
                            ? 'bg-violet-50 text-violet-600 border border-violet-100'
                            : exp.expensetype === 'court_rental'
                            ? 'bg-amber-50 text-amber-600 border border-amber-100'
                            : 'bg-slate-50 text-slate-600 border border-slate-200'
                        }`}>
                          {displayName}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-slate-550 max-w-xs truncate" title={exp.expensedescription}>
                        {exp.expensedescription || "-"}
                      </td>
                      <td className="py-3.5 px-5 font-medium text-slate-800">
                        {exp.coach ? `${exp.coach.nickname}` : "-"}
                      </td>
                      <td className="py-3.5 px-5 text-right font-bold text-slate-900">
                        ฿{exp.expenseamount.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-5">
                        {exp.receipturl ? (
                          <a
                            href={exp.receipturl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#CD0D13] hover:underline font-bold text-[10px] flex items-center space-x-0.5"
                          >
                            <span>เปิดดูรูป</span>
                          </a>
                        ) : (
                          <span className="text-slate-400 text-[10px]">-</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(exp.id)}
                          className="p-1.5 rounded-full hover:bg-rose-50 text-slate-405 text-slate-405 hover:text-[#CD0D13] transition-colors cursor-pointer"
                          title="ลบรายการค่าใช้จ่าย"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
