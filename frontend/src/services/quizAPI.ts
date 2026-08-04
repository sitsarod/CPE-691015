import { QuizQuestion, QuizOption, RecommendResponse } from '@/types/quiz';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export const fetchAllQuestions = async (token: string): Promise<QuizQuestion[]> => {
  const response = await fetch(`${BASE_URL}/admin/quiz/`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const res = await response.json();
  if (!response.ok) throw new Error(res.error || "Failed to fetch questions");
  return res.data || [];
};

export const fetchActiveQuestions = async (): Promise<QuizQuestion[]> => {
  const response = await fetch(`${BASE_URL}/quiz`);
  const res = await response.json();
  if (!response.ok) throw new Error(res.error || "Failed to fetch active questions");
  return res.data || [];
};

export const createQuestion = async (data: { text: string; sequence: number; is_active: boolean }, token: string) => {
  const response = await fetch(`${BASE_URL}/admin/quiz/`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}` 
    },
    body: JSON.stringify(data)
  });
  const res = await response.json();
  if (!response.ok) throw new Error(res.error || "Failed to create question");
  return res.data;
};

export const updateQuestion = async (id: number, data: { text?: string; sequence?: number; is_active?: boolean }, token: string) => {
  const response = await fetch(`${BASE_URL}/admin/quiz/${id}`, {
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}` 
    },
    body: JSON.stringify(data)
  });
  const res = await response.json();
  if (!response.ok) throw new Error(res.error || "Failed to update question");
  return res.data;
};

export const deleteQuestion = async (id: number, token: string) => {
  const response = await fetch(`${BASE_URL}/admin/quiz/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const res = await response.json();
    throw new Error(res.error || "Failed to delete question");
  }
};

export const addOption = async (questionId: number, data: { text: string; recommended_course_id?: number | null }, token: string) => {
  const response = await fetch(`${BASE_URL}/admin/quiz/${questionId}/options`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}` 
    },
    body: JSON.stringify(data)
  });
  const res = await response.json();
  if (!response.ok) throw new Error(res.error || "Failed to add option");
  return res.data;
};

export const deleteOption = async (optionId: number, token: string) => {
  const response = await fetch(`${BASE_URL}/admin/quiz/options/${optionId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const res = await response.json();
    throw new Error(res.error || "Failed to delete option");
  }
};

export const addOptionCourse = async (
  optionId: number,
  data: { course_id: number; weight: number },
  token: string
) => {
  const response = await fetch(`${BASE_URL}/admin/quiz/options/${optionId}/courses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data)
  });
  const res = await response.json();
  if (!response.ok) throw new Error(res.error || "Failed to add recommended course");
  return res.data;
};

export const deleteOptionCourse = async (id: number, token: string) => {
  const response = await fetch(`${BASE_URL}/admin/quiz/option-courses/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const res = await response.json();
    throw new Error(res.error || "Failed to delete recommended course");
  }
};

export const recommendCourses = async (optionIds: number[]): Promise<RecommendResponse> => {
  const response = await fetch(`${BASE_URL}/quiz/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ option_ids: optionIds })
  });
  const res = await response.json();
  if (!response.ok) throw new Error(res.error || "Failed to get recommendations");
  return res as RecommendResponse;
};
