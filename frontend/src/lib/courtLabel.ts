// ชื่อสนามสำหรับแสดงผล · ไม่เติม "สนาม" ซ้ำถ้าชื่อขึ้นต้นด้วยคำเรียกสนามอยู่แล้ว (เช่น "สนาม 1", "คอร์ต A")
const COURT_PREFIX = /^(สนาม|คอร์ท|คอร์ต|court)/i;

export function courtLabel(name?: string | null): string {
  const n = (name ?? "").trim();
  if (!n) return "";
  return COURT_PREFIX.test(n) ? n : `สนาม ${n}`;
}
