// ตัวย่อ + สีประจำธนาคาร สำหรับแสดงเป็นไอคอนกล่องสี่เหลี่ยม (badge)
// คีย์ตรงกับ BANK_OPTIONS ใน @/types/coach ที่แอดมินใช้ตอนเพิ่มบัญชีรับเงิน
// จึงครอบคลุมทุกธนาคารในลิสต์ ส่วนชื่อที่อยู่นอกลิสต์จะ fallback เป็นตัวย่อจากชื่อ
export interface BankVisual {
  /** ตัวย่อที่โชว์ในกล่องไอคอน เช่น KTB, KBANK */
  code: string;
  /** สีพื้นหลังกล่อง (hex) */
  bg: string;
  /** สีตัวอักษรในกล่อง (hex) */
  fg: string;
}

const BANK_VISUALS: Record<string, BankVisual> = {
  "ธนาคารกสิกรไทย": { code: "KBANK", bg: "#138f2d", fg: "#ffffff" },
  "ธนาคารไทยพาณิชย์": { code: "SCB", bg: "#4e2e7f", fg: "#ffffff" },
  "ธนาคารกรุงเทพ": { code: "BBL", bg: "#1e4598", fg: "#ffffff" },
  "ธนาคารกรุงไทย": { code: "KTB", bg: "#1ba5e1", fg: "#ffffff" },
  "ธนาคารกรุงศรีอยุธยา": { code: "BAY", bg: "#fec43b", fg: "#4b3b12" },
  "ธนาคารทหารไทยธนชาต": { code: "TTB", bg: "#1279be", fg: "#ffffff" },
  "ธนาคารออมสิน": { code: "GSB", bg: "#eb198d", fg: "#ffffff" },
  "ธ.ก.ส.": { code: "BAAC", bg: "#4b9b1d", fg: "#ffffff" },
  "ธนาคารซีไอเอ็มบีไทย": { code: "CIMB", bg: "#7e2e3a", fg: "#ffffff" },
  "ธนาคารยูโอบี": { code: "UOB", bg: "#005eb8", fg: "#ffffff" },
  "ธนาคารเกียรตินาคินภัทร": { code: "KKP", bg: "#635f98", fg: "#ffffff" },
  "ธนาคารทิสโก้": { code: "TISCO", bg: "#12549f", fg: "#ffffff" },
  "ธนาคารแลนด์ แอนด์ เฮ้าส์": { code: "LHB", bg: "#6d6e71", fg: "#ffffff" },
  "ธนาคารอิสลามแห่งประเทศไทย": { code: "IBANK", bg: "#184615", fg: "#ffffff" },
};

const FALLBACK: BankVisual = { code: "BANK", bg: "#334155", fg: "#ffffff" };

// คืนค่าไอคอน/สี ตามชื่อธนาคาร รองรับทั้งชื่อในลิสต์และชื่อที่มีข้อความพ่วง เช่น "ธนาคารกรุงไทย (KTB)"
export function getBankVisual(bankName?: string | null): BankVisual {
  const key = (bankName ?? "").trim();
  if (!key) return FALLBACK;

  // ตรงเป๊ะก่อน
  if (BANK_VISUALS[key]) return BANK_VISUALS[key];

  // เผื่อชื่อมีข้อความพ่วง (วงเล็บ/ตัวย่อ) — จับด้วยการ "มีคำนี้อยู่ในชื่อ"
  const hit = Object.keys(BANK_VISUALS).find((k) => key.includes(k));
  if (hit) return BANK_VISUALS[hit];

  // นอกลิสต์: ใช้ตัวย่อจากชื่อ (ตัด "ธนาคาร" นำหน้าออก) เพื่อไม่ให้ขึ้น KTB มั่ว
  const trimmed = key.replace(/^ธนาคาร/, "").trim();
  return { ...FALLBACK, code: trimmed.slice(0, 4) || FALLBACK.code };
}
