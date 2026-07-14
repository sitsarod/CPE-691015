import React, { useState } from 'react';
import { Receipt, Trash2 } from 'lucide-react';
import { Coach, Expense } from './types';
import SlipUploader from '@/components/SlipUploader';

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

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.expenseamount || !expenseForm.expensedate) {
      onTriggerToast("กรุณากรอกจำนวนเงินและเลือกวันที่ทำรายการ", 'error');
      return;
    }

    const reqBody: any = {
      expenseamount: parseFloat(expenseForm.expenseamount),
      expensetype: expenseForm.expensetype,
      expensedescription: expenseForm.expensedescription,
      expensedate: new Date(expenseForm.expensedate).toISOString(),
      receipturl: expenseForm.receipturl
    };

    if (expenseForm.expensetype === 'coach_wages') {
      if (!expenseForm.coach_id) {
        onTriggerToast("กรุณาเลือกโค้ชสำหรับค่าใช้จ่ายค่าจ้างโค้ช", 'error');
        return;
      }
      reqBody.coach_id = parseInt(expenseForm.coach_id);
    }

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      const res = await fetch("http://localhost:8000/api/expenses/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify(reqBody)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "บันทึกค่าใช้จ่ายไม่สำเร็จ");
      }

      onTriggerToast("บันทึกค่าใช้จ่ายสำเร็จเรียบร้อย");
      setExpenseForm({
        expenseamount: '',
        expensetype: 'court_rental',
        expensedescription: '',
        expensedate: new Date().toISOString().split('T')[0],
        coach_id: '',
        receipturl: ''
      });
      onFetchData();
    } catch (err: any) {
      onTriggerToast(err.message, 'error');
    }
  };

  const handleDeleteExpense = async (id: number) => {
    if (!window.confirm("คุณแน่ใจหรือไม่ว่าต้องการลบรายการค่าใช้จ่ายนี้อย่างถาวร?")) return;

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      const res = await fetch(`http://localhost:8000/api/expenses/${id}`, {
        method: "DELETE",
        headers: {
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "ลบค่าใช้จ่ายไม่สำเร็จ");
      }

      onTriggerToast("ลบรายการค่าใช้จ่ายสำเร็จเรียบร้อย");
      onFetchData();
    } catch (err: any) {
      onTriggerToast(err.message, 'error');
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
              onChange={(e) => setExpenseForm(prev => ({ ...prev, expensetype: e.target.value as any, coach_id: '' }))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-xs outline-none focus:bg-white text-slate-800 font-medium"
            >
              <option value="court_rental">ค่าเช่าสนาม</option>
              <option value="coach_wages">ค่าจ้างโค้ช</option>
              <option value="equipment">ค่าอุปกรณ์</option>
              <option value="advertising">ค่าโฆษณา</option>
              <option value="other">อื่นๆ</option>
            </select>
          </div>

          {expenseForm.expensetype === 'coach_wages' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 block">เลือกโค้ช</label>
              <select
                value={expenseForm.coach_id}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, coach_id: e.target.value }))}
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
            label="แนบหลักฐานชำระเงิน (ถ้ามี)"
            currentUrl={expenseForm.receipturl}
            onUploadSuccess={(url) => setExpenseForm(prev => ({ ...prev, receipturl: url }))}
            onError={(msg) => onTriggerToast(msg, 'error')}
          />

          <button
            type="submit"
            className="w-full bg-[#CD0D13] hover:bg-[#A30A0E] text-white font-bold text-xs py-3 rounded-xl transition-all shadow-md hover:shadow-lg cursor-pointer text-center"
          >
            บันทึกค่าใช้จ่าย
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
