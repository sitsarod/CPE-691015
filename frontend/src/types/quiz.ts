export interface QuizOption {
  id: number;
  text: string;
  recommended_course_id?: number | null;
}

export interface QuizQuestion {
  id: number;
  text: string;
  sequence: number;
  is_active: boolean;
  options: QuizOption[];
}
