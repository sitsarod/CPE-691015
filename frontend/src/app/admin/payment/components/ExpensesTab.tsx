import React, { useState, useEffect } from 'react';
import { Trash2, Loader2, Plus, X, QrCode, Copy } from 'lucide-react';
import { Coach, Expense } from './types';
import SlipUploader from '@/components/SlipUploader';
import ImageLightbox from '@/components/ImageLightbox';
import { useHorizontalWheelScroll } from '@/hooks/useHorizontalWheelScroll';
import { createExpense, deleteExpense } from "@/services/paymentAPI";
import { fetchCoachById, fetchCoachPayroll } from "@/services/coachAPI";
import type { CoachPayrollLine } from "@/services/coachAPI";
import { CreateExpenseReq } from "@/types/payment";

// รายละเอียดการคำนวณค่าจ้างค้างจ่ายของโค้ชที่ถูกเลือก
interface CoachWageInfo {
  loading: boolean;
  error?: string;
  paymentType: 'per_session' | 'monthly';
  payRate: number;
  sessionsDone: number; // จำนวนคาบที่สอนไปแล้ว (วันสอนผ่านไปแล้ว) — ใช้เฉพาะโค้ชรายครั้ง
  expected: number;     // ค่าจ้างที่ควรได้ทั้งหมด = sessionsDone * payRate (รายครั้ง) หรือ = payRate เต็มจำนวน (รายเดือน)
  alreadyPaid: number;  // ค่าจ้างที่จ่ายให้โค้ชคนนี้ไปแล้ว (รายครั้ง = สะสมทั้งหมด, รายเดือน = เฉพาะเดือนนี้)
  unpaid: number;       // ยอดที่เติมลงช่องจำนวนเงินให้อัตโนมัติ

  // จำนวนคาบที่สอนไปแล้วแต่ยังไม่มีรอบเช็คชื่อ จึงยังไม่ถูกนับรวมใน sessionsDone
  //
  // ⚠️ ตัวเลขนี้คือเงินที่ยังไม่ได้อยู่ในยอดข้างบน ไม่ใช่ข้อมูลประกอบ
  // ถ้าไม่แสดง แอดมินจะจ่ายตามยอดที่ขาดไปโดยไม่รู้ตัว
  // เคลียร์ได้ที่ /admin/attendance/missed
  unresolvedSessions?: number;
  unresolvedAmount?: number;

  // "8 คาบ × ฿300" + "4 คาบ × ฿400" — ทำให้แอดมินตรวจได้ว่ายอดรวมมาจากไหน
  rateBreakdown?: CoachPayrollLine[];
  periodNote?: string;
  // ข้อมูลบัญชีรับเงินของโค้ช — ไว้สร้าง QR พร้อมเพย์ + แสดงเลขบัญชีให้แอดมินโอน
  promptPay?: string;
  bankName?: string;    // ชื่อธนาคาร (คอลัมน์ bank_account)
  accountNo?: string;   // เลขบัญชี (คอลัมน์ payment_info)
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
  // รูปหลักฐาน/ใบเสร็จที่เปิดดูแบบป็อปอัพ (ไม่เปิดแท็บใหม่)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  const tableScrollRef = useHorizontalWheelScroll<HTMLDivElement>();

  // แบ่งหน้าตารางค่าใช้จ่าย 10 รายการ/หน้า
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  // รีเซ็ตกลับหน้าแรกเมื่อจำนวนรายการเปลี่ยน (เพิ่ม/ลบ)
  useEffect(() => {
    setPage(1);
  }, [expenses.length]);
  const totalPages = Math.max(1, Math.ceil(expenses.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedExpenses = expenses.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
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

  // คัดลอกเลขบัญชี/พร้อมเพย์ลงคลิปบอร์ด — เผื่อแอดมินโอนเองไม่สะดวกสแกน
  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onTriggerToast(`คัดลอก${label}แล้ว`, 'info');
    } catch {
      onTriggerToast('คัดลอกไม่สำเร็จ', 'error');
    }
  };

