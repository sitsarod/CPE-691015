// ข้อมูลผู้เรียนตัวอย่าง (mock) ใช้ร่วมกันระหว่างหน้า "จำแนกผู้เรียน" (detect)
// และ "ประเมินผู้เรียน" (evalution) ฝั่งโค้ช
//
// โฟลเดอร์ขึ้นต้นด้วย "_" เพื่อไม่ให้ Next.js นับเป็น route
// ในอนาคตจะแทนที่ด้วยรายชื่อผู้เรียนจริงของคอร์สที่โค้ชสอนอยู่ (จาก API)
export interface MockStudent {
  id: number;
  nickname: string;
}

export const MOCK_STUDENTS: MockStudent[] = [
  { id: 1, nickname: 'สมพร' },
  { id: 2, nickname: 'สมหญิง' },
  { id: 3, nickname: 'สมชาย' },
  { id: 4, nickname: 'มานี' },
  { id: 5, nickname: 'ปิติ' },
];
