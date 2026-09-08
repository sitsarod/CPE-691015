package services

import (
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// ตัวช่วยกลางสำหรับเทสในแพ็กเกจนี้
//
// เดิมแต่ละไฟล์เทสมีฟังก์ชันสร้างฐานข้อมูลของตัวเอง (newDeleteTestDB,
// newMemberCodeTestDB, newQRTestDB, newPhotoTestDB, newSyncTestDB)
// ซึ่งเนื้อในเหมือนกันทั้งหมด ต่างแค่ว่า migrate ตารางไหน
// รวมเหลือตัวเดียวที่รับรายชื่อตารางเข้ามาแทน

// newTestDB สร้าง sqlite ในหน่วยความจำพร้อม migrate เฉพาะตารางที่เทสนั้นต้องใช้
//
// ใช้ sqlite แทน postgres จริงเพื่อให้รันเทสได้โดยไม่ต้องมีฐานข้อมูล
// และเป็น pure-Go (glebarez/sqlite) จึงไม่ต้องเปิด CGO
//
// สองบรรทัดที่ดูแปลกแต่จำเป็น:
//
//	DisableForeignKeyConstraintWhenMigrating — ไม่ให้ GORM ไล่สร้างตารางที่เกี่ยวโยงกัน
//	  ทั้งพวง เทสจะได้ migrate เฉพาะตารางที่สนใจจริง ๆ
//
//	SetMaxOpenConns(1) — sqlite แบบ :memory: ผูกกับ connection เดียว
//	  ถ้าเปิดหลาย connection แต่ละอันจะเห็นฐานข้อมูลคนละก้อน แล้วเทสจะพังแบบงง ๆ
func newTestDB(t *testing.T, tables ...any) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
		Logger:                                   logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("เปิด sqlite ไม่สำเร็จ: %v", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("ดึง *sql.DB ไม่สำเร็จ: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)

	if len(tables) > 0 {
		if err := db.AutoMigrate(tables...); err != nil {
			t.Fatalf("AutoMigrate ไม่สำเร็จ: %v", err)
		}
	}

	// สร้าง index แบบมีเงื่อนไขเหมือนที่ cmd/migrate ทำกับฐานจริง
	// เพื่อให้เทสเจอกติกาชุดเดียวกัน ไม่ใช่ผ่านในเทสแต่ไปพังตอนใช้จริง
	//
	// เงียบ ๆ ถ้าตารางที่เกี่ยวข้องไม่ได้ถูก migrate ในเทสนั้น
	_ = EnsureMemberCodeIndexes(db)

	// กติกา "ห้ามอีเมล/เลขบัตรซ้ำ เฉพาะคนที่ยังไม่ถูกลบ"
	//
	// สำคัญกับเทสเป็นพิเศษ เพราะโมเดลถอดแท็ก unique ออกไปแล้ว ถ้าไม่เรียกตรงนี้
	// เทสจะรันบนฐานที่ไม่มีกติกาอะไรเลย แล้วเทสที่ควรจับอีเมลซ้ำได้จะผ่านหมด
	_ = EnsureSoftDeleteUniqueIndexes(db)

	return db
}
