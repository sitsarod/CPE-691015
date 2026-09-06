# รายงานตรวจสอบ Logic — ระบบจัดการโค้ช (Coach Management)

**โปรเจค:** CPE-691015 — Badminton Academy Management System
**ขอบเขต:** โมดูลจัดการโค้ช (โปรไฟล์ · เวลาว่าง · ตารางงาน · เช็คชื่อ · ค่าจ้าง)
**วันที่ตรวจ:** 6 กันยายน 2026
**Stack:** Go (Gin + GORM) · Next.js/TypeScript · PostgreSQL

---

## สรุปผลโดยรวม

| ด้าน | ผล | หมายเหตุ |
|---|---|---|
| การควบคุมสิทธิ์ (AuthZ / IDOR) | ✅ ดีมาก | แยก `VerifyCoachOwnership` / `VerifyCoachSelf` ชัดเจน มี test รองรับ |
| Validation เวลาว่าง | ✅ ดี | ครบทั้งรูปแบบ ช่วงซ้อน และวันไม่ถูกต้อง |
| Validation ตารางงาน | 🟠 มีช่องโหว่ | `Update` ข้ามกฎบางข้อที่ `Assign` บังคับ |
| **การลบโค้ช** | ✅ **แก้แล้ว** | รวมเหลือแกนกลางเดียว (`DeleteUserAccount`) + มี test คุมแล้ว |
| **การคำนวณค่าจ้าง** | 🟠 **แก้ไปครึ่งทาง** | ✅ โค้ชขาดงานไม่ได้เงินแล้ว · 🔴 ยังคำนวณฝั่ง frontend · 🔴 ปรับเรตแล้วยอดย้อนหลังเพี้ยน |
| คุณภาพเอกสารในโค้ด | ✅ ดีเยี่ยม | คอมเมนต์อธิบาย "ทำไม" ไม่ใช่แค่ "ทำอะไร" หายากมาก |
| Test coverage | 🟠 ไม่ครบ | logic ที่เกี่ยวกับเงินไม่มี test เลย |

**ข้อสรุป:** โครงสร้างและการควบคุมสิทธิ์ทำได้ดีกว่าโปรเจคนักศึกษาทั่วไปมาก แต่**ส่วนที่เกี่ยวกับเงินยังไม่พร้อมใช้งานจริง** — เหลืออีก 2 ประเด็นที่ต้องแก้ก่อน deploy (ข้อ 2 และ 3)

---

## 🔴 ระดับสูง — ต้องแก้ก่อนใช้งานจริง

### 1. การลบโค้ชมี 2 เส้นทางที่นโยบายตรงข้ามกัน (ร้ายแรงที่สุด)

**ไฟล์:** `backend/internal/services/coach.go:349-398` เทียบกับ `backend/internal/services/user.go:305-415`

ระบบมีทางลบโค้ชอยู่สองทาง และทั้งสองทาง**ทำตรงข้ามกัน**:

| | `UserService.Delete` → `deleteCoachData` | `CoachService.Delete` (`DELETE /admin/coaches/:id`) |
|---|---|---|
| ชนิดการลบ | soft delete | **hard delete (`Unscoped`)** |
| `work_schedules` อดีต | **เก็บไว้** (บันทึกการทำงานใช้คิดค่าจ้าง) | **ลบทิ้งทั้งหมด** |
| `coach_attendances` | **เก็บไว้** (ประวัติเช็คชื่อ) | **ลบทิ้งทั้งหมด** |
| `biometric_consents` | **ห้ามลบเด็ดขาด** (หลักฐานตามกฎหมาย) | ไม่ได้ลบ → **กลายเป็นแถวกำพร้า** |
| `users` | ลบผ่าน flow ที่ตรวจครบ | `tx.Unscoped().Delete(&models.User{}, ...)` **ข้าม flow ทั้งหมด** |

ใน `user.go:305-340` ทีมเขียนคอมเมนต์ไว้ชัดเจนว่าตารางไหน "ห้ามลบ" และเพราะอะไร — แต่ `CoachService.Delete` ซึ่งเป็นปุ่มที่แอดมินกดจริงในหน้า Coach Management **ลบทุกตารางในรายการนั้นทิ้งหมด**

