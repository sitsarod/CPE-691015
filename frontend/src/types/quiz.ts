export interface OptionCourse {
  id: number;
  course_id: number;
  course_name: string;
  weight: number;
}

export interface QuizOption {
  id: number;
  text: string;
  recommended_course_id?: number | null; // deprecated
  recommended_courses: OptionCourse[];
}

export interface QuizQuestion {
  id: number;
  text: string;
  sequence: number;
  is_active: boolean;
  options: QuizOption[];
}

export interface RecommendedCourse {
  course_id: number;
  score: number;
  match_percent: number;
}

export interface RecommendResponse {
  data: RecommendedCourse[];
  fallback: boolean;
}
