# รายงานตรวจระบบโค้ช (การเงิน + ข้อมูล) — CPE-691015

branch `issue-224` · ตรวจวันที่ 2026-09-09

ขอบเขตที่อ่าน: `coach.go`, `coach_payroll.go`, `coach_workschedule.go`, `coach_attendance.go`,
`coach_missed_class.go`, `coach_availability.go`, `expense_service.go`, `settings_service.go`,
`attendance_service.go`, `attendance_record.go`, `attendance_package_group.go`,
controllers / routes / models / dto ที่เกี่ยวข้อง และฝั่ง frontend (`coach/payment`,
`admin/payment/ExpensesTab`, `AssignCoachModal`, `coachRatio.ts`)

---

## 1. ผลการรันเทส

| คำสั่ง | ผล |
|---|---|
| `go build ./...` | ✅ ผ่าน |
| `go vet ./...` | ✅ ไม่มี warning |
| `go test ./... -count=1` | ✅ ผ่านทั้งหมด (services 194 เทส · controllers/dto/middlewares/token 52 เทส) |
| `tsc --noEmit` (frontend) | ✅ ไม่มี type error |

**เทสที่มีอยู่ผ่านหมด — แต่ผ่านเพราะยังไม่มีเทสที่ยิงเข้าช่องที่พังจริง** ผมเขียนเทสตรวจสอบ (probe)
ขึ้นมา 9 ตัวเพื่อยืนยันข้อสงสัยแต่ละข้อ **5 ตัวจับบั๊กได้** (ลบไฟล์ probe ออกแล้ว
ผลที่ได้ยกมาไว้ในหัวข้อ 3 ทุกข้อที่ติดป้าย `[ยืนยันแล้ว]`)

### ช่องว่างของ coverage (เฉพาะไฟล์โค้ช)

| ไฟล์ | จุดที่ไม่เคยถูกเทส |
|---|---|
| `coach_attendance.go` | `recordCoachAttendance` 0% · `markCoachAbsentees` 0% · `coachSchedules` 0% · `buildCoachRoster` 0% · `UpdateCoachAttendanceStatus` 0% · `ensureCoachWorkSchedule` 35% |
| `settings_service.go` | **0% ทั้งไฟล์** (ของใหม่ ยังไม่มีเทสเลย) |
| `coach_payroll.go` | `ApplyCoachPayChange` 0% · `backfillCoachPayRate` 0% · `BackfillWorkSchedulePayRates` 0% |
| `coach_workschedule.go` | `GetWeekSessions` 0% · `taughtSessionDates` 0% · `NormalizeClockTimeColumns` 0% |
| `expense_service.go` | `GetCoachPayroll` / `GetByCoachID` 0% |

`markCoachAbsentees` ที่ 0% น่ากังวลที่สุด — เป็นตัวที่ "ตัดเงิน" โค้ชโดยตรง

---

## 2. ให้คะแนนระบบ

