# face-service

แปลงรูปใบหน้าเป็น embedding 512 มิติ ให้ backend Go เอาไปเทียบตอนเช็คชื่อ

**stateless ทั้งหมด** — ไม่ต่อฐานข้อมูล ไม่เก็บไฟล์ ไม่รู้จักนักเรียน
ตรรกะธุรกิจอยู่ที่ Go ที่เดียว เพื่อให้ service นี้ล่มแล้วเช็คชื่อด้วย QR ยังทำงานปกติ

## API

| Method | Path | หมายเหตุ |
|---|---|---|
| `GET` | `/health` | บอกว่าโมเดลโหลดเสร็จแล้ว ไม่ใช่แค่พอร์ตเปิด |
| `POST` | `/embed` | ใบหน้าที่ใหญ่ที่สุดใบเดียว (เช็คชื่อ) · ต้องมี header `X-Service-Key` |
| `POST` | `/embed-all` | ทุกใบหน้าในรูป (แท็กนักเรียนในรูปหมู่) · ต้องมี header `X-Service-Key` |
| `POST` | `/embed-all-video` | เหมือน `/embed-all` แต่รับวิดีโอ — สุ่มตรวจสูงสุด 8 เฟรม รวมผลเป็นลิสต์เดียว · ต้องมี header `X-Service-Key` |

```jsonc
// POST /embed
{ "image": "<base64 ล้วน ไม่มี data URL prefix>" }

// 200
{
  "found": true,
  "face_count": 1,          // Go เป็นคนตัดสินว่ามีหลายคนแล้วปฏิเสธไหม
  "embedding": [/* 512 ตัว normalize แล้ว */],
  "quality": 0.87,          // det_score
  "bbox": [x1, y1, x2, y2],
  "model": "buffalo_l"      // เก็บลงทุกแถว เพราะ embedding ข้ามโมเดลเทียบกันไม่ได้
}
```

```jsonc
// POST /embed-all — body เหมือน /embed ทุกอย่าง
// 200
{
  "face_count": 3,
  "faces": [                // เรียงตามที่โมเดลเจอ ไม่ได้เรียงตามคุณภาพ
    { "embedding": [/* 512 ตัว */], "quality": 0.91, "bbox": [x1, y1, x2, y2] }
  ],
  "model": "buffalo_l"
}
```
```jsonc
// POST /embed-all-video — body { "image": "<base64 ของไฟล์วิดีโอ>" } (ชื่อฟิลด์เหมือนเดิม
// แม้เนื้อจะเป็นวิดีโอ ให้ struct request ใช้ร่วมกันได้) รูปแบบผลลัพธ์เหมือน /embed-all ทุกอย่าง
{
  "face_count": 5,          // นับรวมทุกเฟรมที่สุ่มตรวจ — คนเดิมโผล่หลายเฟรมนับซ้ำได้ ไม่ใช่จำนวนคนจริง
  "faces": [ /* เหมือน /embed-all */ ],
  "model": "buffalo_l"
}
```

รูปที่ไม่มีใบหน้าเลยตอบ 200 พร้อม `face_count: 0` และ `faces: []` (ไม่ใช่ error)

รหัสตอบกลับอื่น: `401` key ผิด · `413` รูป/วิดีโอใหญ่เกินเพดาน (8 MB สำหรับรูป, ~280 MB สำหรับวิดีโอ) หรือวิดีโอยาวเกิน 5 นาที (`MAX_VIDEO_DURATION_SECONDS`) · `400` base64/ไฟล์เสีย

วิดีโอที่ยาวเกิน 5 นาทีจะไม่ถูกจำแนกให้ (413) — ฝั่ง Go ถือเป็นความล้มเหลวแบบ best-effort เหมือน
ตอน face-service ล่ม โค้ชยังอัปโหลด/เก็บ/แท็กเองได้ตามปกติ แค่ไม่มีข้อเสนอจาก AI ให้เท่านั้น

