package midlewares

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// CORSMiddleware handles Cross-Origin Resource Sharing (CORS) configurations.
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Allow requests dynamically from incoming origins
		origin := c.Request.Header.Get("Origin")
		if origin != "" {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			c.Writer.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		}
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

		// 🟢 ปรับแก้ท่อนดักคำขอ OPTIONS (Preflight) ตรงนี้คัป
		if c.Request.Method == "OPTIONS" {
			// บังคับคืนสถานะ 200 OK หรือ 204 NoContent คู่ไปกับการส่งก้อน Header อนุมัติด้านบนกลับไปให้เบราว์เซอร์
			c.JSON(http.StatusOK, gin.H{"message": "CORS OK"}) 
			c.Abort()
			return
		}

		c.Next()
	}
}

// ใช้ Key ลับตัวเดียวกับที่เธอตั้งไว้ใน AuthService เป๊ะๆ น้า
var jwtSecret = []byte("my_super_secret_key_1234")

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. ดึงค่าจาก Header ที่ชื่อว่า Authorization
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบก่อนใช้งาน (Missing Token)"})
			c.Abort() // สั่งบล็อก ดีด request นี้ตกเก้าอี้ทันที ห้ามวิ่งไปต่อข้างใน
			return
		}

		// 2. แตกข้อความเพื่อเอาเฉพาะตัว Token (ปกติฟอร์แมตจะเป็น "Bearer <TOKEN>")
		parts := strings.SplitN(authHeader, " ", 2)
		if !(len(parts) == 2 && parts[0] == "Bearer") {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "รูปแบบ Token ไม่ถูกต้อง (Invalid Format)"})
			c.Abort()
			return
		}

		tokenString := parts[1]

		// 3. สั่งถอดรหัสลับและตรวจสอบความถูกต้องของ Token
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			// ตรวจสอบเช็กท่าการเข้ารหัส (Signing Method) ว่าเป็น HS256 ไหม
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return jwtSecret, nil
		})

		// ถ้าตั๋วปลอม หรือตั๋วหมดอายุ มันจะพังตรงนี้คัป
		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "ตั๋วหมดอายุหรือไม่มีสิทธิ์ใช้งาน (Invalid or Expired Token)"})
			c.Abort()
			return
		}

		// 4. ถ้าตั๋วผ่านฉลุย ดึงข้อมูลข้างใน (Claims) ออกมาแชร์ต่อให้ API วงในใช้
		claims, ok := token.Claims.(jwt.MapClaims)
		if ok && token.Valid {
			// ดึง user_id และ role ที่เราฝังไว้ตอนล็อกอินออกมา
			userID := claims["user_id"]
			role := claims["role"]

			// แปะฝากไว้ในก้อน Context ของ Gin เผื่อฟังก์ชันข้างในอยากรู้ว่า "ใครเป็นคนยิงมา"
			c.Set("userID", userID)
			c.Set("role", role)
		}

		c.Next() // ปล่อยผ่านประตู วิ่งเข้าฟังก์ชัน API ชั้นในตามปกติคัป!
	}
}
