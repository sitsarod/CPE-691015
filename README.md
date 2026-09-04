# CPE-691015 — Badminton Academy Management System

ระบบจัดการโรงเรียน/อคาเดมีแบดมินตันแบบครบวงจร (Capstone Project) พัฒนาเป็นเว็บแอปพลิเคชัน แบ่งเป็น Backend REST API (Go) และ Frontend (Next.js) แยกกันคนละโปรเจกต์ ใช้งานร่วมกันผ่าน API รองรับผู้ใช้ 3 บทบาท คือ **แอดมิน (admin)**, **โค้ช (coach)** และ **ลูกค้า/นักเรียน (customer)**

โค้ดฝั่ง backend มีคอมเมนต์อธิบายเหตุผลเชิงดีไซน์/ความปลอดภัยเป็นภาษาไทยอย่างละเอียดในหลายจุด (เช่น เรื่อง CORS, rate limit, IDOR) ซึ่งเป็นแหล่งอ้างอิงที่ดีเวลาแก้โค้ดต่อ

---

## 1. ภาพรวมสถาปัตยกรรม

```
Babminton/
├── backend/     # Go REST API (Gin + GORM + PostgreSQL)
│   ├── cmd/         # entry points ต่าง ๆ (serve, init, migrate, ...)
│   └── internal/    # โค้ดหลักของระบบ (ไม่ export ออกนอกโมดูล)
└── frontend/    # Next.js (App Router) + React + TypeScript
    └── src/
```

- **Backend** พูดคุยกับฐานข้อมูล PostgreSQL ผ่าน GORM, เปิด HTTP API ด้วย Gin ที่พอร์ต `8000` (ค่าเริ่มต้น)
- **Frontend** เป็น Next.js SPA/SSR ที่เรียก API ผ่าน `NEXT_PUBLIC_API_URL`, มี route แยกเป็น 3 โซนตามบทบาทผู้ใช้ (`/admin`, `/coach`, `/customer`) บวกหน้าสาธารณะ (landing page, login, register, course catalog)
- สื่อสารกันด้วย JWT (access + refresh token), มี CORS allowlist ที่เข้มงวด (ไม่สะท้อน origin ใด ๆ แบบไม่ตรวจสอบ)

---

## 2. Backend (`/backend`)