**ผลกระทบจริง:**
- กดลบโค้ช 1 คน → ประวัติเช็คชื่อและตารางงานย้อนหลังหายถาวร (rollback ไม่ได้ เพราะ hard delete)
- ตาราง `expenses` ยังมี `coach_id` ชี้ไปหาโค้ชที่ไม่มีอยู่แล้ว → รายงานการเงินย้อนหลังพัง / join ไม่เจอชื่อ
- แถว `biometric_consents` ค้างโดยไม่มีเจ้าของ — ตรงข้ามกับเจตนาที่เขียนไว้ว่าใช้พิสูจน์ความชอบด้วยกฎหมาย

**แนวทางแก้:** ให้ `DELETE /admin/coaches/:id` เรียกใช้ flow เดียวกับ `deleteCoachData` (soft delete + ลบเฉพาะคาบอนาคต + ลบข้อมูลชีวภาพ) แล้วลบ `CoachService.Delete` เวอร์ชัน hard delete ทิ้ง หรืออย่างน้อยให้เหลือทางเดียวในระบบ

#### ✅ แก้แล้ว (6 ก.ย. 2026)

- แยกแกนกลางเป็น `services.DeleteUserAccount(db, faceStorage, userID, actorUserID)` — นโยบายการลบอยู่ที่นี่ที่เดียว
- `UserService.DeleteUser` เหลือเป็น wrapper บาง ๆ
- `CoachService.Delete(coachID, actorUserID)` แปลง `coaches.id` → `users.id` แล้วเรียกแกนกลางตัวเดียวกัน ไม่ลบอะไรเองอีก ทั้งสองเส้นจึงได้ผลเท่ากันทุกตาราง
- เส้น `/coaches/:id` ได้ด่านกันลบตัวเอง / กันลบแอดมินคนสุดท้ายมาด้วยโดยอัตโนมัติ
- แถมแก้ **ข้อ 19** ไปในตัว — `deleteCoachData` เรียก `DeleteCoachFaceImages` แล้ว (ถ้าไม่แก้ การรวมเส้นทางจะทำให้รูปใบหน้าโค้ชค้างบน Cloudinary ซึ่งแย่กว่าเดิม)
- controller แมป status ถูกต้องแล้ว (404 / 409 / 500) และเลิกส่ง `err.Error()` ของ GORM กลับไปหา client
- เพิ่ม `internal/services/coach_delete_test.go` 6 เทส — ตัวหลักคือ `TestCoachDeletePathsAgree` ที่เทียบจำนวนแถวคงเหลือของสองเส้นทางให้ตรงกันทุกตาราง ยืนยันแล้วว่าเทสชุดนี้ **fail จริง** เมื่อย้อนโค้ดกลับไปเป็น hard delete

**⚠️ ผลข้างเคียงที่ต้องรู้:** ตอนนี้เป็น soft delete แล้ว แถว `users.email` และ `coaches.uid` จึงยังกิน slot ของ unique index อยู่ — ลบโค้ชแล้วสมัครคนเดิมกลับเข้ามาด้วยอีเมล/เลขบัตรเดิมไม่ได้ (จะได้ error จาก DB) พฤติกรรมนี้ตรงกับฝั่งผู้เรียนที่เป็นแบบนี้อยู่แล้ว ถ้าจะให้ใช้ซ้ำได้ต้องเปลี่ยนเป็น partial unique index (`WHERE deleted_at IS NULL`) แบบเดียวกับที่ `EnsureMemberCodeIndexes` ทำกับ `member_code` หรือทำเมนู "กู้คืนบัญชีที่ลบแล้ว" — เป็นงานแยกที่กระทบทั้งระบบ ไม่ได้ทำในรอบนี้

---

### 2. โค้ชที่ถูกมาร์ค "ขาดงาน" ยังได้ค่าจ้างเต็ม

**ไฟล์:** `backend/internal/services/coach_attendance.go:329-376` · `backend/internal/services/coach_workschedule.go:244-269`

`markCoachAbsentees` สร้างแถว `CoachAttendance` สถานะ `absent` ตอนปิดรอบ — แต่ **ไม่ได้แตะ `WorkSchedule`**

ส่วน `taughtSessionDates` (ตัวคิดค่าจ้าง) นับจาก `WorkSchedule` ที่มี `AttendanceSession` สถานะ `closed` **โดยไม่ดูเลยว่าโค้ชคนนั้นมาหรือไม่มา**:

