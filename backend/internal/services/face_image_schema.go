package services

import (
	"gorm.io/gorm"
)

// งานระดับสคีมาของ face_images ที่ประกาศผ่านแท็ก GORM ไม่ได้
// เป็นคำสั่งเฉพาะ postgres จึงเรียกจาก cmd/migrate และ cmd/init เท่านั้น
// (ไม่เรียกใน newTestDB ที่ใช้ sqlite) — รูปแบบเดียวกับ EnsureMemberCodeIndexes

// EnableVectorExtension เปิด pgvector
//
// ⚠️ ต้องเรียกก่อน AutoMigrate เสมอ ไม่งั้นสร้างคอลัมน์ vector(512) ไม่ได้
func EnableVectorExtension(db *gorm.DB) error {
	return db.Exec("CREATE EXTENSION IF NOT EXISTS vector").Error
}

// EnsureFaceImageIndexes สร้าง hnsw index — เรียกหลัง AutoMigrate
//
// ใช้ vector_cosine_ops ให้ตรงกับตัวดำเนินการที่ query จะใช้ (<=>)
// ถ้าเลือกไม่ตรง postgres จะไม่หยิบ index ไปใช้เลย
func EnsureFaceImageIndexes(db *gorm.DB) error {
	return db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_face_images_embedding
		ON face_images USING hnsw (embedding vector_cosine_ops)
	`).Error
}