| ด้าน | คะแนน | สรุป |
|---|---|---|
| สถาปัตยกรรม / เอกสารในโค้ด | **9/10** | คอมเมนต์อธิบาย *ทำไม* ไม่ใช่ *ทำอะไร* บอกบั๊กเดิมและกับดักไว้ครบ หายากมากในโปรเจกต์ระดับนี้ |
| ย้ายการคิดเงินมาไว้ backend | **9/10** | `ComputeCoachPayroll` เป็นแหล่งเดียวจริง frontend เลิกคิดเองแล้วจริง (ตรวจ `coach/payment/page.tsx` แล้ว) |
| สแนปช็อตเรต (`pay_rate_snapshot`) | **8/10** | แก้บั๊ก "ปรับเรตแล้วอดีตเพี้ยน" ได้จริง เหลือช่องเดียวคือเรต 0 (F7) |
| การตรวจสิทธิ์ / IDOR | **9/10** | `VerifyCoachOwnership` / `VerifyCoachSelf` ใช้สม่ำเสมอทุก endpoint · แก้เลขบัญชีต้องยืนยันรหัสผ่าน + rate limit |
| Transaction / concurrency | **8/10** | `lockCoachRow` (FOR UPDATE) · พึ่ง unique index แทน SELECT-แล้ว-INSERT · ปิดรอบใช้ `WHERE status = open` กันปิดซ้ำ |
| ป้องกันข้อมูลหาย | **9/10** | soft delete ทุกทาง · ห้ามลบ/ย้ายคาบที่ผ่านไปแล้ว · แจ้งเตือนโค้ชทุกครั้งที่เงินขยับ |
| **ความถูกต้องของยอดเงิน** | **4/10** | ⚠️ ยังจ่ายเกิน/จ่ายขาดได้เงียบ ๆ อย่างน้อย 4 ทาง (F1–F4) |
| **ด่านตรวจยอด (`validateCoachWage`)** | **3/10** | ⚠️ โค้ชรายเดือนข้ามได้ทั้งหมดด้วยการเปลี่ยนวันที่ (F1) และข้ามได้ด้วยการเปลี่ยน type (F5) |
| การจับคู่คลาส (class matching) | **5/10** | นิยาม "คลาสเดียวกัน" มี 2 ท่อน (เวลา OR package_id) ท่อน `package_id` เป็นต้นเหตุ F3 + F4 |
| Coverage ของเทส | **5/10** | เทสเยอะและเขียนดี แต่กระจุกที่ payroll เส้น attendance ของโค้ชแทบไม่มีเลย |
| **รวม** | **6.5/10** | โครงสร้างและเจตนาดีมาก แต่ยังมีรูเรื่องเงินที่ต้องอุดก่อนใช้จริง |

### สิ่งที่ทำได้ดีมาก (ห้ามรื้อ)

- คอมเมนต์ที่บันทึกบั๊กเดิมและ "ทำไมถึงไม่แก้แบบนั้น" — ป้องกันการแก้ถอยหลัง
- `taughtScheduleScope` / `unresolvedScheduleScope` ใช้ SQL ชิ้นเดียวกัน (`classSessionForScheduleSQL`)
- ใช้ `EXISTS` ไม่ใช่ `JOIN` ในการคิดเงิน — กันการนับซ้ำจากรอบเช็คชื่อหลายรอบ
- `guardPastScheduleEdit` แยก "ฟิลด์ที่กระทบเงิน" ออกจาก "ฟิลด์ที่แก้ได้"
- `ResolveMissedClass` บังคับให้ระบุสถานะโค้ชครบทุกคน (`matchCoachDecisions`) — กันจ่ายฟรี
- `ApplyCoachPayChange` เป็นทางเดียวที่แก้ `pay_rate` / `payment_type` ได้ ทั้ง 3 เส้นทางเรียกตัวเดียวกัน
- ระบบแจ้งเตือน: พักงาน / ถูกถอดคาบ / ลบรายการรายได้ / บันทึกย้อนหลัง ล้วนไม่เงียบ

---

## 3. บั๊กที่พบ (เรียงตามความร้ายแรง)

### 🔴 F1 — ด่านเพดานค่าจ้างของโค้ชรายเดือน ข้ามได้ด้วยการเลือกวันที่ย้อนหลัง `[ยืนยันแล้ว]`

**ไฟล์:** `backend/internal/services/coach_payroll.go:263` + `expense_service.go:184`

```go
paid, err := paidWages(db, coachID, monthRange(now))   // นับเฉพาะ "เดือนนี้"
result.Unpaid = positive(coach.PayRate - paid)
```

`validateCoachWage` เทียบยอดที่กรอกกับ `Unpaid` ของ **เดือนปัจจุบัน** แต่แถวที่บันทึกใช้
`req.Date` ที่แอดมินเลือกเอง ถ้าเลือกวันของ **เดือนก่อน** แถวนั้นจะตกนอกหน้าต่างที่ด่านนับ
→ `Unpaid` ไม่ลดลงเลย → กดจ่ายซ้ำได้ไม่จำกัด

