"""
face-service — รับรูป คืน embedding

ขอบเขตแคบโดยตั้งใจ: ไม่ต่อฐานข้อมูล ไม่เก็บไฟล์ ไม่รู้จักนักเรียน stateless ทั้งหมด
ตรรกะธุรกิจทั้งหมด (ใครผ่าน ใครไม่ผ่าน เก็บอะไรลงตาราง) อยู่ที่ Go ที่เดียว
เพื่อให้ service นี้ล่มแล้วระบบเช็คชื่อด้วย QR ยังทำงานได้ปกติ
"""

import base64
import binascii
import hmac
import logging
import os

import cv2
import insightface
import numpy as np
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

log = logging.getLogger("face-service")
logging.basicConfig(level=logging.INFO)

# ต้องมี secret เสมอ — ล้มตั้งแต่ตอนบูตดีกว่าเปิดรับ request โดยไม่มีการยืนยันตัวตน
SHARED_SECRET = os.environ["FACE_SERVICE_SECRET"]

# เพดานขนาด base64 ที่ยอมรับ กัน request ใหญ่ ๆ มากินหน่วยความจำ
# ฝั่งเบราว์เซอร์ย่อด้านยาวเหลือ 640px แล้ว รูปจริงจึงไม่เกินหลักร้อย KB
MAX_IMAGE_B64_BYTES = 8 * 1024 * 1024

# ชื่อโมเดลถูกส่งกลับไปเก็บทุกแถวใน face_images เพราะ embedding ข้ามโมเดลเทียบกันไม่ได้
MODEL_NAME = os.getenv("FACE_MODEL_NAME", "buffalo_l")

# ⚠️ insightface ไม่อ่าน env var ใด ๆ — hardcode ~/.insightface ไว้เป็นค่าดีฟอลต์
# ต้องส่งผ่านพารามิเตอร์ root= เท่านั้น ไม่งั้นตอนรันในคอนเทนเนอร์จะไปหาโมเดล
# ผิดที่แล้วโหลดใหม่ทั้ง 330MB ทุกครั้งที่บูต
MODEL_ROOT = os.getenv("FACE_MODEL_ROOT", "~/.insightface")

app = FastAPI(title="face-service", docs_url=None, redoc_url=None)

# โหลดตอนบูตครั้งเดียว — โหลดต่อ request จะช้ามากและกินหน่วยความจำซ้ำซ้อน
# ctx_id=-1 = CPU (พอสำหรับ 10–20 คนต่อคาบ ไม่ต้องใช้ GPU)
#
# allowed_modules เอาเฉพาะที่ใช้จริง: detection ให้ bbox+det_score, recognition ให้ embedding
# ตัด landmark_3d_68 (143MB) กับ genderage ออก ประหยัด RAM และเวลาบูต
model = insightface.app.FaceAnalysis(
    name=MODEL_NAME,
    root=MODEL_ROOT,
    allowed_modules=["detection", "recognition"],
)
model.prepare(ctx_id=-1, det_size=(640, 640))
log.info("โหลดโมเดล %s จาก %s เรียบร้อย", MODEL_NAME, MODEL_ROOT)


class EmbedRequest(BaseModel):
    image: str  # base64 ล้วน ไม่มี data URL prefix


class EmbedResponse(BaseModel):
    found: bool
    face_count: int
    embedding: list[float] | None  # 512 มิติ normalize มาแล้ว
    quality: float
    bbox: list[float] | None
    model: str


class DetectedFace(BaseModel):
    embedding: list[float]  # 512 มิติ normalize มาแล้ว
    quality: float
    bbox: list[float]


class EmbedAllResponse(BaseModel):
    face_count: int
    faces: list[DetectedFace]
    model: str


def require_service_key(key: str | None) -> None:
    # compare_digest กันการเดา secret ทีละตัวอักษรจากเวลาที่ใช้ตอบ
    if not key or not hmac.compare_digest(key, SHARED_SECRET):
        raise HTTPException(status_code=401, detail="unauthorized")


def decode_request_image(req: EmbedRequest, key: str | None):
    """ตรวจ key + ขนาด + ถอด base64 เป็นภาพ — ใช้ร่วมกันทั้ง /embed และ /embed-all"""
    require_service_key(key)

    if len(req.image) > MAX_IMAGE_B64_BYTES:
        raise HTTPException(status_code=413, detail="image too large")

    try:
        raw = base64.b64decode(req.image, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="invalid base64")

    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="decode failed")
    return img


@app.get("/health")
def health() -> dict:
    """ให้ Railway และฝั่ง Go เช็คได้ว่าโมเดลพร้อมแล้วจริง ไม่ใช่แค่พอร์ตเปิด"""
    return {"status": "ok", "model": MODEL_NAME}


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest, x_service_key: str | None = Header(default=None)) -> EmbedResponse:
    img = decode_request_image(req, x_service_key)

    faces = model.get(img)
    if not faces:
        return EmbedResponse(
            found=False, face_count=0, embedding=None, quality=0.0, bbox=None, model=MODEL_NAME
        )

    # เลือกใบหน้าที่ใหญ่ที่สุด = คนที่ยืนใกล้กล้องที่สุด
    #
    # ยังคืน face_count จริงไปด้วย เพราะฝั่ง Go เป็นคนตัดสินว่า "มีหลายคนในรูป"
    # ควรปฏิเสธไหม — service นี้ไม่ตัดสินใจเชิงนโยบายเอง
    face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))

    return EmbedResponse(
        found=True,
        face_count=len(faces),
        # normed_embedding normalize มาแล้ว → dot product = cosine similarity ได้ตรง ๆ
        embedding=face.normed_embedding.tolist(),
        quality=float(face.det_score),
        bbox=face.bbox.tolist(),
        model=MODEL_NAME,
    )


@app.post("/embed-all", response_model=EmbedAllResponse)
def embed_all(req: EmbedRequest, x_service_key: str | None = Header(default=None)) -> EmbedAllResponse:
    """คืน embedding ของ "ทุกใบหน้า" ในรูป — ใช้ตอนแท็กนักเรียนในรูปหมู่ที่มีหลายคน

    ต่างจาก /embed ที่คืนแค่ใบหน้าที่ใหญ่ที่สุดใบเดียว (ออกแบบมาสำหรับเช็คชื่อทีละคน
    ที่ต้องยืนยันตัวตนคนเดียวต่อการสแกนหนึ่งครั้ง)

    ยังไม่ตัดสินอะไรทั้งสิ้นเหมือนเดิม — คืนคุณภาพของแต่ละหน้าไปให้ Go กรองเอง
    """
    img = decode_request_image(req, x_service_key)

    faces = model.get(img)
    return EmbedAllResponse(
        face_count=len(faces),
        faces=[
            DetectedFace(
                embedding=f.normed_embedding.tolist(),
                quality=float(f.det_score),
                bbox=f.bbox.tolist(),
            )
            for f in faces
        ],
        model=MODEL_NAME,
    )
