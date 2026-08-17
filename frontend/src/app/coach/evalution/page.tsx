'use client';

import React, { useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, X, CalendarDays, List, MessageSquareText } from 'lucide-react';
import Toast from '@/components/Toast';
import { MOCK_STUDENTS, MockStudent } from '../_mock/students';

// หน้า "ประเมินผู้เรียน" ฝั่งโค้ช — เขียนคอมเมนต์ประเมินผู้เรียนแต่ละคนเป็นประจำทุกสัปดาห์
// คนไหนยังไม่ได้ประเมินในสัปดาห์นี้จะมีป้ายเตือนให้เห็นชัดเจน
//
// หมายเหตุ: หน้านี้เป็น UI/UX เท่านั้น ข้อมูลผู้เรียน/ประวัติการประเมินเป็นตัวอย่าง ยังไม่เชื่อมต่อ API จริง
interface WeeklyEvaluation {
  weekLabel: string;
  comment: string;
  evaluatedAt: number; // epoch ms
}

type FilterTab = 'all' | 'pending' | 'done';

// ประวัติการประเมินจำลอง เรียงล่าสุดก่อน — ใช้โชว์คอมเมนต์ครั้งก่อนประกอบการประเมินรอบใหม่
function buildInitialHistory(): Record<number, WeeklyEvaluation[]> {
  const thisWeek = getWeekRange(0).label;
  const lastWeek = getWeekRange(-1).label;
  return {
    1: [
      {
        weekLabel: thisWeek,
        comment: 'ทรงตัวดี ควบคุมจังหวะได้มั่นคงขึ้นกว่าสัปดาห์ก่อน ฟุตเวิร์กเริ่มคล่องตัว',
        evaluatedAt: Date.now() - 1000 * 60 * 60 * 26,
      },
      {
        weekLabel: lastWeek,
        comment: 'พื้นฐานเริ่มดีขึ้น ยังต้องฝึกความมั่นคงของฟุตเวิร์กเพิ่มเติม',
        evaluatedAt: Date.now() - 1000 * 60 * 60 * 24 * 8,
      },
    ],
    4: [
      {
        weekLabel: thisWeek,
        comment: 'ท่าเริ่มนิ่งขึ้น เกมรุกดีขึ้นมาก แต่ควรฝึกความแม่นยำของจังหวะเพิ่ม',
        evaluatedAt: Date.now() - 1000 * 60 * 60 * 3,
      },
      {
        weekLabel: lastWeek,
        comment: 'เกมรุกเริ่มดีขึ้น กลยุทธ์การเล่นยังต้องพัฒนา',
        evaluatedAt: Date.now() - 1000 * 60 * 60 * 24 * 7,
      },
    ],
  };
}

