export const FEATURES = [
  {
    title: 'Smart Video Analysis',
    description: 'บันทึกและวิเคราะห์ฟอร์มการเล่น การเคลื่อนไหวเท้า และความเร็วลูกตบด้วย AI ช่วยให้จับจุดบกพร่องและแก้ไขได้ทันที',
    iconName: 'Video',
  },
  {
    title: 'Professional Coaches',
    description: 'เรียนรู้กับอดีตนักกีฬาทีมชาติและโค้ชที่ได้รับใบรับรองระดับสากล ดูแลอย่างใกล้ชิดและออกแบบแผนการสอนเฉพาะบุคคล',
    iconName: 'Users',
  },
  {
    title: 'Flexible Scheduling',
    description: 'จองคลาสเรียนและจัดการตารางเวลาผ่านระบบออนไลน์ด้วยตัวเอง เช็คประวัติการเข้าเรียนและจัดการชั่วโมงเรียนที่เหลือได้ง่ายๆ',
    iconName: 'Calendar',
  },
  {
    title: 'Transparent Billing',
    description: 'ตรวจสอบบิลค่าเรียน ใบแจ้งหนี้ และประวัติการชำระเงินย้อนหลังได้อย่างปลอดภัย พร้อมระบบอัปโหลดหลักฐานการจ่ายเงินที่สะดวกรวดเร็ว',
    iconName: 'Billing',
  },
];

export const COURSES = [
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

export const FALLBACK_COACHES = [
  {
    name: 'โค้ชกิตติพงษ์ (Coach Kit)',
    role: 'Head Coach & Founder',
    experience: 'อดีตนักกีฬาทีมชาติไทยประเภทเดี่ยว ประสบการณ์สอนกว่า 12 ปี',
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

export const INITIAL_ATTENDANCE_LIST = [
  { id: 101, name: 'เด็กชาย ภูมินทร์ (น้องภู)', status: 'unchecked', time: '16:00' },
  { id: 102, name: 'เด็กหญิง นภัสสร (น้องครีม)', status: 'checked', time: '16:00' },
  { id: 103, name: 'นาย อัครพล (เจมส์)', status: 'unchecked', time: '18:00' },
  { id: 104, name: 'นางสาว พรนภา (ก้อย)', status: 'absent', time: '18:00' },
];

export const FALLBACK_DASHBOARD_COACHES = [
  { id: 1, name: 'โค้ชกิตติพงษ์ (Coach Kit)', role: 'Head Coach', hours: '42 ชั่วโมง', status: 'ปกติ' },
  { id: 2, name: 'โค้ชสุนิสา (Coach May)', role: 'Senior Coach', hours: '35 ชั่วโมง', status: 'ปกติ' },
];
