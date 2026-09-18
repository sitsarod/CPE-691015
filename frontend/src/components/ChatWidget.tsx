'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle, X, Send, Paperclip, FileText, Loader2, Download, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { autoQaAPI } from '../services/autoQaAPI';
import { getUserProfileAPI } from '../services/userAPI';
import { AutoQA, ChatSession, CreateChatSessionReq } from '../types/autoQa';
import { useVisibleInterval } from '../hooks/useVisibleInterval';

interface ChatMessage {
  id: string;
  rowId?: number; // id ของแถว AutoQA จริง (ใช้แก้ไข/ลบ) — ข้อความชั่วคราวจะไม่มี
  sender: 'user' | 'bot' | 'admin';
  text: string;
  timestamp: Date;
  attachmentUrl?: string;
  attachmentType?: string; // "image" | "file"
  attachmentName?: string;
}

// ให้ปุ่ม "สอบถาม" บน Topbar เปิดกล่องแชทนี้ได้ผ่าน event กลาง
export const OPEN_CHAT_EVENT = 'koyama:open-chat';

const ANON_NAME = 'ผู้เยี่ยมชม';

// "เจ้าของห้องแชท" ตามตัวตนปัจจุบัน — ผู้ล็อกอิน "u:<id>", guest "guest"
// export ไว้ให้ CustomerTopbar ใช้คำนวณ badge จำนวนข้อความตอบกลับใหม่ที่ยังไม่ได้เปิดดู
export function chatOwner(): string {
  if (typeof window === 'undefined') return 'guest';
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  const uid = localStorage.getItem('user_id');
  if (token && role === 'customer' && uid) return `u:${uid}`;
  return 'guest';
}

// เก็บ session id แยกคีย์ตามเจ้าของ เพื่อให้คนเดิมล็อกอินกลับมาเจอห้อง/ประวัติเดิม
// และ guest กับผู้ล็อกอินไม่ใช้ห้องปนกัน
export function chatSessionKey(owner: string): string {
  return `auto_qa_session_${owner}`;
}

// เก็บกุญแจลับของห้อง (access_token) แยกตามเจ้าของ คู่กับ session id
// ต้องมีทั้งคู่ถึงจะเข้าถึงห้องได้ (กัน IDOR) — ถ้า token หาย ก็กู้ห้องเดิมไม่ได้ ต้องเริ่มใหม่
export function chatTokenKey(owner: string): string {
  return `auto_qa_token_${owner}`;
}

// เวลาที่เปิดกล่องแชทดูข้อความล่าสุดครั้งล่าสุด — ใช้เทียบกับข้อความ admin_reply
// เพื่อคำนวณ badge แจ้งเตือน "ข้อความตอบกลับใหม่ที่ยังไม่ได้อ่าน" บน CustomerTopbar
export function chatLastViewedKey(owner: string): string {
  return `auto_qa_last_viewed_${owner}`;
}