**ผลการทดสอบจริง:** เงินเดือน 20,000 → บันทึกจ่ายผ่าน 5 ครั้งติด **รวม 100,000 บาท ไม่มี error สักครั้ง**

**เข้าถึงได้จาก UI ปกติ** — `ExpensesTab.tsx:184` ส่ง `expensedate` ตามช่องวันที่ที่แอดมินกรอก
และการจ่ายเงินเดือนงวดที่แล้วในต้นเดือนใหม่คือพฤติกรรมปกติ แปลว่าด่านนี้แทบไม่เคยทำงานจริง

> ฝั่ง `per_session` ไม่มีปัญหานี้ เพราะ `paidWages(db, coachID, nil)` นับสะสมทั้งหมด (ทดสอบยืนยันแล้ว)

**แนวทางแก้:** ยึดยอดค้างของ "เดือนที่แถวนั้นระบุ" ไม่ใช่เดือนปัจจุบัน —
`validateCoachWage` ควรส่ง `req.Date` เข้า `ComputeCoachPayroll` แทน `time.Now()` สำหรับกรณีรายเดือน
และเก็บงวดที่จ่าย (`period_year`, `period_month`) ลงแถว expense ตรง ๆ จะชัดกว่าการเดาจากวันที่ทำรายการ

---

### 🔴 F2 — เวลาในตารางงานไม่ตรงกับเวลาคาบ → สแกนแล้วได้แถวที่สอง → จ่าย 2 เท่า `[ยืนยันแล้ว]`

**ไฟล์:** `backend/internal/services/coach_attendance.go:133` (`ensureCoachWorkSchedule`) + `:196` (`classScheduleScope`)

`classScheduleScope` จับคู่ด้วย `course_id + date + start_time + end_time` **เป๊ะ ๆ**
ถ้าแอดมินมอบหมายโค้ชไว้ 18:00-20:00 แต่คาบเรียนจริงคือ 16:00-20:00 (เคสที่คอมเมนต์ในโค้ดเองก็ยกไว้):

1. `ensureCoachWorkSchedule` ค้นด้วยเวลา 16:00-20:00 → ไม่เจอแถว 18:00-20:00 → **สร้างแถวใหม่**
2. แถวใหม่ (16:00-20:00) จับคู่รอบเช็คชื่อได้ด้วย **เวลา** → ได้เงิน
3. แถวเดิม (18:00-20:00) จับคู่รอบเดียวกันได้ด้วยท่อน `OR a.package_id = work_schedules.package_id` → **ได้เงินอีก**

**ผลการทดสอบจริง:** สอนคาบเดียว → `sessions=2 expected=600.00` (ควรเป็น 300)

ซ้ำร้าย `markCoachAbsentees` ก็ใช้ `coachSchedules` ที่จับคู่ด้วยเวลาเหมือนกัน
→ **แถว 18:00-20:00 ไม่มีทางถูกมาร์คขาดงานเลย** ได้เงินแม้โค้ชไม่มาสอน

`ensureCoachWorkSchedule` ยัง **ตั้งใจไม่เรียก `validateScheduleSlot`** จึงไม่มีด่านกันคาบซ้อนเวลาด้วย
และ `work_schedules` **ไม่มี unique index ใด ๆ** (ตรวจ `soft_delete_indexes.go` แล้ว — มีแค่ `users.email` / `coaches.uid`)

**แนวทางแก้:** ก่อนสร้างแถวใหม่ ต้องเช็คด้วยว่าโค้ชคนนี้มีแถวที่ **เวลาซ้อนกัน** ในวันเดียวกันอยู่แล้วหรือไม่
(ไม่ใช่แค่เวลาตรงเป๊ะ) ถ้ามี ให้อัปเดตแถวเดิมให้ตรงเวลาคาบจริงแทนการสร้างใหม่
\+ เพิ่ม partial unique index `(coach_id, date, start_time) WHERE deleted_at IS NULL` เป็นด่านสุดท้าย