```go
// coach_workschedule.go:247-252
s.db.Model(&models.WorkSchedule{}).
    Joins("JOIN attendance_sessions a ON a.package_id = work_schedules.package_id AND a.session_date = work_schedules.date ...").
    Where("work_schedules.coach_id = ? AND ... a.status = ?", coachID, models.AttendanceSessionClosed).
    Pluck("to_char(work_schedules.date, 'YYYY-MM-DD')", &attended)
```

**ผลลัพธ์:** โค้ชไม่มาสอน → ระบบมาร์ค `absent` → รอบปิด → `taughtSessionDates` ยังนับคาบนั้น → **โค้ชได้เงินเต็มทั้งที่ไม่ได้มา**

ในโค้ดมีคอมเมนต์ยอมรับไว้แล้ว (`coach_attendance.go:327` — "⚠️ ไม่กระทบค่าจ้าง") ซึ่งแปลว่าทีมรู้ตัว แต่ถ้าเป็นระบบที่จ่ายเงินจริง **นี่คือบั๊กทางธุรกิจ ไม่ใช่ design decision ที่ยอมรับได้**

**แนวทางแก้:** เพิ่มเงื่อนไขใน query ให้ join `coach_attendances` แล้วนับเฉพาะแถวที่ `status = 'present'` (และตัดสินใจเรื่อง "โค้ชลืมสแกน" ด้วยการให้แอดมินแก้สถานะย้อนหลังผ่าน `UpdateCoachAttendanceStatus` ที่มีอยู่แล้ว)

#### ✅ แก้แล้ว (6 ก.ย. 2026)

- แยกกติกาการนับคาบออกมาเป็น `taughtScheduleScope` — มีชื่อเรียก มีที่มาที่เดียว และเทสยิงตรงเข้าหาได้
- ใช้ `NOT EXISTS` ตัดคาบที่โค้ชมีแถว `absent` ออก (ไม่ใช้ LEFT JOIN เพราะจะไปเปลี่ยนจำนวนแถว = จำนวนเงิน)
- **เลือกเกณฑ์แบบผ่อนปรน** — ตัดเฉพาะเมื่อมีแถว `absent` ชัดเจน ไม่ใช่ "ต้องมี present ถึงได้เงิน"
  ให้ผลเหมือนแบบเข้มงวดทุกประการกับข้อมูลใหม่ (เพราะ `markCoachAbsentees` สร้างแถวให้ทุกคนตอนปิดรอบ ด้วยคีย์ชุดเดียวกับ query นี้) แต่ไม่ไปทำให้ยอดค่าจ้างย้อนหลังของข้อมูลเก่าเปลี่ยนยกแผง
- **เติมปุ่มแก้สถานะโค้ชในหน้าประวัติเช็คชื่อ** — จำเป็น ไม่ใช่ของแถม เพราะ `absent` เกิดตอน "ปิดรอบ" แล้วรอบจะหายจากหน้าเช็คชื่อทันที (`GetOpenSessions` กรอง `status = open`) ถ้าไม่มีปุ่มนี้ สถานะที่ระบบมาร์คให้จะแก้ในเว็บไม่ได้เลย = โค้ชลืมสแกนแล้วไม่ได้เงินโดยไม่มีทางแก้
- แก้ข้อความ UI ที่กลายเป็นคำโกหกเรื่องเงิน — เดิมโมดัลเขียนว่า `"ไม่กระทบค่าจ้าง"` ย้ายไปเก็บเป็น `COACH_STATUS_NOTE` ที่เดียวใน `types/attendance.ts` ให้ทุกหน้าดึงไปใช้
- แก้คอมเมนต์ที่กลายเป็นข้อมูลผิดใน `markCoachAbsentees` และ `models/coach_attendance.go` (เดิมเขียนว่า "ไม่กระทบค่าจ้าง")
- เพิ่ม `internal/services/coach_payroll_test.go` 6 เทส — ตอบข้อ "Test coverage ที่ขาด" ที่บอกว่าควรเขียนให้ `taughtSessionDates` ก่อนเป็นอันดับแรก ยืนยันแล้วว่า **fail จริง** เมื่อถอดเงื่อนไขใหม่ออก

---

### 3. ค่าจ้างคำนวณทั้งหมดที่ฝั่ง Frontend — Backend ไม่ตรวจซ้ำ

