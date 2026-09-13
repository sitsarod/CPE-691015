import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Coach, Expense } from './types';
import SlipUploader from '@/components/SlipUploader';
import ImageLightbox from '@/components/ImageLightbox';
import ExpenseEditModal from './ExpenseEditModal';
import { useHorizontalWheelScroll } from '@/hooks/useHorizontalWheelScroll';
import { createExpensesBatch, updateExpense, deleteExpense } from "@/services/paymentAPI";
import { fetchCoachById, fetchCoachPayroll } from "@/services/coachAPI";
import type { CoachPayrollLine } from "@/services/coachAPI";
import { CreateExpenseReq, UpdateExpenseReq } from "@/types/payment";

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

  // จ่ายเกินไปเท่าไร (0 ถ้าไม่เกิน)
  //
  // ⚠️ "ค่าจ้างค้างจ่าย" ถูก clamp ที่ 0 ฝั่ง backend เพราะเป็นเพดานของยอดที่จ่ายได้
  // ถ้าไม่มีตัวนี้ "จ่ายครบพอดี" กับ "จ่ายเกินเก้าพัน" จะแสดงเป็น ฿0 เหมือนกัน
  overpaid?: number;

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
        overpaid: payroll.overpaid,
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

  // ยอดรวมที่จะบันทึกจริง = ค่าจ้าง+รายได้อื่น (โหมดโค้ช) หรือจำนวนเงินที่กรอก (โหมดทั่วไป)
  // ถ้าเป็น 0 → ปิดปุ่มบันทึก (spec: title "ไม่มียอดให้บันทึก")
  const nothingToSave = isCoachWages
    ? totalCoachPayout <= 0
    : (parseFloat(expenseForm.expenseamount) || 0) <= 0;

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
      // ⚠️ ส่งเป็นก้อนเดียว ห้ามวนลูปยิงทีละรายการ
      //
      // หน้านี้บันทึก "ค่าจ้าง + โบนัสหลายรายการ" พร้อมกัน ถ้าวนลูปแล้วพังกลางทาง
      // จะเหลือผลลัพธ์ครึ่ง ๆ ที่แอดมินไม่รู้ว่าอันไหนลงไปแล้ว จะกดซ้ำก็ไม่กล้า
      // backend คุมทั้งก้อนเป็นทรานแซกชันเดียว สำเร็จหมดหรือไม่สำเร็จเลย
      await createExpensesBatch(reqBodies, token || "");

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

  // รายการที่กำลังแก้ไขอยู่ใน modal (null = ปิด)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const handleUpdateExpense = async (id: number, payload: UpdateExpenseReq) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
    try {
      await updateExpense(id, payload, token || "");
      onTriggerToast("แก้ไขรายการค่าใช้จ่ายสำเร็จเรียบร้อย");
      onFetchData();
    } catch (err: unknown) {
      onTriggerToast(err instanceof Error ? err.message : 'แก้ไขรายการไม่สำเร็จ', 'error');
      throw err; // ให้ modal รู้ว่าไม่สำเร็จ จะได้ไม่ปิด
    }
  };

  const handleDeleteExpense = async (id: number) => {
    if (!window.confirm("คุณแน่ใจหรือไม่ว่าต้องการลบรายการค่าใช้จ่ายนี้อย่างถาวร?")) {
      throw new Error('cancelled'); // ผู้ใช้ยกเลิก — ไม่ปิด modal
    }

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      await deleteExpense(id, token || "");

      onTriggerToast("ลบรายการค่าใช้จ่ายสำเร็จเรียบร้อย");
      onFetchData();
    } catch (err: unknown) {
      onTriggerToast(err instanceof Error ? err.message : 'ลบรายการไม่สำเร็จ', 'error');
      throw err;
    }
  };

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_1.3fr] lg:gap-[34px] animate-fadeIn">
      {/* ───────── คอลัมน์ซ้าย: ฟอร์ม ───────── */}
      <div className="min-w-0 self-start border border-gray-200 bg-white p-6">
        <form onSubmit={handleSaveExpense} className="space-y-5">

          {/* 1) ประเภทรายจ่าย + เลือกโค้ช */}
          <div className={`grid grid-cols-1 gap-[18px] ${isCoachWages ? 'md:grid-cols-2' : ''}`}>
            <div>
              <label className="mb-1.5 block text-sm text-slate-700">ประเภทรายจ่าย</label>
              <select
                value={expenseForm.expensetype}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#CD0D13]"
              >
                <option value="court_rental">ค่าเช่าสนาม</option>
                <option value="coach_wages">ค่าจ้างโค้ช</option>
                <option value="equipment">ค่าอุปกรณ์</option>
                <option value="advertising">ค่าโฆษณา</option>
                <option value="other">อื่นๆ</option>
              </select>
            </div>

            {isCoachWages && (
              <div>
                <label className="mb-1.5 block text-sm text-slate-700">เลือกโค้ช</label>
                <select
                  value={expenseForm.coach_id}
                  onChange={(e) => {
                    const coachId = e.target.value;
                    setExpenseForm(prev => ({ ...prev, coach_id: coachId }));
                    loadCoachWage(coachId);
                  }}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#CD0D13]"
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

          {/* 2) กล่องยอดค่าจ้าง — เฉพาะโหมดค่าจ้างโค้ช */}
          {isCoachWages && expenseForm.coach_id && wageInfo && (
            <div className="border border-gray-200 bg-slate-50 p-[18px]">
              {wageInfo.loading ? (
                // loading — 3 skeleton แถว ห้ามแสดง ฿0
                <div className="space-y-2.5">
                  {[0, 1, 2].map(i => <div key={i} className={`h-4 animate-pulse bg-slate-200/70 ${i === 2 ? 'w-2/5' : 'w-full'}`} />)}
                </div>
              ) : wageInfo.error ? (
                <p className="text-[11px] text-rose-600">{wageInfo.error}</p>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[12.5px] text-slate-500">ค่าจ้างที่ควรได้ทั้งหมด</span>
                    <span className="text-[13.5px] font-medium tabular-nums text-slate-800">฿{wageInfo.expected.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[12.5px] text-slate-500">จ่ายไปแล้วทั้งหมด</span>
                    <span className="text-[13.5px] font-medium tabular-nums text-slate-800">฿{wageInfo.alreadyPaid.toLocaleString()}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-4 border-t border-gray-200 pt-2.5">
                    <span className="text-[13px] font-medium text-slate-700">ค่าจ้างค้างจ่าย</span>
                    <span className={`text-[22px] font-bold tabular-nums ${wageInfo.unpaid > 0 ? 'text-[#CD0D13]' : 'text-slate-900'}`}>฿{wageInfo.unpaid.toLocaleString()}</span>
                  </div>
                  {/* ที่มาของยอด — ต้องมาจาก breakdown ที่ API ส่งมา ถ้าไม่มีให้ซ่อน (ห้ามเดา) */}
                  {(wageInfo.rateBreakdown?.length ?? 0) > 0 ? (
                    <div className="pt-1.5">
                      <p className="text-[11px] uppercase tracking-[0.1em] text-slate-400">ที่มาของยอด</p>
                      <p className="text-[12px] leading-relaxed text-slate-600">
                        {wageInfo.rateBreakdown!.map(line => `${line.sessions} คาบ × ฿${line.pay_rate.toLocaleString()}`).join(' · ')}
                      </p>
                    </div>
                  ) : wageInfo.periodNote ? (
                    <div className="pt-1.5">
                      <p className="text-[11px] uppercase tracking-[0.1em] text-slate-400">ที่มาของยอด</p>
                      <p className="text-[12px] leading-relaxed text-slate-600">{wageInfo.periodNote}</p>
                    </div>
                  ) : null}
                  {wageInfo.payRate === 0 && (
                    <p className="pt-1 text-[10px] text-amber-600">
                      {wageInfo.paymentType === 'monthly'
                        ? 'ยังไม่ได้ตั้งค่าอัตราค่าจ้างต่อเดือนของโค้ชคนนี้ ยอดจึงเป็น 0'
                        : 'ยังไม่ได้ตั้งค่าอัตราค่าจ้างต่อคาบของโค้ชคนนี้ ยอดจึงเป็น 0'}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3) คำเตือนจ่ายเกิน — ยอด "ค่าจ้างค้างจ่าย" ถูก clamp ที่ 0
              จึงบอกไม่ได้ว่า "จ่ายครบพอดี" หรือ "จ่ายเกิน" ถ้าไม่บอกตรงนี้
              เงินที่จ่ายเกินจะหายไปจากสายตาทุกฝ่าย */}
          {isCoachWages && expenseForm.coach_id && wageInfo && !wageInfo.loading && !wageInfo.error && (wageInfo.overpaid ?? 0) > 0 && (
            <div className="border border-rose-300 bg-rose-50 px-4 py-3">
              <p className="text-[12.5px] font-bold text-rose-700">
                จ่ายเกินไป ฿{wageInfo.overpaid!.toLocaleString()}
              </p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-600">
                จ่ายไปแล้วมากกว่าค่าจ้างที่ควรได้ — ตรวจประวัติการจ่าย
                หรือเคลียร์คาบที่ยังไม่มีรอบเช็คชื่อก่อน
              </p>
            </div>
          )}

          {/* 4) คำเตือนคาบที่ยังไม่ปิดรอบ */}
          {isCoachWages && expenseForm.coach_id && wageInfo && !wageInfo.loading && !wageInfo.error && (wageInfo.unresolvedSessions ?? 0) > 0 && (
            <div className="border border-amber-300 bg-amber-50 px-4 py-3">
              <p className="text-[12.5px] font-medium text-amber-800">
                มี {wageInfo.unresolvedSessions} คาบที่ยังไม่ปิดรอบเช็คชื่อ
                {(wageInfo.unresolvedAmount ?? 0) > 0 && ` (฿${wageInfo.unresolvedAmount!.toLocaleString()})`}
              </p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-600">
                จึงยังไม่ถูกนับในยอดนี้ — ปิดรอบเช็คชื่อก่อนจ่ายเพื่อไม่ให้ยอดขาด
              </p>
              <a href="/admin/attendance/missed" className="mt-1 inline-block text-[11.5px] font-medium text-amber-900 underline">
                เคลียร์คาบที่ค้างก่อนจ่าย
              </a>
            </div>
          )}

          {isCoachWages ? (
            <>
              {/* 4) รายได้ส่วนอื่น ๆ (กรอกเอง) */}
              <div className="space-y-2.5">
                <label className="block text-sm text-slate-700">รายได้ส่วนอื่น ๆ (กรอกเอง)</label>
                {otherIncomes.length > 0 && (
                  <div className="space-y-2.5">
                    {otherIncomes.map((item, index) => (
                      <div key={`other-income-${index}`} className="flex items-center gap-2.5">
                        <input
                          type="text"
                          placeholder="รายละเอียด เช่น โบนัสผลงาน, ค่าเดินทาง"
                          value={item.description}
                          onChange={(e) => updateOtherIncome(index, 'description', e.target.value)}
                          className="h-11 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#CD0D13]"
                        />
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={item.amount}
                          onChange={(e) => updateOtherIncome(index, 'amount', e.target.value)}
                          className="h-11 w-[120px] shrink-0 rounded-lg border border-gray-300 bg-white px-3 text-right text-sm tabular-nums text-slate-800 outline-none focus:border-[#CD0D13]"
                        />
                        <button
                          type="button"
                          onClick={() => removeOtherIncome(index)}
                          className="shrink-0 p-1.5 text-slate-400 hover:text-[#CD0D13] cursor-pointer"
                          title="ลบรายการนี้"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={addOtherIncome}
                  className="text-[12.5px] font-medium text-[#CD0D13] hover:underline cursor-pointer"
                >
                  + เพิ่มรายการ
                </button>
              </div>

              {/* 5) รวมยอดจ่ายทั้งสิ้น */}
              <div>
                <div className="flex items-center justify-between gap-4 border-y border-gray-200 py-4">
                  <span className="text-sm font-medium text-slate-700">รวมยอดจ่ายทั้งสิ้น</span>
                  <span className="text-[28px] font-bold tabular-nums text-[#CD0D13]">฿{totalCoachPayout.toLocaleString()}</span>
                </div>
                {baseWage > 0 && otherIncomeNum > 0 && (
                  <p className="mt-1 text-[10px] text-slate-400">จะบันทึกแยกเป็น {1 + otherIncomes.filter(i => (parseFloat(i.amount) || 0) > 0).length} รายการ: ค่าจ้าง ฿{baseWage.toLocaleString()} และรายได้ส่วนอื่นรวม ฿{otherIncomeNum.toLocaleString()}</p>
                )}
              </div>

              {/* 6) QR + เลขบัญชีของโค้ช */}
              {expenseForm.coach_id && wageInfo && !wageInfo.loading && !wageInfo.error && (
                <div className="grid grid-cols-[124px_1fr] gap-[18px]">
                  {/* QR */}
                  <div className="grid h-[124px] w-[124px] shrink-0 place-items-center border border-gray-300 p-1">
                    {wageInfo.promptPay && totalCoachPayout > 0 ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`https://promptpay.io/${wageInfo.promptPay}/${totalCoachPayout.toFixed(2)}.png`}
                        alt="PromptPay QR"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="px-2 text-center text-[11px] leading-tight text-slate-400">
                        {wageInfo.promptPay ? 'ยอดจ่ายเป็น 0 — ยังไม่สร้าง QR' : 'โค้ชยังไม่ได้ตั้งค่าพร้อมเพย์'}
                      </span>
                    )}
                  </div>
                  {/* รายละเอียดบัญชี */}
                  <div className="min-w-0">
                    <p className="text-[12px] text-slate-500">
                      {wageInfo.promptPay && totalCoachPayout > 0
                        ? `สแกนด้วยแอปธนาคาร · ยอด ฿${totalCoachPayout.toLocaleString()}`
                        : 'ใช้โอนผ่านเลขบัญชีด้านล่างแทน'}
                    </p>
                    <div className="mt-2 border border-gray-300 px-3.5 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10.5px] text-slate-500">เลขบัญชี · {wageInfo.bankName || "—"}</p>
                          <p className="truncate text-[13.5px] font-medium tabular-nums text-slate-800">{wageInfo.accountNo || "-"}</p>
                          {wageInfo.promptPay && (
                            <p className="mt-0.5 text-[10.5px] text-slate-500">พร้อมเพย์ {wageInfo.promptPay}</p>
                          )}
                        </div>
                        {wageInfo.accountNo && (
                          <button
                            type="button"
                            onClick={() => copyText(wageInfo.accountNo!, 'เลขบัญชี')}
                            className="shrink-0 text-[12px] font-medium text-[#CD0D13] hover:underline cursor-pointer"
                            title="คัดลอกเลขบัญชี"
                          >
                            คัดลอก
                          </button>
                        )}
                      </div>
                      {!wageInfo.bankName && !wageInfo.accountNo && (
                        <p className="mt-1 text-[10px] text-amber-600">โค้ชยังไม่ได้กรอกข้อมูลบัญชีรับเงิน</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div>
              <label className="mb-1.5 block text-sm text-slate-700">จำนวนเงิน (บาท)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={expenseForm.expenseamount}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, expenseamount: e.target.value }))}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#CD0D13]"
                required
              />
            </div>
          )}

          {/* 7) วันที่ทำรายการ + รายละเอียดเพิ่มเติม */}
          <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2">
            <div className="min-w-0">
              <label className="mb-1.5 block text-sm text-slate-700">วันที่ทำรายการ</label>
              <input
                type="date"
                value={expenseForm.expensedate}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, expensedate: e.target.value }))}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#CD0D13]"
                required
              />
            </div>
            <div className="min-w-0">
              <label className="mb-1.5 block text-sm text-slate-700">รายละเอียด / คำอธิบายเพิ่มเติม</label>
              <input
                type="text"
                placeholder="ระบุข้อความคำอธิบายค่าใช้จ่าย..."
                value={expenseForm.expensedescription}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, expensedescription: e.target.value }))}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#CD0D13]"
              />
            </div>
          </div>

          {/* แนบหลักฐาน (คงไว้จากของเดิม) */}
          <SlipUploader
            label="แนบหลักฐานชำระเงิน (ควรมี)"
            currentUrl={expenseForm.receipturl}
            onUploadSuccess={(url) => setExpenseForm(prev => ({ ...prev, receipturl: url }))}
            onError={(msg) => onTriggerToast(msg, 'error')}
          />

          {/* 8) ปุ่มบันทึก */}
          <button
            type="submit"
            disabled={isSubmitting || nothingToSave}
            title={nothingToSave ? 'ไม่มียอดให้บันทึก' : undefined}
            className="h-[52px] w-full rounded-xl bg-[#CD0D13] text-[15px] font-bold text-white transition-colors hover:bg-[#A30A0E] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSubmitting ? 'กำลังบันทึก…' : 'บันทึกค่าใช้จ่าย'}
          </button>
        </form>
      </div>

      {/* ───────── คอลัมน์ขวา: ตารางรายการทั้งหมด ───────── */}
      <div className="min-w-0 flex flex-col self-start border border-gray-200 bg-white">
        <div className="flex items-baseline justify-between gap-3 border-b border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900">รายการบันทึกค่าใช้จ่ายทั้งหมด</h3>
          {expenses.length > 0 && (
            <span className="whitespace-nowrap text-xs text-slate-500">หน้า {safePage} / {totalPages}</span>
          )}
        </div>

        <div ref={tableScrollRef} className="overflow-x-auto no-scrollbar">
          <table className="w-full md:min-w-[560px] text-left border-collapse">
            <thead>
              <tr className="text-slate-500 text-[11px] font-normal uppercase tracking-[0.12em] border-b border-slate-200">
                <th className="py-3 px-5 font-normal w-[110px]">วันที่</th>
                <th className="py-3 px-5 font-normal w-[130px] hidden md:table-cell">ประเภท</th>
                <th className="py-3 px-5 font-normal">รายละเอียด</th>
                <th className="py-3 px-5 font-normal text-right w-[110px]">ยอดจ่าย</th>
                <th className="py-3 px-5 font-normal text-right w-[64px]">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <p className="text-xs text-slate-400">ยังไม่มีรายการค่าใช้จ่าย</p>
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

                  // ชื่อโค้ชพับรวมในคอลัมน์รายละเอียด (ตาม spec — ตารางไม่มีคอลัมน์ผู้รับเงินแยก)
                  const coachSuffix = exp.coach ? ` — ${exp.coach.nickname}` : '';

                  return (
                    <tr key={exp.id} className="hover:bg-slate-50/60 text-xs transition-colors">
                      <td className="py-[14px] px-5 whitespace-nowrap tabular-nums text-slate-500">{exp.expensedate?.split('T')[0]}</td>
                      <td className="py-[14px] px-5 text-slate-800 hidden md:table-cell">{displayName}</td>
                      <td className="py-[14px] px-5 text-slate-600">
                        <span className="block max-w-xs truncate" title={exp.expensedescription}>
                          {(exp.expensedescription || "-") + coachSuffix}
                        </span>
                        {exp.receipturl && (
                          <button
                            type="button"
                            onClick={() => setReceiptUrl(exp.receipturl)}
                            className="mt-0.5 mr-2 text-[11px] font-medium text-[#CD0D13] hover:underline cursor-pointer"
                          >
                            ดูหลักฐาน
                          </button>
                        )}
                        {(() => {
                          // แสดงคนล่าสุดที่แตะรายการนี้พอ — แก้ล่าสุดถ้ามี ไม่งั้นก็คนที่บันทึกไว้
                          const who = exp.updated_by || exp.created_by;
                          return who ? (
                            <span className="mt-0.5 block text-[10.5px] text-slate-400">
                              แก้ไขล่าสุดโดย {who.firstName} {who.lastName}
                            </span>
                          ) : null;
                        })()}
                      </td>
                      <td className="py-[14px] px-5 text-right font-medium tabular-nums text-slate-900 whitespace-nowrap">
                        ฿{exp.expenseamount.toLocaleString()}
                      </td>
                      <td className="py-[14px] px-5 text-right">
                        <button
                          type="button"
                          onClick={() => setEditingExpense(exp)}
                          className="text-[12px] font-medium text-[#CD0D13] hover:underline cursor-pointer"
                          title="แก้ไข / ลบรายการค่าใช้จ่าย"
                        >
                          แก้ไข
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {expenses.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-slate-200 text-xs">
            <span className="text-slate-500">
              แสดง {pagedExpenses.length} จาก {expenses.length} รายการ
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                title={safePage <= 1 ? 'อยู่หน้าแรกแล้ว' : 'หน้าก่อนหน้า'}
                className="rounded-lg border border-slate-200 px-3.5 py-[7px] font-semibold text-slate-600 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                ก่อนหน้า
              </button>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                title={safePage >= totalPages ? 'อยู่หน้าสุดท้ายแล้ว' : 'หน้าถัดไป'}
                className="rounded-lg border border-slate-200 px-3.5 py-[7px] font-semibold text-slate-600 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                ถัดไป
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ป็อปอัพดูรูปหลักฐาน/ใบเสร็จ — ไม่เปิดแท็บใหม่ */}
      <ImageLightbox url={receiptUrl} onClose={() => setReceiptUrl(null)} alt="หลักฐานการชำระเงิน" />

      {/* modal แก้ไข/ลบรายการค่าใช้จ่าย */}
      <ExpenseEditModal
        isOpen={!!editingExpense}
        expense={editingExpense}
        onClose={() => setEditingExpense(null)}
        onSave={handleUpdateExpense}
        onDelete={handleDeleteExpense}
      />
    </div>
  );
}