---

### 🔴 F3 — แพ็กเกจเดียวมีคาบเรียน 2 ช่วงในวันเดียวกัน = พังทั้งสองทาง `[ยืนยันแล้ว]`

**ไฟล์:** `backend/internal/models/attendance_session.go:30` + `coach_workschedule.go:534`

`attendance_sessions` มี unique index `(package_id, session_date)` — **1 แพ็กเกจเปิดรอบได้วันละ 1 รอบ**
แต่ `package_schedules` ไม่มีอะไรห้ามแพ็กเกจเดียวมี 2 คาบในวันเดียวกัน (เช่น เสาร์ 10-12 และ เสาร์ 14-16)

**ทางที่ 1 — จ่ายเกิน:** ท่อน `OR a.package_id = work_schedules.package_id` ใน `classSessionForScheduleSQL`
ทำให้ตารางงานของ **ทั้งสองคาบ** จับคู่กับรอบเช็คชื่อรอบเดียวที่มีอยู่ได้หมด

> ผลการทดสอบจริง: ปิดรอบไปแค่คาบเช้า แต่คิดเงิน `sessions=2 expected=600.00 unresolved=0`
> — คาบบ่ายได้เงินทั้งที่ไม่เคยมีรอบเช็คชื่อ และไม่โผล่ในรายการค้างให้ใครเห็น

**ทางที่ 2 — เปิดรอบไม่ได้เลย:** คาบที่สองของวันจะติด unique index ตอน `OpenSession`
→ `openSessionForSlot` หาไม่เจอ (เพราะกรองเวลาแล้ว) → `Create` ล้ม → fallback ก็หาไม่เจอ
→ ผู้ใช้ได้ `"ไม่สามารถเปิดรอบเช็คชื่อได้"` โดยไม่รู้สาเหตุ · นักเรียนเช็คชื่อคาบนั้นไม่ได้เลย

> คอมเมนต์ที่ `assertNoAnchorDayCollision` รู้ปัญหานี้แล้วและเขียนไว้ว่า "ต้องแก้ index ให้รวมเวลาด้วย" — ยังไม่ได้แก้

> ⚠️ คอมเมนต์เหนือ `classSessionForScheduleSQL` สรุปผิด: เขียนว่า *"ท่อน package_id ไม่ทำให้สองคาบต่างเวลา
> ถูกยุบเป็นคาบเดียว เพราะ unique index ... 1 แพ็กเกจมีรอบได้วันละ 1 รอบ"* — ข้อเท็จจริงตรงกันข้าม
> **การมีได้รอบเดียวนั่นแหละคือสาเหตุ** ที่ทำให้ทุกคาบของแพ็กเกจนั้นในวันนั้นไปเกาะรอบเดียวกันหมด
> (เทส `TestTwoSlotsSameDayPayTwice` ไม่ครอบเคสนี้ เพราะ `seedMergedClass` สร้างคนละแพ็กเกจให้แต่ละคาบ)

**แนวทางแก้:** เปลี่ยน unique index ของ `attendance_sessions` เป็น `(package_id, session_date, schedule_start_time)`
แล้วจึงตัดท่อน `OR a.package_id = ...` ให้เหลือเงื่อนไขเวลาอย่างเดียว — **ต้องแก้พร้อมกัน** ถ้าตัด OR ก่อนแก้ index
ข้อมูลเก่าที่ไม่มีสแนปช็อตเวลาจะจับคู่ไม่เจอ → โค้ชได้เงิน 0 ทุกคน

---

