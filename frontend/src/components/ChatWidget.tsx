'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle, X, Send, Paperclip, FileText, Loader2, Download } from 'lucide-react';
import { autoQaAPI } from '../services/autoQaAPI';
import { getUserProfileAPI } from '../services/userAPI';
import { AutoQA, ChatSession, CreateChatSessionReq } from '../types/autoQa';

interface ChatMessage {
  id: string;
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

// แปลง log แชท (AutoQA) เป็นข้อความในกล่องแชท
// แถวลูกค้า: question(ลูกค้า) + answer(บอท) · แถวแอดมิน: mode=admin_reply
// ไฟล์แนบเป็นของผู้ส่งแถวนั้น (ลูกค้าในแถว question, แอดมินในแถว admin_reply)
function mapAutoQAsToMessages(qas: AutoQA[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  qas.forEach((qa) => {
    if (qa.mode === 'admin_reply') {
      out.push({
        id: `admin-${qa.id}`,
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
        sender: 'user',
        text: qa.question,
        timestamp: new Date(qa.created_at),
        attachmentUrl: qa.attachment_url,
        attachmentType: qa.attachment_type,
        attachmentName: qa.attachment_name,
      });
    }
    if (qa.answer) {
      out.push({ id: `bot-${qa.id}`, sender: 'bot', text: qa.answer, timestamp: new Date(qa.created_at) });
    }
  });
  return out;
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [quickReplies, setQuickReplies] = useState<AutoQA[]>([]);

  // ตัวตนผู้ใช้: ล็อกอิน = ดึงจากบัญชี, ไม่ล็อกอิน = ไม่ระบุตัวตน (ผู้เยี่ยมชม)
  const [loggedInCustomer, setLoggedInCustomer] = useState(false);
  const [customerUserId, setCustomerUserId] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState(ANON_NAME);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [identityReady, setIdentityReady] = useState(false);

  const [creating, setCreating] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);
  const autoStartTriedRef = useRef(false);

  // การพิมพ์ / ส่ง
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);

  // ไฟล์แนบที่กำลังจะส่ง
  const [pendingAttachment, setPendingAttachment] = useState<{ url: string; type: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const pathname = usePathname();
  const isCustomerArea = pathname?.startsWith('/customer') ?? false;

  // เลื่อนลงล่างสุดเมื่อมีข้อความใหม่
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // เปิดกล่องแชทเมื่อปุ่ม "สอบถาม" บน Topbar ส่ง event มา
  useEffect(() => {
    const openHandler = () => setIsOpen(true);
    window.addEventListener(OPEN_CHAT_EVENT, openHandler);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, openHandler);
  }, []);

  // โหลด quick replies (ครั้งเดียว — ไม่ขึ้นกับตัวตนผู้ใช้)
  useEffect(() => {
    const loadQuickReplies = async () => {
      try {
        const qas = await autoQaAPI.getPublicAutoQAs();
        setQuickReplies(qas || []);
      } catch (err) {
        console.error('Failed to load quick replies:', err);
      }
    };
    loadQuickReplies();
  }, []);

  // ระบุตัวตน: ล็อกอินเป็นลูกค้า → ดึงชื่อ/อีเมล/เบอร์จากบัญชี, ไม่ล็อกอิน → ไม่ระบุตัวตน
  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    const uid = localStorage.getItem('user_id');

    if (!token || role !== 'customer' || !uid) {
      setIdentityReady(true); // guest — ไม่ต้องดึงข้อมูล
      return;
    }

    setLoggedInCustomer(true);
    setCustomerUserId(Number(uid));
    const fn = localStorage.getItem('firstName') || '';
    const ln = localStorage.getItem('lastName') || '';
    const em = localStorage.getItem('email') || '';
    const localName = `${fn} ${ln}`.trim();
    if (localName) setDisplayName(localName);
    if (em) setEmail(em);

