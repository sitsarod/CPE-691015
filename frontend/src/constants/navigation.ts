export interface MenuItem {
  id: string;
  label: string;
  iconName: 'Home' | 'Calendar' | 'Video' | 'Billing' | 'Users' | 'Attendance' | 'Feedback' | 'Settings' | 'Announce' | 'Logout' | 'Chart';
}

export interface RoleConfig {
  title: string;
  user: {
    name: string;
    avatar: string;
    email: string;
  };
  menu: MenuItem[];
}

export const ROLE_CONFIGS: Record<'student' | 'coach' | 'admin', RoleConfig> = {
  student: {
    title: 'Student Portal',
    user: { name: 'ภูมินทร์ ใจดี (น้องภู)', avatar: '👦', email: 'phumin@gmail.com' },
    menu: [
      { id: 'home', label: 'หน้าหลัก', iconName: 'Home' },
      { id: 'classes', label: 'คลาสเรียนของฉัน', iconName: 'Calendar' },
      { id: 'video', label: 'วิเคราะห์การเล่น (AI)', iconName: 'Video' },
      { id: 'billing', label: 'ใบเสร็จ & การเงิน', iconName: 'Billing' },
      { id: 'settings', label: 'ตั้งค่าระบบ', iconName: 'Settings' }
    ]
  },
  coach: {
    title: 'Coach Portal',
    user: { name: 'โค้ชกิตติพงษ์ (Coach Kit)', avatar: '🏸', email: 'kit.coach@smash.com' },
    menu: [
      { id: 'home', label: 'หน้าหลัก', iconName: 'Home' },
      { id: 'classes', label: 'ตารางสอนของฉัน', iconName: 'Calendar' },
      { id: 'attendance', label: 'เช็คชื่อเข้าเรียน', iconName: 'Attendance' },
      { id: 'feedback', label: 'ประเมินฟอร์มนักเรียน', iconName: 'Feedback' },
      { id: 'settings', label: 'ตั้งค่าระบบ', iconName: 'Settings' }
    ]
  },
  admin: {
    title: 'Admin Console',
    user: { name: 'ผู้บริหาร ณัฐพล (Admin)', avatar: '💼', email: 'admin@smashacademy.com' },
    menu: [
      { id: 'home', label: 'หน้าภาพรวม (Overview)', iconName: 'Chart' },
      { id: 'coaches', label: 'จัดการข้อมูลโค้ช', iconName: 'Users' },
      { id: 'students', label: 'จัดการข้อมูลนักเรียน', iconName: 'Users' },
      { id: 'billing', label: 'ระบบบัญชี & ค่าเล่าเรียน', iconName: 'Billing' },
      { id: 'announcements', label: 'ประชาสัมพันธ์ข่าว', iconName: 'Announce' },
      { id: 'settings', label: 'ตั้งค่าระบบ', iconName: 'Settings' }
    ]
  }
};
