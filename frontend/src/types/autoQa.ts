export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

export interface AutoQA {
  id: number;
  mode: 'keyword_match' | 'admin_reply';
  question: string;
  similar_question: string;
  answer: string;
  attachment_url?: string;
  attachment_type?: 'image' | 'file' | string;
  attachment_name?: string;
  session_id?: number | null;
  created_at: string;
  updated_at: string;
}

// ผลลัพธ์การอัปโหลดไฟล์แนบในแชท
export interface ChatUploadResponse {
  url: string;
  type: 'image' | 'file';
  name: string;
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
  mode: 'keyword_match';
  question: string;
  similar_question?: string;
  answer: string;
}

export interface UpdateAutoQAReq {
  mode?: 'keyword_match';
  question?: string;
  similar_question?: string;
  answer?: string;
}

// ทุกฟิลด์ optional — guest ที่ไม่ล็อกอินเริ่มแชทแบบไม่ระบุตัวตนได้
export interface CreateChatSessionReq {
  guest_name?: string;
  guest_email?: string;
  guest_phone?: string;
  user_id?: number;
}

export interface UpdateChatSessionReq {
  status?: 'active' | 'closed';
}

export interface AskQuestionReq {
  question?: string;
  attachment_url?: string;
  attachment_type?: string;
  attachment_name?: string;
}

export interface AskQuestionResponse {
  answer: string;
  match?: AutoQA;
}

export interface AdminReplyReq {
  answer?: string;
  attachment_url?: string;
  attachment_type?: string;
  attachment_name?: string;
}