function mapAutoQAsToMessages(qas: AutoQA[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  qas.forEach((qa) => {
    if (qa.mode === 'admin_reply') {
      out.push({
        id: `admin-${qa.id}`,
        rowId: qa.id,
        sender: 'admin',
        text: qa.answer,
        timestamp: new Date(qa.created_at),
        attachmentUrl: qa.attachment_url,
        attachmentType: qa.attachment_type,
        attachmentName: qa.attachment_name,
      });
      return;
    }
    if (qa.question || qa.attachment_url) {
      out.push({
        id: `user-${qa.id}`,
        rowId: qa.id,
        sender: 'user',
        text: qa.question,
        timestamp: new Date(qa.created_at),
        attachmentUrl: qa.attachment_url,
        attachmentType: qa.attachment_type,
        attachmentName: qa.attachment_name,
      });
    }
    if (qa.answer) {
      out.push({ id: `bot-${qa.id}`, rowId: qa.id, sender: 'bot', text: qa.answer, timestamp: new Date(qa.created_at) });
    }
  });
  return out;
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [session, setSession] = useState<ChatSession | null>(null);
  // กุญแจลับของห้องปัจจุบัน — เก็บแยกจาก session เพราะ backend ส่ง access_token กลับเฉพาะตอนสร้าง
  // (ตอนกู้ห้อง/ดึงซ้ำจะไม่มีมาด้วย) ต้องอ่านจาก localStorage มาถือไว้เองเพื่อแนบทุกคำขอ
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  // จำนวนข้อความตอบกลับจากแอดมินที่ยังไม่ได้เปิดอ่าน — โชว์เป็น badge บนปุ่มลอย (ตอนกล่องปิดอยู่)
  const [unreadCount, setUnreadCount] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [quickReplies, setQuickReplies] = useState<AutoQA[]>([]);

  const [loggedInCustomer, setLoggedInCustomer] = useState(false);
  const [customerUserId, setCustomerUserId] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState(ANON_NAME);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [identityReady, setIdentityReady] = useState(false);

  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(true); // กำลังกู้ห้องเดิม
  const autoStartTriedRef = useRef(false);
  const ownerRef = useRef<string>('__init__');
  const [greetingTime] = useState(() => new Date());

  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);

  const [pendingAttachment, setPendingAttachment] = useState<{ url: string; type: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // แก้ไขข้อความ
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const pathname = usePathname();
  const isCustomerArea = pathname?.startsWith('/customer') ?? false;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // เปิดกล่องแชท → เลื่อนลงข้อความล่าสุดทันที
  // (ข้อความเดิมถูกโหลดไว้ก่อนแล้ว state messages จึงไม่เปลี่ยนตอนเปิด eff[messages] ด้านบนจึงไม่ยิง)
  // เลื่อนซ้ำอีกครั้งหลัง 250ms เผื่อรูปแนบ/เลย์เอาต์โหลดช้าแล้วดันความสูงเพิ่ม
  useEffect(() => {
    if (!isOpen || restoring) return;
    const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    scrollToBottom();
    const t = setTimeout(scrollToBottom, 250);
    return () => clearTimeout(t);
  }, [isOpen, restoring, messages.length]);

  useEffect(() => {
    const openHandler = () => setIsOpen(true);
    window.addEventListener(OPEN_CHAT_EVENT, openHandler);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, openHandler);
  }, []);

  // อ่านตัวตนปัจจุบันจาก localStorage → ตั้งชื่อ/อีเมล/เบอร์
  const deriveIdentity = () => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    const uid = localStorage.getItem('user_id');

    if (!token || role !== 'customer' || !uid) {
      setLoggedInCustomer(false);
      setCustomerUserId(null);
      setDisplayName(ANON_NAME);
      setEmail('');
      setPhone('');
      setIdentityReady(true);
      return;
    }

    setLoggedInCustomer(true);
    setCustomerUserId(Number(uid));
    const fn = localStorage.getItem('firstName') || '';
    const ln = localStorage.getItem('lastName') || '';
    const em = localStorage.getItem('email') || '';
    setDisplayName(`${fn} ${ln}`.trim() || ANON_NAME);
    setEmail(em);
    setPhone('');
    setIdentityReady(false);

    getUserProfileAPI(Number(uid))
      .then((p) => {
        const full = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
        if (full) setDisplayName(full);
        if (p.email) setEmail(p.email);
        if (p.phoneNumber) setPhone(p.phoneNumber);
      })
      .catch((err) => console.error('โหลดโปรไฟล์ลูกค้าไม่สำเร็จ:', err))
      .finally(() => setIdentityReady(true));
  };

  // กู้ห้องแชทเดิมของเจ้าของนี้ (ถ้ามีและยังไม่หมดอายุ 3 วัน)
  const loadSavedSession = async (owner: string) => {
    const id = localStorage.getItem(chatSessionKey(owner));
    const tok = localStorage.getItem(chatTokenKey(owner));
    // ต้องมีทั้ง id และ token ถึงจะกู้ห้องเดิมได้ (token คือกุญแจเข้าถึง)
    if (!id || !tok) {
      localStorage.removeItem(chatSessionKey(owner));
      localStorage.removeItem(chatTokenKey(owner));
      setRestoring(false);
      return;
    }
    try {
      const fetched = await autoQaAPI.getChatSessionById(Number(id), tok);
      if (fetched && fetched.status === 'active' && chatOwner() === owner) {
        setSession(fetched);
        setSessionToken(tok);
        if (fetched.auto_qas) setMessages(mapAutoQAsToMessages(fetched.auto_qas));
        autoStartTriedRef.current = true;
      } else {
        localStorage.removeItem(chatSessionKey(owner));
        localStorage.removeItem(chatTokenKey(owner));
      }
    } catch {
      localStorage.removeItem(chatSessionKey(owner));
      localStorage.removeItem(chatTokenKey(owner));
    } finally {
      setRestoring(false);
    }
  };

  // ซิงก์ให้ตรงกับตัวตนปัจจุบัน — เรียกตอน mount และตอนเปิดกล่อง (จับ login/logout กลางคัน)
  const syncToOwner = () => {
    const owner = chatOwner();
    if (ownerRef.current === owner) return;
    ownerRef.current = owner;
    setSession(null);
    setSessionToken(null);
    setUnreadCount(0);
    setMessages([]);
    setEditingRowId(null);
    autoStartTriedRef.current = false;
    setRestoring(true);
    deriveIdentity();
    loadSavedSession(owner);
  };

  // mount: โหลด quick replies + ซิงก์เจ้าของครั้งแรก
  useEffect(() => {
    (async () => {
      try {
        const qas = await autoQaAPI.getPublicAutoQAs();
        setQuickReplies(qas || []);
      } catch (err) {
        console.error('Failed to load quick replies:', err);
      }
    })();
    syncToOwner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // เปิดกล่อง → ซิงก์เจ้าของอีกครั้ง (เผื่อ login/logout ระหว่างที่กล่องปิดอยู่)
  // และมาร์คว่า "อ่านแล้ว" (ไว้เทียบคำนวณ badge แจ้งเตือนข้อความใหม่บน CustomerTopbar)
  useEffect(() => {
    if (isOpen) {
      syncToOwner();
      setUnreadCount(0); // เปิดกล่องแล้ว = อ่านแล้ว เคลียร์ badge ทันที
      try {
        localStorage.setItem(chatLastViewedKey(chatOwner()), new Date().toISOString());
      } catch {
        // เพิกเฉยถ้า localStorage ใช้งานไม่ได้ (private mode ฯลฯ)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // หมายเหตุ: ไม่สร้างห้องแชททันทีที่เปิดกล่อง — สร้างแบบ lazy ตอนกดส่งข้อความ/ไฟล์ครั้งแรก
  // (ดู createSession() ที่ถูกเรียกจาก handleSend) เพื่อไม่ให้เกิดห้องแชทว่างเปล่าเวลาผู้ใช้แค่เปิดดู

  // ข้อความต้อนรับ — แยกตามประเภทผู้ใช้:
  //   ผู้เยี่ยมชม (guest) → บอกว่าเป็นระบบตอบอัตโนมัติ (มีบอท + ปุ่ม Q&A ให้กด)
  //   ผู้ใช้ที่ล็อกอินแล้ว → คุยกับแอดมินตรง ๆ ไม่มีบอท/Q&A จึงบอกให้พิมพ์ถามได้เลย
  const greetingText = loggedInCustomer
    ? `สวัสดีค่ะคุณ ${displayName} พิมพ์ข้อความสอบถามได้เลยค่ะ เดี๋ยวเจ้าหน้าที่จะรีบตอบกลับให้เร็วที่สุดค่ะ`
    : `สวัสดีค่ะคุณ ${displayName} นี่เป็นข้อความตอบกลับอัตโนมัติ แชทนี้จะยังคงอยู่ภายใน 7 วัน มีอะไรให้เราช่วยไหมคะ?`;

  const createSession = async (): Promise<ChatSession | null> => {
    setCreating(true);
    try {
      const payload: CreateChatSessionReq = loggedInCustomer
        ? { guest_name: displayName, guest_email: email, guest_phone: phone, user_id: customerUserId ?? undefined }
        : {};
      const newSession = await autoQaAPI.createChatSession(payload);
      setSession(newSession);
      // เก็บ id + กุญแจลับของห้องไว้ใช้เข้าถึงในคำขอถัดไป (token มีมาเฉพาะตอนสร้างนี้เท่านั้น)
      const tok = newSession.access_token || '';
      setSessionToken(tok);
      localStorage.setItem(chatSessionKey(chatOwner()), String(newSession.id));
      if (tok) localStorage.setItem(chatTokenKey(chatOwner()), tok);
      setMessages([
        {
          id: 'greeting',
          sender: 'bot',
          text: greetingText,
          timestamp: new Date(),
        },
      ]);
      autoStartTriedRef.current = true;
      return newSession;
    } catch (err) {
      console.error('Failed to create session:', err);
      return null;
    } finally {
      setCreating(false);
    }
  };

  // ดึงข้อความล่าสุดของห้องแชทปัจจุบันมาต่อกับข้อความที่มีอยู่ในเครื่อง (ไม่ทับข้อความที่ยังไม่ sync)
  // เก็บเป็น ref แล้วอัปเดตทุก render (แทนการ useCallback) เพื่อให้ SSE handler ด้านล่างเรียกฟังก์ชัน
  // เวอร์ชันล่าสุดที่อ้างอิง session ปัจจุบันได้เสมอ โดยไม่ต้อง reconnect ทุกครั้งที่ state อื่นเปลี่ยน
  const refreshSessionRef = useRef<() => Promise<void>>(async () => {});
  refreshSessionRef.current = async () => {
    if (!session || !sessionToken) return;
    try {
      const fetched = await autoQaAPI.getChatSessionById(session.id, sessionToken);
      if (fetched && fetched.status === 'active') {
        if (fetched.auto_qas) {
          const loaded = mapAutoQAsToMessages(fetched.auto_qas);
          setMessages((prev) => {
            const serverCount = loaded.length;
            const localSaved = prev.filter((m) => !m.id.startsWith('temp-') && !m.id.startsWith('error-') && m.id !== 'greeting').length;
            if (serverCount > localSaved) {
              const greeting = prev.find((m) => m.id === 'greeting');
              return greeting ? [greeting, ...loaded] : loaded;
            }
            return prev;
          });
        }
      } else {
        setSession(fetched);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('not found') || msg.includes('ไม่พบ')) {
        localStorage.removeItem(chatSessionKey(chatOwner()));
        localStorage.removeItem(chatTokenKey(chatOwner()));
        setSession(null);
        setSessionToken(null);
        setMessages([]);
        autoStartTriedRef.current = false;
      } else {
        console.error('Failed to refresh chat session:', err);
      }
    }
  };

  const isChatStreamActive = isOpen && !!session && !!sessionToken && session.status === 'active';

  // SSE — รับสัญญาณ "มีข้อความใหม่" แบบเรียลไทม์จาก backend แทนการ poll รัวๆ ทุก 5 วิเหมือนเดิม
  // ใช้ session ID เป็นคีย์ (ไม่ต้องล็อกอิน ต่างจาก NotificationBell ที่ต้องมี JWT) — พอมีสัญญาณเข้ามา
  // ค่อยไปเรียก GET /chat-sessions/:id จริงเหมือนตอน poll เดิม มี reconnect เองถ้าหลุด
  useEffect(() => {
    if (!isChatStreamActive || !session || !sessionToken) return;
    const base = process.env.NEXT_PUBLIC_API_URL;
    if (!base) return;

    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      // EventSource แนบ custom header ไม่ได้ จึงส่งกุญแจลับผ่าน query string เพื่อยืนยันสิทธิ์
      es = new EventSource(`${base}/chat-sessions/${session.id}/stream?token=${encodeURIComponent(sessionToken)}`);
      es.addEventListener('notify', () => refreshSessionRef.current());
      es.onerror = () => {
        es?.close();
        if (closed) return;
        if (retry) clearTimeout(retry);
        retry = setTimeout(connect, 5000);
      };
    };
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      es?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChatStreamActive, session?.id]);

  // poll สำรองทุก 45 วิ เผื่อ SSE หลุด/เบราว์เซอร์บล็อก EventSource — หยุดอัตโนมัติเมื่อย่อ/สลับแท็บ
  // (เดิมยิงทุก 5 วิไม่หยุดตราบใดที่เปิดกล่องแชทค้างไว้ ตอนนี้ SSE เป็นตัวหลัก อันนี้แค่กันพลาด)
  useVisibleInterval(() => refreshSessionRef.current(), 45000, isChatStreamActive);

  // เช็คข้อความตอบกลับใหม่จากแอดมินขณะ "กล่องปิดอยู่" เพื่ออัปเดต badge ตัวเลขบนปุ่มลอย
  // นับเฉพาะข้อความ admin_reply ที่ใหม่กว่าเวลาที่เปิดกล่องอ่านครั้งล่าสุด
  const checkUnreadRef = useRef<() => Promise<void>>(async () => {});
  checkUnreadRef.current = async () => {
    if (!session || !sessionToken) {
      setUnreadCount(0);
      return;
    }
    try {
      const fetched = await autoQaAPI.getChatSessionById(session.id, sessionToken);
      if (!fetched || fetched.status !== 'active') {
        setUnreadCount(0);
        return;
      }
      const lastViewedRaw = localStorage.getItem(chatLastViewedKey(chatOwner()));
      const lastViewed = lastViewedRaw ? new Date(lastViewedRaw).getTime() : 0;
      const count = (fetched.auto_qas || []).filter(
        (qa) => qa.mode === 'admin_reply' && new Date(qa.created_at).getTime() > lastViewed
      ).length;
      setUnreadCount(count);
    } catch {
      // เงียบไว้ ไม่ให้ error กระทบปุ่มลอย
    }
  };

  // เช็คทันทีเมื่อกู้ห้องได้ตอนกล่องยังปิด + poll ทุก 30 วิระหว่างปิด (หยุดเองเมื่อเปิดกล่อง/สลับแท็บ)
  useEffect(() => {
    if (!isOpen && session && sessionToken) checkUnreadRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, session?.id, sessionToken]);
  useVisibleInterval(() => checkUnreadRef.current(), 30000, !isOpen && !!session && !!sessionToken);

  const handleResetSession = () => {
    localStorage.removeItem(chatSessionKey(chatOwner()));
    localStorage.removeItem(chatTokenKey(chatOwner()));
    setSession(null);
    setSessionToken(null);
    setUnreadCount(0);
    setMessages([]);
    setInputText('');
    setPendingAttachment(null);
    setEditingRowId(null);
    autoStartTriedRef.current = false;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    try {
      setUploading(true);
      const res = await autoQaAPI.uploadChatAttachment(file);
      setPendingAttachment({ url: res.url, type: res.type, name: res.name });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'อัปโหลดไฟล์ไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if ((!text && !pendingAttachment) || isSending || creating) return;

    // ยังไม่มีห้องแชท (ยังไม่เคยส่งข้อความ) → สร้างห้องแบบ lazy ตอนนี้เป็นครั้งแรก
    let activeSession = session;
    if (!activeSession) {
      activeSession = await createSession();
      if (!activeSession) {
        setMessages((prev) => [
          ...prev,
          { id: `error-bot-${Date.now()}`, sender: 'bot', text: 'ขออภัย เริ่มการสนทนาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', timestamp: new Date() },
        ]);
        return;
      }
    }

    const attach = pendingAttachment;
    setMessages((prev) => [
      ...prev,
      {
        id: `temp-user-${Date.now()}`,
        sender: 'user',
        text,
        timestamp: new Date(),
        attachmentUrl: attach?.url,
        attachmentType: attach?.type,
        attachmentName: attach?.name,
      },
    ]);
    setInputText('');
    setPendingAttachment(null);
    setIsSending(true);

    try {
      // ห้องที่เพิ่งสร้างจะมี access_token ติดมากับ object เลย ส่วนห้องที่กู้มาใช้ token ใน state
      const token = activeSession.access_token ?? sessionToken ?? undefined;
      const response = await autoQaAPI.askQuestion(activeSession.id, {
        question: text,
        attachment_url: attach?.url,
        attachment_type: attach?.type,
        attachment_name: attach?.name,
      }, token);
      if (response.answer) {
        setMessages((prev) => [...prev, { id: `temp-bot-${Date.now()}`, sender: 'bot', text: response.answer, timestamp: new Date() }]);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages((prev) => [...prev, { id: `error-bot-${Date.now()}`, sender: 'bot', text: 'ขออภัย เกิดข้อผิดพลาดในการส่งข้อความ', timestamp: new Date() }]);
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveEdit = async () => {
    const rowId = editingRowId;
    const t = editText.trim();
    if (rowId == null || !session) return;
    if (!t) return;
    try {
      await autoQaAPI.editChatMessage(session.id, rowId, t, sessionToken ?? undefined);
      setMessages((prev) => prev.map((m) => (m.rowId === rowId && m.sender === 'user' ? { ...m, text: t } : m)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'แก้ไขข้อความไม่สำเร็จ');
    } finally {
      setEditingRowId(null);
      setEditText('');
    }
  };

  const handleDeleteMessage = async (rowId: number) => {
    if (!session) return;
    if (!window.confirm('ต้องการลบข้อความนี้ใช่หรือไม่?')) return;
    try {
      await autoQaAPI.deleteChatMessage(session.id, rowId, sessionToken ?? undefined);
      setMessages((prev) => prev.filter((m) => m.rowId !== rowId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ลบข้อความไม่สำเร็จ');
    }
  };

  if (pathname?.startsWith('/admin') || pathname?.startsWith('/coach')) {
    return null;
  }

  if (!isOpen) {
    if (isCustomerArea) return null;
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-[#CC0000] text-white rounded-full flex items-center justify-center shadow-lg hover:bg-[#990000] transition-colors z-50 animate-bounce"
        aria-label={unreadCount > 0 ? `เปิดแชท มีข้อความใหม่ ${unreadCount} ข้อความ` : 'Open chat'}
      >
        <MessageCircle size={28} />
        {/* badge จำนวนข้อความตอบกลับใหม่จากแอดมิน */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 flex items-center justify-center rounded-full bg-white text-[#CC0000] text-xs font-bold border-2 border-[#CC0000] shadow">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className="fixed z-50 bg-white shadow-2xl flex flex-col overflow-hidden border border-gray-200 rounded-2xl
                 left-1/2 -translate-x-1/2 w-[94vw] top-20 bottom-24
                 sm:left-auto sm:right-6 sm:translate-x-0 sm:top-auto sm:bottom-6 sm:w-96 sm:h-[500px] sm:max-h-[80vh]"
    >
      {/* Header */}
      <div className="bg-[#CC0000] text-white p-4 flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle size={24} />
          <div>
            <h3 className="font-bold text-lg leading-tight">KOYAMA</h3>
            <p className="text-xs text-red-100">ติดต่อสอบถามรายละเอียดได้ 24 ชั่วโมง</p>
          </div>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-white hover:text-red-200 transition-colors p-1">
          <X size={24} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
        {restoring ? (
          // skeleton ฟองแชทระหว่างกู้ห้องเดิม (สลับซ้าย/ขวาให้เหมือนบทสนทนาจริง)
          <div className="flex flex-col space-y-3">
            <div className="self-start h-10 w-40 animate-pulse rounded-2xl rounded-bl-none bg-gray-200" />
            <div className="self-end h-10 w-32 animate-pulse rounded-2xl rounded-br-none bg-[#CC0000]/20" />
            <div className="self-start h-16 w-52 animate-pulse rounded-2xl rounded-bl-none bg-gray-200" />
            <div className="self-end h-10 w-36 animate-pulse rounded-2xl rounded-br-none bg-[#CC0000]/20" />
          </div>
        ) : (
          <div className="flex flex-col space-y-3">
            {/* ยังไม่มีห้องแชท (ยังไม่เคยส่งข้อความ) → แสดงข้อความต้อนรับแบบ preview เฉยๆ ยังไม่สร้างห้องจริง */}
            {!session && (
              <MessageRow
                key="greeting-preview"
                msg={{
                  id: 'greeting-preview',
                  sender: 'bot',
                  text: greetingText,
                  timestamp: greetingTime,
                }}
                isEditing={false}
                editText=""
                setEditText={() => {}}
                onStartEdit={() => {}}
                onCancelEdit={() => {}}
                onSaveEdit={() => {}}
                onDelete={() => {}}
              />
            )}

            {messages.map((msg) => (
              <MessageRow
                key={msg.id}
                msg={msg}
                isEditing={editingRowId != null && msg.sender === 'user' && msg.rowId === editingRowId}
                editText={editText}
                setEditText={setEditText}
                onStartEdit={() => { setEditingRowId(msg.rowId ?? null); setEditText(msg.text); }}
                onCancelEdit={() => { setEditingRowId(null); setEditText(''); }}
                onSaveEdit={handleSaveEdit}
                onDelete={() => msg.rowId != null && handleDeleteMessage(msg.rowId)}
              />
            ))}

            {(isSending || creating) && (
              <div className="self-end flex space-x-1 items-center bg-[#CC0000]/80 px-4 py-3 rounded-2xl rounded-br-none">
                <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      {!restoring && (
        <div className="bg-white border-t border-gray-200 p-3 flex flex-col gap-2 flex-shrink-0">
          {session?.status === 'closed' ? (
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <p className="text-xs text-gray-500">การสนทนานี้ถูกปิดแล้ว</p>
              <button
                onClick={handleResetSession}
                className="text-xs font-medium bg-[#CC0000] text-white px-4 py-2 rounded-full hover:bg-[#990000] transition-colors"
              >
                เริ่มการสนทนาใหม่
              </button>
            </div>
          ) : (
            <>
              {/* ปุ่ม Quick Reply (Q&A สำเร็จรูป) แสดงเฉพาะผู้เยี่ยมชม — ผู้ล็อกอินคุยกับแอดมินตรง ๆ */}
              {!loggedInCustomer && (quickReplies?.length || 0) > 0 && (messages?.length || 0) < 5 && !pendingAttachment && (
                <div className="flex overflow-x-auto pb-2 gap-2 hide-scrollbar">
                  {quickReplies.map((qr) => (
                    <button
                      key={qr.id}
                      onClick={() => setInputText(qr.question)}
                      className="whitespace-nowrap bg-red-50 text-[#CC0000] border border-red-200 px-3 py-1.5 rounded-full text-xs hover:bg-red-100 transition-colors"
                    >
                      {qr.question}
                    </button>
                  ))}
                </div>
              )}

              {pendingAttachment && (
                <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-2">
                  {pendingAttachment.type === 'image' ? (
                    <img src={pendingAttachment.url} alt="แนบ" className="w-12 h-12 object-cover rounded" />
                  ) : (
                    <FileText size={22} className="text-[#CC0000]" />
                  )}
                  <span className="text-xs text-gray-600 truncate flex-1">{pendingAttachment.name || 'ไฟล์แนบ'}</span>
                  <button onClick={() => setPendingAttachment(null)} className="text-gray-400 hover:text-red-500">
                    <X size={16} />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input type="file" accept="image/*,application/pdf" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || isSending}
                  className="p-2 text-gray-400 hover:text-[#CC0000] disabled:opacity-50 transition-colors flex-shrink-0"
                  title="แนบรูป/ไฟล์"
                >
                  {uploading ? <Loader2 size={20} className="animate-spin" /> : <Paperclip size={20} />}
                </button>
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="พิมพ์ข้อความ..."
                  className="flex-1 text-black bg-gray-100 border-none rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC0000]/40"
                  disabled={isSending || creating}
                />
                <button
                  onClick={handleSend}
                  disabled={(!inputText.trim() && !pendingAttachment) || isSending || creating}
                  className="p-2 bg-[#CC0000] text-white rounded-full hover:bg-[#990000] disabled:bg-gray-300 transition-colors flex-shrink-0"
                >
                  <Send size={18} className="ml-0.5" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ฟองข้อความ — ข้อความของลูกค้าเอง (ส่งแล้ว) กดสามจุด/กดค้างเพื่อแก้ไข/ลบได้
function MessageRow({
  msg, isEditing, editText, setEditText, onStartEdit, onCancelEdit, onSaveEdit, onDelete,
}: {
  msg: ChatMessage;
  isEditing: boolean;
  editText: string;
  setEditText: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUser = msg.sender === 'user';
  const editable = isUser && !!msg.rowId; // เฉพาะข้อความของลูกค้าที่ถูกบันทึกแล้ว

  const startPress = () => {
    if (!editable) return;
    timer.current = setTimeout(() => setMenuOpen(true), 500); // กดค้าง 0.5 วิ บนมือถือ
  };
  const endPress = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };

  const bubbleClass =
    isUser
      ? 'bg-[#CC0000] text-white rounded-br-none'
      : msg.sender === 'admin'
        ? 'bg-blue-50 text-blue-900 border border-blue-200 rounded-bl-none shadow-sm'
        : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none shadow-sm';

  return (
    <div
      className={`group flex flex-col max-w-[85%] ${isUser ? 'self-end items-end' : 'self-start items-start'}`}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      onTouchMove={endPress}
    >
      {msg.sender === 'admin' && <span className="text-[10px] font-semibold text-blue-600 mb-1 ml-1">เจ้าหน้าที่</span>}

      <div className="relative flex items-center gap-1">
        {editable && !isEditing && (
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
            title="ตัวเลือก"
          >
            <MoreVertical size={16} />
          </button>
        )}

        <div className={`px-3 py-2 rounded-2xl ${bubbleClass}`}>
          {msg.attachmentUrl && (
            <Attachment url={msg.attachmentUrl} type={msg.attachmentType} name={msg.attachmentName} onDark={isUser} />
          )}
          {isEditing ? (
            <div className="flex flex-col gap-2 min-w-[180px]">
              <input
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onSaveEdit(); if (e.key === 'Escape') onCancelEdit(); }}
                className="bg-white text-black rounded px-2 py-1 text-sm outline-none"
              />
              <div className="flex gap-2 justify-end text-xs">
                <button onClick={onCancelEdit} className="px-2 py-1 rounded bg-white/25 hover:bg-white/40">ยกเลิก</button>
                <button onClick={onSaveEdit} className="px-2 py-1 rounded bg-white text-[#CC0000] font-medium">บันทึก</button>
              </div>
            </div>
          ) : (
            msg.text && <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
          )}
        </div>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-1 w-28 bg-white border border-gray-200 rounded-lg shadow-lg z-30 py-1">
              <button
                onClick={() => { setMenuOpen(false); onStartEdit(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Pencil size={14} /> แก้ไข
              </button>
              <button
                onClick={() => { setMenuOpen(false); onDelete(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} /> ลบ
              </button>
            </div>
          </>
        )}
      </div>

      <span className="text-[10px] text-gray-400 mt-1 mx-1">
        {msg.timestamp.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
}

function Attachment({ url, type, name, onDark }: { url: string; type?: string; name?: string; onDark?: boolean }) {
  if (type === 'image') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block mb-1">
        <img src={url} alt={name || 'รูปแนบ'} className="max-w-[200px] max-h-[220px] rounded-lg object-cover" />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2 mb-1 underline ${onDark ? 'text-white' : 'text-[#CC0000]'}`}
    >
      <FileText size={18} />
      <span className="text-sm truncate max-w-[180px]">{name || 'ไฟล์แนบ'}</span>
      <Download size={14} />
    </a>
  );
}
