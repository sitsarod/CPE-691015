export interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
}

export interface AutoQA {
  id: number;
  mode: 'keyword_match' | 'ai_predict' | 'admin_reply';
  question: string;
  similar_question: string;
  answer: string;
  session_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ChatSession {
  id: number;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  status: 'active' | 'closed';
  user_id?: number | null;
  user?: User;
  auto_qas?: AutoQA[];
  created_at: string;
  updated_at: string;
}

export interface CreateAutoQAReq {
  mode: 'keyword_match' | 'ai_predict';
  question: string;
  similar_question?: string;
  answer: string;
}

export interface UpdateAutoQAReq {
  mode?: 'keyword_match' | 'ai_predict';
  question?: string;
  similar_question?: string;
  answer?: string;
}

export interface CreateChatSessionReq {
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  user_id?: number;
}

export interface UpdateChatSessionReq {
  status?: 'active' | 'closed';
}

export interface AskQuestionReq {
  question: string;
}

export interface AskQuestionResponse {
  answer: string;
  match?: AutoQA;
}

export interface AdminReplyReq {
  answer: string;
}

