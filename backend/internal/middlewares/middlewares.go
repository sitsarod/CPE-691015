package middlewares

import (
    "net/http"
    "os"
    "strings"

    "CPE-691015/internal/models"
    "CPE-691015/internal/token"

    "github.com/gin-gonic/gin"
    "gorm.io/gorm"
)

// defaultAllowedOrigins คือค่าที่ใช้เมื่อไม่ได้ตั้ง ALLOWED_ORIGINS ใน .env
//
// ตั้งเป็น localhost ของ Next.js เพื่อให้ทีมรันบนเครื่องตัวเองได้เลยโดยไม่ต้องตั้งค่าอะไร
// แต่ตอนขึ้นใช้งานจริง "ต้อง" ตั้ง ALLOWED_ORIGINS เป็นโดเมนจริงเสมอ
var defaultAllowedOrigins = []string{"http://localhost:3000"}

// allowedOrigins อ่านรายชื่อโดเมนที่อนุญาตจาก env (คั่นด้วยจุลภาค)
//
//	ALLOWED_ORIGINS=https://academy.example.com,https://admin.academy.example.com
func allowedOrigins() []string {
    raw := strings.TrimSpace(os.Getenv("ALLOWED_ORIGINS"))
    if raw == "" {
        return defaultAllowedOrigins
    }

    var list []string
    for _, o := range strings.Split(raw, ",") {
        if o = strings.TrimSpace(o); o != "" {
            list = append(list, o)
        }
    }
    if len(list) == 0 {
        return defaultAllowedOrigins
    }
    return list
}

// CORSMiddleware handles Cross-Origin Resource Sharing (CORS) configurations.
//
// ⚠️ ห้ามกลับไปสะท้อน Origin ที่ client ส่งมาแบบเดิมเด็ดขาด
//
// โค้ดเดิมเขียนว่า Set("Access-Control-Allow-Origin", origin) ซึ่งแปลว่า
// "เว็บไหนก็ได้ในโลก" คู่กับ Allow-Credentials: true ที่บอกว่า
// "ส่ง cookie/credential มาด้วยได้" — สองอย่างนี้รวมกันคือการอนุญาตให้
// เว็บของใครก็ได้ยิง API แทนผู้ใช้ที่ล็อกอินอยู่
//
// ตอนนี้ token อยู่ใน Authorization header จึงยังไม่โดนเต็ม ๆ
// แต่วันที่ย้าย token ไปเก็บใน HttpOnly cookie (ซึ่งควรย้าย) จะกลายเป็น
// ช่องโหว่ทันทีโดยไม่มีใครทันสังเกต จึงปิดตั้งแต่ตอนนี้
func CORSMiddleware() gin.HandlerFunc {
    origins := allowedOrigins()

    return func(c *gin.Context) {
        origin := c.Request.Header.Get("Origin")

        // ตอบ Allow-Origin เฉพาะเมื่อ origin อยู่ใน allowlist เท่านั้น
        // ถ้าไม่อยู่ก็ไม่ต้องใส่ header นี้เลย เบราว์เซอร์จะบล็อกให้เอง
        for _, allowed := range origins {
            if origin == allowed {
                c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
                // บอก cache/proxy ว่า response ต่างกันตาม Origin
                // ไม่งั้น proxy อาจเอา response ของโดเมนหนึ่งไปให้อีกโดเมน
                c.Writer.Header().Set("Vary", "Origin")
                break
            }
        }

        c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
        c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
        c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

        if c.Request.Method == "OPTIONS" {
            c.JSON(http.StatusOK, gin.H{"message": "CORS OK"}) 
            c.Abort()
            return
        }

        c.Next()
    }
}

