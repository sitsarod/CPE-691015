package middlewares

import (
    "net/http"
    "os"
    "strings"

    "CPE-691015/internal/token"

    "github.com/gin-gonic/gin"
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

func AuthMiddleware() gin.HandlerFunc {
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