### เทคโนโลยีหลัก
- **ภาษา/เฟรมเวิร์ก:** Go 1.26 + [Gin](https://github.com/gin-gonic/gin)
- **ORM/DB:** [GORM](https://gorm.io) + PostgreSQL (`gorm.io/driver/postgres`, `jackc/pgx`)
- **Auth:** JWT (`golang-jwt/jwt`) แบบ access + refresh token
- **Validation:** `asaskevich/govalidator`
- **ไฟล์/รูปภาพ:** อัปโหลดในเครื่อง (`/uploads`) หรือ Cloudinary (`cloudinary-go`) เป็น fallback
- **QR Code:** `skip2/go-qrcode` (สร้าง QR ประจำตัวสมาชิก)
- **ยืนยันสลิปโอนเงิน:** เรียกใช้บริการภายนอก SlipOK (`services/slipok_service.go`) เพื่อตรวจสอบสลิปโอนเงินของธนาคารไทย

### โครงสร้างโค้ด (`internal/`)
| โฟลเดอร์ | หน้าที่ |
|---|---|
| `config/` | เชื่อมต่อฐานข้อมูล (`db.go`) |
| `models/` | GORM models ทั้งหมด (Entity/ตารางในฐานข้อมูล) |
| `dto/` | Data Transfer Object สำหรับ request/response ของแต่ละ endpoint |
| `controllers/` | HTTP handler รับ request → เรียก service → ตอบกลับ |
| `services/` | Business logic หลักของระบบ |
| `middlewares/` | CORS, JWT auth, role-based guard, rate limiting |
| `routes/` | ประกาศ route ทั้งหมดของ API (`routes.go`) |
| `token/` | สร้าง/ตรวจสอบ JWT |

### Entry points (`cmd/`)
รันแยกเป็นโปรแกรมย่อย แต่ละตัว `cd` เข้าโฟลเดอร์แล้ว `go run .`

| คำสั่ง | ทำอะไร |
|---|---|
| `cmd/serve` | รันเซิร์ฟเวอร์ API หลัก (โหลด `.env`, เช็ค `JWT_SECRET`, connect DB, ตั้ง route, เริ่ม background job) |
| `cmd/init` | **ล้างฐานข้อมูลทั้งหมด** (`DROP SCHEMA public CASCADE`) แล้ว AutoMigrate ใหม่ + seed ข้อมูลตัวอย่าง (แอดมิน, โค้ช, ลูกค้า, คอร์ส, แพ็กเกจ, บัญชีธนาคาร) — ใช้ตอนตั้งฐานข้อมูลใหม่ |
| `cmd/migrate` | AutoMigrate แบบ **ไม่ลบข้อมูล** — ใช้เวลาที่เพิ่ม field/table ใหม่ในโมเดล แล้วอยากอัปเดตสคีมาฐานข้อมูลเดิมโดยไม่รีเซ็ต |
| `cmd/createadmin` | เครื่องมือสร้างบัญชีแอดมิน |
| `cmd/membercode` | เครื่องมือจัดการรหัสสมาชิก (member code) |
| `cmd/reissueqr` | เครื่องมือออก QR ประจำตัวใหม่ให้สมาชิก |

### Background job
`serve/main.go` เริ่ม goroutine ไว้ 4 ตัว ทุกตัวรันครั้งแรกทันทีตอน start แล้วทำซ้ำตามรอบของตัวเอง

| งาน | รอบ | ทำอะไร |
|---|---|---|
| `startCustomerStatusJob` | 24 ชม. | sync สถานะลูกค้า active/inactive (`UserService.SyncCustomerStatuses`) |
| `startAnnouncementCleanupJob` | 1 ชม. | ลบประกาศที่พ้นวันสิ้นสุดแล้ว |
| `startChatCleanupJob` | 6 ชม. | ลบห้องแชทที่ปิดไปแล้วเกิน 7 วัน |
| `startAttendanceAutoCloseJob` | 15 นาที | ปิดรอบเช็คชื่อที่เลยเวลาคาบแล้วแต่ลืมกดปิด แล้วมาร์คคนที่ไม่มาเป็นขาดเรียน (`AttendanceService.AutoCloseStaleSessions`) |

> ⚠️ งานปิดรอบอัตโนมัติ **หักโควตาคนที่ไม่มา** โดยไม่มีมนุษย์กดยืนยัน จึงรอจนพ้นเวลาผ่อนผัน 30 นาทีหลังจบคาบเสมอ (`sessionScanDeadline`) เพื่อให้แอดมินมีช่วงเข้าไปจัดการเองก่อน รอบที่ระบบปิดเองจะมี `closed_by_user_id` เป็น `NULL`

### ความปลอดภัยที่ implement ไว้ (เห็นจากคอมเมนต์ในโค้ด)
- `SetTrustedProxies(nil)` กัน IP spoofing ผ่าน `X-Forwarded-For` เพื่อให้ rate limit ตาม IP ใช้งานได้จริง
- CORS ตรวจ origin กับ allowlist เท่านั้น (ไม่สะท้อน origin ที่ client ส่งมาแบบไม่ตรวจ) — ป้องกันเว็บอื่นยิง API แทนผู้ใช้ที่ล็อกอินอยู่
- Rate limit เฉพาะจุดที่เดารหัส/ข้อมูลได้ (login, register, ค้นหาบัญชีจากเบอร์โทร, แก้บัญชีธนาคารโค้ช)
- Access token กับ Refresh token แยกชนิดกัน (middleware เช็ค `type` ใน JWT claims)
- ไฟล์ที่ผู้ใช้อัปโหลด เสิร์ฟผ่าน `/uploads` พร้อม header `X-Content-Type-Options: nosniff` และ `Content-Security-Policy: sandbox` กันไฟล์แนบถูกรันเป็นสคริปต์
- ตรวจสิทธิ์ความเป็นเจ้าของ (กัน IDOR) ในหลาย endpoint ที่ path ไม่มี user id ตรง ๆ (ดึงจาก JWT แทน) เช่น QR ประจำตัว, consent ใบหน้า, รีวิว
- Fail-fast: เซิร์ฟเวอร์จะไม่สตาร์ทถ้าไม่ได้ตั้ง `JWT_SECRET`

---

## 3. โมเดลข้อมูลหลัก (Database)

จากรายการ AutoMigrate ทั้งใน `cmd/init` และ `cmd/migrate` ระบบมีตารางหลัก ๆ ครอบคลุมโดเมนต่อไปนี้:

- **ผู้ใช้/บทบาท:** `User` (role: admin/customer/coach), `Coach`, `Customer`
- **คอร์สเรียน:** `Course`, `Package`, `PackageSchedule`, `Court` (สนาม)
- **การลงทะเบียน:** `Enrollment`, `EnrollmentExtension`
- **การเช็คชื่อ:** `AttendanceSession`, `StudentAttendance`, `CoachAttendance`
- **การเงิน:** `Billing`, `BillingType`, `Invoice`, `PaymentItem`, `BankAccount`, `Expense`
- **ตารางงานโค้ช:** `WorkSchedule`, `CoachAvailability`
- **ใบหน้า/วิดีโอ (AI face recognition):** `Photo`, `DetectedVideo`, `RawVideo`, `BiometricConsent`, `Evaluation`
- **คอนเทนต์เว็บไซต์:** `HomeContent`, `HeroSlide`, `Announcement`, `Category`, `Review`
- **แชท/ระบบตอบคำถามอัตโนมัติ:** `ChatSession`, `AutoQA`
- **แจ้งเตือน:** `Notification`
- **อื่น ๆ:** `Product`

---

## 4. API หลัก (`/api/...`)

ใน `routes/routes.go` แบ่ง route เป็น 3 ระดับสิทธิ์:
1. **Public** — ไม่ต้องล็อกอิน (login/register, ดูคอร์สสาธารณะ, landing page content, ประกาศ, รีวิวเด่น, ถาม Q&A)
2. **Protected** (`AuthMiddleware`) — ต้องมี JWT ที่ valid, ผู้ใช้เห็น/แก้ได้เฉพาะข้อมูลของตัวเอง
3. **Admin only** (`AuthMiddleware` + `RequireRole("admin")`) — เฉพาะแอดมิน

สรุปกลุ่ม endpoint สำคัญ:

| กลุ่ม | คำอธิบาย |
|---|---|
| `/auth/*` | login (rate-limit), register, refresh token |
| `/users/*`, `/admin/users/*` | ค้นหาบัญชี, ดู/แก้โปรไฟล์, แอดมินสร้าง/แก้/ลบผู้ใช้พร้อมโปรไฟล์ตามบทบาท |
| `/coaches/*` | โปรไฟล์โค้ช, เวลาว่าง, ตารางงาน, บัญชีธนาคาร (แก้เองต้องยืนยันรหัสผ่านซ้ำ), ประวัติค่าจ้าง, รีวิวที่ได้รับ |
| `/work-schedules/*`, `/schedule-sessions`, `/coach-availabilities` | ปฏิทินงานโค้ชทั้งหมด (แอดมินจัดการ) |
| `/courts/*` | จัดการสนามแบดมินตัน |
| `/courses/*`, `/packages/*` | คอร์สเรียนและแพ็กเกจราคา (public ดูได้, แอดมิน CRUD) |
| `/enrollments/*` | ลูกค้าลงทะเบียนคอร์ส, แอดมินอนุมัติ/ขยายเวลา/จัดการ |
| `/attendance/*` | ระบบเช็คชื่อด้วย QR — เปิด session ที่สนาม, ดูรอบที่เปิดค้างอยู่ (`GET /sessions`), สแกน 2 จังหวะ (lookup → check-in), เช็คชื่อมือ, ปิด session, ดูประวัติ |
| `/payments/*`, `/billings/*` | สร้าง invoice, อัปโหลดสลิปโอนเงิน (ตรวจผ่าน SlipOK), แอดมินยืนยัน/ปฏิเสธ/ยกเลิก, บิล/แบ่งบิล |
| `/bank-accounts/*` | บัญชีธนาคารสำหรับรับเงิน |
| `/expenses/*`, `/upload` | บันทึกรายจ่าย พร้อมอัปโหลดไฟล์แนบ |
| `/consents/face/*` | ระบบยินยอมเก็บข้อมูลใบหน้าตาม PDPA (ดู/บันทึก/ถอนความยินยอม, แอดมินดูประวัติ) |
| `/students/face-photo/*` | อัปโหลด/ลบรูปใบหน้าสำหรับระบบจดจำใบหน้า |
| `/evaluations/*` | โค้ชประเมินนักเรียน |
| `/videos/*` | อัปโหลดวิดีโอสแกนใบหน้า, ระบบตรวจจับ/จับคู่นักเรียนในวิดีโอ (auto + manual assign) |
| `/notifications/*`, `/notifications/stream` | แจ้งเตือนต่อผู้ใช้ + SSE stream แบบเรียลไทม์ |
| `/me/qr` | QR ประจำตัว (ดึงจาก JWT เท่านั้น ป้องกันดึง QR คนอื่น) |
| `/reviews/*` | รีวิว/ให้คะแนนคอร์สและโค้ช |
| `/home-content/*` | จัดการเนื้อหาหน้าแรก (Landing Page CMS: hero slide, โค้ชแนะนำ) |
| `/announcements/*` | ประกาศข่าวสารและหมวดหมู่ |
| `/auto-qas/*`, `/chat-sessions/*` | ระบบถาม-ตอบอัตโนมัติ + ห้องแชทที่แอดมินตอบเองได้ |

---

## 5. Frontend (`/frontend`)

### เทคโนโลยีหลัก
- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4**
- `lucide-react` สำหรับไอคอน

> หมายเหตุจาก `AGENTS.md`: เวอร์ชัน Next.js ที่ใช้เป็นรุ่นที่มี breaking changes จากที่คุ้นเคย ควรอ่านเอกสารใน `node_modules/next/dist/docs/` ก่อนแก้โค้ดที่เกี่ยวกับ framework

### โครงสร้าง `src/`
| โฟลเดอร์ | หน้าที่ |
|---|---|
| `app/` | หน้าเว็บทั้งหมด (App Router) แบ่งโซนตามบทบาท: `admin/`, `coach/`, `customer/` และหน้าสาธารณะ `login/`, `register/`, `courses/`, `privacy/`, `terms/` |
| `components/` | UI component ที่ใช้ร่วมกัน (sidebar/topbar ต่อโซน, modal, table, ChatWidget, ตัวการ์ด QR ฯลฯ) |
| `services/` | ตัวเรียก API แยกตามโดเมน (เช่น `authAPI`, `courseAPI`, `paymentAPI`, `attendanceAPI`) |
| `types/` | TypeScript types ที่ล้อกับ DTO ฝั่ง backend |
| `hooks/`, `lib/`, `utils/` | โค้ดช่วยเหลือทั่วไป (format ตัวเลข/วันที่, scroll, อัปโหลดรูป) |

### โซนของแอป (ตามบทบาท)
- **หน้าแรก/สาธารณะ** — landing page (`app/page.tsx`, ใช้ HeroSlider, รีวิวเด่น, ประกาศ, ChatWidget), catalog คอร์ส, login/register (มี flow ลืมรหัสผ่าน: ค้นบัญชี → เลือกวิธียืนยัน → กรอก OTP → ตั้งรหัสผ่านใหม่)
- **`/admin`** — แดชบอร์ดผู้ดูแลระบบ: จัดการประกาศ, เช็คชื่อ (สแกน QR/ประวัติ), Auto Q&A, ห้องแชท, จัดการโค้ช/ตารางงาน, คอร์ส, แดชบอร์ดสรุปภาพรวม, ตรวจ/อนุมัติการลงทะเบียน, ฟีดแบ็ก, การเงิน (บัญชีธนาคาร, ออกบิล, ค่าใช้จ่าย, สรุปการเงิน, ตรวจสลิป), จัดการนักเรียน/ผู้ใช้ทั้งหมด
- **`/coach`** — พอร์ทัลโค้ช: ตั้งเวลาว่าง, แดชบอร์ด, ตรวจจับใบหน้านักเรียนจากวิดีโอ (`detect`), ประเมินนักเรียน, ฟีดแบ็ก, ดูค่าจ้าง/สลิปเงินเดือน, โปรไฟล์ + QR ของตัวเอง, ตารางสอน, ตั้งค่าความเป็นส่วนตัว
- **`/customer`** — พอร์ทัลลูกค้า/นักเรียน: แดชบอร์ด, ลงทะเบียนเรียน, ให้ฟีดแบ็ก, ภาพรวมการเรียน, ชำระเงิน (ดูบิล/ใบแจ้งหนี้, อัปโหลดสลิปผ่าน Checkout Modal), โปรไฟล์ + QR ประจำตัว, ตารางเรียน, ตั้งค่าความเป็นส่วนตัว

### การยืนยันตัวตนฝั่ง frontend
- ใช้ JWT ที่ได้จาก backend (access + refresh)
- `SessionGuard` คุมสถานะ session และ redirect เมื่อ token หมดอายุ
- `RoleGuard` จำกัดการเข้าถึงหน้าตามบทบาทผู้ใช้ (admin/coach/customer)

---

## 6. ฟีเจอร์เด่นของระบบ

- **เช็คชื่อด้วย QR Code** — สมาชิกแต่ละคนมี QR ประจำตัว แอดมินเปิด session ที่สนาม แล้วสแกนเช็คชื่อ (lookup ก่อนเขียนจริง แล้วค่อย check-in ตัดโควตาการเรียน)
- **ตรวจจับใบหน้าจากวิดีโอ (AI)** — โค้ชอัปโหลดวิดีโอการซ้อม ระบบตรวจจับ/จับคู่นักเรียนในวิดีโออัตโนมัติ พร้อมให้แก้ไข mapping ได้เอง (manual assign) ทั้งหมดอยู่ภายใต้การขอความยินยอมแบบ PDPA (บันทึก/ถอนความยินยอมได้)
- **ตรวจสอบสลิปโอนเงินอัตโนมัติ** — เชื่อมต่อบริการภายนอก SlipOK เพื่อตรวจสอบสลิปโอนเงินธนาคารไทยก่อนยืนยันการชำระเงิน
- **ระบบการเงินครบวงจร** — ออกบิล/แบ่งบิล (split billing), ใบแจ้งหนี้, บันทึกรายจ่าย, สรุปภาพรวมการเงิน, จัดการหลายบัญชีธนาคารสำหรับรับเงิน
- **CMS หน้าแรก** — แอดมินแก้ไขเนื้อหาหน้าแรก, สไลด์ hero, เลือกโค้ชเด่นที่จะแสดงหน้าเว็บได้เอง
- **แจ้งเตือนเรียลไทม์** — ผ่าน Server-Sent Events (SSE) พร้อมระบบอ่านแล้ว/ยังไม่อ่าน
- **ระบบถาม-ตอบอัตโนมัติ (Auto Q&A) + แชทสด** — ผู้เยี่ยมชมถามคำถามได้จากหน้าเว็บ ระบบตอบอัตโนมัติจากฐานความรู้ ถ้าตอบไม่ได้แอดมินตอบต่อในห้องแชทเดียวกัน
- **ระบบรีวิว/ให้คะแนน** — ลูกค้ารีวิวคอร์สและโค้ชได้ แอดมินเลือกรีวิวเด่นไปแสดงหน้าแรก

---

## 7. การตั้งค่าและรันโปรเจกต์

### ตัวแปรแวดล้อม (`.env`)

**Backend** (`backend/.env`):
```
DATABASE_URL=   # connection string ของ PostgreSQL
JWT_SECRET=     # secret สำหรับเซ็น JWT (ต้องตั้งไม่งั้นเซิร์ฟเวอร์ไม่ยอมสตาร์ท)
ALLOWED_ORIGINS=# (ไม่บังคับ) โดเมนที่อนุญาตให้เรียก API คั่นด้วยจุลภาค — ดีฟอลต์คือ http://localhost:3000
```

**Frontend** (`frontend/.env`):
```
NEXT_PUBLIC_API_URL=   # URL ของ backend API
```

> ทั้งสองไฟล์มีอยู่แล้วในโปรเจกต์นี้ (เก็บค่าจริงไว้) — **ไม่ควร commit ค่าใน `.env` ขึ้น git หรือแชร์ต่อ** เพราะมี secret ของฐานข้อมูลและ JWT อยู่

### รัน Backend
```bash
cd backend

# ตั้งฐานข้อมูลใหม่ทั้งหมด (ลบข้อมูลเดิม!) + seed ข้อมูลตัวอย่าง — ใช้ครั้งแรกเท่านั้น
cd cmd/init && go run .

# หรือถ้ามีฐานข้อมูลอยู่แล้วแค่ต้องการอัปเดตสคีมาแบบไม่ลบข้อมูล
cd cmd/migrate && go run .

# รันเซิร์ฟเวอร์หลัก (ดีฟอลต์พอร์ต 8000)
cd cmd/serve && go run .
```

### รัน Frontend
```bash
cd frontend
npm install
npm run dev      # http://localhost:3000
```

### รัน face-service (จำเป็นเฉพาะตอนทดสอบระบบสแกนใบหน้า)

Python service ที่แปลงรูปใบหน้าเป็น embedding — **ถ้าไม่รัน รูปที่นักเรียนอัปโหลด
จะค้างสถานะ "กำลังประมวลผล" ตลอด** ส่วนอย่างอื่นของระบบทำงานปกติ (รวมถึงเช็คชื่อด้วย QR)

**ติดตั้งครั้งแรกครั้งเดียว** (ต้องมี Homebrew)
```bash
brew install python@3.12 cmake
cd face-service
python3.12 -m venv .venv
.venv/bin/pip install numpy==1.26.4 Cython==3.0.11   # ต้องมาก่อน insightface
.venv/bin/pip install -r requirements.txt
```
รันครั้งแรกจะโหลดโมเดล buffalo_l (~330 MB) ลง `~/.insightface/` อัตโนมัติ

**ตั้งค่าใน `.env` ที่ root**
```
FACE_SERVICE_URL=http://127.0.0.1:8099
FACE_SERVICE_SECRET=<สุ่มด้วย openssl rand -hex 32>
```

**รันทุกครั้งที่จะทดสอบ**
```bash
cd face-service
FACE_SERVICE_SECRET=$(grep ^FACE_SERVICE_SECRET= ../.env | cut -d= -f2) \
  .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8099
```

เช็คว่าขึ้นแล้ว: `curl http://127.0.0.1:8099/health`

> รายละเอียด API / วิธี deploy บน Railway / ข้อจำกัดลิขสิทธิ์ของโมเดล — ดู `face-service/README.md`

### Deploy ด้วย Docker (แนะนำสำหรับขึ้น production)

โปรเจกต์มีชุด Docker พร้อมใช้: `backend/Dockerfile`, `frontend/Dockerfile` และ `docker-compose.yml` ที่ root
(backend build เป็น static binary บน Alpine, frontend ใช้ Next.js standalone output)

**สิ่งที่ต้องมี:** Docker + Docker Compose v2

**1. เตรียมไฟล์ตั้งค่า** — คัดลอกจากตัวอย่างแล้วเติมค่าจริง (compose อ่าน `.env` ที่ root อัตโนมัติ):
```bash
cp .env.example .env
```
ค่าที่ต้องแก้ก่อนขึ้น production:
- `ALLOWED_ORIGINS` → โดเมนจริงของ frontend (คั่นหลายอันด้วยจุลภาค)
- `NEXT_PUBLIC_API_URL` → โดเมนจริงของ backend + ลงท้าย `/api`

> ⚠️ `NEXT_PUBLIC_API_URL` เป็น **build-time** (ถูกฝังลง bundle ตอน build) — ถ้าแก้ค่านี้ต้อง `docker compose build frontend` ใหม่เสมอ

**2. Build อิมเมจ**
```bash
docker compose build
```

**3. เตรียมฐานข้อมูล (ครั้งแรก)**
```bash
docker compose run --rm backend /app/migrate       # อัปเดต schema แบบไม่ลบข้อมูล
docker compose run --rm backend /app/createadmin   # สร้าง admin คนแรก
```

**4. ยกระบบขึ้น**
```bash
docker compose up -d
# frontend: http://localhost:3000   |   backend: http://localhost:8000
```

**คำสั่งที่ใช้บ่อย**
```bash
docker compose logs -f backend     # ดู log สด
docker compose ps                  # ดูสถานะ container
docker compose up -d --build       # rebuild + restart หลังแก้โค้ด
docker compose down                # หยุดทั้งหมด (ข้อมูล uploads เก็บใน volume ไม่หาย)
```

**หมายเหตุ**
- ดีฟอลต์เชื่อมต่อ PostgreSQL ตาม `DATABASE_URL` ใน `.env` (เช่น Neon) — ถ้าอยากใช้ postgres local ตอน dev ให้เปิด profile: `docker compose --profile local-db up -d` แล้วชี้ `DATABASE_URL` ไปที่ `db:5432`
- ไฟล์ที่ผู้ใช้อัปโหลด (`/app/uploads`) ถูก mount เป็น named volume จึงคงอยู่ข้ามการ redeploy
- ถ้ามี reverse proxy (nginx/Cloudflare) มาคั่นหน้า ต้องแก้ `SetTrustedProxies` ใน `cmd/serve/main.go` ให้ trust IP ของ proxy นั้น ไม่งั้น rate limit จะนับ IP ผิด

---

## 8. ข้อสังเกต/สิ่งที่ยังไม่เสร็จ (จากคอมเมนต์ในโค้ด)

- ระบบยืนยันตัวตนด้วย OTP (`send-otp` / `verify-otp`) เขียนไว้แล้วแต่ยัง **comment out** อยู่ใน routes — ถ้าจะเปิดใช้ต้องเพิ่ม rate limit ด้วย เพราะ OTP 6 หลักเดาได้ในจำนวนจำกัด
- Endpoint สร้างผู้ใช้แบบเก่า (`POST /admin/create`) ยังเก็บไว้คู่กับตัวใหม่ (`POST /admin/users`) เพื่อไม่ให้หน้าบ้านเก่าพัง รอวันย้ายออกให้หมด
- โทเคนปัจจุบันส่งผ่าน `Authorization` header (ไม่ใช่ HttpOnly cookie) — คอมเมนต์ในโค้ดระบุว่าอนาคตควรย้ายไปเก็บใน HttpOnly cookie เพื่อความปลอดภัยที่สูงขึ้น
- `/notifications/sync` ยังไม่ถูกเรียกใช้งานจริง (เตรียมไว้สำหรับแจ้งเตือนที่ derive ฝั่ง client)

---

*ไฟล์นี้สรุปจากการสำรวจโครงสร้างโค้ดทั้งโปรเจกต์ (backend + frontend) ในโฟลเดอร์นี้ ณ วันที่จัดทำ หากมีการเพิ่มฟีเจอร์ใหม่ควรอัปเดตไฟล์นี้ตามไปด้วย*