**ไฟล์:** `frontend/src/app/admin/payment/components/ExpensesTab.tsx:100-145` · `backend/internal/dto/expense_dto.go:8-15`

สูตร `ยอดค้างจ่าย = (จำนวนคาบ × pay_rate) − ที่จ่ายไปแล้ว` อยู่ใน React ทั้งหมด ส่วน backend รับแค่:

```go
type CreateExpenseRequest struct {
    Amount float64 `json:"expenseamount" binding:"required,gt=0"`  // รับเลขอะไรก็ได้
    CoachID *uint  `json:"coach_id"`
}
```

**ปัญหา:** backend ไม่เคยตรวจว่ายอดที่ส่งมาตรงกับที่ควรจ่ายหรือไม่ — ยิง API ตรงด้วยยอดเท่าไหร่ก็ผ่าน (ช่องกรอกใน UI ก็แก้ได้อยู่แล้ว)

**ปัญหาซ้อน — ปรับเรตแล้วยอดย้อนหลังเพี้ยน:**

```ts
const expected = sessionsDone * payRate;   // ใช้ pay_rate ปัจจุบัน
const alreadyPaid = expenses.filter(...).reduce(...)  // ยอดจ่ายจริงในอดีต
```

`sessionsDone` คือคาบ**ทั้งหมดตั้งแต่เริ่มงาน** แต่คูณด้วย `pay_rate` **ค่าปัจจุบัน** → ขึ้นค่าจ้างโค้ชจาก 300 เป็น 400 บาท ระบบจะคิดว่าค้างจ่ายย้อนหลังทุกคาบที่เคยสอนมาในอัตราใหม่ทันที (100 บาท × คาบทั้งหมด)

**แนวทางแก้:**
1. ย้ายการคำนวณไปที่ backend เป็น endpoint เดียว แล้วให้ frontend แค่แสดงผล
2. ตรวจยอดที่ส่งมาให้ตรง (หรือไม่เกิน) ยอดที่คำนวณได้ ก่อนบันทึก
3. เก็บ snapshot `pay_rate` ไว้ในแถว `WorkSchedule` หรือ `expenses` ตอนสร้าง เพื่อไม่ให้อดีตเปลี่ยนตามปัจจุบัน
4. เปลี่ยน `float64` เป็น integer หน่วยสตางค์ (ประเด็นนี้มีใน `CODE_REVIEW.md` ข้อ 7 อยู่แล้ว)

---

## 🟠 ระดับกลาง — ควรแก้

### 4. `Update` ตารางงานหลบกฎที่ `Assign` บังคับไว้

**ไฟล์:** `backend/internal/services/coach_workschedule.go:283-318`

`AssignWorkSchedule` มีการ์ด 2 ชั้นที่ `Update` **ไม่มี**:

| กฎ | `AssignWorkSchedule` | `Update` |
|---|---|---|
| ห้ามมอบหมายวันย้อนหลัง | ✅ (บรรทัด 152-158) | ❌ ไม่มีเลย |
| ติดธง `IsEmergency` เมื่อข้ามเวลาว่าง | ✅ (บรรทัด 177) | ❌ ไม่เขียนค่า |
| แจ้งเตือนโค้ช | ✅ (บรรทัด 186-197) | ❌ ไม่แจ้ง |

**ช่องโหว่ที่ตามมา:** `validateScheduleSlot(tx, req, id)` ใน `Update` **ยังอ่าน `req.IgnoreAvailability` อยู่** (บรรทัด 88) แปลว่าแอดมินส่ง `ignore_availability: true` ผ่าน `PATCH` เพื่อข้ามการตรวจเวลาว่างได้ **แต่แถวนั้นจะไม่ถูกติดธง `is_emergency`** → หลักฐานว่า "คาบนี้เคยถูกมอบหมายนอกกฎ" หายไป ซึ่งขัดกับเจตนาที่เขียนไว้ใน `models/coach_workschedule.go:35-37`

**อีกประเด็น:** `Update` แก้ `coach_id` ได้ (บรรทัด 303) แต่ไม่แจ้งใครเลย — โค้ชคนใหม่ไม่รู้ว่าได้งาน โค้ชคนเก่าไม่รู้ว่าถูกถอด