  // ดึงยอดค่าจ้างที่ backend คำนวณให้ แล้วเติมลงช่องจำนวนเงิน
  //
  // ⚠️ ห้ามคำนวณยอดเองที่นี่อีก
  //
  // เดิมฟังก์ชันนี้คิดเองทั้งหมด: expected = sessionsDone × payRate แล้วลบด้วย
  // ยอดที่จ่ายไปแล้ว ซึ่งพังสองทาง — backend ไม่เคยตรวจว่ายอดที่ส่งมาถูกไหม
  // และการคูณด้วย "เรตปัจจุบัน" ทำให้วันที่ขึ้นค่าจ้าง หนี้ย้อนหลังโผล่มาเป็นก้อน
  //
  // ตอนนี้แหล่งความจริงเดียวคือ GET /coaches/:id/payroll
  // (backend: services/coach_payroll.go — คิดจากสแนปช็อตเรตของแต่ละคาบ)
  const loadCoachWage = async (coachIdStr: string) => {
    if (!coachIdStr) {
      setWageInfo(null);
      setExpenseForm(prev => ({ ...prev, expenseamount: '' }));
      return;
    }
    const coachId = parseInt(coachIdStr);
    setWageInfo({ loading: true, paymentType: 'per_session', payRate: 0, sessionsDone: 0, expected: 0, alreadyPaid: 0, unpaid: 0 });
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;

      // payroll = ตัวเลขเรื่องเงินทั้งหมด · coach = ข้อมูลบัญชีรับเงินสำหรับสร้าง QR
      const [payroll, coach] = await Promise.all([
        fetchCoachPayroll(coachId, token || ""),
        fetchCoachById(coachId, token || ""),
      ]);

      setWageInfo({
        loading: false,
        paymentType: payroll.payment_type,
        payRate: payroll.pay_rate,
        sessionsDone: payroll.sessions_done,
        expected: payroll.expected,
        alreadyPaid: payroll.already_paid,
        unpaid: payroll.unpaid,
        unresolvedSessions: payroll.unresolved_sessions,
        unresolvedAmount: payroll.unresolved_amount,
        rateBreakdown: payroll.rate_breakdown,
        periodNote: payroll.period_note,
        promptPay: coach.prompt_pay || '',
        bankName: coach.bank_account || '',
        accountNo: coach.payment_info || '',
      });
      setExpenseForm(prev => ({ ...prev, expenseamount: String(payroll.unpaid) }));
    } catch (err: unknown) {
      setWageInfo({
        loading: false,
        error: err instanceof Error ? err.message : 'คำนวณค่าจ้างไม่สำเร็จ',
        paymentType: 'per_session', payRate: 0, sessionsDone: 0, expected: 0, alreadyPaid: 0, unpaid: 0,
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
          expensedescription: typedDesc || (wageInfo && !wageInfo.error
            ? (wageInfo.paymentType === 'monthly' ? 'ค่าจ้างรายเดือน' : `ค่าจ้างค้างจ่าย ${wageInfo.sessionsDone} คาบ`)
            : 'ค่าจ้างโค้ช'),
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
      <div className="bg-white border border-gray-200 p-6 self-start">
        <form onSubmit={handleSaveExpense} className="space-y-4">
          <div className={`grid grid-cols-1 gap-4 ${isCoachWages ? 'md:grid-cols-2' : ''}`}>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 block">ประเภทรายจ่าย</label>
              <select
                value={expenseForm.expensetype}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:bg-white text-slate-800 font-medium"
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
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:bg-white text-slate-800 font-medium"
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
          </div>

          {/* สรุปการคำนวณค่าจ้างค้างจ่าย — แสดงเมื่อเลือกโค้ชแล้ว */}
          {isCoachWages && expenseForm.coach_id && wageInfo && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1.5">
              {wageInfo.loading ? (
                <div className="flex items-center gap-2 text-slate-500 text-xs py-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> กำลังคำนวณ...
                </div>
              ) : wageInfo.error ? (
                <p className="text-[11px] text-rose-600">{wageInfo.error}</p>
              ) : wageInfo.paymentType === 'monthly' ? (
                <div className="text-[11px] text-slate-600 space-y-1.5">
                  <div className="flex justify-between">
                    <span>อัตราต่อเดือน</span>
                    <span className="font-semibold text-slate-800 tabular-nums">฿{wageInfo.payRate.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>จ่ายไปแล้วทั้งหมด</span>
                    <span className="font-semibold text-slate-800 tabular-nums">฿{wageInfo.alreadyPaid.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-slate-200 pt-2 mt-0.5">
                    <span className="text-xs font-bold text-slate-700">ค่าจ้างค้างจ่าย</span>
                    <span className="text-lg font-black text-[#CD0D13] tabular-nums">฿{wageInfo.unpaid.toLocaleString()}</span>
                  </div>
                  {wageInfo.payRate === 0 && (
                    <p className="text-[10px] text-amber-600 pt-1">
                      ยังไม่ได้ตั้งค่าอัตราค่าจ้างต่อเดือนของโค้ชคนนี้ ยอดจึงเป็น 0
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-slate-600 space-y-1.5">
                  <div className="flex justify-between">
                    <span>ค่าจ้างที่ควรได้ทั้งหมด</span>
                    <span className="font-semibold text-slate-800 tabular-nums">฿{wageInfo.expected.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>จ่ายไปแล้วทั้งหมด</span>
                    <span className="font-semibold text-slate-800 tabular-nums">฿{wageInfo.alreadyPaid.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-slate-200 pt-2 mt-0.5">
                    <span className="text-xs font-bold text-slate-700">ค่าจ้างค้างจ่าย</span>
                    <span className="text-lg font-black text-[#CD0D13] tabular-nums">฿{wageInfo.unpaid.toLocaleString()}</span>
                  </div>
                  {/* ที่มาของยอด — แยกตามอัตราที่บันทึกไว้ในแต่ละคาบ ไม่ใช่ "จำนวนคาบ × เรตปัจจุบัน"
                      โค้ชที่เคยถูกปรับค่าจ้างจะเห็นหลายช่วง และตรวจย้อนได้ว่ายอดมาจากไหน */}
                  {(wageInfo.rateBreakdown?.length ?? 0) > 0 ? (
                    <div className="pt-1.5">
                      <p className="text-[10px] font-semibold text-slate-500">ที่มาของยอด</p>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        {wageInfo.rateBreakdown!.map(line => `${line.sessions} คาบ × ฿${line.pay_rate.toLocaleString()}`).join(' · ')}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 pt-1">
                      {wageInfo.periodNote ?? `คาบที่สอนจริง ${wageInfo.sessionsDone} คาบ · นับเฉพาะคาบที่ปิดรอบเช็คชื่อแล้ว`}
                    </p>
                  )}
                  {wageInfo.payRate === 0 && (
                    <p className="text-[10px] text-amber-600 pt-1">
                      ยังไม่ได้ตั้งค่าอัตราค่าจ้างต่อคาบของโค้ชคนนี้ ยอดจึงเป็น 0
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* คาบที่ค้างรอบเช็คชื่อ — เตือนแยกนอกกล่องคำนวณ (design 5d)
              ถ้าไม่เตือน แอดมินจะจ่ายตามยอดที่ขาดไปโดยไม่รู้ตัว */}
          {isCoachWages && expenseForm.coach_id && wageInfo && !wageInfo.loading && !wageInfo.error && (wageInfo.unresolvedSessions ?? 0) > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
              <p className="text-[10px] font-semibold text-amber-800">
                ยังมีอีก {wageInfo.unresolvedSessions} คาบที่ไม่มีรอบเช็คชื่อ
                {(wageInfo.unresolvedAmount ?? 0) > 0 && ` (฿${wageInfo.unresolvedAmount!.toLocaleString()})`}
                {' '}จึงยังไม่ถูกนับในยอดนี้
              </p>
              <a
                href="/admin/attendance/missed"
                className="text-[10px] font-medium text-amber-900 underline"
              >
                เคลียร์คาบที่ค้างก่อนจ่าย
              </a>
            </div>
          )}

          {isCoachWages ? (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-600 block">รายได้ส่วนอื่น ๆ (กรอกเอง)</label>
                  <button
                    type="button"
                    onClick={addOtherIncome}
                    className="flex items-center gap-1 text-[11px] font-bold text-[#CD0D13] hover:text-white hover:bg-[#CD0D13] border border-[#CD0D13]/40 rounded-lg px-2.5 py-1 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> เพิ่มรายการ
                  </button>
                </div>

                {otherIncomes.length === 0 ? (
                  <p className="text-[10px] text-slate-400">เช่น โบนัส หรือรายได้อื่นที่ต้องการจ่ายเพิ่ม กด &quot;เพิ่มรายการ&quot; เพื่อระบุได้หลายรายการ</p>
                ) : (
                  <div className="space-y-2">
                    {otherIncomes.map((item, index) => (
                      <div key={`other-income-${index}`} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="รายละเอียด เช่น โบนัสผลงาน, ค่าเดินทาง"
                          value={item.description}
                          onChange={(e) => updateOtherIncome(index, 'description', e.target.value)}
                          className="flex-1 min-w-0 px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:bg-white text-slate-800"
                        />
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={item.amount}
                          onChange={(e) => updateOtherIncome(index, 'amount', e.target.value)}
                          className="w-28 shrink-0 px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:bg-white text-slate-800 text-right tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() => removeOtherIncome(index)}
                          className="shrink-0 p-1.5 rounded-full text-slate-400 hover:bg-rose-50 hover:text-[#CD0D13] cursor-pointer"
                          title="ลบรายการนี้"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 pt-3 space-y-0.5">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-700">รวมยอดจ่ายทั้งสิ้น</span>
                  <span className="text-xl font-black text-[#CD0D13] tabular-nums">฿{totalCoachPayout.toLocaleString()}</span>
                </div>
                {baseWage > 0 && otherIncomeNum > 0 && (
                  <p className="text-[10px] text-slate-400">จะบันทึกแยกเป็น {1 + otherIncomes.filter(i => (parseFloat(i.amount) || 0) > 0).length} รายการ: ค่าจ้าง ฿{baseWage.toLocaleString()} และรายได้ส่วนอื่นรวม ฿{otherIncomeNum.toLocaleString()}</p>
                )}
              </div>

              {/* ช่องทางจ่ายเงินให้โค้ช: QR พร้อมเพย์ (ยอด = ยอดจ่ายรวม) + เลขบัญชีเผื่อสแกนไม่สะดวก */}
              {expenseForm.coach_id && wageInfo && !wageInfo.loading && !wageInfo.error && (
                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <QrCode className="w-3.5 h-3.5 text-[#CD0D13]" />
                    <span className="text-xs font-bold">ช่องทางจ่ายเงินให้โค้ช</span>
                  </div>

                  {/* แนวนอน: QR ซ้าย · รายละเอียดบัญชีขวา (design 5d) */}
                  <div className="flex items-start gap-3">
                    <div className="shrink-0">
                      {wageInfo.promptPay && totalCoachPayout > 0 ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`https://promptpay.io/${wageInfo.promptPay}/${totalCoachPayout.toFixed(2)}.png`}
                            alt="PromptPay QR"
                            className="w-28 h-28 rounded-lg border border-slate-100"
                          />
                        </>
                      ) : (
                        <div className="w-28 h-28 rounded-lg border border-dashed border-slate-200 grid place-items-center px-2 text-center">
                          <span className="text-[9px] text-slate-400 leading-tight">
                            {wageInfo.promptPay ? 'ยอดจ่ายเป็น 0 — ยังไม่สร้าง QR' : 'โค้ชยังไม่ได้ตั้งพร้อมเพย์'}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        {wageInfo.promptPay && totalCoachPayout > 0
                          ? `สแกนด้วยแอปธนาคาร · ยอด ฿${totalCoachPayout.toLocaleString()}`
                          : 'ใช้โอนผ่านเลขบัญชีด้านล่างแทน'}
                      </p>

                      {/* เลขบัญชี เผื่อไม่สะดวกสแกน */}
                      <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] text-slate-500">เลขบัญชี · {wageInfo.bankName || "—"}</p>
                            <p className="text-sm font-bold text-slate-800 tabular-nums truncate">{wageInfo.accountNo || "-"}</p>
                            {wageInfo.promptPay && (
                              <p className="text-[10px] text-slate-500 mt-0.5">พร้อมเพย์ {wageInfo.promptPay}</p>
                            )}
                          </div>
                          {wageInfo.accountNo && (
                            <button
                              type="button"
                              onClick={() => copyText(wageInfo.accountNo!, 'เลขบัญชี')}
                              className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-[#CD0D13] transition-colors cursor-pointer"
                              title="คัดลอกเลขบัญชี"
                            >
                              <Copy className="w-3 h-3" /> คัดลอก
                            </button>
                          )}
                        </div>
                        {!wageInfo.bankName && !wageInfo.accountNo && (
                          <p className="text-[10px] text-amber-600 mt-1">โค้ชยังไม่ได้กรอกข้อมูลบัญชีรับเงิน</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:bg-white text-slate-800"
                required
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 block">วันที่ทำรายการ</label>
              <input
                type="date"
                value={expenseForm.expensedate}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, expensedate: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-55 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:bg-white text-slate-800"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 block">รายละเอียด / คำอธิบายเพิ่มเติม</label>
              <input
                type="text"
                placeholder="ระบุข้อความคำอธิบายค่าใช้จ่าย..."
                value={expenseForm.expensedescription}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, expensedescription: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-55 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:bg-white text-slate-800"
              />
            </div>
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
      <div className="lg:col-span-2 bg-white border border-gray-200 overflow-hidden flex flex-col self-start">
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-md font-bold text-slate-800">รายการบันทึกค่าใช้จ่ายทั้งหมด</h3>
        </div>

        <div ref={tableScrollRef} className="overflow-x-auto no-scrollbar">
          <table className="w-full md:min-w-[720px] text-left border-collapse">
            <thead>
              <tr className="text-slate-500 text-[10px] font-medium uppercase tracking-[0.14em] border-b border-slate-200">
                <th className="py-3 px-5">วันที่ทำรายการ</th>
                <th className="py-3 px-5 hidden md:table-cell">หมวดหมู่</th>
                <th className="py-3 px-5">รายละเอียด</th>
                <th className="py-3 px-5 hidden md:table-cell">ผู้รับเงิน (โค้ช)</th>
                <th className="py-3 px-5 text-right">ยอดจ่าย</th>
                <th className="py-3 px-5 hidden md:table-cell">หลักฐาน</th>
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
                pagedExpenses.map(exp => {
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
                      <td className="py-3.5 px-5 font-bold text-slate-700 hidden md:table-cell">
                        <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-[9px] ${
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
                      <td className="py-3.5 px-5 font-medium text-slate-800 hidden md:table-cell">
                        {exp.coach ? `${exp.coach.nickname}` : "-"}
                      </td>
                      <td className="py-3.5 px-5 text-right font-bold text-slate-900">
                        ฿{exp.expenseamount.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-5 hidden md:table-cell">
                        {exp.receipturl ? (
                          <button
                            type="button"
                            onClick={() => setReceiptUrl(exp.receipturl)}
                            className="text-[#CD0D13] hover:underline font-bold text-[10px] flex items-center space-x-0.5 cursor-pointer"
                          >
                            <span>เปิดดูรูป</span>
                          </button>
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

        {/* Pagination controls */}
        {expenses.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-slate-200 text-xs">
            <span className="text-slate-500">
              แสดง {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, expenses.length)} จาก {expenses.length} รายการ
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ก่อนหน้า
              </button>
              <span className="text-slate-600 font-semibold whitespace-nowrap">หน้า {safePage}/{totalPages}</span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ถัดไป
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ป็อปอัพดูรูปหลักฐาน/ใบเสร็จ — ไม่เปิดแท็บใหม่ */}
      <ImageLightbox url={receiptUrl} onClose={() => setReceiptUrl(null)} alt="หลักฐานการชำระเงิน" />
    </div>
  );
}
