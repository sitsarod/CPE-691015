package services

import (
	"fmt"
	"log"

	"gorm.io/gorm"
)

// EnsureSoftDeleteUniqueIndexes สร้าง unique index ที่ "ไม่นับแถวที่ถูกลบไปแล้ว"
// ให้กับคอลัมน์ที่ผู้ใช้เป็นคนกรอกเองและห้ามซ้ำ: users.email และ coaches.uid
//
// ─── ปัญหาที่แก้ ───
//
// การลบสมาชิกในระบบนี้เป็น soft delete (ตั้ง deleted_at ไม่ได้ลบแถวจริง)
// เพราะต้องเก็บบันทึกการทำงานกับเอกสารการเงินไว้ join ย้อนหลัง
// แต่ unique index ธรรมดาของฐานข้อมูลไม่รู้จัก deleted_at มันเห็นแค่ว่า
// "แถวนี้ยังอยู่ในตาราง และถืออีเมลนี้" แถวที่ลบไปแล้วจึงยังจองอีเมลกับ
// เลขบัตรประชาชนไว้ตลอดกาล
//
// อาการที่เกิดจริง: ลบโค้ชแล้วรับคนเดิมกลับเข้ามาทำงานใหม่ไม่ได้
// สมัครด้วยอีเมลเดิมจะเด้ง SQLSTATE 23505 ออกมาเป็น error 500 ดิบ ๆ
//
// ─── ทำไมถึงถือว่า index เป็นฝ่ายผิด ไม่ใช่โค้ด ───
//
// ด่านเช็คซ้ำทุกจุดในฝั่ง Go เช็คแบบ "ไม่นับคนที่ลบแล้ว" อยู่แล้ว
// (UserService.CreateUser, AdminUpdateUser, CoachService.Create ล้วน query
// แบบปกติที่ GORM ตัด deleted_at ออกให้) แปลว่าเจตนาเดิมคือให้ใช้ค่าซ้ำได้
// หลังลบ เพียงแต่ไม่ได้ไปบอกฐานข้อมูลด้วย ฟังก์ชันนี้ทำให้สองฝั่งตรงกัน
//
// ─── ทำไมไม่ทำกับ personal_qr_code และ member_code ───
//
// สองคอลัมน์นั้นเซิร์ฟเวอร์สุ่มให้เอง และตัวสุ่มใช้ Unscoped() ตรวจซ้ำอยู่แล้ว
// (ดู qrCodeTaken และ member_code.go) จึงไม่มีวันสุ่มไปชนกับคนที่ลบแล้ว
// การคง unique เต็มไว้เป็นตาข่ายชั้นสุดท้าย กันบัตร QR ใบเก่าของคนที่ลาออกไป
// ไปสแกนแล้วตรงกับสมาชิกคนใหม่ — อย่าเผลอเอามาใส่ในฟังก์ชันนี้
//
// ⚠️ ต้องเรียกหลัง AutoMigrate ทุกครั้ง (cmd/init, cmd/migrate และ newTestDB ในเทส)
// เพราะโมเดลถอดแท็ก unique ออกแล้ว ถ้าไม่เรียก จะไม่มีกติกาห้ามอีเมลซ้ำเลย
func EnsureSoftDeleteUniqueIndexes(db *gorm.DB) error {
	// ── ขั้นที่ 1: รื้อกติกาเก่าทิ้งก่อน ──
	//
	// ฐานข้อมูลที่สร้างไว้ก่อนหน้านี้ยังมี unique constraint ที่ GORM สร้างจากแท็ก
	// `gorm:"unique"` ค้างอยู่ ถ้าไม่รื้อ กติกาเก่าจะยังบังคับอยู่ต่อไป
	// และ index ตัวใหม่จะไม่มีผลอะไรเลย
	//
	// postgres ตั้งชื่อ constraint จากแท็ก unique เป็น <ตาราง>_<คอลัมน์>_key
	// ส่วนชื่อ idx_* เผื่อไว้กรณีเคยประกาศเป็น uniqueIndex มาก่อน
	//
	// รันแบบ best-effort โดยตั้งใจ — คำสั่งพวกนี้ล้มได้ตามปกติถ้าฐานข้อมูล
	// เพิ่งสร้างใหม่และยังไม่เคยมี constraint เก่าให้รื้อ
	// ถ้า return error ตรงนี้ ขั้นที่ 2 จะไม่ได้รันเลย ซึ่งอันตรายกว่ามาก
	legacy := []string{
		`DROP INDEX IF EXISTS idx_users_email`,
		`DROP INDEX IF EXISTS idx_coaches_uid`,
	}

	// ALTER TABLE ... DROP CONSTRAINT เป็นไวยากรณ์ของ postgres
	// sqlite (ที่ใช้ในเทส) ไม่รองรับ และไม่ต้องรื้ออะไรอยู่แล้วเพราะสร้างใหม่ทุกครั้ง
	// เช็ค dialect แทนที่จะยิงไปแล้วกลืน error เพื่อไม่ให้ log เต็มไปด้วยคำเตือนที่ไม่ใช่ปัญหา
	//
	// ชื่อ constraint มีได้สองแบบ ขึ้นกับว่าฐานนี้ถูกสร้างยังไง:
	//   <ตาราง>_<คอลัมน์>_key — postgres ตั้งให้เอง ตอน CREATE TABLE ที่มี UNIQUE ติดมากับคอลัมน์
	//   uni_<ตาราง>_<คอลัมน์>  — GORM ตั้งเอง ตอนเพิ่ม constraint เข้าตารางที่มีอยู่แล้ว
	// รื้อทั้งสองชื่อไปเลย ตัวที่ไม่มีอยู่ก็แค่ไม่เกิดอะไรขึ้น (IF EXISTS)
	if db.Dialector.Name() == "postgres" {
		legacy = append(legacy,
			`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key`,
			`ALTER TABLE users DROP CONSTRAINT IF EXISTS uni_users_email`,
			`ALTER TABLE coaches DROP CONSTRAINT IF EXISTS coaches_uid_key`,
			`ALTER TABLE coaches DROP CONSTRAINT IF EXISTS uni_coaches_uid`,
		)
	}

	for _, sql := range legacy {
		if err := db.Exec(sql).Error; err != nil {
			log.Printf("ข้ามการรื้อกติกาเก่า (ปกติถ้าเป็นฐานที่สร้างใหม่): %s — %v", sql, err)
		}
	}

	// ── ขั้นที่ 2: สร้างกติกาใหม่ที่มองข้ามแถวที่ถูกลบ ──
	//
	// ขั้นนี้ห้ามพลาด ถ้าล้มต้องดังให้คนเห็น ไม่งั้นระบบจะไม่มีอะไรกันอีเมลซ้ำเลย
	//
	// ถ้าคำสั่งนี้ล้มด้วย duplicate key แปลว่ามีสมาชิกที่ยังใช้งานอยู่ถืออีเมล
	// (หรือเลขบัตร) ซ้ำกันอยู่แล้วในฐาน ต้องไปแก้ข้อมูลก่อน ห้ามข้าม
	//
	// ไล่ให้ครบทุกคำสั่งก่อนแล้วค่อยคืน error ตัวแรก ไม่ใช่หยุดทันทีที่เจอ
	// เพราะในเทสบางตัว migrate แค่บางตาราง ถ้าหยุดที่ users ที่ไม่มีอยู่
	// index ของ coaches จะไม่ถูกสร้างตามไปด้วย แล้วเทสจะรันบนกติกาที่ไม่ครบ
	required := []string{
		`CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_email_active
		 ON users (email) WHERE deleted_at IS NULL`,
		`CREATE UNIQUE INDEX IF NOT EXISTS uniq_coaches_uid_active
		 ON coaches (uid) WHERE deleted_at IS NULL`,
	}
	var firstErr error
	for _, sql := range required {
		if err := db.Exec(sql).Error; err != nil && firstErr == nil {
			firstErr = err
		}
	}
	if firstErr != nil {
		return firstErr
	}

	// ── ขั้นที่ 3: ตรวจว่ารื้อของเก่าหมดจริง ──
	//
	// ขั้นที่ 1 รื้อตามรายชื่อที่เดาไว้ ถ้าฐานข้อมูลของใครมี constraint ชื่ออื่น
	// ที่คาดไม่ถึง มันจะรอดมาแล้วยังบังคับกติกาเก่าต่อไปเงียบ ๆ
	// อาการคือบั๊กเดิมกลับมาทั้งที่ migrate ผ่านฉลุย ซึ่งหาสาเหตุยากมาก
	//
	// จึงตรวจซ้ำแล้วดังให้คนเห็น พร้อมบอกชื่อที่ต้องไปรื้อ
	return verifyNoFullUniqueLeft(db)
}