**แนวทางแก้:** ย้ายกฎ "ห้ามย้อนหลัง" เข้าไปใน `validateScheduleSlot` ให้ทั้งสองเส้นใช้ร่วมกัน · เขียน `is_emergency` เมื่อ `req.IgnoreAvailability` เป็น true (แบบ OR กับค่าเดิม ไม่ใช่ทับ) · เพิ่ม notification ตอนเปลี่ยนเวลา/วัน/ตัวโค้ช และตอนลบคาบ

---

### 5. คาบฉุกเฉินทำให้โค้ชแก้เวลาว่างไม่ได้ตลอดไป

**ไฟล์:** `backend/internal/services/coach_availability.go:158-216`

`ensureNoScheduleConflict` บังคับว่าเวลาว่างชุดใหม่ต้อง**คลุมคาบสอนในอนาคตทุกคาบ** — แต่**ไม่ได้ยกเว้นคาบที่ `is_emergency = true`**

คาบฉุกเฉินคือคาบที่ถูกสร้างขึ้น**นอกเวลาว่างโดยตั้งใจ** (แอดมินติ๊กฉุกเฉิน หรือระบบสร้างให้ตอนโค้ชสแกนหน้างาน — `coach_attendance.go:165-179` สร้างโดยไม่ตรวจอะไรเลย)

**ผลลัพธ์:** โค้ชสแกนเช็คชื่อคาบที่ไม่มีในตาราง → ระบบสร้าง `WorkSchedule` ฉุกเฉินให้ → ถ้าคาบนั้นอยู่ในอนาคต โค้ชจะ**แก้เวลาว่างของตัวเองไม่ได้อีกเลย** จนกว่าจะเลยวันนั้นไป โดยได้ error ว่า "กรุณาติดต่อแอดมิน"

**แนวทางแก้:** เพิ่ม `AND is_emergency = false` ใน query บรรทัด 164

---

### 6. เส้นทาง double-pay จากตารางงานซ้ำ

**ไฟล์:** `backend/internal/services/coach_attendance.go:133-184` · `coach_workschedule.go:244-269`

โค้ดเองยอมรับว่า `work_schedules` ไม่มี unique index (`coach_attendance.go:202` — "แถวซ้ำจึงเกิดได้จริง") และ `coachSchedules` กับ `GetWeekSessions` **ต่างก็ dedupe ด้วยมือ** — แต่ `taughtSessionDates` (ตัวคิดเงิน) **ไม่ dedupe เลย** ใช้ `Pluck` ตรง ๆ

`ensureCoachWorkSchedule` เช็คซ้ำด้วยคีย์ `(coach_id, package_id, date)` เท่านั้น ดังนั้นถ้าโค้ชมีคาบเก่าแบบ legacy (`package_id = NULL`) ในวันเดียวกันอยู่แล้ว การนับจะได้ 0 → สร้างแถวใหม่ → วันนั้นมี 2 แถว → **นับเป็น 2 คาบ = จ่ายเงินสองเท่า**

**แนวทางแก้:** ใส่ `DISTINCT` ใน query ค่าจ้าง หรือเพิ่ม unique index `(coach_id, date, start_time)` บน `work_schedules`

---

### 7. `GetWeekSessions` เชื่อว่า `week_start` เป็นวันอาทิตย์เสมอ

**ไฟล์:** `backend/internal/services/coach_workschedule.go:332-345`

`weekdayOffset` กำหนดให้ Sunday = 0 แล้วคำนวณ `classDate := start.AddDate(0, 0, off)` โดยไม่เคยตรวจว่า `start` เป็นวันอาทิตย์จริงหรือไม่

ตอนนี้ frontend ส่งถูก (`coachschedule/page.tsx:46` — `d.setDate(d.getDate() - d.getDay())`) แต่ถ้ามีใครเรียก API ด้วยวันจันทร์ **ตารางทั้งสัปดาห์จะเลื่อนไป 1 วันโดยไม่มี error** — คาบวันอาทิตย์ไปโผล่วันจันทร์

**แนวทางแก้:** เพิ่ม `if start.Weekday() != time.Sunday { return ErrScheduleInvalid }`

---

### 8. เส้นแบ่ง "วันนี้" ใช้ timezone ไม่ตรงกันในโค้ดคนละที่

**ไฟล์:** `coach_workschedule.go:154` เทียบกับ `coach_workschedule.go:254-259`