### 🔴 F4 — มาร์คขาดงาน 1 คาบ ตัดเงินคาบอื่นของแพ็กเกจเดียวกันในวันนั้นไปด้วย `[ยืนยันแล้ว]`

**ไฟล์:** `backend/internal/services/coach_workschedule.go:556` (`taughtScheduleScope`)

ท่อน `NOT EXISTS(coach_attendances ... status = absent)` ผูกกับ `a.id` ของรอบที่จับคู่ได้
แต่เมื่อท่อน `OR package_id` ทำให้ทุกคาบของวันนั้นจับคู่กับรอบเดียวกัน
**แถว absent แถวเดียวจึงตัดเงินทุกคาบของวันนั้นทิ้งหมด**

**ผลการทดสอบจริง:** โค้ชมีคาบ 10-12 และ 14-16 · มาร์คขาดเฉพาะคาบเช้า
→ `sessions=0 expected=0.00 unresolved=0`
**คาบบ่ายที่สอนจริงได้ 0 บาท ไม่มี error และไม่โผล่ในรายการค้างจ่ายให้ใครเห็น**

นี่คืออาการ "เงินหายเงียบ ๆ" แบบเดียวกับที่ `coach_missed_class.go` ทั้งไฟล์ถูกเขียนขึ้นมาแก้
ต่างกันแค่ตอนนี้เข้าทางที่รายการค้างจับไม่ได้ · แก้พร้อมกับ F3

---

### 🔴 F5 — `expensetype` ไม่ถูกตรวจ ยิงค่าอะไรก็ได้ ผ่านด่านค่าจ้างทั้งหมด `[ยืนยันแล้ว]`

**ไฟล์:** `backend/internal/dto/expense_dto.go:8` + `expense_service.go:184`

```go
Type models.ExpenseType `json:"expensetype" binding:"required"`   // ไม่มี oneof=
...
if req.Type != models.ExpenseTypeCoach { return nil }              // ไม่ใช่ coach_wages = ปล่อยผ่าน
```

**ผลการทดสอบจริง:** `POST /expenses` ด้วย `expensetype: "อะไรก็ได้"` + `expenseamount: 999999`
→ **บันทึกสำเร็จ** ไม่มีการตรวจใด ๆ

ผลกระทบ:

- ข้ามด่าน `validateCoachWage` ได้ 100% ด้วยการพิมพ์ type ผิดตัวเดียว
- `paidWages` นับเฉพาะ `coach_wages` → แถวนี้ไม่ถูกหักออกจากยอดค้าง
  → **จ่ายเงินไปแล้วแต่ระบบยังบอกว่าค้างอยู่เต็ม → จ่ายซ้ำได้อีกรอบ**
- dashboard / รายงานที่ `switch` ตาม type จะไม่รู้จักหมวดนี้ ยอดหายไปจากทุกกราฟ

**แนวทางแก้:** `binding:"required,oneof=coach_wages coach_other court_rental equipment advertising other"`
และย้ำที่ service ด้วย (อย่าพึ่ง binding อย่างเดียว) · จุดเดียวกันควรกันแถวที่ผูก `coach_id`
กับ type ที่ไม่ใช่ของโค้ชด้วย

---

### 🟠 F6 — มอบหมายคาบโดยไม่มี `package_id` ได้ → คาบนั้นจ่ายเงินอัตโนมัติ ไม่ต้องมีรอบเช็คชื่อ `[ยืนยันแล้ว]`

**ไฟล์:** `backend/internal/dto/coach_dto.go:159` + `coach_workschedule.go:348` + `coach_payroll.go:457`

`CreateWorkScheduleRequest.PackageID` เป็น `*uint` (optional) และ `anchorPackageForSlot` คืน `nil`
เมื่อไม่มี `package_schedules` ที่ตรง course+วัน+เวลา → แถวที่ได้มี `package_id = NULL`

แถวแบบนี้ตกเข้า `legacyTaughtScope` ซึ่ง **จ่ายเงินทันทีที่วันผ่านไป โดยไม่ต้องมีรอบเช็คชื่อ**

