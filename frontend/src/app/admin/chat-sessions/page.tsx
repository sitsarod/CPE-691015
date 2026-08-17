'use client';

import React, { useState, useEffect } from 'react';
import { autoQaAPI } from '../../../services/autoQaAPI';
import { ChatSession, AutoQA } from '../../../types/autoQa';
import { MessageSquare, X, Trash2, Power, Eye } from 'lucide-react';

export default function ChatSessionsManagement() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);

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

  const handleUpdateStatus = async (id: number, status: 'active' | 'closed') => {
    try {
      await autoQaAPI.updateChatSession(id, { status });
      // Update local state or reload
      setSessions(sessions.map(s => s.id === id ? { ...s, status } : s));
      if (selectedSession && selectedSession.id === id) {
        setSelectedSession({ ...selectedSession, status });
      }
    } catch (err) {
      console.error('Failed to update status', err);
      alert('เกิดข้อผิดพลาดในการอัปเดตสถานะ');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ที่จะลบเซสชั่นแชทนี้? ประวัติการสนทนาทั้งหมดจะหายไป')) return;
    try {
      await autoQaAPI.deleteChatSession(id);
      setSessions(sessions.filter(s => s.id !== id));
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

  const handleAdminReply = async () => {
    if (!replyText.trim() || !selectedSession) return;
    setIsReplying(true);
    try {
      const newReply = await autoQaAPI.adminReplyChatSession(selectedSession.id, replyText);
      const updatedSession = {
        ...selectedSession,
        auto_qas: [...(selectedSession.auto_qas || []), newReply]
      };
      setSelectedSession(updatedSession);
      setReplyText('');
    } catch (err) {
      console.error('Failed to send reply', err);
      alert('เกิดข้อผิดพลาดในการส่งข้อความ');
    } finally {
      setIsReplying(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl text-black">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">จัดการแชท & รายชื่อลูกค้า (CRM)</h1>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-gray-500">กำลังโหลดข้อมูล...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-sm">
                  <th className="p-4 font-semibold">ID</th>
                  <th className="p-4 font-semibold">ชื่อลูกค้า (Guest Name)</th>
                  <th className="p-4 font-semibold">อีเมล (Email)</th>
                  <th className="p-4 font-semibold">เบอร์โทร (Phone)</th>
                  <th className="p-4 font-semibold">สถานะ</th>
                  <th className="p-4 font-semibold">วันที่สร้าง</th>
                  <th className="p-4 font-semibold text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-sm align-middle text-gray-500">#{session.id}</td>
                    <td className="p-4 text-sm align-middle font-medium">{session.guest_name}</td>
                    <td className="p-4 text-sm align-middle text-gray-600">{session.guest_email}</td>
                    <td className="p-4 text-sm align-middle text-gray-600">{session.guest_phone}</td>
                    <td className="p-4 text-sm align-middle">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        session.status === 'active' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {session.status === 'active' ? 'Active' : 'Closed'}
                      </span>
                    </td>
                    <td className="p-4 text-sm align-middle text-gray-500">
                      {new Date(session.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="p-4 align-middle">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => viewSessionDetails(session.id)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium"
                          title="ดูแชท"
                        >
                          <Eye size={18} /> เปิดแชท
                        </button>
                        <button
                          onClick={() => handleDelete(session.id)}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="ลบ"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sessions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-500">
                      ยังไม่มีข้อมูลการแชท
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Session Details Modal (Chat Log) */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl h-[85vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-gray-200 bg-gray-50">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <MessageSquare size={20} className="text-red-600" />
                  แชทกับ {selectedSession.guest_name}
                </h2>
                <div className="text-sm text-gray-500 flex gap-4 mt-1">
                  <span>อีเมล: {selectedSession.guest_email}</span>
                  <span>เบอร์โทร: {selectedSession.guest_phone}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {selectedSession.status === 'active' ? (
                  <button 
                    onClick={() => handleUpdateStatus(selectedSession.id, 'closed')}
                    className="flex items-center gap-1 text-sm bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg hover:bg-orange-200 transition-colors"
                  >
                    <Power size={16} /> ปิดแชท
                  </button>
                ) : (
                  <span className="text-sm font-medium px-3 py-1 bg-gray-200 text-gray-700 rounded-lg">แชทถูกปิดแล้ว</span>
                )}
                <button onClick={() => setSelectedSession(null)} className="text-gray-500 hover:text-gray-800">
                  <X size={24} />
                </button>
              </div>
            </div>
            
            {/* Chat History Body */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-100 flex flex-col space-y-4">
              <div className="text-center">
                <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                  เริ่มต้นการสนทนา: {new Date(selectedSession.created_at).toLocaleString('th-TH')}
                </span>
              </div>
              
              {!selectedSession.auto_qas || selectedSession.auto_qas.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                  ยังไม่มีข้อความสนทนา
                </div>
              ) : (
                selectedSession.auto_qas.map((qa: AutoQA) => (
                  <React.Fragment key={qa.id}>
                    {/* User Message */}
                    {qa.question && (
                      <div className="flex flex-col max-w-[85%] self-end items-end">
                        <span className="text-xs text-gray-500 mb-1 mr-1">{selectedSession.guest_name}</span>
                        <div className="px-4 py-2 rounded-2xl bg-red-600 text-white rounded-br-none shadow-sm">
                          <p className="text-sm whitespace-pre-wrap">{qa.question}</p>
                        </div>
                        <span className="text-[10px] text-gray-400 mt-1 mx-1">
                          {new Date(qa.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}

                    {/* Bot/Admin Message */}
                    <div className="flex flex-col max-w-[85%] self-start items-start">
                      <span className="text-xs text-gray-500 mb-1 ml-1">
                        {qa.mode === 'admin_reply' ? 'ผู้ดูแลระบบ (Admin)' : 'ระบบ (Bot)'}
                      </span>
                      <div className={`px-4 py-2 rounded-2xl border shadow-sm rounded-bl-none ${qa.mode === 'admin_reply' ? 'bg-blue-50 text-blue-900 border-blue-200' : 'bg-white text-gray-800 border-gray-200'}`}>
                        <p className="text-sm whitespace-pre-wrap">{qa.answer}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1 mx-1">
                        <span className="text-[10px] text-gray-400">
                          {new Date(qa.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 rounded-sm">
                          {qa.mode}
                        </span>
                      </div>
                    </div>
                  </React.Fragment>
                ))
              )}
            </div>
            
            {/* Input Placeholder (Admins can only view for now based on AutoQA) */}
            <div className="p-4 border-t border-gray-200 bg-white">
              {selectedSession.status === 'active' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdminReply()}
                    placeholder="พิมพ์ข้อความตอบกลับลูกค้า..."
                    className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                    disabled={isReplying}
                  />
                  <button
                    onClick={handleAdminReply}
                    disabled={!replyText.trim() || isReplying}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition-colors text-sm font-medium"
                  >
                    ส่งข้อความ
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center flex items-center justify-center gap-2">
                  <Eye size={16} /> โหมดดูประวัติการสนทนาเท่านั้น (แชทถูกปิดแล้ว)
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