export default function CoachEvalutionPage() {
  const [history, setHistory] = useState<Record<number, WeeklyEvaluation[]>>(buildInitialHistory);
  const [tab, setTab] = useState<FilterTab>('all');
  const [modalStudent, setModalStudent] = useState<MockStudent | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const week = useMemo(() => getWeekRange(0), []);

  const triggerToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const isDoneThisWeek = (studentId: number) =>
    (history[studentId] ?? []).some((e) => e.weekLabel === week.label);

  const doneCount = MOCK_STUDENTS.filter((s) => isDoneThisWeek(s.id)).length;
  const totalCount = MOCK_STUDENTS.length;
  const pendingCount = totalCount - doneCount;

  const counts = { all: totalCount, pending: pendingCount, done: doneCount };

  const filteredStudents = MOCK_STUDENTS.filter((s) => {
    if (tab === 'pending') return !isDoneThisWeek(s.id);
    if (tab === 'done') return isDoneThisWeek(s.id);
    return true;
  });

  const handleSave = (studentId: number, data: WeeklyEvaluation) => {
    setHistory((prev) => {
      const rest = (prev[studentId] ?? []).filter((e) => e.weekLabel !== data.weekLabel);
      return { ...prev, [studentId]: [data, ...rest] };
    });
    const student = MOCK_STUDENTS.find((s) => s.id === studentId);
    setModalStudent(null);
    triggerToast(`บันทึกผลการประเมินของ ${student?.nickname} เรียบร้อยแล้ว`);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 animate-in fade-in duration-500">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-[#CC0000]">
          <span className="h-px w-7 bg-[#CC0000]" />
          <span className="text-xs font-black uppercase tracking-[0.25em]">Weekly Evaluation</span>
        </div>
        <h1 className="mt-2.5 text-3xl font-black tracking-tight text-gray-900 md:text-4xl">
          ประเมินผู้เรียน
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
          <CalendarDays size={15} className="text-gray-400" />
          ประเมินผู้เรียนทุกคนเป็นประจำทุกสัปดาห์ — สัปดาห์นี้: {week.label}
        </p>
        <div className="mt-6 h-px bg-gray-200" />
      </div>

      {/* Progress summary */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-700">
              ประเมินแล้ว {doneCount} / {totalCount} คน
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              {pendingCount > 0 ? `ยังเหลืออีก ${pendingCount} คนในสัปดาห์นี้` : 'ประเมินครบทุกคนแล้วในสัปดาห์นี้ 🎉'}
            </p>
          </div>
          <span className="text-2xl font-black tabular-nums text-[#CC0000]">
            {totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0}%
          </span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-[#CC0000] transition-all"
            style={{ width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {(
          [
            { key: 'all', label: 'ทั้งหมด', icon: List },
            { key: 'pending', label: 'ยังไม่ได้ประเมิน', icon: CircleAlert },
            { key: 'done', label: 'ประเมินแล้ว', icon: CheckCircle2 },
          ] as { key: FilterTab; label: string; icon: React.ElementType }[]
        ).map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                active ? 'bg-[#CC0000] text-white shadow-md shadow-[#CC0000]/20' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Icon size={15} />
              {t.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  active ? 'bg-white/25 text-white' : 'bg-white text-gray-500'
                }`}
              >
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Student roster */}
      {filteredStudents.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white py-14 text-center text-gray-400">
          <CheckCircle2 className="h-9 w-9 text-gray-300" />
          <p className="text-sm">ไม่มีผู้เรียนในหมวดนี้</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filteredStudents.map((s) => {
            const entries = history[s.id] ?? [];
            const current = entries.find((e) => e.weekLabel === week.label) ?? null;
            const previous = entries.find((e) => e.weekLabel !== week.label) ?? null;
            return (
              <StudentRow
                key={s.id}
                student={s}
                current={current}
                previous={previous}
                onOpen={() => setModalStudent(s)}
              />
            );
          })}
        </div>
      )}

      {/* Evaluation modal */}
      {modalStudent && (
        <EvaluationModal
          student={modalStudent}
          weekLabel={week.label}
          current={(history[modalStudent.id] ?? []).find((e) => e.weekLabel === week.label) ?? null}
          previous={(history[modalStudent.id] ?? []).find((e) => e.weekLabel !== week.label) ?? null}
          onClose={() => setModalStudent(null)}
          onSave={(data) => handleSave(modalStudent.id, data)}
        />
      )}
    </div>
  );
}

// ==================== Student row ====================
function StudentRow({
  student,
  current,
  previous,
  onOpen,
}: {
  student: MockStudent;
  current: WeeklyEvaluation | null;
  previous: WeeklyEvaluation | null;
  onOpen: () => void;
}) {
  const done = !!current;

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-2xl border p-4 transition-all hover:shadow-md ${
        done ? 'border-gray-200 bg-white' : 'border-amber-200 bg-amber-50/40'
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
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
            <>
              <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-emerald-600">
                <CheckCircle2 size={12} />
                ประเมินแล้ว &middot; {formatRelative(current!.evaluatedAt)}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-gray-500">{current!.comment}</p>
            </>
          ) : (
            <>
              <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-600">
                <CircleAlert size={12} />
                ยังไม่ได้ประเมินสัปดาห์นี้
              </p>
              {previous && (
                <p className="mt-1 line-clamp-2 text-xs text-gray-400">ครั้งก่อน: {previous.comment}</p>
              )}
            </>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className={`flex-shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
          done
            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            : 'bg-[#CC0000] text-white shadow-md shadow-[#CC0000]/20 hover:bg-[#990000]'
        }`}
      >
        {done ? 'แก้ไข' : 'ประเมิน'}
      </button>
    </div>
  );
}

// ==================== Evaluation modal ====================
function EvaluationModal({
  student,
  weekLabel,
  current,
  previous,
  onClose,
  onSave,
}: {
  student: MockStudent;
  weekLabel: string;
  current: WeeklyEvaluation | null;
  previous: WeeklyEvaluation | null;
  onClose: () => void;
  onSave: (data: WeeklyEvaluation) => void;
}) {
  const [comment, setComment] = useState(current?.comment ?? '');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = comment.trim().length > 0 && !submitting;

  const handleConfirm = () => {
    if (!canSubmit) return;
    setSubmitting(true);
    // จำลองการบันทึกผล — ของจริงจะยิงไปยัง API ประเมินผู้เรียนภายหลัง
    setTimeout(() => {
      setSubmitting(false);
      onSave({ weekLabel, comment: comment.trim(), evaluatedAt: Date.now() });
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-800">ประเมินผู้เรียน — {student.nickname}</h2>
            <p className="text-xs text-gray-400">สัปดาห์นี้: {weekLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-6">
          {previous && (
            <div className="mb-4 flex gap-2 rounded-xl bg-gray-50 p-3 text-xs text-gray-500">
              <MessageSquareText size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
              <p>
                <span className="font-semibold text-gray-600">คอมเมนต์ครั้งก่อน: </span>
                {previous.comment}
              </p>
            </div>
          )}

          <label className="mb-1 block text-sm font-bold text-gray-700">คอมเมนต์ประเมินผู้เรียน</label>
          <textarea
            rows={6}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="สรุปผลการประเมิน จุดที่ทำได้ดี และสิ่งที่ควรพัฒนาเพิ่มเติมในสัปดาห์นี้..."
            className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20"
          />
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-gray-900 px-6 py-2.5 font-bold text-white transition-colors hover:bg-gray-800"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="rounded-xl bg-[#CC0000] px-6 py-2.5 font-bold text-white shadow-md shadow-[#CC0000]/20 transition-colors hover:bg-[#990000] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'กำลังบันทึก...' : 'ยืนยัน'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== Helpers ====================
function getWeekRange(offsetWeeks: number): { start: Date; end: Date; label: string } {
  const now = new Date();
  const day = now.getDay(); // 0 = อาทิตย์
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(now);
  start.setDate(now.getDate() + diffToMonday + offsetWeeks * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const fmt = (d: Date) => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  const label = `${fmt(start)} - ${fmt(end)} ${(start.getFullYear() + 543).toString()}`;
  return { start, end, label };
}

function formatRelative(epochMs: number): string {
  const diffH = Math.round((Date.now() - epochMs) / (1000 * 60 * 60));
  if (diffH < 1) return 'เมื่อสักครู่';
  if (diffH < 24) return `${diffH} ชม.ที่แล้ว`;
  const diffD = Math.round(diffH / 24);
  return `${diffD} วันที่แล้ว`;
}