**ผลการทดสอบจริง:** assign คาบพรุ่งนี้แบบไม่ส่ง `package_id` → พอวันผ่านไป
`sessions=1 expected=300.00 unpaid=300.00 unresolved=0` ทั้งที่ไม่เคยมีรอบเช็คชื่อเลย

และเพราะ `unresolvedScheduleScope` บังคับ `package_id IS NOT NULL` แถวนี้จึง:

- ไม่โผล่ใน `ListMissedClasses` → เคลียร์ย้อนหลังไม่ได้
- มาร์ค absent ไม่ได้ (ไม่มีรอบให้ผูก) → **ไม่มีทางตัดเงินได้เลย**

UI ปัจจุบัน (`AssignCoachModal.tsx:103`) ส่ง `package_id` เสมอ **จึงยังไม่ถูก trigger จากหน้าเว็บ**
แต่ endpoint เปิดรับอยู่ และ "คาบรุ่นเก่า" ควรเป็นข้อมูลที่ตกค้างจากอดีต ไม่ใช่สิ่งที่ยังสร้างใหม่ได้วันนี้

**แนวทางแก้:** `AssignWorkSchedule` ต้องปฏิเสธเมื่อหา anchor ไม่ได้และ client ไม่ส่ง `package_id`
(ข้อความ: "ไม่พบคาบเรียนของคอร์สนี้ในวัน-เวลาที่เลือก") · เส้นทาง legacy เก็บไว้อ่านข้อมูลเก่าอย่างเดียว

---

### 🟠 F7 — ตั้ง `pay_rate` ทีหลัง → คาบที่มอบหมายไปแล้วค้างที่ 0 บาทถาวร `[ยืนยันแล้ว]`

**ไฟล์:** `backend/internal/services/coach_payroll.go:94` (`ApplyCoachPayChange`)

```go
switchingIn := coach.PaymentType != PaymentTypePerSession && targetType == PaymentTypePerSession
if switchingIn && targetRate > 0 { backfillCoachPayRate(...) }   // เติมเฉพาะตอน "สลับประเภท"
```

`Coach.PayRate` default = 0 และ `payment_type` default = `per_session`
ถ้าแอดมินสร้างโค้ชแล้วยังไม่ตั้งเรต มอบหมายคาบไปก่อน แล้วค่อยมาตั้งเรตทีหลัง
→ ไม่เข้าเงื่อนไข `switchingIn` → **ไม่มีการเติมย้อนหลัง**

**ผลการทดสอบจริง:** สอน 3 คาบ ตั้งเรต 300 ทีหลัง →
`sessions=3 expected=0.00 breakdown=[{PayRate:0 Sessions:3 Amount:0}]`

ผลต่อเนื่อง: `validateCoachWage` จะตอบ `ErrPayrollNoUnpaid`
→ **แอดมินจ่ายค่าจ้างให้โค้ชคนนี้ผ่าน `coach_wages` ไม่ได้เลย** ต้องอ้อมไปใช้ `coach_other` ซึ่งเสียการแยกหมวด

ทางซ่อมเดียวที่มีคือ `BackfillWorkSchedulePayRates` ที่รันได้จาก `cmd/migrate` เท่านั้น — ไม่มีปุ่มในแอป

**แนวทางแก้:** เติมย้อนหลังเมื่อ `oldRate == 0 && newRate > 0` ด้วย (ไม่ใช่เฉพาะตอนสลับประเภท)
หรือดีกว่านั้น: บล็อกการ assign คาบให้โค้ช `per_session` ที่ `pay_rate = 0` ตั้งแต่แรก

---

### 🟠 F8 — `AppSetting` ไม่อยู่ใน `cmd/init` → ติดตั้งใหม่แล้วตาราง `app_settings` ไม่มี `[ยืนยันแล้ว]`