// verifyNoFullUniqueLeft ตรวจว่าไม่มี unique index แบบ "ไม่มีเงื่อนไข" หลงเหลือ
// อยู่บน users.email หรือ coaches.uid
//
// เช็คที่ระดับ index ไม่ใช่ระดับ constraint เพราะ unique constraint ของ postgres
// มี index หนุนอยู่ข้างหลังเสมอ ดูที่ index จึงเจอทั้งสองแบบในคราวเดียว
// เงื่อนไข indpred IS NULL คือ "ไม่ใช่ partial index" — ตัวที่เราเพิ่งสร้างมี indpred
// จึงไม่ถูกนับ
func verifyNoFullUniqueLeft(db *gorm.DB) error {
	if db.Dialector.Name() != "postgres" {
		return nil
	}

	const q = `
		SELECT i.relname
		FROM pg_index x
		JOIN pg_class i ON i.oid = x.indexrelid
		JOIN pg_class t ON t.oid = x.indrelid
		WHERE t.relname = ?
		  AND x.indisunique
		  AND x.indpred IS NULL
		  AND pg_get_indexdef(x.indexrelid) LIKE ?`

	for _, target := range []struct{ table, column string }{
		{"users", "email"},
		{"coaches", "uid"},
	} {
		var leftovers []string
		if err := db.Raw(q, target.table, "%("+target.column+")%").
			Scan(&leftovers).Error; err != nil {
			return err
		}
		if len(leftovers) > 0 {
			return fmt.Errorf(
				"ยังมี unique index แบบไม่มีเงื่อนไขค้างอยู่บน %s.%s: %v — "+
					"ต้องรื้อทิ้งก่อน ไม่งั้นลบสมาชิกแล้วจะรับคนเดิมกลับเข้ามาใหม่ไม่ได้ "+
					"(สั่ง DROP INDEX <ชื่อ> หรือ ALTER TABLE %s DROP CONSTRAINT <ชื่อ> แล้วรัน migrate ใหม่)",
				target.table, target.column, leftovers, target.table)
		}
	}
	return nil
}