    getUserProfileAPI(Number(uid))
      .then((p) => {
        const full = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
        if (full) setDisplayName(full);
        if (p.email) setEmail(p.email);
        if (p.phoneNumber) setPhone(p.phoneNumber);
      })
      .catch((err) => console.error('โหลดโปรไฟล์ลูกค้าไม่สำเร็จ:', err))
      .finally(() => setIdentityReady(true));
  }, []);

  // กู้ session เดิมหลังจากรู้ตัวตนผู้ใช้แล้ว — ใช้ key แยกตาม user เพื่อไม่ให้ session ปนกัน
  useEffect(() => {
    if (!identityReady) return;
    const sessionKey = customerUserId ? `auto_qa_session_id_user_${customerUserId}` : 'auto_qa_session_id_guest';
    const savedSessionId = localStorage.getItem(sessionKey);
    if (!savedSessionId) return;

    // ตั้ง flag ก่อนเพื่อกัน auto-start สร้าง session ซ้ำขณะกำลัง fetch
    autoStartTriedRef.current = true;

    const restoreSession = async () => {
      try {
        const fetched = await autoQaAPI.getChatSessionById(Number(savedSessionId));
        if (fetched && fetched.status === 'active') {
          setSession(fetched);
          if (fetched.auto_qas) setMessages(mapAutoQAsToMessages(fetched.auto_qas));
        } else {
          localStorage.removeItem(sessionKey);
          autoStartTriedRef.current = false;
        }
      } catch {
        localStorage.removeItem(sessionKey);
        autoStartTriedRef.current = false;
      }
    };
    restoreSession();
  }, [identityReady, customerUserId]);

  // เปิดห้องแชทอัตโนมัติเมื่อเปิดกล่อง (ทั้ง guest และลูกค้าที่ล็อกอิน) — ไม่ต้องกรอกฟอร์ม
  useEffect(() => {
    if (!isOpen || session || !identityReady || creating || createFailed) return;
    if (autoStartTriedRef.current) return;
    autoStartTriedRef.current = true;
    createSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, session, identityReady, creating, createFailed]);

  const createSession = async () => {
    setCreating(true);
    try {
      const payload: CreateChatSessionReq = loggedInCustomer
        ? { guest_name: displayName, guest_email: email, guest_phone: phone, user_id: customerUserId ?? undefined }
        : {}; // ไม่ระบุตัวตน
      const newSession = await autoQaAPI.createChatSession(payload);
      setSession(newSession);
      const sessionKey = customerUserId ? `auto_qa_session_id_user_${customerUserId}` : 'auto_qa_session_id_guest';
      localStorage.setItem(sessionKey, String(newSession.id));
      setMessages([
        {
          id: 'greeting',
          sender: 'bot',
          text: `สวัสดีค่ะคุณ ${displayName} นี่เป็นข้อความตอบกลับอัตโนมัติ แชทนี้จะยังคงอยู่ภายใน 3 วัน มีอะไรให้เราช่วยไหมคะ?`,
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      console.error('Failed to create session:', err);
      setCreateFailed(true);
    } finally {
      setCreating(false);
    }
  };

  // Poll ข้อความใหม่ทุก 5 วิ ระหว่างเปิดกล่องและ session ยัง active
  useEffect(() => {
    if (!isOpen || !session || session.status !== 'active') return;
    const interval = setInterval(async () => {
      try {
        const fetched = await autoQaAPI.getChatSessionById(session.id);
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
          const sessionKey = customerUserId ? `auto_qa_session_id_user_${customerUserId}` : 'auto_qa_session_id_guest';
          localStorage.removeItem(sessionKey);
          setSession(null);
          setMessages([]);
          autoStartTriedRef.current = false;
        } else {
          console.error('Failed to poll chat session:', err);
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isOpen, session]);

  const handleResetSession = () => {
    const sessionKey = customerUserId ? `auto_qa_session_id_user_${customerUserId}` : 'auto_qa_session_id_guest';
    localStorage.removeItem(sessionKey);
    setSession(null);
    setMessages([]);
    setInputText('');
    setPendingAttachment(null);
    autoStartTriedRef.current = false;
    setCreateFailed(false);
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
    if ((!text && !pendingAttachment) || !session || isSending) return;

    const attach = pendingAttachment;
    const userMsg: ChatMessage = {
      id: `temp-user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date(),
      attachmentUrl: attach?.url,
      attachmentType: attach?.type,
      attachmentName: attach?.name,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setPendingAttachment(null);
    setIsSending(true);

    try {
      const response = await autoQaAPI.askQuestion(session.id, {
        question: text,
        attachment_url: attach?.url,
        attachment_type: attach?.type,
        attachment_name: attach?.name,
      });
      if (response.answer) {
        setMessages((prev) => [
          ...prev,
          { id: `temp-bot-${Date.now()}`, sender: 'bot', text: response.answer, timestamp: new Date() },
        ]);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages((prev) => [
        ...prev,
        { id: `error-bot-${Date.now()}`, sender: 'bot', text: 'ขออภัย เกิดข้อผิดพลาดในการส่งข้อความ', timestamp: new Date() },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  if (pathname?.startsWith('/admin') || pathname?.startsWith('/coach')) {
    return null;
  }

  if (!isOpen) {
    // โซนลูกค้าเปิดแชทจากปุ่ม "สอบถาม" บน Topbar จึงไม่แสดงปุ่มลอย
    if (isCustomerArea) return null;
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-[#CC0000] text-white rounded-full flex items-center justify-center shadow-lg hover:bg-[#990000] transition-colors z-50 animate-bounce"
        aria-label="Open chat"
      >
        <MessageCircle size={28} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-80 sm:w-96 h-[500px] max-h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden border border-gray-200">
      {/* Header */}
      <div className="bg-[#CC0000] text-white p-4 flex justify-between items-center">
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
        {!session ? (
          createFailed ? (
            <div className="flex flex-col h-full items-center justify-center gap-3 text-center px-4">
              <p className="text-sm text-gray-500">เริ่มการสนทนาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</p>
              <button
                onClick={() => { setCreateFailed(false); autoStartTriedRef.current = false; }}
                className="text-sm font-medium bg-[#CC0000] text-white px-4 py-2 rounded-full hover:bg-[#990000] transition-colors"
              >
                ลองใหม่
              </button>
            </div>
          ) : (
            <div className="flex flex-col h-full items-center justify-center gap-3 text-gray-500">
              <Loader2 size={28} className="animate-spin text-[#CC0000]" />
              <p className="text-sm">กำลังเริ่มการสนทนา...</p>
            </div>
          )
        ) : (
          <div className="flex flex-col space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[85%] ${msg.sender === 'user' ? 'self-end items-end' : 'self-start items-start'}`}
              >
                {msg.sender === 'admin' && (
                  <span className="text-[10px] font-semibold text-blue-600 mb-1 ml-1">เจ้าหน้าที่</span>
                )}
                <div
                  className={`px-3 py-2 rounded-2xl ${msg.sender === 'user'
                      ? 'bg-[#CC0000] text-white rounded-br-none'
                      : msg.sender === 'admin'
                        ? 'bg-blue-50 text-blue-900 border border-blue-200 rounded-bl-none shadow-sm'
                        : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none shadow-sm'
                    }`}
                >
                  {msg.attachmentUrl && (
                    <Attachment url={msg.attachmentUrl} type={msg.attachmentType} name={msg.attachmentName} onDark={msg.sender === 'user'} />
                  )}
                  {msg.text && <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>}
                </div>
                <span className="text-[10px] text-gray-400 mt-1 mx-1">
                  {msg.timestamp.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}

            {isSending && (
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
      {session && (
        <div className="bg-white border-t border-gray-200 p-3 flex flex-col gap-2">
          {session.status === 'closed' ? (
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
              {/* Quick Replies */}
              {(quickReplies?.length || 0) > 0 && (messages?.length || 0) < 5 && !pendingAttachment && (
                <div className="flex overflow-x-auto pb-2 gap-2 hide-scrollbar">
                  {quickReplies.map((qr) => (
                    <button
                      key={qr.id}
                      onClick={() => { setInputText(qr.question); }}
                      className="whitespace-nowrap bg-red-50 text-[#CC0000] border border-red-200 px-3 py-1.5 rounded-full text-xs hover:bg-red-100 transition-colors"
                    >
                      {qr.question}
                    </button>
                  ))}
                </div>
              )}

              {/* ตัวอย่างไฟล์แนบที่กำลังจะส่ง */}
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
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                />
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
                  disabled={isSending}
                />
                <button
                  onClick={handleSend}
                  disabled={(!inputText.trim() && !pendingAttachment) || isSending}
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

// แสดงไฟล์แนบ: รูป → แสดงรูป (กดเปิดเต็ม), ไฟล์ → ลิงก์ดาวน์โหลด
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
