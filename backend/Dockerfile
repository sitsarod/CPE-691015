# syntax=docker/dockerfile:1

# ---- build stage ----
FROM golang:1.26-alpine AS build
WORKDIR /src

# ดึง dependency ก่อน copy source ทั้งหมด เพื่อให้ layer นี้ถูก cache ไว้
# (จะ re-download เฉพาะตอน go.mod/go.sum เปลี่ยนเท่านั้น)
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# build เป็น static binary — sqlite (glebarez) และ pgx เป็น pure-Go จึงปิด CGO ได้
# สร้าง binary ที่ต้องใช้บ่อยไว้ทั้งหมด: serve (เซิร์ฟเวอร์หลัก), migrate, createadmin
ENV CGO_ENABLED=0 GOOS=linux
RUN go build -trimpath -ldflags="-s -w" -o /out/serve       ./cmd/serve && \
    go build -trimpath -ldflags="-s -w" -o /out/migrate     ./cmd/migrate && \
    go build -trimpath -ldflags="-s -w" -o /out/createadmin ./cmd/createadmin

# ---- runtime stage ----
FROM alpine:3.20
# ca-certificates: จำเป็นสำหรับต่อ Neon/Cloudinary/SlipOK/SMTP ผ่าน TLS
# tzdata: ให้ background job ที่อิงเวลา (auto-close, billing) ใช้ timezone ถูกต้อง
RUN apk add --no-cache ca-certificates tzdata && \
    adduser -D -u 10001 app
WORKDIR /app

COPY --from=build /out/ /app/

# uploads ถูกเขียนโดยแอป — mount เป็น volume ใน compose เพื่อเก็บถาวรข้ามการ redeploy
RUN mkdir -p /app/uploads && chown -R app:app /app

USER app
ENV PORT=8000 \
    TZ=Asia/Bangkok
EXPOSE 8000

# หมายเหตุ: godotenv จะมองหา ../../../.env ไม่เจอในคอนเทนเนอร์แล้วข้ามไป
# ให้ส่ง config ผ่าน environment variables จริง (ดู docker-compose.yml)
CMD ["/app/serve"]