```go
// AssignWorkSchedule — ใช้ UTC โดยไม่ตั้งใจ
today := time.Now().Truncate(24 * time.Hour)   // Truncate ทำงานบนเวลา absolute = ได้เที่ยงคืน UTC

// taughtSessionDates — ใช้เวลาไทย (ถูกต้อง)
loc, _ := time.LoadLocation("Asia/Bangkok")
todayStr := time.Now().In(loc).Format("2006-01-02")
```

`time.Truncate(24*time.Hour)` คิดจากเวลา absolute ไม่ใช่ local — ผลคือได้เที่ยงคืน **UTC** ไม่ใช่เที่ยงคืนไทย

**ผลลัพธ์:** ระหว่าง 00:00–07:00 น. เวลาไทย UTC ยังเป็นเมื่อวาน → แอดมินมอบหมายคาบของ**เมื่อวาน**ได้ ทั้งที่กฎบอกว่าห้าม (`coach_availability.go:161` ก็ใช้ `time.Now().Format(...)` = local ของ server อีกแบบหนึ่ง — รวมแล้วมี 3 วิธีในระบบเดียว)

**แนวทางแก้:** ทำ helper `todayInBangkok()` ตัวเดียวแล้วใช้ทุกที่

---

### 9. ข้อความ error ภายในหลุดออกไปหา client

**ไฟล์:** controller ของโค้ชแทบทุกไฟล์ เช่น `coach_workschedule.go:29, 78, 105, 194`

```go
c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve work schedules: " + err.Error()})
```

`err.Error()` จาก GORM มักมีชื่อตาราง ชื่อคอลัมน์ และบางครั้งมีส่วนของ SQL — ช่วยคนที่กำลังสำรวจระบบมากกว่าช่วยผู้ใช้

**แนวทางแก้:** log รายละเอียดไว้ฝั่ง server แล้วตอบ client ด้วยข้อความกลาง ๆ

---

## 🟡 ระดับต่ำ — คุณภาพโค้ด

### 10. `pay_rate` ไม่ตรวจค่าติดลบตอนสร้างโค้ช
`AdminUpdate` ตรวจ (`coach.go:325-327`) แต่ `Create` ไม่ตรวจ (`coach.go:137-202`) — สร้างโค้ชด้วย `pay_rate: -500` ได้

### 11. `Create` ไม่ได้อยู่ใน transaction
`coach.go:166-198` — `GenerateUniqueQRCode` และ `GenerateMemberCode` ถูกเรียกก่อน `Create` ถ้า `Create` ล้มเหลว รหัสที่สร้างไว้จะสูญไปเฉย ๆ (ไม่ร้ายแรง แต่ไม่สะอาด)

### 12. เช็คข้อมูลซ้ำแบบ TOCTOU
`coach.go:148-157` — ใช้ `First().Error == nil` เช็คซ้ำ ถ้าสอง request เข้ามาพร้อมกันจะผ่านทั้งคู่ (ตอนนี้มี unique index ที่ DB รองรับอยู่ จึงไม่พังจริง แต่ error ที่ได้จะเป็น 500 แทนที่จะเป็น 409) — เทียบกับ `recordCoachAttendance:92-99` ที่จัดการเรื่องนี้ถูกต้องแล้ว ควรใช้แพทเทิร์นเดียวกัน

### 13. โค้ชล้างเวลาว่างทั้งหมดไม่ได้
`controllers/coach_availability.go:78-81` บล็อก array ว่างด้วย 400 — โค้ชที่จะลาออก/พักยาวจึงล้างตารางตัวเองไม่ได้

### 14. `DeleteAll` เป็น dead code ที่ไม่มีการตรวจสิทธิ์
`services/coach_availability.go:154-156` ไม่ผูกกับ route ใดเลย และไม่มี ownership check — ถ้าวันหนึ่งมีคน wire เข้า router จะกลายเป็นช่องโหว่ IDOR ทันที ควรลบทิ้งหรือใส่ check ไว้ก่อน

### 15. ใช้ string literal แทน constant ที่มีอยู่แล้ว
`coach_workschedule.go:81` เขียน `coach.Status == "inactive"` ทั้งที่มี `coachStatusInactive` อยู่ใน `coach_attendance.go:22` · และ `coachStatusActive` ประกาศไว้แต่ไม่มีใครใช้

