'use client';

import { useState, useEffect } from 'react';

// Mock Data
const FEATURES = [
  {
    title: 'Smart Video Analysis',
    description: 'บันทึกและวิเคราะห์ฟอร์มการเล่น การเคลื่อนไหวเท้า และความเร็วลูกตบด้วย AI ช่วยให้จับจุดบกพร่องและแก้ไขได้ทันที',
    icon: (
      <svg className="w-6 h-6 text-green-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    title: 'Professional Coaches',
    description: 'เรียนรู้กับอดีตนักกีฬาทีมชาติและโค้ชที่ได้รับใบรับรองระดับสากล ดูแลอย่างใกล้ชิดและออกแบบแผนการสอนเฉพาะบุคคล',
    icon: (
      <svg className="w-6 h-6 text-orange-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    title: 'Flexible Scheduling',
    description: 'จองคลาสเรียนและจัดการตารางเวลาผ่านระบบออนไลน์ด้วยตัวเอง เช็คประวัติการเข้าเรียนและจัดการชั่วโมงเรียนที่เหลือได้ง่ายๆ',
    icon: (
      <svg className="w-6 h-6 text-green-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    title: 'Transparent Billing',
    description: 'ตรวจสอบบิลค่าเรียน ใบแจ้งหนี้ และประวัติการชำระเงินย้อนหลังได้อย่างปลอดภัย พร้อมระบบอัปโหลดหลักฐานการจ่ายเงินที่สะดวกรวดเร็ว',
    icon: (
      <svg className="w-6 h-6 text-orange-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

const COURSES = [
  {
    id: 1,
    title: 'Junior Badminton Basics',
    category: 'beginners',
    age: 'อายุ 6 - 12 ปี',
    lessons: '10 คลาส (15 ชม.)',
    price: '4,500 บาท',
    description: 'ปูพื้นฐานการจับไม้ การยืน ท่าทาง และการเคลื่อนไหวพื้นฐานอย่างสนุกสนานสำหรับเด็กๆ',
  },
  {
    id: 2,
    title: 'Adult Basic & Stroke Play',
    category: 'beginners',
    age: 'อายุ 15 ปีขึ้นไป',
    lessons: '10 คลาส (20 ชม.)',
    price: '6,000 บาท',
    description: 'ฝึกฝนท่าการตีลูกโฟร์แฮนด์-แบ็คแฮนด์ การเซฟลูก ลูกดาด และทักษะพื้นฐานสำหรับผู้เริ่มต้น',
  },
  {
    id: 3,
    title: 'Intermediate Tactics & Court Play',
    category: 'intermediate',
    age: 'ทุกช่วงอายุที่มีพื้นฐาน',
    lessons: '12 คลาส (24 ชม.)',
    price: '7,500 บาท',
    description: 'เจาะลึกเทคนิคการเคลื่อนที่บนคอร์ท (Footwork) วิธีวางแผนเกมบุก เกมรับ และทักษะการประสานงานประเภทคู่',
  },
  {
    id: 4,
    title: 'Elite Tournament Preparation',
    category: 'elite',
    age: 'เน้นส่งแข่ง',
    lessons: '16 คลาส (32 ชม.)',
    price: '9,900 บาท',
    description: 'คอร์สเข้มข้นสำหรับนักกีฬาส่งแข่ง เน้นพละกำลัง ความเร็ว ความอึด แท็กติกขั้นสูง และวิเคราะห์ฟอร์มด้วยวิดีโอ',
  },
  {
    id: 5,
    title: 'Private 1-on-1 Coaching',
    category: 'elite',
    age: 'ทุกช่วงอายุ',
    lessons: '1 คลาส (2 ชม.)',
    price: '1,500 บาท / ครั้ง',
    description: 'เรียนเดี่ยวตัวต่อตัวกับโค้ช เลือกเน้นจุดที่ต้องการแก้ไขหรือฝึกซ้อมเฉพาะทักษะได้อย่างรวดเร็ว',
  },
];

const COACHES = [
  {
    name: 'โค้ชกิตติพงษ์ (Coach Kit)',
    role: 'Head Coach & Founder',
    experience: 'อดีตนักกีฬาทีมชาติไทยประเภทเดี่ยว ประсบการณ์สอนกว่า 12 ปี',
    specialty: 'เทคนิคการเคลื่อนที่ (Footwork) และแผนการแข่งขันประเภทเดี่ยว',
    rating: '5.0',
  },
  {
    name: 'โค้ชสุนิสา (Coach May)',
    role: 'Senior Youth Coach',
    experience: 'อดีตผู้ฝึกสอนเยาวชนทีมจังหวัด ใบรับรองระดับ B-License',
    specialty: 'ปูพื้นฐานเด็กเยาวชน การจัดระเบียบร่างกาย และการเสิร์ฟ/หยอด',
    rating: '4.9',
  },
  {
    name: 'โค้ชทีรุตม์ (Coach T)',
    role: 'Tactical Coach & Video Analyst',
    experience: 'ผู้เชี่ยวชาญด้านวิทยาศาสตร์การกีฬาและเทคโนโลยีวิดีโอวิเคราะห์การเล่น',
    specialty: 'วิเคราะห์ฟอร์มการตบลูก (Smash Speed) และฟิตเนสสร้างพลังกล้ามเนื้อ',
    rating: '4.9',
  },
];

export default function Home() {
  const [coaches, setCoaches] = useState(COACHES);
  const [activeTab, setActiveTab] = useState('all');
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [role, setRole] = useState('student'); // student | coach | admin
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '' });

  useEffect(() => {
    fetch('http://localhost:8080/api/coaches')
      .then(res => {
        if (!res.ok) throw new Error('API failed');
        return res.json();
      })
      .then(data => {
        if (data && data.length > 0) {
          const mapped = data.map((c: any) => ({
            name: `โค้ช${c.nickname || c.first_name} (${c.first_name} ${c.last_name})`,
            role: c.specialization ? 'Coach Staff' : 'Senior Coach',
            experience: `ผู้ฝึกสอนของสถาบัน เบอร์โทรติดต่อ: ${c.phone}`,
            specialty: c.specialization || 'ทักษะแบดมินตันทั่วไป',
            rating: '4.9',
          }));
          setCoaches(mapped);
        }
      })
      .catch(err => {
        console.log('Backend API is down or empty, using mock coaches data:', err);
      });
  }, []);

  // Filter courses
  const filteredCourses = activeTab === 'all' 
    ? COURSES 
    : COURSES.filter(course => course.category === activeTab);

  // Handle mock login
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim() && password.trim()) {
      setLoginSuccess(true);
      setTimeout(() => {
        setIsLoginOpen(false);
        setLoginSuccess(false);
        setUsername('');
        setPassword('');
        window.location.href = '/dashboard?role=' + role;
      }, 1000);
    }
  };

  // Handle contact form
  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (contactForm.name && contactForm.email && contactForm.message) {
      setContactSubmitted(true);
      setTimeout(() => {
        setContactSubmitted(false);
        setContactForm({ name: '', email: '', message: '' });
      }, 3000);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-orange-primary selection:text-white">
      
      {/* 1. NAVBAR */}
      <header className="fixed top-0 left-0 right-0 z-50 glass-nav">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-orange-primary flex items-center justify-center font-bold text-white text-xl shadow-md shadow-orange-primary/10">
              S
            </div>
            <span className="text-xl font-bold tracking-wider uppercase text-slate-800">
              SMASH <span className="text-green-accent">ACADEMY</span>
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
            <a href="#about" className="hover:text-orange-primary transition-colors">เกี่ยวกับเรา</a>
            <a href="#features" className="hover:text-orange-primary transition-colors">จุดเด่น</a>
            <a href="#courses" className="hover:text-orange-primary transition-colors">คอร์สเรียน</a>
            <a href="#coaches" className="hover:text-orange-primary transition-colors">ทีมโค้ช</a>
            <a href="#contact" className="hover:text-orange-primary transition-colors">ติดต่อเรา</a>
          </nav>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsLoginOpen(true)}
              className="px-6 py-2.5 rounded-full bg-orange-primary text-white font-bold text-sm hover:bg-orange-hover active:scale-95 transition-all shadow-md shadow-orange-primary/10 cursor-pointer"
            >
              Portal Login
            </button>
          </div>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <section className="relative pt-40 pb-24 md:pt-48 md:pb-36 overflow-hidden bg-white">
        {/* Subtle Decorative Accents */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-orange-primary/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute top-1/3 left-1/4 -translate-y-1/2 w-[300px] h-[300px] bg-green-accent/5 rounded-full blur-[80px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-glow border border-orange-primary/20 text-orange-primary text-xs font-bold uppercase tracking-wider mb-6">
            🏸 สถาบันแบดมินตันมาตรฐานสากล
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-8 max-w-4xl mx-auto leading-tight text-slate-900">
            SMASH YOUR <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-primary to-green-accent">LIMITS</span>
          </h1>

          <p className="text-base md:text-lg text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed">
            ยกระดับทักษะการเล่นแบดมินตันของคุณด้วยสตาฟโค้ชมืออาชีพ 
            พร้อมระบบเทคโนโลยีวิเคราะห์ฟอร์มการตี และตารางเรียนยืดหยุ่นที่ออกแบบเฉพาะคุณ
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#courses"
              className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-orange-primary text-white font-bold hover:bg-orange-hover shadow-md shadow-orange-primary/10 active:scale-98 transition-all text-center cursor-pointer"
            >
              ดูคอร์สเรียนทั้งหมด
            </a>
            <button
              onClick={() => setIsLoginOpen(true)}
              className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-slate-50 border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 active:scale-98 transition-all text-center cursor-pointer"
            >
              เข้าสู่ระบบสมาชิก
            </button>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto mt-24 pt-12 border-t border-slate-100">
            <div className="text-center">
              <div className="text-4xl font-extrabold text-slate-800 mb-1">500+</div>
              <div className="text-xs text-slate-500 font-medium">นักเรียนที่ไว้วางใจ</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-extrabold text-orange-primary mb-1">12+</div>
              <div className="text-xs text-slate-500 font-medium">โค้ชประสบการณ์สูง</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-extrabold text-slate-800 mb-1">8</div>
              <div className="text-xs text-slate-500 font-medium">สนามที่ได้รับมาตรฐาน</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-extrabold text-green-accent mb-1">98%</div>
              <div className="text-xs text-slate-500 font-medium">ผู้เรียนพึงพอใจการพัฒนา</div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. KEY FEATURES */}
      <section id="features" className="py-20 bg-slate-50 border-y border-slate-100 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-xs font-bold text-green-accent uppercase tracking-widest mb-3">FEATURES</h2>
            <p className="text-3xl md:text-4xl font-bold text-slate-800 tracking-tight">
              ทำไมต้องเรียนกับ Smash Academy?
            </p>
            <p className="text-slate-500 mt-4 text-sm leading-relaxed">
              เราผสมผสานกีฬาและเทคโนโลยีการซ้อมรูปแบบใหม่เข้าด้วยกัน เพื่อยกระดับผู้เรียนอย่างรวดเร็วและปลอดภัย
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {FEATURES.map((feat, idx) => (
              <div key={idx} className="p-8 rounded-2xl bg-white border border-slate-200/80 flex gap-6 hover:shadow-md transition-all">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                  idx % 2 === 0 ? 'bg-green-glow' : 'bg-orange-glow'
                }`}>
                  {feat.icon}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">{feat.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{feat.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. COURSES & PROGRAMS */}
      <section id="courses" className="py-20 relative bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-xs font-bold text-orange-primary uppercase tracking-widest mb-3">COURSES</h2>
            <p className="text-3xl md:text-4xl font-bold text-slate-800 tracking-tight">
              หลักสูตรและแพ็กเกจเรียน
            </p>
            <p className="text-slate-500 mt-4 text-sm leading-relaxed">
              ตอบโจทย์ทั้งการปูพื้นฐานเยาวชน การซ้อมเพื่อสุขภาพ หรือเทรนความฟิตเตรียมความพร้อมแข่งทัวร์นาเมนต์
            </p>
          </div>

          {/* Filtering Tabs */}
          <div className="flex items-center justify-center gap-2 mb-12 flex-wrap">
            {['all', 'beginners', 'intermediate', 'elite'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer border ${
                  activeTab === tab
                    ? 'bg-orange-primary text-white border-transparent'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {tab === 'all' && 'ทั้งหมด'}
                {tab === 'beginners' && 'ระดับเริ่มต้น'}
                {tab === 'intermediate' && 'ระดับกลาง'}
                {tab === 'elite' && 'นักกีฬา & ติวเข้ม'}
              </button>
            ))}
          </div>

          {/* Course Cards Grid */}
          <div className="grid md:grid-cols-3 gap-8">
            {filteredCourses.map((course) => (
              <div key={course.id} className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col justify-between hover:border-orange-primary/30 hover:shadow-lg hover:shadow-slate-100 transition-all group">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="px-2.5 py-1 rounded bg-slate-100 text-[10px] font-bold uppercase text-slate-600">
                      {course.category === 'beginners' && 'Beginner'}
                      {course.category === 'intermediate' && 'Intermediate'}
                      {course.category === 'elite' && 'Elite'}
                    </span>
                    <span className="text-xs text-green-accent font-bold">{course.age}</span>
                  </div>

                  <h3 className="text-lg font-bold text-slate-800 mb-2 group-hover:text-orange-primary transition-colors">
                    {course.title}
                  </h3>

                  <p className="text-slate-500 text-xs leading-relaxed mb-6">
                    {course.description}
                  </p>
                </div>

                <div className="pt-6 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-xs text-slate-400 font-medium">คอร์ส: {course.lessons}</div>
                    <div className="text-base font-bold text-slate-800">{course.price}</div>
                  </div>
                  
                  <button
                    onClick={() => setIsLoginOpen(true)}
                    className="w-full py-2.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold hover:bg-orange-primary hover:text-white hover:border-transparent transition-all active:scale-[0.98] cursor-pointer"
                  >
                    สนใจสมัครเรียน
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. TEAM COACHES */}
      <section id="coaches" className="py-20 bg-slate-50 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-xs font-bold text-green-accent uppercase tracking-widest mb-3">COACHES</h2>
            <p className="text-3xl md:text-4xl font-bold text-slate-800 tracking-tight">
              สตาฟผู้ฝึกสอนของเรา
            </p>
            <p className="text-slate-500 mt-4 text-sm leading-relaxed">
              พบกับครูฝึกสอนระดับทีมชาติและสตาฟโค้ชผู้ชำนาญ ที่พร้อมพัฒนาและปรับแก้ทุกจุดบกพร่องให้คุณ
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {coaches.map((coach, idx) => (
              <div key={idx} className="rounded-2xl bg-white border border-slate-200 p-6 hover:shadow-md transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">{coach.name}</h3>
                      <div className="text-xs text-orange-primary font-bold mt-0.5">{coach.role}</div>
                    </div>
                    <div className="flex items-center gap-1 bg-green-glow px-2.5 py-1 rounded text-green-accent text-xs font-bold border border-green-accent/15">
                      ⭐ {coach.rating}
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 font-semibold mb-4 leading-relaxed">
                    🎓 {coach.experience}
                  </p>
                  <p className="text-slate-500 text-xs leading-relaxed">
                    🎯 <span className="font-semibold text-slate-700">จุดเด่น:</span> {coach.specialty}
                  </p>
                </div>

                <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <a
                    href="/coaches"
                    className="text-xs text-green-accent font-bold hover:underline inline-flex items-center gap-1"
                  >
                    ดูตารางสอนของโค้ช
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. CONTACT SECTION */}
      <section id="contact" className="py-20 relative bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            
            {/* Information Info */}
            <div>
              <h2 className="text-xs font-bold text-orange-primary uppercase tracking-widest mb-3">CONTACT US</h2>
              <p className="text-3xl md:text-4xl font-bold text-slate-800 tracking-tight mb-6">
                ติดต่อสอบถามรายละเอียด
              </p>
              <p className="text-slate-500 text-sm leading-relaxed mb-8">
                หากคุณต้องการนัดหมายเข้ามาดูสถานที่เรียน ขอข้อมูลราคาแพ็กเกจลดพิเศษ 
                หรือนัดคิวโค้ชสำหรับการซ้อมเดี่ยว สามารถกรอกรายละเอียดได้ทันทีครับ
              </p>

              <div className="grid gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-orange-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">สถานที่ตั้ง</div>
                    <div className="text-xs text-slate-700 font-bold">123 ถนนสนามแบดมินตัน แขวงลาดพร้าว เขตจตุจักร กรุงเทพฯ 10900</div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-green-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">เบอร์โทรศัพท์ติดต่อ</div>
                    <div className="text-xs text-slate-700 font-bold">02-123-4567, 089-999-8888</div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-orange-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">อีเมลสถาบัน</div>
                    <div className="text-xs text-slate-700 font-bold">contact@smashacademy.com</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Form submission */}
            <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800 mb-6">ส่งข้อความสอบถาม</h3>
              
              {contactSubmitted ? (
                <div className="py-12 text-center">
                  <div className="w-16 h-16 bg-green-glow text-green-accent rounded-full flex items-center justify-center mx-auto mb-4 border border-green-accent/10">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h4 className="text-base font-bold text-slate-800">ส่งข้อมูลเรียบร้อยแล้ว!</h4>
                  <p className="text-xs text-slate-500 mt-2">เจ้าหน้าที่จะติดต่อกลับหาคุณผ่านอีเมลโดยเร็วที่สุด</p>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} className="grid gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">ชื่อ-นามสกุลของคุณ</label>
                    <input
                      type="text"
                      required
                      placeholder="เช่น สมชาย ใจดี"
                      value={contactForm.name}
                      onChange={e => setContactForm({ ...contactForm, name: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-4 text-xs text-slate-800 focus:outline-none focus:border-orange-primary transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">อีเมลติดต่อ</label>
                    <input
                      type="email"
                      required
                      placeholder="เช่น somchai@gmail.com"
                      value={contactForm.email}
                      onChange={e => setContactForm({ ...contactForm, email: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-4 text-xs text-slate-800 focus:outline-none focus:border-orange-primary transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">ข้อความหรือรายละเอียดหลักสูตรที่สนใจ</label>
                    <textarea
                      required
                      rows={4}
                      placeholder="ป้อนรายละเอียดข้อมูลที่ต้องการปรึกษา..."
                      value={contactForm.message}
                      onChange={e => setContactForm({ ...contactForm, message: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-4 text-xs text-slate-800 focus:outline-none focus:border-orange-primary transition-all resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 rounded-lg bg-orange-primary text-white font-bold text-xs hover:bg-orange-hover transition-all cursor-pointer shadow-sm shadow-orange-primary/10 mt-2"
                  >
                    ส่งข้อความถามข้อมูล
                  </button>
                </form>
              )}
            </div>

          </div>
        </div>
      </section>

      {/* 7. FOOTER */}
      <footer className="mt-auto bg-slate-900 border-t border-slate-800 py-12 text-slate-400">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-orange-primary flex items-center justify-center font-bold text-white text-lg">
              S
            </div>
            <span className="text-base font-bold tracking-wider uppercase text-white">
              SMASH <span className="text-green-accent">ACADEMY</span>
            </span>
          </div>
          <div className="text-[11px] text-slate-400 text-center md:text-right">
            © 2026 Smash Academy. All rights reserved. Badminton Management Web App for CPE-691015.
          </div>
        </div>
      </footer>

      {/* 8. MOCK PORTAL LOGIN MODAL */}
      {isLoginOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            onClick={() => setIsLoginOpen(false)}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm cursor-pointer"
          />

          {/* Modal Content */}
          <div className="relative w-full max-w-md rounded-2xl bg-white p-8 border border-slate-200 overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800 tracking-tight">เข้าสู่ระบบสมาชิก Portal</h3>
              <button
                onClick={() => setIsLoginOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {loginSuccess ? (
              <div className="py-12 text-center flex flex-col items-center">
                <div className="w-12 h-12 border-4 border-orange-primary border-t-transparent rounded-full animate-spin mb-4" />
                <h4 className="text-base font-bold text-slate-800">กำลังเข้าสู่ระบบสมาชิก...</h4>
                <p className="text-xs text-slate-500 mt-2">โปรดรอสักครู่ ระบบกำลังนำคุณไปที่หน้าจัดการข้อมูล</p>
              </div>
            ) : (
              <form onSubmit={handleLoginSubmit} className="grid gap-5">
                
                {/* Role Switcher */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">บทบาทผู้ใช้งานของคุณ</label>
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                    {['student', 'coach', 'admin'].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        className={`py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                          role === r
                            ? 'bg-orange-primary text-white shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {r === 'student' && 'นักเรียน'}
                        {r === 'coach' && 'โค้ช'}
                        {r === 'admin' && 'ผู้ดูแล'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">ชื่อผู้ใช้งาน (Username)</label>
                  <input
                    type="text"
                    required
                    placeholder="ป้อนชื่อผู้ใช้งานสำหรับเทส (เช่น user1)"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-4 text-xs text-slate-800 focus:outline-none focus:border-orange-primary transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">รหัสผ่าน (Password)</label>
                  <input
                    type="password"
                    required
                    placeholder="ป้อนรหัสผ่านอะไรก็ได้..."
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-4 text-xs text-slate-800 focus:outline-none focus:border-orange-primary transition-all"
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" className="accent-orange-primary rounded" />
                    จดจำฉันในระบบ
                  </label>
                  <a href="#" className="hover:underline hover:text-slate-600">ลืมรหัสผ่าน?</a>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-lg bg-orange-primary text-white font-bold text-xs hover:bg-orange-hover transition-all cursor-pointer shadow-sm shadow-orange-primary/20 mt-2"
                >
                  เข้าสู่ระบบ
                </button>
              </form>
            )}

            <div className="mt-6 pt-4 border-t border-slate-100 text-[10px] text-slate-400 leading-relaxed">
              💡 <span className="font-semibold">คำแนะนำสำหรับทดสอบ:</span> สามารถป้อน username และ password อะไรก็ได้เพื่อทดลองกดล็อคอินเข้าสู่ระบบ ระบบจำลองจะพาคุณไปยังหน้าแดชบอร์ด (`/dashboard`) ตามบทบาทที่คุณเลือกทันทีครับ
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
