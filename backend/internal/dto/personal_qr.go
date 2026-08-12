package dto

// PersonalQRResponse ข้อมูล QR ประจำตัวที่ส่งให้หน้าโปรไฟล์แสดงผลและดาวน์โหลด
//
// ใช้ร่วมกันทั้งนักเรียนและโค้ช เพราะทั้งสองบทบาทใช้ QR รูปแบบเดียวกันเช็คชื่อ
type PersonalQRResponse struct {
	// Code คือรหัสดิบที่ฝังอยู่ใน QR เช่น "QR_Kj3nP..."
	// ส่งมาด้วยเผื่อหน้าบ้านอยากวาด QR เองหรือให้ผู้ใช้กรอกมือตอนเครื่องสแกนเสีย
	Code string `json:"code"`

	// QRImage คือรูป PNG แบบ data URL พร้อมใส่ใน <img src> ได้เลย
	// สร้างสดทุกครั้งที่เรียก ไม่ได้เก็บไฟล์ไว้ที่ไหน
	QRImage string `json:"qrImage"`

	// DisplayName และ Nickname ใช้พิมพ์กำกับบนการ์ด QR ตอนดาวน์โหลด
	// จะได้รู้ว่าบัตรใบไหนของใครเวลาปรินต์ออกมาหลายใบ
	DisplayName string `json:"displayName"`
	Nickname    string `json:"nickname"`

	// Role บอกว่าเป็น QR ของนักเรียนหรือโค้ช ใช้เลือกข้อความบนการ์ด
	Role string `json:"role"`
}
