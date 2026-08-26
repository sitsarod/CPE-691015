import { useMemo, useState } from 'react';
import { MOCK_STUDENTS, MockStudent } from '../../_mock/students';

export interface WeeklyEvaluation {
  weekLabel: string;
  comment: string;
  evaluatedAt: number; // epoch ms
}

export type FilterTab = 'all' | 'pending' | 'done';

export function getWeekRange(offsetWeeks: number): { start: Date; end: Date; label: string } {
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

export function formatRelative(epochMs: number): string {
  const diffH = Math.round((Date.now() - epochMs) / (1000 * 60 * 60));
  if (diffH < 1) return 'เมื่อสักครู่';
  if (diffH < 24) return `${diffH} ชม.ที่แล้ว`;
  const diffD = Math.round(diffH / 24);
  return `${diffD} วันที่แล้ว`;
}

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

export function useEvaluation() {
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

  return {
    history,
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
    pendingCount
  };
}

export type EvaluationManager = ReturnType<typeof useEvaluation>;
