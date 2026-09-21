'use client';

import React, { useState, useEffect } from 'react';
import { autoQaAPI } from '../../../services/autoQaAPI';
import { AutoQA, CreateAutoQAReq, UpdateAutoQAReq } from '../../../types/autoQa';
import { Plus, Edit2, Trash2, X, Search, MessageCircleQuestion, Inbox, Tag, Loader2 } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';
import AutoQASkeleton from './components/AutoQASkeleton';

export default function AutoQAManagement() {
  const [qas, setQas] = useState<AutoQA[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQA, setEditingQA] = useState<AutoQA | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form State
  const [question, setQuestion] = useState('');
  const [similarQuestions, setSimilarQuestions] = useState<string[]>(['', '', '', '', '']);
  const [answer, setAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pop up ยืนยัน/แจ้งเตือนภายในเว็บ (แทน window.confirm / alert ของเบราว์เซอร์)
  const [dialog, setDialog] = useState<{
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    tone?: 'danger' | 'default';
    onConfirm?: () => void;
  } | null>(null);

  const showAlert = (message: string, title = 'แจ้งเตือน') =>
    setDialog({ title, message, confirmText: 'ตกลง' });

  const showConfirm = (
    message: string,
    onConfirm: () => void,
    opts?: { title?: string; confirmText?: string; tone?: 'danger' | 'default' }
  ) =>
    setDialog({
      title: opts?.title ?? 'ยืนยัน',
      message,
      confirmText: opts?.confirmText ?? 'ตกลง',
      cancelText: 'ยกเลิก',
      tone: opts?.tone ?? 'danger',
      onConfirm,
    });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await autoQaAPI.getAllAutoQAs();
      setQas(data);
    } catch (err) {
      console.error('Failed to load Q&A templates', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setQuestion('');
    setSimilarQuestions(['', '', '', '', '']);
    setAnswer('');
    setEditingQA(null);
  };

  const openModalForNew = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openModalForEdit = (qa: AutoQA) => {
    setEditingQA(qa);
    setQuestion(qa.question);

    // Parse the joined similar questions (split by | )
    const parsed = (qa.similar_question || '').split('|').map((s) => s.trim()).filter(Boolean);
    const padded = [...parsed, '', '', '', '', ''].slice(0, 5);
    setSimilarQuestions(padded);

    setAnswer(qa.answer);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const joinedSimilar = similarQuestions.filter((q) => q.trim() !== '').join(' | ');

      if (editingQA) {
        const req: UpdateAutoQAReq = { mode: 'keyword_match', question, similar_question: joinedSimilar, answer };
        await autoQaAPI.updateAutoQA(editingQA.id, req);
      } else {
        const req: CreateAutoQAReq = { mode: 'keyword_match', question, similar_question: joinedSimilar, answer };
        await autoQaAPI.createAutoQA(req);
      }
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      console.error('Failed to save Q&A', err);
      showAlert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (id: number) => {
    showConfirm(
      'คุณแน่ใจหรือไม่ที่จะลบคำถาม-ตอบนี้? การกระทำนี้ไม่สามารถยกเลิกได้',
      async () => {
        try {
          await autoQaAPI.deleteAutoQA(id);
          loadData();
        } catch (err) {
          console.error('Failed to delete Q&A', err);
          showAlert('เกิดข้อผิดพลาดในการลบข้อมูล');
        }
      },
      { title: 'ยืนยันการลบ', confirmText: 'ลบ', tone: 'danger' }
    );
  };

  const keywordsOf = (qa: AutoQA) =>
    (qa.similar_question || '').split('|').map((s) => s.trim()).filter(Boolean);

  const q = searchQuery.trim().toLowerCase();
  const filteredQas = (qas || []).filter(
    (qa) =>
      !q ||
      qa.question.toLowerCase().includes(q) ||
      (qa.similar_question || '').toLowerCase().includes(q) ||
      qa.answer.toLowerCase().includes(q)
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6 animate-in fade-in duration-500">
      {/* Header + Search รวมอยู่ในกรอบเดียว */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 sm:text-2xl">
              จัดการคลังข้อมูล Q&amp;A
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              คำถาม-คำตอบสำเร็จรูปที่บอทใช้ตอบลูกค้าอัตโนมัติ และแสดงเป็นปุ่ม Quick Reply
            </p>
          </div>
          <button
            onClick={openModalForNew}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#CC0000] px-4 py-2.5 font-medium text-white shadow-md shadow-[#CC0000]/20 transition-all hover:-translate-y-0.5 hover:bg-[#990000] sm:w-auto"
          >
            <Plus size={18} />
            เพิ่ม Q&amp;A ใหม่
          </button>
        </div>

        {/* Search — คั่นด้วยเส้นบางในกรอบเดียวกัน */}
        <div className="border-t border-gray-100 p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาจากคำถาม คีย์เวิร์ด หรือคำตอบ..."
              className="w-full rounded-lg border border-gray-300 bg-gray-50 py-2.5 pl-10 pr-9 text-sm text-gray-700 outline-none focus:border-[#CC0000] focus:bg-white focus:ring-1 focus:ring-[#CC0000]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                aria-label="ล้างคำค้น"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <AutoQASkeleton />
      ) : filteredQas.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-gray-100 text-gray-400">
            <Inbox size={28} />
          </div>
          <p className="text-gray-500">
            {searchQuery ? `ไม่พบ Q&A ที่ตรงกับ "${searchQuery}"` : 'ยังไม่มีข้อมูล Q&A'}
          </p>
          {!searchQuery && (
            <button
              onClick={openModalForNew}
              className="mt-1 inline-flex items-center gap-2 rounded-lg bg-[#CC0000] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#990000]"
            >
              <Plus size={16} /> เพิ่ม Q&amp;A แรกของคุณ
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredQas.map((qa) => {
            const keywords = keywordsOf(qa);
            return (
              <div
                key={qa.id}
                className="group flex flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                {/* คำถามหลัก */}
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#FFF0F0] text-[#CC0000]">
                    <MessageCircleQuestion size={18} />
                  </span>
                  <h3 className="flex-1 font-bold leading-snug text-gray-900">{qa.question}</h3>
                </div>

                {/* คีย์เวิร์ด */}
                {keywords.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {keywords.map((k, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600"
                      >
                        <Tag size={11} className="text-gray-400" />
                        {k}
                      </span>
                    ))}
                  </div>
                )}

                {/* คำตอบ */}
                <div className="mt-3 flex-1 rounded-xl bg-gray-50 p-3">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">คำตอบ</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 line-clamp-4">
                    {qa.answer}
                  </p>
                </div>

                {/* จัดการ */}
                <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
                  <button
                    onClick={() => openModalForEdit(qa)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100"
                  >
                    <Edit2 size={15} /> แก้ไข
                  </button>
                  <button
                    onClick={() => handleDelete(qa.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
                  >
                    <Trash2 size={15} /> ลบ
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
            <div className="flex items-center justify-between border-b border-gray-100 p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                <MessageCircleQuestion className="text-[#CC0000]" size={20} />
                {editingQA ? 'แก้ไข Q&A' : 'เพิ่ม Q&A ใหม่'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto p-5 sm:p-6">
              <form id="qa-form" onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-800">คำถามหลัก (Question) *</label>
                  <p className="mb-2 text-xs text-gray-500">
                    คำถามสั้น ๆ  เช่น คอร์สเรียนมีอะไรบ้าง
                  </p>
                  <input
                    type="text"
                    required
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-[#CC0000] focus:ring-1 focus:ring-[#CC0000]"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-800">
                    คำถามใกล้เคียง / คีย์เวิร์ด
                  </label>
                  <p className="mb-2 text-xs text-gray-500">
                    ระบุคำหรือวลีอื่น ๆ สูงสุด 5 รายการ เช่น &apos;เรียน&apos;, &apos;คอร์ส&apos;, &apos;มีอะไรสอน&apos;
                  </p>
                  <div className="space-y-2">
                    {similarQuestions.map((sq, index) => (
                      <div key={index} className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-300">
                          {index + 1}
                        </span>
                        <input
                          type="text"
                          placeholder={`คีย์เวิร์ดที่ ${index + 1}`}
                          value={sq}
                          onChange={(e) => {
                            const newSq = [...similarQuestions];
                            newSq[index] = e.target.value;
                            setSimilarQuestions(newSq);
                          }}
                          className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-4 text-sm outline-none focus:border-[#CC0000] focus:ring-1 focus:ring-[#CC0000]"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-800">คำตอบ (Answer) *</label>
                  <textarea
                    required
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    rows={5}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-[#CC0000] focus:ring-1 focus:ring-[#CC0000]"
                  />
                </div>
              </form>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 p-4">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                form="qa-form"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-lg bg-[#CC0000] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#990000] disabled:opacity-60"
              >
                {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                {isSubmitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pop up ยืนยัน/แจ้งเตือนภายในเว็บ */}
      <ConfirmDialog
        open={!!dialog}
        title={dialog?.title}
        message={dialog?.message ?? ''}
        confirmText={dialog?.confirmText}
        cancelText={dialog?.cancelText}
        tone={dialog?.tone}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          const cb = dialog?.onConfirm;
          setDialog(null);
          cb?.();
        }}
      />
    </div>
  );
}