// AuthMiddleware ตรวจว่า token ใช้ได้จริงก่อนปล่อยเข้า API
//
// ─── ทำไมต้องรับ db เข้ามา ───
//
// JWT ตรวจสอบด้วยลายเซ็นอย่างเดียว เซิร์ฟเวอร์จึงไม่รู้ว่าออก token ใบไหน
// ไปแล้วบ้าง และยกเลิกใบใดใบหนึ่งไม่ได้ ผลคือคนที่ขโมยบัญชีไปยังใช้ token
// เดิมได้ต่อ แม้เจ้าของจะรีบเปลี่ยนรหัสผ่านแล้วก็ตาม
//
// การเทียบเลขรุ่นกับฐานข้อมูลทุก request จึงเป็นจุดเดียวที่ทำให้ "เปลี่ยน
// รหัสผ่านแล้วเตะทุก session ออก" เกิดขึ้นได้จริง
//
// ⚠️ ต้นทุน: เพิ่มการอ่านฐานข้อมูล 1 ครั้งต่อ 1 request
//
// เป็นการค้นด้วย primary key และดึงมาคอลัมน์เดียว จึงเบาที่สุดเท่าที่การค้น
// จะเป็นได้ แต่ฐานของเราอยู่บน Neon ซึ่งวิ่งผ่านเน็ต จึงบวกเวลาต่อ request จริง
// ถ้าวันหนึ่งช้าจนสังเกตได้ ให้ทำแคชในหน่วยความจำคั่นไว้ (userID → เลขรุ่น
// อายุสั้น ๆ) อย่าแก้ด้วยการเลิกตรวจ เพราะจะเปิดช่องโหว่กลับมา
func AuthMiddleware(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        authHeader := c.GetHeader("Authorization")
        if authHeader == "" {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบก่อนใช้งาน (Missing Token)"})
            c.Abort()
            return
        }

        parts := strings.SplitN(authHeader, " ", 2)
        if !(len(parts) == 2 && parts[0] == "Bearer") {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "รูปแบบ Token ไม่ถูกต้อง (Invalid Format)"})
            c.Abort()
            return
        }

        claims, err := token.Parse(parts[1])
        if err != nil {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "ตั๋วหมดอายุหรือไม่มีสิทธิ์ใช้งาน (Invalid or Expired Token)"})
            c.Abort()
            return
        }

        // ต้องเป็น access token เท่านั้น กันไม่ให้ refresh token ถูกนำมาเข้าถึง API โดยตรง
        if t, _ := claims["type"].(string); t != token.TypeAccess {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "ต้องใช้ access token เท่านั้น (Invalid Token Type)"})
            c.Abort()
            return
        }

        // เทียบเลขรุ่นกับฐานข้อมูล — ด่านที่ทำให้ยกเลิก token ได้จริง
        //
        // ถ้าเจ้าของบัญชีเปลี่ยนรหัสผ่านไปแล้ว เลขในฐานจะเดินหน้าไปกว่าเลขที่
        // ติดมากับ token ใบนี้ แปลว่าใบนี้ออกก่อนการเปลี่ยนรหัส จึงต้องปฏิเสธ
        userID, err := token.UserID(claims)
        if err != nil {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Token ไม่ถูกต้อง (Invalid Token)"})
            c.Abort()
            return
        }

        // ⚠️ ต้องเช็ค RowsAffected ด้วย ห้ามดูแค่ err
        //
        // Scan ไม่ถือว่า "ไม่เจอแถว" เป็นความผิดพลาด มันคืน err เป็น nil
        // แล้วปล่อยให้ตัวแปรเป็นค่าศูนย์ ผลคือบัญชีที่ถูกลบไปแล้วจะได้
        // TokenVersion = 0 ซึ่งบังเอิญตรงกับ token ของคนที่ไม่เคยเปลี่ยนรหัสผ่าน
        // แล้วผ่านด่านนี้ไปได้ทั้งที่ไม่มีบัญชีอยู่จริง
        var current struct{ TokenVersion int }
        result := db.Model(&models.User{}).
            Select("token_version").
            Where("id = ?", userID).
            Scan(&current)

        // เช็ค error ก่อน RowsAffected เพราะตอนฐานล่ม RowsAffected ก็เป็น 0 เหมือนกัน
        // ถ้าสลับลำดับ ปัญหาการเชื่อมต่อจะถูกรายงานว่า "ไม่พบบัญชีผู้ใช้"
        if result.Error != nil {
            // ⚠️ อ่านฐานไม่ได้ต้องปฏิเสธ ห้ามปล่อยผ่าน
            //
            // ถ้าเลือกปล่อยผ่านตอนฐานล่ม ด่านนี้จะกลายเป็นด่านที่ปิดได้ด้วยการ
            // ทำให้ฐานล่ม ซึ่งเท่ากับไม่มีด่านเลย
            c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่สามารถตรวจสอบสถานะบัญชีได้ กรุณาเข้าสู่ระบบใหม่"})
            c.Abort()
            return
        }

        // ไม่เจอแถว = บัญชีถูกลบไปแล้ว (soft delete ก็นับ เพราะ GORM กรอง deleted_at ให้)
        if result.RowsAffected == 0 {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบบัญชีผู้ใช้ กรุณาเข้าสู่ระบบใหม่"})
            c.Abort()
            return
        }

        if token.Version(claims) != current.TokenVersion {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "รหัสผ่านถูกเปลี่ยนแล้ว กรุณาเข้าสู่ระบบใหม่"})
            c.Abort()
            return
        }

        c.Set("userID", claims["user_id"])
        c.Set("role", claims["role"])

        c.Next()
    }
}

// RequireRole checks if the user's role matches any of the allowed roles.
func RequireRole(allowedRoles ...string) gin.HandlerFunc {
    return func(c *gin.Context) {
        roleVal, exists := c.Get("role")
        if !exists {
            c.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์เข้าถึง (No role found)"})
            c.Abort()
            return
        }

        role, ok := roleVal.(string)
        if !ok {
            c.JSON(http.StatusForbidden, gin.H{"error": "ข้อมูลสิทธิ์ไม่ถูกต้อง (Invalid role type)"})
            c.Abort()
            return
        }

        for _, allowed := range allowedRoles {
            if role == allowed {
                c.Next()
                return
            }
        }

        c.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้ (Forbidden)"})
        c.Abort()
    }
}