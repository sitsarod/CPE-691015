package services

// ChatHub เป็น pub/sub ในหน่วยความจำแบบเดียวกับ NotifHub (ดู notification_hub.go)
// แต่ผูกกับ "session ID ของห้องแชท" แทน "user ID" — เพราะผู้เยี่ยมชม (guest) ที่ยังไม่ได้
// ล็อกอินไม่มี JWT token จึงเปิด SSE ของ NotifHub (ต้องยืนยันตัวตน) ไม่ได้ แต่ยังรู้ session ID
// ของห้องแชทตัวเอง (เก็บใน localStorage ฝั่ง client) จึงใช้ session ID เป็นคีย์แทน
//
// รูปแบบความปลอดภัยเดียวกับ endpoint GET /chat-sessions/:id เดิมที่มีอยู่แล้ว (public, สาธารณะ
// ไม่ต้องล็อกอิน แต่ต้องรู้ session ID ที่สุ่มไม่ได้ง่ายๆ ถึงจะดูได้) — ไม่ได้เพิ่มช่องโหว่ใหม่
//
// ใช้ type notificationHub ตัวเดิม (แค่คนละ instance/namespace) เพื่อไม่ต้องเขียน pub/sub ซ้ำ
var ChatHub = &notificationHub{subs: make(map[uint]map[chan string]bool)}
