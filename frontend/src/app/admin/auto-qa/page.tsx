'use client';

import React, { useState, useEffect } from 'react';
import { autoQaAPI } from '../../../services/autoQaAPI';
import { AutoQA, CreateAutoQAReq, UpdateAutoQAReq } from '../../../types/autoQa';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

export default function AutoQAManagement() {
  const [qas, setQas] = useState<AutoQA[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQA, setEditingQA] = useState<AutoQA | null>(null);

  // Form State
  const [question, setQuestion] = useState('');
  const [similarQuestions, setSimilarQuestions] = useState<string[]>(['', '', '', '', '']);
  const [answer, setAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    const parsed = (qa.similar_question || '').split('|').map(s => s.trim()).filter(Boolean);
    const padded = [...parsed, '', '', '', '', ''].slice(0, 5);
    setSimilarQuestions(padded);
    
    setAnswer(qa.answer);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const joinedSimilar = similarQuestions.filter(q => q.trim() !== '').join(' | ');
      
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
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ที่จะลบคำถาม-ตอบนี้?')) return;
    try {
      await autoQaAPI.deleteAutoQA(id);
      loadData();
    } catch (err) {
      console.error('Failed to delete Q&A', err);
      alert('เกิดข้อผิดพลาดในการลบข้อมูล');
    }
  };

  return (
    <div className="mx-auto max-w-7xl text-black">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">จัดการคลังข้อมูล Q&A</h1>
        <button
          onClick={openModalForNew}
          className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
        >
          <Plus size={20} />
          เพิ่ม Q&A ใหม่
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-gray-500">กำลังโหลดข้อมูล...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-sm">
                  <th className="p-4 font-semibold w-[20%]">คำถามหลัก</th>
                  <th className="p-4 font-semibold w-[20%]">คำถามใกล้เคียง (Keywords)</th>
                  <th className="p-4 font-semibold w-[50%]">คำตอบ</th>
                  <th className="p-4 font-semibold w-[10%] text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {(qas || []).map((qa) => (
                  <tr key={qa.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-sm align-top">{qa.question}</td>
                    <td className="p-4 text-sm align-top text-gray-500">{qa.similar_question || '-'}</td>
                    <td className="p-4 text-sm align-top whitespace-pre-wrap">{qa.answer}</td>
                    <td className="p-4 align-top">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openModalForEdit(qa)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="แก้ไข"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(qa.id)}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="ลบ"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(qas || []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-gray-500">
                      ยังไม่มีข้อมูล Q&A
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold">{editingQA ? 'แก้ไข Q&A' : 'เพิ่ม Q&A ใหม่'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-800">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <form id="qa-form" onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">คำถามหลัก (Question) *</label>
                  <p className="text-xs text-gray-500 mb-2">คำถามสั้นๆ ที่เป็นตัวแทน เช่น 'คอร์สเรียนมีอะไรบ้าง' (อันนี้จะโชว์เป็นปุ่ม Quick Reply ให้ลูกค้าด้วย)</p>
                  <input
                    type="text"
                    required
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">คำถามใกล้เคียง / คีย์เวิร์ด (Similar Question / Keywords)</label>
                  <p className="text-xs text-gray-500 mb-2">ระบุคำหรือวลีอื่นๆ สูงสุด 5 รายการ เช่น 'เรียน', 'คอร์ส', 'มีอะไรสอน'</p>
                  <div className="space-y-2">
                    {similarQuestions.map((sq, index) => (
                      <input
                        key={index}
                        type="text"
                        placeholder={`คีย์เวิร์ดที่ ${index + 1}`}
                        value={sq}
                        onChange={(e) => {
                          const newSq = [...similarQuestions];
                          newSq[index] = e.target.value;
                          setSimilarQuestions(newSq);
                        }}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none text-sm"
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">คำตอบ (Answer) *</label>
                  <textarea
                    required
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    rows={5}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                  />
                </div>
              </form>
            </div>
            
            <div className="p-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                form="qa-form"
                disabled={isSubmitting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-400"
              >
                {isSubmitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
