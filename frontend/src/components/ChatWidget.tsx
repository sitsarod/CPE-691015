'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle, X, Send, User } from 'lucide-react';
import { autoQaAPI } from '../services/autoQaAPI';
import { AutoQA, ChatSession } from '../types/autoQa';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: Date;
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [quickReplies, setQuickReplies] = useState<AutoQA[]>([]);
  
  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Chat input state
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load quick replies
        const qas = await autoQaAPI.getPublicAutoQAs();
        setQuickReplies(qas || []);

        // Check if there's an active session in local storage
        const savedSessionId = localStorage.getItem('auto_qa_session_id');
        if (savedSessionId) {
          const fetchedSession = await autoQaAPI.getChatSessionById(Number(savedSessionId));
          if (fetchedSession && fetchedSession.status === 'active') {
            setSession(fetchedSession);
            // Load message history from auto_qas
            if (fetchedSession.auto_qas) {
              const loadedMessages: ChatMessage[] = [];
              fetchedSession.auto_qas.forEach(qa => {
                if (qa.question) {
                  loadedMessages.push({
                    id: `user-${qa.id}`,
                    sender: 'user',
                    text: qa.question,
                    timestamp: new Date(qa.created_at)
                  });
                }
                loadedMessages.push({
                  id: `bot-${qa.id}`,
                  sender: 'bot',
                  text: qa.answer,
                  timestamp: new Date(qa.created_at)
                });
              });
              setMessages(loadedMessages);
            }
          } else {
            // Session closed or invalid, clear it
            localStorage.removeItem('auto_qa_session_id');
          }
        }
      } catch (err) {
        console.error('Failed to load chat data:', err);
      }
    };
    loadData();
  }, []);

  // Poll for new messages every 5 seconds if session is active and widget is open
  useEffect(() => {
    if (!isOpen || !session || session.status !== 'active') return;
    
    const interval = setInterval(async () => {
      try {
        const fetchedSession = await autoQaAPI.getChatSessionById(session.id);
        if (fetchedSession && fetchedSession.status === 'active') {
          if (fetchedSession.auto_qas) {
            const loadedMessages: ChatMessage[] = [];
            fetchedSession.auto_qas.forEach(qa => {
              if (qa.question) {
                loadedMessages.push({
                  id: `user-${qa.id}`,
                  sender: 'user',
                  text: qa.question,
                  timestamp: new Date(qa.created_at)
                });
              }
              loadedMessages.push({
                id: `bot-${qa.id}`,
                sender: 'bot',
                text: qa.answer,
                timestamp: new Date(qa.created_at)
              });
            });
            // Update messages only if there is a change in length (simple check)
            // Assuming greeting is length 1, so loadedMessages + greeting is the total
            setMessages(prev => {
              // Only update if there are more messages from server than we have locally (minus greeting & temp messages)
              // This is a naive way to avoid overwriting optimistic UI if it's identical
              const serverMsgCount = loadedMessages.length;
              const localSavedCount = prev.filter(m => !m.id.startsWith('temp-') && !m.id.startsWith('error-') && m.id !== 'greeting').length;
              if (serverMsgCount > localSavedCount) {
                const greeting = prev.find(m => m.id === 'greeting');
                return greeting ? [greeting, ...loadedMessages] : loadedMessages;
              }
              return prev;
            });
          }
        } else {
          setSession(fetchedSession); // Could be closed now
        }
      } catch (err) {
        console.error('Failed to poll chat session:', err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isOpen, session]);

  const handleStartChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !phone) return;

    try {
      setIsSubmitting(true);
      const newSession = await autoQaAPI.createChatSession({
        guest_name: name,
        guest_email: email,
        guest_phone: phone,
      });
      setSession(newSession);
      localStorage.setItem('auto_qa_session_id', String(newSession.id));
      
      // Add initial greeting
      setMessages([
        {
          id: 'greeting',
          sender: 'bot',
          text: `สวัสดีค่ะคุณ ${name}, มีอะไรให้เราช่วยไหมคะ?`,
          timestamp: new Date()
        }
      ]);
    } catch (err) {
      console.error('Failed to create session:', err);
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || !session || isSending) return;

    // Add user message to UI optimistically
    const userMsg: ChatMessage = {
      id: `temp-user-${Date.now()}`,
      sender: 'user',
      text: text,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);

    try {
      const response = await autoQaAPI.askQuestion(session.id, { question: text });
      
      // Add bot response to UI
      const botMsg: ChatMessage = {
        id: `temp-bot-${Date.now()}`,
        sender: 'bot',
        text: response.answer,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (err) {
      console.error('Failed to send message:', err);
      const errorMsg: ChatMessage = {
        id: `error-bot-${Date.now()}`,
        sender: 'bot',
        text: 'ขออภัย เกิดข้อผิดพลาดในการส่งข้อความ',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  };

  const pathname = usePathname();

  if (pathname?.startsWith('/admin') || pathname?.startsWith('/coach')) {
    return null;
  }

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-700 transition-colors z-50 animate-bounce"
        aria-label="Open chat"
      >
        <MessageCircle size={28} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-80 sm:w-96 h-[500px] max-h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden border border-gray-200">
      {/* Header */}
      <div className="bg-red-600 text-white p-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <MessageCircle size={24} />
          <div>
            <h3 className="font-bold text-lg leading-tight">KOYAMA</h3>
            <p className="text-xs text-red-100">ติดต่อสอบถามรายละเอียดได้ 24 ชั่วโมง</p>
          </div>
        </div>
        <button 
          onClick={() => setIsOpen(false)}
          className="text-white hover:text-red-200 transition-colors p-1"
        >
          <X size={24} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
        {!session ? (
          <div className="flex flex-col h-full items-center justify-center">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 w-full">
              <h4 className="text-center font-semibold text-gray-800 mb-2">ยินดีต้อนรับ!</h4>
              <p className="text-center text-sm text-gray-500 mb-6">กรุณากรอกข้อมูลเพื่อเริ่มการสนทนา</p>
              
              <form onSubmit={handleStartChat} className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">ชื่อ-นามสกุล *</label>
                  <input 
                    type="text" 
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full text-black px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-red-500 text-sm"
                    placeholder="สมชาย ใจดี"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">อีเมล *</label>
                  <input 
                    type="email" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full text-black px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-red-500 text-sm"
                    placeholder="somchai@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">เบอร์โทรศัพท์ *</label>
                  <input 
                    type="tel" 
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full text-black px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-red-500 text-sm"
                    placeholder="0812345678"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-red-600 text-white font-medium py-2 rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-400"
                >
                  {isSubmitting ? 'กำลังโหลด...' : 'เริ่มคุยเลย'}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="flex flex-col space-y-4">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex flex-col max-w-[85%] ${msg.sender === 'user' ? 'self-end items-end' : 'self-start items-start'}`}
              >
                <div 
                  className={`px-4 py-2 rounded-2xl ${
                    msg.sender === 'user' 
                      ? 'bg-red-600 text-white rounded-br-none' 
                      : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none shadow-sm'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                </div>
                <span className="text-[10px] text-gray-400 mt-1 mx-1">
                  {msg.timestamp.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}

            {isSending && (
              <div className="self-start flex space-x-1 items-center bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-bl-none shadow-sm">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      {session && (
        <div className="bg-white border-t border-gray-200 p-3 flex flex-col gap-2">
          {/* Quick Replies */}
          {(quickReplies?.length || 0) > 0 && (messages?.length || 0) < 5 && (
            <div className="flex overflow-x-auto pb-2 gap-2 hide-scrollbar">
              {quickReplies.map((qr) => (
                <button
                  key={qr.id}
                  onClick={() => handleSendMessage(qr.question)}
                  className="whitespace-nowrap bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-full text-xs hover:bg-red-100 transition-colors"
                >
                  {qr.question}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(inputText)}
              placeholder="พิมพ์ข้อความ..."
              className="flex-1 text-black bg-gray-100 border-none rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              disabled={isSending}
            />
            <button
              onClick={() => handleSendMessage(inputText)}
              disabled={!inputText.trim() || isSending}
              className="p-2 bg-red-600 text-white rounded-full hover:bg-red-700 disabled:bg-gray-300 transition-colors"
            >
              <Send size={18} className="ml-1" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