### 16. `timeToMinutesWS` ยอมรับ input ที่มีขยะต่อท้าย
`coach_workschedule.go:498-508` — `fmt.Sscanf` ทำให้ `"09:00xyz"` ผ่าน (อ่านได้ 2 ตัวเลข, `err = nil`) ควรใช้ regex หรือ `time.Parse` แทน

### 17. `GetWeekSessions` มี N+1 query
`coach_workschedule.go:449-455` — วนลูปทุกคลาสแล้วยิง query หาโค้ชทีละครั้ง ทั้งที่ในไฟล์เดียวกันบรรทัด 378-389 อุตส่าห์รวม query เพื่อเลี่ยง N+1 ไปแล้ว ควรดึงทีเดียวแล้ว group ใน memory

### 18. ค่าอัตราส่วนโค้ช:นักเรียน เก็บใน localStorage
`frontend/src/lib/coachRatio.ts` — เป็นกฎทางธุรกิจที่ควรใช้ร่วมกันทั้งองค์กร แต่เก็บแยกในเบราว์เซอร์แต่ละเครื่อง แอดมินสองคนจึงเห็นคำแนะนำจำนวนโค้ชไม่ตรงกัน ควรย้ายไปเก็บใน DB

### ~~19. ข้อมูลใบหน้าของโค้ชไม่ถูกลบในเส้นทาง user delete~~ ✅ แก้แล้ว (6 ก.ย. 2026)
`user.go:383-414` (`deleteCoachData`) เรียกแค่ `DeleteCoachPhotos` แต่**ไม่เรียก `DeleteCoachFaceImages`** — ขณะที่ฝั่งลูกค้า (`deleteCustomerData:352-362`) เรียกทั้งคู่ ทำให้รูปใบหน้าโค้ชค้างบน Cloudinary หลังลบบัญชี ขัดกับเหตุผล PDPA ที่เขียนไว้ในคอมเมนต์เอง

> แก้พร้อมข้อ 1 — `deleteCoachData` คืน `faceKeys` แล้ว และ `DeleteUserAccount` เอาไปลบไฟล์บน Cloudinary หลัง commit เหมือนฝั่งผู้เรียน (test: `TestCoachServiceDeleteKeepsPayrollHistory` ตรึงไว้ว่า `face_images` ต้องเหลือ 0 แถว)

---

## Test coverage ที่ขาด

มี test ที่ดีอยู่แล้วสำหรับ:
- ✅ `VerifyCoachOwnership` / `VerifyCoachSelf` (`coach_ownership_test.go`) — ครอบคลุมดี รวมถึงเคส "อย่าเอา userID ไปเทียบ coachID"
- ✅ `validateAvailabilities`, `timeToMinutesWS`, `isValidDayOfWeek` (`coach_validation_test.go`)

**ยังไม่มี test เลยสำหรับ logic ที่สำคัญที่สุด:**

| ฟังก์ชัน | ทำไมต้องมี test |
|---|---|
| `validateScheduleSlot` | หัวใจของการกันเวลาชน/สนามซ้อน — 3 กฎซ้อนกัน |
| `taughtSessionDates` | **คิดเงิน** — ควรมี test ว่าโค้ชขาดงานต้องไม่ถูกนับ |
| `ensureNoScheduleConflict` | ตัวบล็อกการแก้เวลาว่าง |
| `ensureCoachWorkSchedule` | find-or-create ที่ถ้าพลาด = จ่ายเงินซ้ำ |
| `GetWeekSessions` | logic merge คลาสข้าม package |

**แนะนำ:** เขียน test ให้ `taughtSessionDates` ก่อนเป็นอันดับแรก เพราะเป็นจุดที่ผิดแล้วเสียเงินจริง

---

## ✅ จุดที่ทำได้ดีมาก

1. **การควบคุมสิทธิ์แยกสองระดับอย่างมีเหตุผล** — `VerifyCoachOwnership` (เจ้าของ + admin) กับ `VerifyCoachSelf` (เจ้าของเท่านั้น แม้ admin ก็ไม่ได้) พร้อมคอมเมนต์อธิบายว่ากันภัยคนละแบบ นี่คือระดับที่ระบบ production หลายตัวยังทำไม่ได้