**ไฟล์:** `backend/cmd/init/main.go:43-83` vs `backend/cmd/migrate/main.go:85`

ตรวจ diff รายชื่อโมเดลใน AutoMigrate ทั้งสองไฟล์ — `models.AppSetting` **มีใน `migrate` แต่ไม่มีใน `init`**
(เป็นโมเดลเดียวที่ต่างกัน) ระบบที่ติดตั้งใหม่ด้วย `cmd/init` จะไม่มีตารางนี้ และอาการจะเงียบครึ่งหนึ่ง:

- `GET /settings/coach-ratio` → คืน 6 เสมอ (`GetStudentsPerCoach` กลืน error โดยตั้งใจ)
- `PUT /admin/settings/coach-ratio` → **500** โดยไม่มีคำอธิบายว่าทำไม

**แนวทางแก้:** เพิ่ม `&models.AppSetting{}` ใน `cmd/init/main.go` · ระยะยาวควรรวมรายชื่อโมเดล
ไว้ที่เดียว (`models.AllModels()`) แล้วให้ทั้ง init และ migrate เรียกตัวเดียวกัน ไม่งั้นจะลืมซ้ำอีก

---

### 🟡 F9 — `normalizeClockTime` ยังไม่ครบทุกจุดที่ "ค้นหา" ด้วยเวลา

**ไฟล์:** `backend/internal/services/attendance_service.go:154` (`OpenSession`)

```go
ScheduleStartTime: normalizeClockTime(sch.StartTime),                              // เขียน = normalized
...
s.openSessionForSlot(s.db, siblings, dayStart, dayEnd, sch.StartTime, sch.EndTime) // ค้น = ดิบ
```

`siblingPackageIDs` ก็เทียบ `package_schedules.start_time` (ดิบ) กับ `session.ScheduleStartTime` (normalized)
ถ้าฐานมี `"18:00:00"` ปนกับ `"18:00"` การ merge คลาสจะพลาดเป็นบางแถวแบบเดาไม่ได้
→ คลาสที่ควรรวมเป็นการ์ดเดียวแยกออกเป็นสอง → กลับไปสู่รากของ F2/F3

ตอนนี้กันไว้ด้วย `NormalizeClockTimeColumns` ที่รันจาก `cmd/migrate` เท่านั้น
**แปลว่าความถูกต้องของการคิดเงินขึ้นกับว่ามีคนรัน migrate หรือยัง** ซึ่งเป็นกฎที่บังคับไม่ได้

**แนวทางแก้:** ห่อทุกค่าที่อ่านจาก `package_schedules` ด้วย `normalizeClockTime` ก่อนเอาไปเทียบ
(เขียนก็ normalize อ่านก็ normalize) ไม่ให้ผลลัพธ์ขึ้นกับสถานะการ migrate

---

### 🟡 F10 — ยอดค้างของโค้ชรายเดือนไม่สะสมข้ามเดือน

**ไฟล์:** `backend/internal/services/coach_payroll.go:263`

`Unpaid` ของรายเดือนคิดจากเดือนปัจจุบันเท่านั้น ถ้าค้างจ่าย 3 เดือน หน้าจอจะโชว์ค้างแค่ 1 เดือน
สองเดือนที่เหลือหายจากสายตาทั้งระบบ (ไม่มี `unresolved` มารับ เพราะรายเดือนไม่มีคาบให้นับ)

คอมเมนต์ระบุว่าเลือกแบบนี้เพื่อไม่ให้ "เดือนใหม่กลายเป็นไม่ต้องจ่าย" ซึ่งถูก
แต่ทางแก้ที่ถูกกว่าคือ **ผูกแถว expense กับงวดที่จ่าย** แล้วคิด `Unpaid` เป็นผลรวมของทุกงวดที่ยังขาด
(แก้พร้อม F1 ได้ในตัวเดียวกัน)

---

