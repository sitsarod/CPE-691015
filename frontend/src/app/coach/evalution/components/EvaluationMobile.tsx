'use client';

import React, { useState } from 'react';
import { CheckCircle2, CircleAlert, X, List, ChevronRight } from 'lucide-react';
import Toast from '@/components/Toast';
import { EvaluationManager, EvaluationStudent, WeeklyEvaluation, FilterTab, formatRelative } from './useEvaluation';

// ==================== Bottom-sheet evaluation modal ====================
function EvaluationSheet({
  student,
  weekLabel,
  current,
  previous,
  onClose,
  onSave,
}: {
  student: EvaluationStudent;
  weekLabel: string;
  current: WeeklyEvaluation | null;
  previous: WeeklyEvaluation | null;
  onClose: () => void;
  onSave: (comment: string) => Promise<void>;
}) {
  const [comment, setComment] = useState(current?.comment ?? '');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = comment.trim().length > 0 && !submitting;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSave(comment.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-gray-900/40 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-xl animate-in slide-in-from-bottom duration-300">
        {/* drag handle */}
        <div className="flex justify-center pt-3">
          <span className="h-1.5 w-10 rounded-full bg-gray-200" />
        </div>

        <div className="flex items-center justify-between px-5 pb-3 pt-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-gray-800">ประเมิน — {student.nickname}</h2>
            <p className="text-xs text-gray-400">สัปดาห์นี้: {weekLabel}</p>
          </div>
          <button onClick={onClose} className="flex-shrink-0 rounded-full p-1.5 text-gray-400 active:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {previous && (
            <div className="mb-4 rounded-xl bg-gray-50 p-3 text-xs text-gray-500">
              <span className="font-semibold text-gray-600">ครั้งก่อน: </span>
              {previous.comment}
            </div>
          )}

          <label className="mb-1 block text-sm font-bold text-gray-700">คอมเมนต์ประเมินผู้เรียน</label>
          <textarea
            rows={5}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="สรุปผลการประเมิน จุดที่ทำได้ดี และสิ่งที่ควรพัฒนาเพิ่มเติมในสัปดาห์นี้..."
            className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20"
          />
        </div>

        {/* ปุ่มยืนยันวางท้ายสุด กดง่ายด้วยนิ้วโป้งตอนถือมือถือมือเดียว + เว้น safe-area ของจอมี notch */}
        <div className="flex flex-col gap-2 border-t border-gray-100 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="w-full rounded-xl bg-[#CC0000] py-3.5 text-base font-bold text-white shadow-md shadow-[#CC0000]/20 transition-colors active:bg-[#990000] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'กำลังบันทึก...' : 'ยืนยัน'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-600 active:bg-gray-200"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== Student row ====================
function StudentRow({
  student,
  current,
  onOpen,
}: {
  student: EvaluationStudent;
  current: WeeklyEvaluation | null;
  onOpen: () => void;
}) {
  const done = !!current;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-colors active:bg-gray-50 ${
        done ? 'border-gray-200 bg-white' : 'border-amber-200 bg-amber-50/40'
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full font-bold ${
            done ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-100 text-amber-600'
          }`}
        >
          {student.nickname.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900">{student.nickname}</p>
          {done ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-emerald-600">
              <CheckCircle2 size={12} />
              ประเมินแล้ว &middot; {formatRelative(current!.evaluatedAt)}
            </p>
          ) : (
            <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-600">
              <CircleAlert size={12} />
              ยังไม่ได้ประเมิน
            </p>
          )}
        </div>
      </div>
      <ChevronRight size={18} className="flex-shrink-0 text-gray-300" />
    </button>
  );
}

export function EvaluationMobile({ manager }: { manager: EvaluationManager }) {
  const {
    history,
    loading,
    loadError,
    tab,
    setTab,
    modalStudent,
    setModalStudent,
    toast,
    setToast,
    week,
    counts,
    filteredStudents,
    handleSave,
    doneCount,
    totalCount,
    pendingCount,
  } = manager;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-400">กำลังโหลดรายชื่อนักเรียน...</div>
    );
  }

  if (loadError) {
    return <div className="px-4 py-20 text-center text-sm text-red-500">โหลดข้อมูลไม่สำเร็จ: {loadError}</div>;
  }

  return (
    <div className="space-y-5 px-4 pb-8 pt-4 animate-in fade-in duration-500">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-gray-900">ประเมินผู้เรียน</h1>
        <p className="mt-1 text-xs text-gray-500">สัปดาห์นี้: {week.label}</p>
      </div>

      {/* Progress summary */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-gray-700">
            ประเมินแล้ว {doneCount} / {totalCount} คน
          </p>
          <span className="text-lg font-black tabular-nums text-[#CC0000]">
            {totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0}%
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-[#CC0000] transition-all"
            style={{ width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Filter tabs — เลื่อนแนวนอนได้ กดง่ายด้วยนิ้ว */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {(
          [
            { key: 'all', label: 'ทั้งหมด', icon: List },
            { key: 'pending', label: 'ยังไม่ประเมิน', icon: CircleAlert },
            { key: 'done', label: 'ประเมินแล้ว', icon: CheckCircle2 },
          ] as { key: FilterTab; label: string; icon: React.ElementType }[]
        ).map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition-colors ${
                active ? 'bg-[#CC0000] text-white shadow-md shadow-[#CC0000]/20' : 'bg-gray-100 text-gray-600 active:bg-gray-200'
              }`}
            >
              <Icon size={14} />
              {t.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-white/25 text-white' : 'bg-white text-gray-500'}`}>
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Student roster */}
      {filteredStudents.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white py-12 text-center text-gray-400">
          <CheckCircle2 className="h-8 w-8 text-gray-300" />
          <p className="text-sm">ไม่มีผู้เรียนในหมวดนี้</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredStudents.map((s) => {
            const entries = history[s.id] ?? [];
            const current = entries.find((e) => e.weekLabel === week.label) ?? null;
            return <StudentRow key={s.id} student={s} current={current} onOpen={() => setModalStudent(s)} />;
          })}
        </div>
      )}

      {/* Evaluation sheet */}
      {modalStudent && (
        <EvaluationSheet
          student={modalStudent}
          weekLabel={week.label}
          current={(history[modalStudent.id] ?? []).find((e) => e.weekLabel === week.label) ?? null}
          previous={(history[modalStudent.id] ?? []).find((e) => e.weekLabel !== week.label) ?? null}
          onClose={() => setModalStudent(null)}
          onSave={(comment) => handleSave(modalStudent.id, comment)}
        />
      )}

      {pendingCount === 0 && totalCount > 0 && (
        <p className="pt-2 text-center text-xs text-gray-400">ประเมินครบทุกคนแล้วในสัปดาห์นี้ 🎉</p>
      )}
    </div>
  );
}
