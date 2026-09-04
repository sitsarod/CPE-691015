import { useEffect, useMemo, useState } from 'react';
import { createEvaluation, fetchMyGivenEvaluations, fetchMyStudents } from '@/services/evaluationAPI';
import type { Evaluation } from '@/types/evaluation';

// EvaluationStudent = นักเรียนที่โค้ชคนนี้ประเมินได้จริง (มาจาก /evaluations/students)
// เดิมหน้านี้ใช้ MOCK_STUDENTS ที่เป็นรายชื่อสมมติ ตอนนี้ดึงจาก API แล้ว
// (รายชื่อจะมีเฉพาะนักเรียนที่ลงทะเบียนเรียนกับโค้ชคนนี้อยู่จริงเท่านั้น — บังคับที่ backend)
export interface EvaluationStudent {
  id: number;
  nickname: string;
  profilePicture?: string;
}

export interface WeeklyEvaluation {
  id: number;
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

// weekLabelOf คำนวณ label ของสัปดาห์ที่ timestamp นั้นตกอยู่ ใช้จัดกลุ่มการประเมินจริงเข้าสัปดาห์
function weekLabelOf(epochMs: number): string {
  const d = new Date(epochMs);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (x: Date) => x.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  return `${fmt(start)} - ${fmt(end)} ${(start.getFullYear() + 543).toString()}`;
}

export function formatRelative(epochMs: number): string {
  const diffH = Math.round((Date.now() - epochMs) / (1000 * 60 * 60));
  if (diffH < 1) return 'เมื่อสักครู่';
  if (diffH < 24) return `${diffH} ชม.ที่แล้ว`;
  const diffD = Math.round(diffH / 24);
  return `${diffD} วันที่แล้ว`;
}

function toHistory(evaluations: Evaluation[]): Record<number, WeeklyEvaluation[]> {
  const history: Record<number, WeeklyEvaluation[]> = {};
  for (const ev of evaluations) {
    const evaluatedAt = new Date(ev.created_at).getTime();
    const entry: WeeklyEvaluation = {
      id: ev.id,
      weekLabel: weekLabelOf(evaluatedAt),
      comment: ev.assessment,
      evaluatedAt,
    };
    const list = history[ev.customer_id] ?? [];
    history[ev.customer_id] = [...list, entry].sort((a, b) => b.evaluatedAt - a.evaluatedAt);
  }
  return history;
}

export function useEvaluation() {
  const [students, setStudents] = useState<EvaluationStudent[]>([]);
  const [history, setHistory] = useState<Record<number, WeeklyEvaluation[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<FilterTab>('all');
  const [modalStudent, setModalStudent] = useState<EvaluationStudent | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const week = useMemo(() => getWeekRange(0), []);

  const triggerToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [studentList, evaluations] = await Promise.all([fetchMyStudents(), fetchMyGivenEvaluations()]);
        if (cancelled) return;
        setStudents(
          studentList.map((s) => ({ id: s.customer_id, nickname: s.nickname, profilePicture: s.profile_picture }))
        );
        setHistory(toHistory(evaluations));
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isDoneThisWeek = (studentId: number) =>
    (history[studentId] ?? []).some((e) => e.weekLabel === week.label);

  const doneCount = students.filter((s) => isDoneThisWeek(s.id)).length;
  const totalCount = students.length;
  const pendingCount = totalCount - doneCount;

  const counts = { all: totalCount, pending: pendingCount, done: doneCount };

  const filteredStudents = students.filter((s) => {
    if (tab === 'pending') return !isDoneThisWeek(s.id);
    if (tab === 'done') return isDoneThisWeek(s.id);
    return true;
  });

  const handleSave = async (studentId: number, comment: string) => {
    try {
      const saved = await createEvaluation({ customer_id: studentId, assessment: comment });
      const entry: WeeklyEvaluation = {
        id: saved.id,
        weekLabel: weekLabelOf(new Date(saved.created_at).getTime()),
        comment: saved.assessment,
        evaluatedAt: new Date(saved.created_at).getTime(),
      };
      setHistory((prev) => {
        const rest = (prev[studentId] ?? []).filter((e) => e.weekLabel !== entry.weekLabel);
        return { ...prev, [studentId]: [entry, ...rest] };
      });
      const student = students.find((s) => s.id === studentId);
      setModalStudent(null);
      triggerToast(`บันทึกผลการประเมินของ ${student?.nickname ?? 'นักเรียน'} เรียบร้อยแล้ว`);
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'บันทึกผลการประเมินไม่สำเร็จ', 'error');
    }
  };

  return {
    students,
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
  };
}

export type EvaluationManager = ReturnType<typeof useEvaluation>;