## ตัวแปรที่ต้องตั้ง

| ตัวแปร | จำเป็น | หมายเหตุ |
|---|---|---|
| `FACE_SERVICE_SECRET` | ✅ | ไม่มีแล้ว service จะไม่บูตเลยโดยตั้งใจ · ต้องตรงกับฝั่ง Go |
| `PORT` | | ดีฟอลต์ 8080 (Railway ส่งมาให้เอง) |
| `FACE_MODEL_NAME` | | ดีฟอลต์ `buffalo_l` |

สร้าง secret: `openssl rand -hex 32`

## รันในเครื่อง

```bash
docker compose build face-service
docker compose up -d face-service
```
compose ไม่ map port ออกมาโดยตั้งใจ — เรียกได้จาก network ภายในเท่านั้น
ทดสอบผ่าน backend หรือ `docker compose exec face-service ...`

## Deploy บน Railway

เป็น **service ที่ 2 ในโปรเจกต์เดียวกัน** กับ backend Go (ไม่ใช่ Vercel — serverless
ไม่เหมาะกับโปรเซสยืนระยะที่ต้องโหลดโมเดลค้างไว้)

**สร้าง service**
1. ในโปรเจกต์ Railway เดิม → **New → GitHub Repo** → เลือก repo เดียวกัน
2. **Settings → Root Directory = `face-service`** ← สำคัญ ไม่งั้นมันจะไป build backend
3. Builder ต้องเป็น **Dockerfile** (Railway ตรวจเจอเองจาก root directory)
   ไม่ใช้ Nixpacks เพราะ `insightface` ต้องคอมไพล์ และโมเดลถูกฝังลงอิมเมจตอน build
4. **Settings → Networking → อย่ากด Generate Domain** ปล่อยให้ไม่มีโดเมนสาธารณะ
5. Healthcheck path ตั้งเป็น `/health`

**ตัวแปรของ face-service**
```
FACE_SERVICE_SECRET = <ค่าสุ่ม>
PORT                = 8080
```

**ตัวแปรที่ต้องเพิ่มให้ backend**
```
FACE_SERVICE_SECRET = <ค่าเดียวกันเป๊ะ>
FACE_SERVICE_URL    = http://<ชื่อ-service>.railway.internal:8080
```
แล้ว redeploy backend

> ⚠️ **private network ของ Railway เป็น IPv6 เท่านั้น** คอนเทนเนอร์จึง bind `::`
> ถ้า bind `0.0.0.0` (IPv4 อย่างเดียว) backend จะเรียกผ่าน `.railway.internal` ไม่เจอ
> — ปรับได้ผ่านตัวแปร `HOST` ถ้าจำเป็น
>
> ความปลอดภัยมาจาก "ไม่มีโดเมนสาธารณะ" + `X-Service-Key` ไม่ใช่จากที่อยู่ที่ bind

**build ครั้งแรกนาน 10–20 นาที** (คอมไพล์ insightface + โหลดโมเดล 330MB ลงอิมเมจ)

## 🔴 ข้อจำกัดลิขสิทธิ์ของโมเดล

| ส่วน | License |
|---|---|
| โค้ด InsightFace | MIT — ใช้เชิงพาณิชย์ได้ |
| **โมเดลสำเร็จรูป `buffalo_l`** | **non-commercial research purposes only** |

โปรเจกต์นี้ยอมรับข้อจำกัดนี้ในขอบเขต capstone **ถ้าจะเปิดใช้เชิงพาณิชย์จริงต้อง
เปลี่ยนโมเดลหรือซื้อ license ก่อน** — และต้องเขียนข้อจำกัดนี้ไว้ในรายงาน capstone ด้วย

ฝั่ง Go ออกแบบเป็น interface `FaceEngine` ไว้แล้วเพื่อให้สลับโมเดลได้โดยไม่ต้องรื้อ