2. **Step-up authentication ตอนแก้เลขบัญชี** — `UpdateCoachBankAccount` ขอรหัสผ่านซ้ำ + rate limit และคอมเมนต์อธิบายเหตุผลว่ากันคนที่ยึด session ได้ ตรงประเด็นมาก

3. **คอมเมนต์อธิบาย "ทำไม" ไม่ใช่ "ทำอะไร"** — เช่น `coach_attendance.go:29-31` ที่เตือนว่าห้ามใส่ `default:` tag เพราะ GORM จะตัดฟิลด์ false ออกจาก INSERT · หรือ `personal_qr` ที่ห้ามคำนวณ QR จากอีเมล นี่คือความรู้ที่ปกติหายไปเมื่อคนเขียนออกจากทีม

4. **พึ่ง unique index แทน SELECT-แล้ว-INSERT** — `recordCoachAttendance:92-99` จัดการ race condition ถูกวิธี

5. **แยก DTO ตามระดับสิทธิ์** — `UpdateCoachRequest` / `AdminUpdateCoachRequest` / `UpdateCoachBankRequest` แยกกันชัด กัน mass assignment ได้จริง และคอมเมนต์บอกด้วยว่าฟิลด์ไหนถูกย้ายออกเพราะอะไร

6. **`CoachResponse` ไม่มี `PersonalQRCode`** — ตั้งใจไม่ให้ QR หลุดไปกับ payload รายชื่อ (`coach_dto.go:115-120`) ละเอียดดี

---

## ลำดับการแก้ที่แนะนำ

| ลำดับ | ประเด็น | เหตุผล |
|---|---|---|
| ~~1~~ | ~~ข้อ 1 — รวมเส้นทางลบโค้ชให้เหลือทางเดียว~~ ✅ | ~~ข้อมูลหายถาวร กู้ไม่ได้~~ (แก้แล้ว 6 ก.ย. 2026) |
| ~~2~~ | ~~ข้อ 2 — โค้ชขาดงานต้องไม่ได้เงิน~~ ✅ | ~~เสียเงินจริงทุกครั้งที่เกิด~~ (แก้แล้ว 6 ก.ย. 2026) |
| 3 | ข้อ 3 — ย้ายการคิดค่าจ้างไป backend | เสียเงินจริง + แก้ยอดได้จากฝั่ง client |
| 4 | ข้อ 6 — ใส่ DISTINCT / unique index | เสียเงินจริง (จ่ายซ้ำ) |
| 5 | ข้อ 4 — `Update` ต้องใช้กฎเดียวกับ `Assign` | ช่องโหว่ข้าม validation |
| 6 | ข้อ 5 — ยกเว้นคาบฉุกเฉินตอนแก้เวลาว่าง | โค้ชใช้งานไม่ได้จริง |
| 7 | ข้อ 8 — รวม timezone ให้เป็นตัวเดียว | บั๊กที่หายาก โผล่เฉพาะกลางดึก |
| ~~8~~ | ~~เขียน test ให้ `taughtSessionDates`~~ ✅ | ~~กันไม่ให้ 3 ข้อบนกลับมาอีก~~ (แก้แล้ว 6 ก.ย. 2026 — `coach_payroll_test.go`) |
| 9 | ข้อ 7, 9–19 | ค่อยทยอยแก้ |

---

## หมายเหตุ

- รายงานนี้ตรวจ**เฉพาะโมดูลโค้ช** — ประเด็นระดับระบบ (JWT secret, OTP, CORS, การอัปโหลดไฟล์, seat overselling) อยู่ใน `CODE_REVIEW.md` ที่มีอยู่แล้วและยังไม่ได้ตรวจซ้ำในรอบนี้
- ~~ยังไม่ได้รัน `go build` / `go test` เพราะเครื่องที่เชื่อมต่อไม่มี Go ติดตั้ง~~ — **ข้อนี้เข้าใจผิด** เครื่องมี Go 1.26.4 อยู่ รอบแก้ข้อ 1 รัน `go build ./...`, `go vet ./...` และ `go test ./...` แล้วผ่านทั้งหมด ส่วนข้ออื่นที่ยังไม่ได้แก้ยังคงมาจากการอ่านโค้ดเป็นหลัก
- ไฟล์และบรรทัดที่อ้างอิงตรงกับ snapshot วันที่ 6 ก.ย. 2026
