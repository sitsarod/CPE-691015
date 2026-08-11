// แปลงวันที่ (รับได้ทั้ง "2026-08-09" และ ISO "2026-08-09T00:00:00Z") → "DD/MM/YYYY"
// ใช้เป็นรูปแบบวันเกิด/วันที่มาตรฐานของฝั่งงาน coach ทั้งหมด
export function formatDate(value?: string): string {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value; // parse ไม่ได้ คืนค่าเดิม
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}
