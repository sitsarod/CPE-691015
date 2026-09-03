'use client';

import React, { useState, useEffect, useRef } from 'react';
import { autoQaAPI } from '../../../services/autoQaAPI';
import { ChatSession, AutoQA } from '../../../types/autoQa';
import {
  MessageSquare, Send, Trash2, Power, RotateCcw, Search, ArrowLeft,
  MoreVertical, Settings, X, Mail, Phone, User, Calendar, RefreshCw,
  Paperclip, FileText, Loader2, Download,
} from 'lucide-react';

// ── helpers ──────────────────────────────────────────────
const initialOf = (name: string) => (name?.trim()?.charAt(0) || '?').toUpperCase();
// สีของ avatar สุ่มจากชื่อ (คงที่ต่อคน) ให้ดูมีชีวิตชีวาแบบ Messenger
const AVATAR_COLORS = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500', 'bg-sky-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500'];
const avatarColor = (name: string) => {
  let sum = 0;
  for (let i = 0; i < (name?.length || 0); i++) sum += name.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

export default function ChatSessionsManagement() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);

  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{ url: string; type: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);   // เมนูสามจุด (⋯) ในหัวแชท
  const [infoOpen, setInfoOpen] = useState(false);    // แผงตั้งค่า/ข้อมูลลูกค้า
  const [refreshing, setRefreshing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await autoQaAPI.getAllChatSessions();
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load chat sessions', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // เลื่อนลงล่างสุดเมื่อเปิดแชทหรือมีข้อความใหม่
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedSession?.id, selectedSession?.auto_qas?.length]);

  const handleUpdateStatus = async (id: number, status: 'active' | 'closed') => {
    try {
      await autoQaAPI.updateChatSession(id, { status });
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
      if (selectedSession && selectedSession.id === id) {
        setSelectedSession({ ...selectedSession, status });
      }
    } catch (err) {
      console.error('Failed to update status', err);
      alert('เกิดข้อผิดพลาดในการอัปเดตสถานะ');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ที่จะลบการสนทนานี้? ประวัติการสนทนาทั้งหมดจะหายไป')) return;
    try {
      await autoQaAPI.deleteChatSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (selectedSession && selectedSession.id === id) {
        setSelectedSession(null);
      }
    } catch (err) {
      console.error('Failed to delete session', err);
      alert('เกิดข้อผิดพลาดในการลบข้อมูล');
    }
  };

  const viewSessionDetails = async (id: number) => {
    try {
      const data = await autoQaAPI.getChatSessionById(id);
      setSelectedSession(data);
    } catch (err) {
      console.error('Failed to fetch session details', err);
    }
  };

  // ดึงข้อความล่าสุดของแชทที่เปิดอยู่ (เช่น เห็นข้อความใหม่ของลูกค้า) โดยไม่ต้อง poll ทั้งหน้า
  const refreshCurrent = async () => {
    if (!selectedSession) return;
    setRefreshing(true);
    try {
      const data = await autoQaAPI.getChatSessionById(selectedSession.id);
      setSelectedSession(data);
    } catch (err) {
      console.error('Failed to refresh session', err);
    } finally {
      setRefreshing(false);
    }
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

  const handleAdminReply = async () => {
    if ((!replyText.trim() && !pendingAttachment) || !selectedSession) return;
    const attach = pendingAttachment;
    setIsReplying(true);
    try {
      const newReply = await autoQaAPI.adminReplyChatSession(selectedSession.id, {
        answer: replyText,
        attachment_url: attach?.url,
        attachment_type: attach?.type,
        attachment_name: attach?.name,
      });
      setSelectedSession({
        ...selectedSession,
        auto_qas: [...(selectedSession.auto_qas || []), newReply],
      });
      setReplyText('');
      setPendingAttachment(null);
    } catch (err) {
      console.error('Failed to send reply', err);
      alert('เกิดข้อผิดพลาดในการส่งข้อความ');
    } finally {
      setIsReplying(false);
    }
  };

  const filtered = sessions.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.guest_name?.toLowerCase().includes(q) ||
      s.guest_email?.toLowerCase().includes(q) ||
      s.guest_phone?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="mx-auto max-w-6xl h-[calc(100dvh-8rem)] flex bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden text-black">

      {/* ───────── รายการแชท (ซ้าย) ───────── */}
      <aside className={`${selectedSession ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 flex-col border-r border-gray-200 bg-white`}>
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <MessageSquare size={22} className="text-[#CC0000]" /> แชท
            </h1>
            <button
              onClick={loadData}
              className="p-2 text-gray-400 hover:text-[#CC0000] hover:bg-[#FFF0F0] rounded-full transition-colors"
              title="รีเฟรชรายการ"
            >
              <RefreshCw size={18} />
            </button>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ / อีเมล / เบอร์โทร"
              className="w-full bg-gray-100 rounded-full pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC0000]/30"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400 text-sm">กำลังโหลด...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              {search ? 'ไม่พบผลการค้นหา' : 'ยังไม่มีการสนทนา'}
            </div>
          ) : (
            filtered.map((s) => {
              const active = selectedSession?.id === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => viewSessionDetails(s.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors border-b border-gray-50 ${
                    active ? 'bg-[#FFF0F0]' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className={`relative w-12 h-12 rounded-full ${avatarColor(s.guest_name)} text-white flex items-center justify-center font-bold text-lg flex-shrink-0`}>
                    {initialOf(s.guest_name)}
                    <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${s.status === 'active' ? 'bg-green-500' : 'bg-gray-300'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-gray-900 truncate">{s.guest_name}</span>
                      <span className="text-[11px] text-gray-400 flex-shrink-0">{fmtDate(s.created_at)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-xs text-gray-500 truncate">{s.guest_email}</span>
                      {s.status === 'closed' && (
                        <span className="text-[10px] text-gray-400 flex-shrink-0">ปิดแล้ว</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ───────── หน้าต่างแชท (ขวา) ───────── */}
      <section className={`${selectedSession ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-gray-50 min-w-0`}>
        {!selectedSession ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
            <MessageSquare size={48} className="text-gray-200" />
            <p className="text-sm">เลือกการสนทนาทางซ้ายเพื่อเริ่มดูแชท</p>
          </div>
        ) : (
          <>
            {/* header */}
            <div className="flex items-center gap-3 px-3 sm:px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0">
              <button
                onClick={() => setSelectedSession(null)}
                className="md:hidden p-1.5 -ml-1 text-gray-500 hover:text-gray-800"
                title="กลับ"
              >
                <ArrowLeft size={22} />
              </button>
              <div className={`w-10 h-10 rounded-full ${avatarColor(selectedSession.guest_name)} text-white flex items-center justify-center font-bold flex-shrink-0`}>
                {initialOf(selectedSession.guest_name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 truncate leading-tight">{selectedSession.guest_name}</p>
                <p className={`text-xs leading-tight ${selectedSession.status === 'active' ? 'text-green-600' : 'text-gray-400'}`}>
                  {selectedSession.status === 'active' ? 'กำลังใช้งาน' : 'ปิดการสนทนาแล้ว'}
                </p>
              </div>

              {/* ปุ่มสามจุด (⋯) รวมการจัดการ/แก้ไข/ตั้งค่า */}
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className={`p-2 rounded-full transition-colors ${menuOpen ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}
                  title="ตัวเลือก"
                >
                  <MoreVertical size={20} />
                </button>

                {menuOpen && (
                  <>
                    {/* คลิกพื้นที่ว่างเพื่อปิดเมนู */}
                    <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 z-30 animate-in fade-in slide-in-from-top-1 duration-150">
                      <button
                        onClick={() => { setMenuOpen(false); refreshCurrent(); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <RotateCcw size={16} /> รีเฟรชข้อความ
                      </button>
                      <button
                        onClick={() => { setMenuOpen(false); setInfoOpen(true); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Settings size={16} /> ตั้งค่า & ข้อมูลลูกค้า
                      </button>
                      {selectedSession.status === 'active' ? (
                        <button
                          onClick={() => { setMenuOpen(false); handleUpdateStatus(selectedSession.id, 'closed'); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-orange-600 hover:bg-orange-50"
                        >
                          <Power size={16} /> ปิดการสนทนา
                        </button>
                      ) : (
                        <button
                          onClick={() => { setMenuOpen(false); handleUpdateStatus(selectedSession.id, 'active'); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-green-600 hover:bg-green-50"
                        >
                          <Power size={16} /> เปิดการสนทนาอีกครั้ง
                        </button>
                      )}
                      <div className="my-1 border-t border-gray-100" />
                      <button
                        onClick={() => { setMenuOpen(false); handleDelete(selectedSession.id); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={16} /> ลบการสนทนา
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ข้อความ */}
            <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 flex flex-col gap-2">
              <div className="text-center mb-2">
                <span className="text-[11px] bg-gray-200 text-gray-500 px-3 py-1 rounded-full">
                  เริ่มการสนทนา {new Date(selectedSession.created_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </div>

              {(!selectedSession.auto_qas || selectedSession.auto_qas.length === 0) ? (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">ยังไม่มีข้อความสนทนา</div>
              ) : (
                selectedSession.auto_qas.map((qa: AutoQA) =>
                  qa.mode === 'admin_reply' ? (
                    // ข้อความแอดมิน (เรา) → ขวา สีแดงธีมระบบ
                    <div key={qa.id} className="flex flex-col max-w-[80%] self-end items-end">
                      <div className="px-4 py-2 rounded-2xl rounded-br-md bg-[#CC0000] text-white shadow-sm">
                        {qa.attachment_url && <ChatAttachment url={qa.attachment_url} type={qa.attachment_type} name={qa.attachment_name} onDark />}
                        {qa.answer && <p className="text-sm whitespace-pre-wrap break-words">{qa.answer}</p>}
                      </div>
                      <span className="text-[10px] text-gray-400 mt-1 mr-1">{fmtTime(qa.created_at)}</span>
                    </div>
                  ) : (
                    // แถวของลูกค้า: คำถามลูกค้า (ซ้ายขาว) + คำตอบบอท (ซ้ายเทา)
                    <React.Fragment key={qa.id}>
                      {(qa.question || qa.attachment_url) && (
                        <div className="flex flex-col max-w-[80%] self-start items-start">
                          <div className="px-4 py-2 rounded-2xl rounded-bl-md bg-white border border-gray-200 text-gray-800 shadow-sm">
                            {qa.attachment_url && <ChatAttachment url={qa.attachment_url} type={qa.attachment_type} name={qa.attachment_name} />}
                            {qa.question && <p className="text-sm whitespace-pre-wrap break-words">{qa.question}</p>}
                          </div>
                          <span className="text-[10px] text-gray-400 mt-1 ml-1">{selectedSession.guest_name} · {fmtTime(qa.created_at)}</span>
                        </div>
                      )}
                      {qa.answer && (
                        <div className="flex flex-col max-w-[80%] self-start items-start">
                          <div className="px-4 py-2 rounded-2xl rounded-bl-md bg-gray-100 text-gray-600 border border-gray-100">
                            <p className="text-sm whitespace-pre-wrap break-words">{qa.answer}</p>
                          </div>
                          <span className="text-[10px] text-gray-400 mt-1 ml-1">บอทตอบอัตโนมัติ · {fmtTime(qa.created_at)}</span>
                        </div>
                      )}
                    </React.Fragment>
                  )
                )
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ช่องพิมพ์ */}
            <div className="p-3 bg-white border-t border-gray-200 flex-shrink-0">
              {selectedSession.status === 'active' ? (
                <div className="flex flex-col gap-2">
                  {pendingAttachment && (
                    <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-2 w-fit max-w-full">
                      {pendingAttachment.type === 'image' ? (
                        <img src={pendingAttachment.url} alt="แนบ" className="w-12 h-12 object-cover rounded" />
                      ) : (
                        <FileText size={22} className="text-[#CC0000]" />
                      )}
                      <span className="text-xs text-gray-600 truncate max-w-[180px]">{pendingAttachment.name || 'ไฟล์แนบ'}</span>
                      <button onClick={() => setPendingAttachment(null)} className="text-gray-400 hover:text-red-500">
                        <X size={16} />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input type="file" accept="image/*,application/pdf" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || isReplying}
                      className="p-2 text-gray-400 hover:text-[#CC0000] disabled:opacity-50 transition-colors flex-shrink-0"
                      title="แนบรูป/ไฟล์"
                    >
                      {uploading ? <Loader2 size={20} className="animate-spin" /> : <Paperclip size={20} />}
                    </button>
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAdminReply()}
                      placeholder="พิมพ์ข้อความตอบกลับลูกค้า..."
                      className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC0000]/30"
                      disabled={isReplying}
                    />
                    <button
                      onClick={handleAdminReply}
                      disabled={(!replyText.trim() && !pendingAttachment) || isReplying}
                      className="w-11 h-11 flex items-center justify-center bg-[#CC0000] text-white rounded-full hover:bg-[#990000] disabled:bg-gray-300 transition-colors flex-shrink-0"
                      title="ส่งข้อความ"
                    >
                      <Send size={18} className="ml-0.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-1">
                  <span>การสนทนานี้ปิดอยู่</span>
                  <button
                    onClick={() => handleUpdateStatus(selectedSession.id, 'active')}
                    className="text-[#CC0000] font-medium hover:underline"
                  >
                    เปิดอีกครั้งเพื่อตอบกลับ
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* ───────── แผงตั้งค่า & ข้อมูลลูกค้า ───────── */}
      {infoOpen && selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setInfoOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Settings size={18} className="text-[#CC0000]" /> ตั้งค่า & ข้อมูลลูกค้า
              </h3>
              <button onClick={() => setInfoOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>

            <div className="p-5">
              <div className="flex items-center gap-3 mb-5">
                <div className={`w-14 h-14 rounded-full ${avatarColor(selectedSession.guest_name)} text-white flex items-center justify-center font-bold text-xl`}>
                  {initialOf(selectedSession.guest_name)}
                </div>
                <div>
                  <p className="font-bold text-gray-900">{selectedSession.guest_name}</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${selectedSession.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {selectedSession.status === 'active' ? 'กำลังใช้งาน' : 'ปิดการสนทนาแล้ว'}
                  </span>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <InfoRow icon={<Mail size={16} />} label="อีเมล" value={selectedSession.guest_email} />
                <InfoRow icon={<Phone size={16} />} label="เบอร์โทร" value={selectedSession.guest_phone} />
                <InfoRow icon={<User size={16} />} label="บัญชีผู้ใช้" value={selectedSession.user_id ? `เชื่อมกับสมาชิก #${selectedSession.user_id}` : 'ผู้เยี่ยมชม (ไม่ได้ล็อกอิน)'} />
                <InfoRow icon={<Calendar size={16} />} label="เริ่มสนทนา" value={new Date(selectedSession.created_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })} />
              </div>

              <div className="mt-6 flex flex-col gap-2">
                {selectedSession.status === 'active' ? (
                  <button
                    onClick={() => { handleUpdateStatus(selectedSession.id, 'closed'); setInfoOpen(false); }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 font-medium transition-colors"
                  >
                    <Power size={16} /> ปิดการสนทนา
                  </button>
                ) : (
                  <button
                    onClick={() => { handleUpdateStatus(selectedSession.id, 'active'); setInfoOpen(false); }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 font-medium transition-colors"
                  >
                    <Power size={16} /> เปิดการสนทนาอีกครั้ง
                  </button>
                )}
                <button
                  onClick={() => { setInfoOpen(false); handleDelete(selectedSession.id); }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-medium transition-colors"
                >
                  <Trash2 size={16} /> ลบการสนทนา
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-gray-400 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-gray-800 break-words">{value || '-'}</p>
      </div>
    </div>
  );
}

// แสดงไฟล์แนบในฟองแชท: รูป → แสดงรูป (กดเปิดเต็ม), ไฟล์ → ลิงก์ดาวน์โหลด
function ChatAttachment({ url, type, name, onDark }: { url: string; type?: string; name?: string; onDark?: boolean }) {
  if (type === 'image') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block mb-1">
        <img src={url} alt={name || 'รูปแนบ'} className="max-w-[220px] max-h-[240px] rounded-lg object-cover" />
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
