'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

// --- ICONS (SVGs) ---
const Icons = {
  Home: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  Calendar: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  Video: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  ),
  Billing: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  Users: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  Attendance: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  Feedback: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  ),
  Settings: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  Announce: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
    </svg>
  ),
  Logout: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
  Chart: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
    </svg>
  )
};

// --- CORE DASHBOARD COMPONENT ---
function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Get active role from URL params, default is 'student'
  const [role, setRole] = useState('student');
  const [currentTab, setCurrentTab] = useState('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Sync state with query parameters
  useEffect(() => {
    const roleParam = searchParams.get('role');
    if (roleParam && ['student', 'coach', 'admin'].includes(roleParam)) {
      setRole(roleParam);
    }
  }, [searchParams]);

  // Set default tab when role changes
  useEffect(() => {
    setCurrentTab('home');
  }, [role]);

  // Change role dynamically
  const switchRole = (newRole: string) => {
    setRole(newRole);
    router.push(`/dashboard?role=${newRole}`);
  };

  // --- MOCK INTERACTIVE STATES ---
  const [attendanceList, setAttendanceList] = useState([
    { id: 101, name: 'เด็กชาย ภูมินทร์ (น้องภู)', status: 'unchecked', time: '16:00' },
    { id: 102, name: 'เด็กหญิง นภัสสร (น้องครีม)', status: 'checked', time: '16:00' },
    { id: 103, name: 'นาย อัครพล (เจมส์)', status: 'unchecked', time: '18:00' },
    { id: 104, name: 'นางสาว พรนภา (ก้อย)', status: 'absent', time: '18:00' },
  ]);

  const [coaches, setCoaches] = useState([
    { id: 1, name: 'โค้ชกิตติพงษ์ (Coach Kit)', role: 'Head Coach', hours: '42 ชั่วโมง', status: 'ปกติ' },
    { id: 2, name: 'โค้ชสุนิสา (Coach May)', role: 'Senior Coach', hours: '35 ชั่วโมง', status: 'ปกติ' },
  ]);

  useEffect(() => {
    if (role === 'admin' && currentTab === 'coaches') {
      fetch('http://localhost:8080/api/coaches')
        .then(res => {
          if (!res.ok) throw new Error('API failed');
          return res.json();
        })
        .then(data => {
          if (data && data.length > 0) {
            const mapped = data.map((c: any) => ({
              id: c.ID || Math.random(),
              name: `โค้ช${c.nickname || c.first_name} (${c.first_name} ${c.last_name})`,
              role: c.specialization || 'สตาฟผู้ฝึกสอน',
              hours: c.phone ? `ติดต่อ: ${c.phone}` : '42 ชั่วโมง',
              status: 'ปกติ'
            }));
            setCoaches(mapped);
          }
        })
        .catch(err => {
          console.log('Backend not available, using mock coaches list:', err);
        });
    }
  }, [role, currentTab]);

  const toggleAttendance = (id: number, status: string) => {
    setAttendanceList(prev => prev.map(student => 
      student.id === id ? { ...student, status } : student
    ));
  };

  // --- CONFIGURATIONS FOR EACH ROLE ---
  const roleConfigs: {
    [key: string]: {
      title: string;
      user: { name: string; avatar: string; email: string };
      menu: { id: string; label: string; icon: React.ReactNode }[];
    };
  } = {
    student: {
      title: 'Student Portal',
      user: { name: 'ภูมินทร์ ใจดี (น้องภู)', avatar: '👦', email: 'phumin@gmail.com' },
      menu: [
        { id: 'home', label: 'หน้าหลัก', icon: <Icons.Home /> },
        { id: 'classes', label: 'คลาสเรียนของฉัน', icon: <Icons.Calendar /> },
        { id: 'video', label: 'วิเคราะห์การเล่น (AI)', icon: <Icons.Video /> },
        { id: 'billing', label: 'ใบเสร็จ & การเงิน', icon: <Icons.Billing /> },
        { id: 'settings', label: 'ตั้งค่าระบบ', icon: <Icons.Settings /> }
      ]
    },
    coach: {
      title: 'Coach Portal',
      user: { name: 'โค้ชกิตติพงษ์ (Coach Kit)', avatar: '🏸', email: 'kit.coach@smash.com' },
      menu: [
        { id: 'home', label: 'หน้าหลัก', icon: <Icons.Home /> },
        { id: 'classes', label: 'ตารางสอนของฉัน', icon: <Icons.Calendar /> },
        { id: 'attendance', label: 'เช็คชื่อเข้าเรียน', icon: <Icons.Attendance /> },
        { id: 'feedback', label: 'ประเมินฟอร์มนักเรียน', icon: <Icons.Feedback /> },
        { id: 'settings', label: 'ตั้งค่าระบบ', icon: <Icons.Settings /> }
      ]
    },
    admin: {
      title: 'Admin Console',
      user: { name: 'ผู้บริหาร ณัฐพล (Admin)', avatar: '💼', email: 'admin@smashacademy.com' },
      menu: [
        { id: 'home', label: 'หน้าภาพรวม (Overview)', icon: <Icons.Chart /> },
        { id: 'coaches', label: 'จัดการข้อมูลโค้ช', icon: <Icons.Users /> },
        { id: 'students', label: 'จัดการข้อมูลนักเรียน', icon: <Icons.Users /> },
        { id: 'billing', label: 'ระบบบัญชี & ค่าเล่าเรียน', icon: <Icons.Billing /> },
        { id: 'announcements', label: 'ประชาสัมพันธ์ข่าว', icon: <Icons.Announce /> },
        { id: 'settings', label: 'ตั้งค่าระบบ', icon: <Icons.Settings /> }
      ]
    }
  };

  const config = roleConfigs[role] || roleConfigs.student;

  return (
    <div className="min-h-screen bg-background text-slate-800 flex flex-col md:flex-row">
      
      {/* --- MOBILE NAVBAR --- */}
      <div className="md:hidden flex items-center justify-between px-6 h-16 bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-orange-primary flex items-center justify-center font-bold text-white">S</div>
          <span className="font-bold text-sm tracking-wider uppercase text-slate-800">{config.title}</span>
        </div>
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-slate-500 hover:text-slate-800"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* --- SIDEBAR --- */}
      <aside className={`w-full md:w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 md:sticky md:top-0 md:h-screen z-20 transition-all ${
        mobileMenuOpen ? 'block' : 'hidden md:flex'
      }`}>
        {/* Brand Header */}
        <div className="p-6 border-b border-slate-200 hidden md:flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-orange-primary flex items-center justify-center font-bold text-white text-xl shadow-sm shadow-orange-primary/10">S</div>
          <div>
            <h1 className="font-bold text-sm text-slate-800 tracking-wider uppercase">SMASH ACADEMY</h1>
            <p className="text-[10px] text-green-accent font-bold uppercase">{config.title}</p>
          </div>
        </div>

        {/* User Card */}
        <div className="p-6 border-b border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-2xl">
            {config.user.avatar}
          </div>
          <div className="overflow-hidden">
            <h2 className="font-bold text-sm text-slate-800 truncate">{config.user.name}</h2>
            <p className="text-xs text-slate-500 truncate">{config.user.email}</p>
          </div>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {config.menu.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setCurrentTab(item.id);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all cursor-pointer ${
                currentTab === item.id
                  ? 'bg-orange-primary text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Sidebar Footer / Log out */}
        <div className="p-4 border-t border-slate-150">
          <button 
            onClick={() => window.location.href = '/'}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition-all cursor-pointer"
          >
            <Icons.Logout />
            ออกจากระบบ (Log Out)
          </button>
        </div>
      </aside>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto max-w-7xl mx-auto w-full">
        
        {/* --- DYNAMIC SECTION CONTENT --- */}
        {role === 'student' && (
          <div>
            {currentTab === 'home' && (
              <div className="space-y-8">
                {/* Welcome Card */}
                <div className="p-8 rounded-2xl bg-gradient-to-r from-orange-glow to-green-glow/40 border border-orange-primary/20 relative overflow-hidden">
                  <div className="absolute -right-10 -bottom-10 w-44 h-44 bg-orange-primary/5 rounded-full blur-3xl pointer-events-none" />
                  <h3 className="text-2xl font-extrabold text-slate-800 mb-2">สวัสดีครับ, {config.user.name} 👋</h3>
                  <p className="text-slate-600 text-sm max-w-2xl leading-relaxed">
                    พร้อมสำหรับคลาสซ้อมแบดมินตันวันนี้หรือยังครับ? ฟอร์มการตีและกำลังหน้าไม้ของคุณพัฒนาขึ้นอย่างมากจากสัปดาห์ที่แล้ว! 
                    อย่าลืมเข้าไปดูคลิปวิเคราะห์การตีลูกตบ (Smash Analysis) ของวันจันทร์ที่โค้ชวิเคราะห์ไว้ให้ด้วยนะครับ
                  </p>
                </div>

                {/* Grid stats & Shortcuts */}
                <div className="grid md:grid-cols-3 gap-6">
                  {/* Class credit count */}
                  <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase mb-2">ชั่วโมงเรียนคงเหลือ</div>
                      <div className="text-3xl font-extrabold text-orange-primary">8 / 12</div>
                      <p className="text-[11px] text-slate-500 mt-2">หมดอายุในวันที่ 24 ก.ค. 2026</p>
                    </div>
                    <button 
                      onClick={() => setCurrentTab('classes')}
                      className="mt-6 text-xs text-orange-primary font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      ดูประวัติเข้าเรียน →
                    </button>
                  </div>

                  {/* Next session card */}
                  <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase mb-2">ชั่วโมงซ้อมคลาสถัดไป</div>
                      <div className="text-base font-bold text-slate-800">Junior Badminton Basics</div>
                      <div className="text-xs text-slate-600 mt-2">📅 วันเสาร์ที่ 27 มิ.ย. 2026</div>
                      <div className="text-xs text-slate-600 mt-0.5">⏰ เวลา 16:00 - 18:00 น.</div>
                      <div className="text-xs text-green-accent font-bold mt-2">คอร์ท 3 (โค้ชMay)</div>
                    </div>
                    <button 
                      onClick={() => setCurrentTab('classes')}
                      className="mt-4 text-xs text-slate-500 hover:text-slate-800 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      เช็คตารางสัปดาห์นี้ →
                    </button>
                  </div>

                  {/* Latest feedback link */}
                  <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase mb-2">การวิเคราะห์ฟอร์มล่าสุด</div>
                      <div className="text-sm font-bold text-slate-800">วิเคราะห์จังหวะการขึ้นตบ (Smash)</div>
                      <p className="text-xs text-slate-500 mt-2 leading-relaxed line-clamp-2">
                        "สะบัดข้อมือได้เร็วขึ้นแล้ว แต่ยังต้องปรับจังหวะการกระโดดให้รับลูกพอดีหน้า..."
                      </p>
                      <span className="inline-block mt-2.5 text-[9px] bg-green-glow border border-green-accent/20 text-green-accent px-2 py-0.5 rounded font-bold">
                        วิเคราะห์ความเร็วโดย AI
                      </span>
                    </div>
                    <button 
                      onClick={() => setCurrentTab('video')}
                      className="mt-4 text-xs text-orange-primary font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      เปิดดูคลิปวิเคราะห์ →
                    </button>
                  </div>
                </div>

                {/* Announcement panel */}
                <div className="p-6 rounded-2xl border border-slate-250 bg-white shadow-sm">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">📢 ประชาสัมพันธ์จากทางสถาบัน</h4>
                  <ul className="space-y-3 text-xs text-slate-600">
                    <li className="flex gap-4">
                      <span className="text-orange-primary font-bold shrink-0">24 มิ.ย.</span>
                      <span>ปิดทำการสถาบัน 1 วันในวันอังคารหน้า เพื่อปรับปรุงระบบไฟและพื้นคอร์ท 3-4</span>
                    </li>
                    <li className="flex gap-4">
                      <span className="text-orange-primary font-bold shrink-0">15 มิ.ย.</span>
                      <span>ขอต้อนรับ โค้ชทีรุตม์ เข้าร่วมทีมสตาฟโค้ชอย่างเป็นทางการ ดูแลการถ่ายวิดีโอวิเคราะห์ของนักกีฬา</span>
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {currentTab === 'classes' && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-slate-800">ประวัติคลาสและตารางเรียนของฉัน</h3>
                <p className="text-slate-500 text-xs">ตรวจสอบสถานะการเช็คชื่อเข้าซ้อม และข้อมูลการเข้าเรียนในสัปดาห์นี้</p>
                
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-xs text-left text-slate-600">
                    <thead className="text-[11px] text-slate-700 uppercase bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4 font-bold">วันที่</th>
                        <th className="px-6 py-4 font-bold">คลาส / คอร์ส</th>
                        <th className="px-6 py-4 font-bold">ผู้สอน</th>
                        <th className="px-6 py-4 font-bold">เวลาเรียน</th>
                        <th className="px-6 py-4 font-bold">สถานะเช็คชื่อ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      <tr>
                        <td className="px-6 py-4 text-slate-800 font-medium">22 มิ.ย. 2026</td>
                        <td className="px-6 py-4">Junior Badminton Basics</td>
                        <td className="px-6 py-4">โค้ช May</td>
                        <td className="px-6 py-4">16:00 - 18:00</td>
                        <td className="px-6 py-4"><span className="text-green-accent font-bold">✓ มาเรียน (Present)</span></td>
                      </tr>
                      <tr>
                        <td className="px-6 py-4 text-slate-800 font-medium">15 มิ.ย. 2026</td>
                        <td className="px-6 py-4">Junior Badminton Basics</td>
                        <td className="px-6 py-4">โค้ช May</td>
                        <td className="px-6 py-4">16:00 - 18:00</td>
                        <td className="px-6 py-4"><span className="text-green-accent font-bold">✓ มาเรียน (Present)</span></td>
                      </tr>
                      <tr>
                        <td className="px-6 py-4 text-slate-800 font-medium">08 มิ.ย. 2026</td>
                        <td className="px-6 py-4">Junior Badminton Basics</td>
                        <td className="px-6 py-4">โค้ช May</td>
                        <td className="px-6 py-4">16:00 - 18:00</td>
                        <td className="px-6 py-4"><span className="text-rose-500 font-bold">✗ ลาหยุด (Absent/Excused)</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {currentTab === 'video' && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-slate-800">ระบบวิเคราะห์วิดีโอ (Smart Video Analysis)</h3>
                <p className="text-slate-500 text-xs">ดูบันทึกวิดีโอการฝึกตบหรือเทคนิคการเคลื่อนเท้าที่โค้ชนำเข้าไปประเมินมุมและวิเคราะห์ AI</p>

                <div className="grid md:grid-cols-3 gap-8">
                  <div className="md:col-span-2 space-y-4">
                    <div className="w-full aspect-video rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center relative overflow-hidden group">
                      <div className="absolute inset-0 bg-slate-900/10 flex flex-col justify-between p-6">
                        <div className="text-[10px] bg-black/75 px-3 py-1 rounded text-orange-primary font-bold self-start">
                          AI SPEED DETECTION: 184 km/h
                        </div>
                        
                        <div className="w-16 h-16 rounded-full bg-orange-primary text-white flex items-center justify-center mx-auto hover:scale-110 transition-all cursor-pointer shadow-lg shadow-orange-primary/30">
                          <svg className="w-8 h-8 fill-current translate-x-0.5" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                        
                        <div className="flex justify-between items-center text-xs text-slate-800 bg-white/90 p-2 rounded shadow-sm">
                          <span className="font-semibold">วิดีโอตบลูกก้อย: ช็อตซ้อมประจำสัปดาห์</span>
                          <span>0:14 / 0:45</span>
                        </div>
                      </div>
                      
                      <div className="absolute top-1/3 left-1/3 w-28 h-28 border border-dashed border-rose-500 rounded-full animate-ping pointer-events-none" />
                      <div className="absolute top-1/2 left-1/2 w-4 h-4 bg-orange-primary rounded-full animate-bounce pointer-events-none" />
                      <span className="text-slate-400 text-xs select-none">[ Badminton Court Camera Mockup ]</span>
                    </div>

                    <div className="flex gap-4">
                      <button className="px-4 py-2 bg-orange-primary text-white text-xs font-bold rounded-lg hover:bg-orange-hover transition-all cursor-pointer">ดาวน์โหลดคลิปวิดีโอ</button>
                      <button className="px-4 py-2 bg-white border border-slate-200 text-xs font-bold text-slate-600 rounded-lg hover:bg-slate-50 cursor-pointer">ส่งต่อลิงก์ภายนอก</button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="p-6 rounded-xl border border-slate-200 bg-white shadow-sm">
                      <h4 className="font-bold text-xs text-slate-800 mb-3">💬 รายงานประเมินจากโค้ชทีรุตม์</h4>
                      <p className="text-xs text-slate-550 leading-relaxed">
                        "จากการบันทึกวิดีโอความเร็วตบวัดได้สูงสุด 184 กม./ชม. องศาไม้ในจังหวะสัมผัสลูกเหมาะสมมาก แต่จุดที่ต้องระวังคือเท้าข้างซ้ายยังไม่รับน้ำหนักตอนก้าวถอยหลังตบ ทำให้เสียสมดุลส่งผลให้วางลูกยาวได้ไม่แม่นยำ"
                      </p>
                      <div className="mt-6 pt-4 border-t border-slate-100 text-xs">
                        <span className="text-slate-400 block">วิเคราะห์โดย:</span>
                        <span className="text-green-accent font-bold">โค้ชทีรุตม์ (ผู้เชี่ยวชาญเทคโนโลยี)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentTab === 'billing' && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-slate-800">ใบเสร็จรับเงิน & บิลค้างชำระ</h3>
                <p className="text-slate-500 text-xs">ดูบิลเรียกเก็บเงิน ตรวจสอบสถานะการชำระเงิน และอัปโหลดหลักฐานสลิป</p>

                <div className="grid gap-4">
                  <div className="p-6 rounded-xl border border-orange-primary/20 bg-orange-glow flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <span className="text-[9px] font-extrabold uppercase bg-rose-100 text-rose-500 px-2 py-0.5 rounded border border-rose-200">ยังไม่ได้ชำระ</span>
                      <h4 className="font-bold text-base text-slate-800 mt-2">บิลค่าคอร์สเรียน Junior Basics - แพ็กเกจ ก.ค. 2026</h4>
                      <p className="text-xs text-slate-500 mt-1">ยอดเรียกเก็บ: 4,500 บาท | วันที่ออกบิล: 24 มิ.ย. 2026</p>
                    </div>
                    <button className="px-6 py-2.5 bg-orange-primary text-white font-bold text-xs rounded-full hover:bg-orange-hover shadow-md shadow-orange-primary/10 cursor-pointer">
                      อัปโหลดสลิปชำระเงิน
                    </button>
                  </div>

                  <div className="p-6 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <span className="text-[9px] font-extrabold uppercase bg-green-glow text-green-accent px-2 py-0.5 rounded border border-green-accent/20">ชำระแล้ว</span>
                      <h4 className="font-bold text-base text-slate-700 mt-2">บิลค่าสมัครสมาชิก & แพ็กเกจ มิถุนายน 2026</h4>
                      <p className="text-xs text-slate-400 mt-1">ยอดชำระ: 4,500 บาท | วันที่โอนเงิน: 01 มิ.ย. 2026 10:24 น.</p>
                    </div>
                    <button className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer">
                      ดาวน์โหลดใบเสร็จ (PDF)
                    </button>
                  </div>
                </div>
              </div>
            )}

            {currentTab === 'settings' && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-slate-800">ตั้งค่าโปรไฟล์</h3>
                <p className="text-slate-500 text-xs">ข้อมูลทั่วไปของผู้ใช้ สามารถเข้าแก้ไขเพื่อใช้ติดต่อขอข้อมูล</p>
                <div className="p-6 rounded-xl border border-slate-200 bg-white max-w-lg shadow-sm">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5">ชื่อผู้เรียน</label>
                      <input type="text" readOnly value="เด็กชาย ภูมินทร์ ใจดี" className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5">เบอร์โทรศัพท์ผู้ปกครอง</label>
                      <input type="text" defaultValue="089-999-8888" className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-orange-primary" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5">อีเมลที่ผูกกับบัญชี</label>
                      <input type="text" readOnly value="phumin@gmail.com" className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-500 focus:outline-none" />
                    </div>
                    <button className="px-5 py-2 bg-orange-primary text-white font-bold text-xs rounded-lg hover:bg-orange-hover cursor-pointer">บันทึกข้อมูลส่วนตัว</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {role === 'coach' && (
          <div>
            {currentTab === 'home' && (
              <div className="space-y-8">
                {/* Welcome Card */}
                <div className="p-8 rounded-2xl bg-gradient-to-r from-orange-glow to-green-glow/40 border border-orange-primary/20 relative overflow-hidden">
                  <div className="absolute -right-10 -bottom-10 w-44 h-44 bg-orange-primary/5 rounded-full blur-3xl pointer-events-none" />
                  <h3 className="text-2xl font-extrabold text-slate-800 mb-2">ยินดีต้อนรับครับ, {config.user.name} 🏆</h3>
                  <p className="text-slate-600 text-sm max-w-2xl leading-relaxed">
                    วันนี้มีตารางคลาสสอนทั้งหมด 3 กลุ่มหลัก และมีตารางสอนตัวต่อตัว 1 คลาสช่วงเย็น 
                    อย่าลืมเช็คชื่อการลงเวลาทำงานของโค้ชและการเช็คชื่อเข้าคลาสของนักเรียนหลังจากจบคลาสแต่ละรอบด้วยครับ
                  </p>
                </div>

                {/* Dashboard grid widgets */}
                <div className="grid md:grid-cols-3 gap-6">
                  {/* Today schedule count */}
                  <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase mb-2">ตารางการเรียนวันนี้</div>
                      <div className="text-3xl font-extrabold text-orange-primary">3 คลาส</div>
                      <p className="text-[11px] text-slate-500 mt-2">รอบ 16:00, 18:00 และ 20:00</p>
                    </div>
                    <button 
                      onClick={() => setCurrentTab('classes')}
                      className="mt-6 text-xs text-orange-primary font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      เปิดดูตารางสอนโดยละเอียด →
                    </button>
                  </div>

                  {/* Attendance check pending status */}
                  <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase mb-2">เช็คชื่อรอบล่าสุด (16:00)</div>
                      <div className="text-lg font-bold text-slate-800">เช็คชื่อแล้ว 1/4 คน</div>
                      <div className="text-xs text-slate-500 mt-1 leading-relaxed">
                        ยังมีรายชื่อค้างตรวจสอบเช็คชื่อ ให้โค้ชรีบลงสถานะของนักเรียนวันนี้ให้เรียบร้อย
                      </div>
                    </div>
                    <button 
                      onClick={() => setCurrentTab('attendance')}
                      className="mt-4 text-xs text-orange-primary font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      เปิดเช็คชื่อทันที →
                    </button>
                  </div>

                  {/* Feedback pending list shortcut */}
                  <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase mb-2">นักเรียนที่รอประเมินฟอร์ม</div>
                      <div className="text-3xl font-extrabold text-slate-850">2 คน</div>
                      <p className="text-[11px] text-slate-500 mt-2">น้องภู (วิเคราะห์ Smash) และ เจมส์ (ตีดาด)</p>
                    </div>
                    <button 
                      onClick={() => setCurrentTab('feedback')}
                      className="mt-6 text-xs text-orange-primary font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      บันทึกคำแนะนำหลังสอน →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {currentTab === 'classes' && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-slate-800">ตารางสอนของโค้ชในสัปดาห์นี้</h3>
                <p className="text-slate-500 text-xs">ดูคลาสเรียนและรายชื่อคอร์สที่โค้ชได้รับมอบหมายตามตารางเวลา</p>

                <div className="grid gap-4">
                  <div className="p-6 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <span className="text-[9px] font-extrabold uppercase bg-orange-glow text-orange-primary px-2 py-0.5 rounded border border-orange-primary/10">คลาสเด็ก</span>
                      <h4 className="font-bold text-base text-slate-800 mt-2">Junior Badminton Basics (กลุ่ม 1)</h4>
                      <p className="text-xs text-slate-500 mt-1">⏰ เวลา 16:00 - 18:00 น. | วันเสาร์และอาทิตย์ | คอร์ท 3</p>
                    </div>
                    <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">นักเรียนลงชื่อ: 4 คน</div>
                  </div>

                  <div className="p-6 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <span className="text-[9px] font-extrabold uppercase bg-green-glow text-green-accent px-2 py-0.5 rounded border border-green-accent/10">คลาสผู้ใหญ่</span>
                      <h4 className="font-bold text-base text-slate-800 mt-2">Adult Basic & Stroke Play (กลุ่ม 3)</h4>
                      <p className="text-xs text-slate-500 mt-1">⏰ เวลา 18:00 - 20:00 น. | วันเสาร์และอาทิตย์ | คอร์ท 4</p>
                    </div>
                    <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">นักเรียนลงชื่อ: 6 คน</div>
                  </div>
                </div>
              </div>
            )}

            {currentTab === 'attendance' && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-slate-800">เช็คชื่อเข้าเรียนประจำวัน (Student Attendance)</h3>
                <p className="text-slate-500 text-xs">คลิกลงชื่อเช็คอินนักเรียนที่มาซ้อมวันนี้ เพื่อนำไปตัดระบบชั่วโมงเรียนในระบบโควต้า</p>

                <div className="p-6 rounded-xl border border-slate-200 bg-white shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <span className="text-xs font-bold text-slate-700">รายชื่อนักเรียน คลาสรอบ 16:00 - 18:00 น.</span>
                    <span className="text-xs text-green-accent font-bold">คอร์ท 3</span>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {attendanceList.map((student) => (
                      <div key={student.id} className="py-4 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-bold text-slate-800">{student.name}</div>
                          <div className="text-xs text-slate-400 mt-0.5">เวลาตาราง: {student.time} น.</div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleAttendance(student.id, 'checked')}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                              student.status === 'checked'
                                ? 'bg-emerald-500 text-white border-transparent'
                                : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            มาเรียน
                          </button>
                          <button
                            onClick={() => toggleAttendance(student.id, 'absent')}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                              student.status === 'absent'
                                ? 'bg-rose-500 text-white border-transparent'
                                : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            ลาหยุด
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex justify-end">
                    <button 
                      onClick={() => alert('บันทึกเช็คชื่อเสร็จสิ้นและส่งใบเช็คชื่อเข้าระบบหลังบ้านแล้ว')}
                      className="px-5 py-2 bg-orange-primary text-white font-bold text-xs rounded-lg hover:bg-orange-hover cursor-pointer"
                    >
                      บันทึกเช็คชื่อคลาสวันนี้
                    </button>
                  </div>
                </div>
              </div>
            )}

            {currentTab === 'feedback' && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-slate-800">ระบบบันทึกประเมินการฝึกสอน (Student Feedback)</h3>
                <p className="text-slate-500 text-xs">โค้ชสามารถใส่คอมเมนต์ ข้อเสนอแนะ หรือบันทึกเพื่อแจ้งให้นักเรียนและผู้ปกครองทราบพัฒนาการ</p>

                <div className="p-6 rounded-xl border border-slate-200 bg-white max-w-xl space-y-4 shadow-sm">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">เลือกนักเรียนที่ต้องการส่งผลการประเมิน</label>
                    <select className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-4 text-xs text-slate-800 focus:outline-none focus:border-orange-primary">
                      <option>เด็กชาย ภูมินทร์ ใจดี (น้องภู)</option>
                      <option>เด็กหญิง นภัสสร สุขสบาย (น้องครีม)</option>
                      <option>นาย อัครพล รุ่งเรือง (เจมส์)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">ประเภทการประเมิน</label>
                    <div className="flex gap-2">
                      <button className="px-3 py-1.5 bg-orange-glow border border-orange-primary/20 text-orange-primary text-xs font-bold rounded">ทักษะการตี (Stroke)</button>
                      <button className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-500 text-xs font-bold rounded hover:text-slate-850">ความรวดเร็ว (Footwork)</button>
                      <button className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-500 text-xs font-bold rounded hover:text-slate-850">พละกำลัง (Fitness)</button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">ผลวิเคราะห์และคำติชม</label>
                    <textarea rows={4} placeholder="เขียนคำประเมิน พฤติกรรมการซ้อม จุดดี และจุดที่โค้ชแนะนำให้ผู้เรียนนำไปทบทวน..." className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-4 text-xs text-slate-800 focus:outline-none focus:border-orange-primary resize-none" />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">ลิงก์วิดีโอ (อัปโหลดทาง Google Drive / YouTube)</label>
                    <input type="text" placeholder="https://youtube.com/watch?v=..." className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-4 text-xs text-slate-800 focus:outline-none focus:border-orange-primary" />
                  </div>

                  <button 
                    onClick={() => alert('อัปเดตฟีดแบ็กไปสู่หน้าโปรไฟล์นักเรียนและผู้ปกครองสำเร็จ')}
                    className="px-5 py-2.5 bg-orange-primary text-white font-bold text-xs rounded-lg hover:bg-orange-hover cursor-pointer"
                  >
                    ส่งผลการประเมินบันทึกเข้าประวัติ
                  </button>
                </div>
              </div>
            )}

            {currentTab === 'settings' && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-slate-800">ตั้งค่าประวัติโค้ช</h3>
                <p className="text-slate-500 text-xs">ข้อมูลทั่วไปของสตาฟโค้ช เพื่อนำไปแสดงในหน้ารายชื่อสตาฟหลักของสถาบัน</p>
                <div className="p-6 rounded-xl border border-slate-200 bg-white max-w-lg shadow-sm">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5">ชื่อโค้ช</label>
                      <input type="text" readOnly value="โค้ชกิตติพงษ์ ใจงาม" className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5">ความเชี่ยวชาญส่วนตัว</label>
                      <input type="text" defaultValue="การเคลื่อนไหวทางเท้าและจังหวะบุกตบเดี่ยว" className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-orange-primary" />
                    </div>
                    <button className="px-5 py-2 bg-orange-primary text-white font-bold text-xs rounded-lg hover:bg-orange-hover cursor-pointer">บันทึกข้อมูลส่วนตัว</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {role === 'admin' && (
          <div>
            {currentTab === 'home' && (
              <div className="space-y-8">
                {/* Welcome Card */}
                <div className="p-8 rounded-2xl bg-gradient-to-r from-orange-glow to-green-glow/40 border border-orange-primary/20 relative overflow-hidden">
                  <div className="absolute -right-10 -bottom-10 w-44 h-44 bg-orange-primary/5 rounded-full blur-3xl pointer-events-none" />
                  <h3 className="text-2xl font-extrabold text-slate-800 mb-2">ยินดีต้อนรับสู่แดชบอร์ดผู้บริหาร 📊</h3>
                  <p className="text-slate-600 text-sm max-w-2xl leading-relaxed">
                    ระบบภาพรวมของสถาบันแบดมินตัน คุณสามารถติดตามยอดสมัครเรียน การเงินคงค้างของลูกค้า 
                    รวมถึงตรวจสอบอัตราการเข้าทำงานและสถิติภาพรวมต่างๆ ของโค้ชได้จากตรงนี้
                  </p>
                </div>

                {/* Dashboard grid stats widgets */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <div className="text-[10px] text-slate-400 font-bold uppercase mb-2">นักเรียนทั้งหมด</div>
                    <div className="text-2xl font-extrabold text-slate-800">142 คน</div>
                  </div>
                  <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <div className="text-[10px] text-slate-400 font-bold uppercase mb-2">โค้ชทั้งหมด</div>
                    <div className="text-2xl font-extrabold text-orange-primary">12 คน</div>
                  </div>
                  <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <div className="text-[10px] text-slate-400 font-bold uppercase mb-2">ชำระเงินค้างจ่าย</div>
                    <div className="text-2xl font-extrabold text-rose-500">4 รายการ</div>
                  </div>
                  <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <div className="text-[10px] text-slate-400 font-bold uppercase mb-2">คลาสเรียนสัปดาห์นี้</div>
                    <div className="text-2xl font-extrabold text-green-accent">18 คลาส</div>
                  </div>
                </div>

                {/* Recent actions & pending logs */}
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="p-6 rounded-xl border border-slate-200 bg-white shadow-sm">
                    <h4 className="font-bold text-xs text-slate-800 mb-4">👥 บันทึกกิจกรรมของนักเรียนล่าสุด</h4>
                    <div className="space-y-3 text-xs text-slate-500">
                      <div className="flex justify-between">
                        <span>👦 น้องภู เช็คชื่อเรียนเสร็จสิ้น</span>
                        <span className="text-slate-400">10 นาทีที่แล้ว</span>
                      </div>
                      <div className="flex justify-between">
                        <span>👧 น้องครีม โอนสลิปเงินค่าสมัคร 4,500 บาท</span>
                        <span className="text-orange-primary font-bold">รอตรวจสอบ</span>
                      </div>
                      <div className="flex justify-between">
                        <span>👨 เจมส์ สมัครเรียนคอร์สระดับกลาง</span>
                        <span className="text-slate-400">2 ชั่วโมงที่แล้ว</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 rounded-xl border border-slate-200 bg-white shadow-sm">
                    <h4 className="font-bold text-xs text-slate-800 mb-4">💳 บิลที่รอตรวจสอบการโอนเงิน</h4>
                    <div className="space-y-3 text-xs">
                      <div className="flex justify-between items-center bg-slate-50 border border-slate-100 p-2 rounded">
                        <div>
                          <span className="text-slate-800 font-bold">น้องครีม - Basic Junior</span>
                          <span className="text-slate-500 block text-[9px] mt-0.5">ยอดโอน: 4,500 บาท | ธ.กสิกร</span>
                        </div>
                        <button 
                          onClick={() => alert('ยืนยันอนุมัติบิลการจ่ายเงินเรียบร้อย เพิ่มชั่วโมงเรียนเข้าระบบนักเรียน')}
                          className="px-3 py-1.5 bg-orange-primary text-white font-bold text-[10px] rounded hover:bg-orange-hover cursor-pointer"
                        >
                          อนุมัติ
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentTab === 'coaches' && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-slate-800">จัดการรายชื่อผู้ฝึกสอน (Coaches Management)</h3>
                <div className="flex justify-between items-center mb-4">
                  <p className="text-slate-500 text-xs">รายชื่อโค้ช สถิติชั่วโมงการสอน และการจัดการสัญญา</p>
                  <button className="px-4 py-2 bg-orange-primary text-white font-bold text-xs rounded-lg hover:bg-orange-hover cursor-pointer">เพิ่มรายชื่อโค้ชใหม่</button>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-xs text-left text-slate-600">
                    <thead className="text-[11px] text-slate-700 uppercase bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4 font-bold">ชื่อโค้ช</th>
                        <th className="px-6 py-4 font-bold">ตำแหน่ง</th>
                        <th className="px-6 py-4 font-bold">ชั่วโมงสอนเดือนนี้</th>
                        <th className="px-6 py-4 font-bold">สถานะการทำงาน</th>
                        <th className="px-6 py-4 font-bold">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {coaches.map((coach) => (
                        <tr key={coach.id}>
                          <td className="px-6 py-4 text-slate-800 font-bold">{coach.name}</td>
                          <td className="px-6 py-4 text-orange-primary font-bold">{coach.role}</td>
                          <td className="px-6 py-4">{coach.hours}</td>
                          <td className="px-6 py-4"><span className="text-green-accent font-bold">● {coach.status}</span></td>
                          <td className="px-6 py-4"><button className="text-xs text-slate-500 hover:text-slate-800 hover:underline">แก้ไขข้อมูล</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {currentTab === 'students' && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-slate-800">จัดการรายชื่อนักเรียนในระบบ (Students Management)</h3>
                <div className="flex justify-between items-center mb-4">
                  <p className="text-slate-500 text-xs">จัดการประวัติการเรียน แพ็กเกจของนักเรียน และการระงับการเข้าคอร์ส</p>
                  <button className="px-4 py-2 bg-orange-primary text-white font-bold text-xs rounded-lg hover:bg-orange-hover cursor-pointer">สมัครสมาชิกใหม่</button>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-xs text-left text-slate-600">
                    <thead className="text-[11px] text-slate-700 uppercase bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4 font-bold">รหัสนักเรียน</th>
                        <th className="px-6 py-4 font-bold">ชื่อ-นามสกุล</th>
                        <th className="px-6 py-4 font-bold">แพ็กเกจปัจจุบัน</th>
                        <th className="px-6 py-4 font-bold">หน่วยชั่วโมงคงเหลือ</th>
                        <th className="px-6 py-4 font-bold">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      <tr>
                        <td className="px-6 py-4">STD-0102</td>
                        <td className="px-6 py-4 text-slate-800 font-bold">เด็กชาย ภูมินทร์ ใจดี</td>
                        <td className="px-6 py-4">Junior Basics</td>
                        <td className="px-6 py-4 font-bold text-orange-primary">8 / 12 คลาส</td>
                        <td className="px-6 py-4"><button className="text-xs text-slate-500 hover:text-slate-800 hover:underline">จัดการโควต้า</button></td>
                      </tr>
                      <tr>
                        <td className="px-6 py-4">STD-0105</td>
                        <td className="px-6 py-4 text-slate-800 font-bold">เด็กหญิง นภัสสร สุขสบาย</td>
                        <td className="px-6 py-4">Junior Basics</td>
                        <td className="px-6 py-4 font-bold text-orange-primary">4 / 12 คลาส</td>
                        <td className="px-6 py-4"><button className="text-xs text-slate-500 hover:text-slate-800 hover:underline">จัดการโควต้า</button></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {currentTab === 'billing' && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-slate-800">ระบบเรียกเก็บค่าเล่าเรียน & บัญชีสถาบัน</h3>
                <p className="text-slate-500 text-xs">ออกใบแจ้งหนี้เพื่อเรียกเก็บเงินนักเรียน และตรวจสอบสถิติรายรับสถาบันรายสัปดาห์</p>
                <div className="flex gap-4">
                  <button className="px-4 py-2.5 bg-orange-primary text-white font-bold text-xs rounded-lg hover:bg-orange-hover cursor-pointer">สร้างบิลเรียกเก็บเงินใหม่</button>
                  <button className="px-4 py-2.5 bg-white border border-slate-200 text-slate-650 text-xs font-bold rounded-lg hover:bg-slate-50 cursor-pointer">ส่งคำเตือนค้างชำระทั้งหมด</button>
                </div>
              </div>
            )}

            {currentTab === 'announcements' && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-slate-800">จัดการประกาศประชาสัมพันธ์สถาบัน</h3>
                <p className="text-slate-500 text-xs">เขียนข่าว ประกาศระเบียบการ และการหยุดทำการ เพื่อให้นักเรียนเปิดเห็นในแดชบอร์ดหลัก</p>
                <div className="p-6 rounded-xl border border-slate-200 bg-white shadow-sm max-w-xl space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">หัวข้อข่าวประกาศ</label>
                    <input type="text" placeholder="เช่น แจ้งสถาบันแบดมินตันหยุดทำการ 1 วัน..." className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-4 text-xs text-slate-800 focus:outline-none focus:border-orange-primary" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">รายละเอียดประกาศ</label>
                    <textarea rows={4} placeholder="พิมพ์ข้อความที่ต้องการแจ้งให้นักเรียนและสตาฟรับรู้..." className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-4 text-xs text-slate-800 focus:outline-none focus:border-orange-primary resize-none" />
                  </div>
                  <button onClick={() => alert('เผยแพร่ประกาศลงสู่หน้าหลักแดชบอร์ดของทุกคนเรียบร้อย')} className="px-5 py-2.5 bg-orange-primary text-white font-bold text-xs rounded-lg hover:bg-orange-hover cursor-pointer">เผยแพร่ประกาศนี้</button>
                </div>
              </div>
            )}

            {currentTab === 'settings' && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-slate-800">ตั้งค่าระบบสถาบัน</h3>
                <p className="text-slate-500 text-xs">การตั้งค่าพารามิเตอร์หลักของสถาบัน ระบบชั่วโมงหมดอายุ และคีย์ API อื่นๆ</p>
                <div className="p-6 rounded-xl border border-slate-200 bg-white shadow-sm max-w-lg">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5">ชื่อทางการของสถาบัน</label>
                      <input type="text" defaultValue="สมาส แบดมินตัน อะคาเดมี สาขาลาดพร้าว" className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-orange-primary" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5">จำนวนชั่วโมงของหนึ่งคลาสเรียนมาตรฐาน</label>
                      <input type="text" defaultValue="2 ชั่วโมง" className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-orange-primary" />
                    </div>
                    <button className="px-5 py-2 bg-orange-primary text-white font-bold text-xs rounded-lg hover:bg-orange-hover cursor-pointer">บันทึกพารามิเตอร์</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </main>

      {/* --- FLOATING PREVIEW ROLE SWITCHER --- */}
      <div className="fixed bottom-6 right-6 z-50 bg-white border border-slate-200 p-2 rounded-full shadow-2xl backdrop-blur flex items-center gap-1.5">
        <span className="text-[10px] text-slate-400 font-bold uppercase pl-3 pr-1.5">Preview:</span>
        <button 
          onClick={() => switchRole('student')}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
            role === 'student' ? 'bg-orange-primary text-white shadow-md shadow-orange-primary/20' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          นักเรียน
        </button>
        <button 
          onClick={() => switchRole('coach')}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
            role === 'coach' ? 'bg-orange-primary text-white shadow-md shadow-orange-primary/20' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          โค้ช
        </button>
        <button 
          onClick={() => switchRole('admin')}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
            role === 'admin' ? 'bg-orange-primary text-white shadow-md shadow-orange-primary/20' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          แอดมิน
        </button>
      </div>

    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-slate-800">กำลังโหลดแดชบอร์ด...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