### 🟡 F11 — `GET /coaches/:id/expenses` ไม่กรอง type

**ไฟล์:** `backend/internal/services/expense_service.go:234`

```go
s.db.Where("coach_id = ?", coachID)   // ไม่กรอง type
```

ถ้ามีแถว `court_rental` (หรือ type ปลอมจาก F5) ที่เผลอผูก `coach_id` ไว้
แถวนั้นจะไปโผล่ในหน้า "รายได้ของฉัน" ของโค้ช ทั้งที่ไม่ใช่เงินของเขา

---

### 🟡 F12 — `AdminUpdateCoach` แมป error ทุกชนิดเป็น 400

**ไฟล์:** `backend/internal/controllers/coach.go:288`

`ErrCoachPaySwitchUnpaid` (ผิดกฎธุรกิจ ควรเป็น 409) และ error ระดับ DB (ควรเป็น 500)
ถูกตอบเป็น 400 หมด · ไม่ร้ายแรงต่อข้อมูล แต่ทำให้ frontend แยกเคสไม่ได้และ log ตามยาก

---

## 4. ลำดับที่ควรแก้

| ลำดับ | รายการ | เหตุผล |
|---|---|---|
| 1 | **F5** | แก้ได้ในบรรทัดเดียว แต่ปิดช่องที่ข้ามด่านตรวจเงินได้ทั้งหมด |
| 2 | **F1** | ด่านค่าจ้างรายเดือนแทบไม่ทำงานเลยตอนนี้ · แก้พร้อม F10 |
| 3 | **F3 + F4** | ต้องแก้พร้อมกัน (index + ตัดท่อน OR) แยกทำแล้วโค้ชได้เงิน 0 ทุกคน · **ทดสอบบน postgres จริง ไม่ใช่ sqlite** |
| 4 | **F2** | เพิ่มการเช็คเวลาซ้อนใน `ensureCoachWorkSchedule` + partial unique index |
| 5 | **F6, F7, F8** | แก้แยกกันได้ กระทบแคบกว่า |
| 6 | **F9, F11, F12** | เก็บงาน |

---

## 5. เทสที่ควรเพิ่ม (ยึดบั๊กที่เจอไว้)

1. `TestMonthlyWageCannotBeOverpaidViaBackdating` — F1
2. `TestScheduleTimeMismatchDoesNotCreateSecondRow` — F2
3. `TestOnePackageTwoSlotsSameDayPaysOnlyClosedSlot` — F3
4. `TestAbsentOnOneSlotDoesNotKillOtherSlot` — F4
5. `TestExpenseRejectsUnknownType` — F5
6. `TestAssignWithoutPackageIsRejected` — F6
7. `TestSettingRateAfterAssignBackfillsSnapshots` — F7
8. เทสชุดแรกของ `settings_service.go` (ตอนนี้ 0%)
9. เทส `markCoachAbsentees` / `recordCoachAttendance` (ตอนนี้ 0% ทั้งที่ตัดเงินโดยตรง)

> ⚠️ sqlite ที่ใช้ในเทสไม่บังคับ unique index บางตัวที่ postgres บังคับ (เจอตอนทดสอบ F3 —
> สร้างรอบที่สองของ `(package_id, session_date)` เดียวกันได้) เทสที่ตรึงพฤติกรรมเรื่อง index
> ต้องรันบน postgres ไม่งั้นจะผ่านทั้งที่ของจริงพัง

---

## 6. หมายเหตุการติดตั้ง

ต้องรัน `cd backend/cmd/migrate && go run .` ก่อนใช้งาน — มีขั้นตอนที่ระบบพึ่งอยู่จริง:
`EnsureSoftDeleteUniqueIndexes`, `NormalizeClockTimeColumns` (ดู F9),
`BackfillWorkSchedulePayRates` (ดู F7), `NormalizeFutureWorkSchedulePackages`
และตาราง `app_settings` (ดู F8)
