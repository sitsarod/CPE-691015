package middlewares

import (
    "fmt"
    "net/http"
    "os"
    "strings"

    "github.com/gin-gonic/gin"
    "github.com/golang-jwt/jwt/v5"
)

// CORSMiddleware handles Cross-Origin Resource Sharing (CORS) configurations.
func CORSMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        origin := c.Request.Header.Get("Origin")
        if origin != "" {
            c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
        } else {
            c.Writer.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
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

func getJWTSecret() []byte {
    secret := os.Getenv("JWT_SECRET")
    if secret == "" {
        panic("JWT_SECRET is not set in .env file. Please check your environment variables.")
    }
    return []byte(secret)
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

        tokenString := parts[1]

        token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
            if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
                return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
            }
            return getJWTSecret(), nil
        })

        if err != nil || !token.Valid {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "ตั๋วหมดอายุหรือไม่มีสิทธิ์ใช้งาน (Invalid or Expired Token)"})
            c.Abort()
            return
        }

        claims, ok := token.Claims.(jwt.MapClaims)
        if ok && token.Valid {
            userID := claims["user_id"]
            role := claims["role"]

            c.Set("userID", userID)
            c.Set("role", role)
        }

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