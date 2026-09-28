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
import tempfile

import cv2
import insightface
import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

log = logging.getLogger("face-service")
logging.basicConfig(level=logging.INFO)

# ต้องมี secret เสมอ — ล้มตั้งแต่ตอนบูตดีกว่าเปิดรับ request โดยไม่มีการยืนยันตัวตน
SHARED_SECRET = os.environ["FACE_SERVICE_SECRET"]

# เพดานขนาด base64 ที่ยอมรับ กัน request ใหญ่ ๆ มากินหน่วยความจำ
# ฝั่งเบราว์เซอร์ย่อด้านยาวเหลือ 640px แล้ว รูปจริงจึงไม่เกินหลักร้อย KB
MAX_IMAGE_B64_BYTES = 8 * 1024 * 1024

# วิดีโอฝึกซ้อมของโค้ชหนักได้ถึง 200MB (MaxVideoUploadBytes ฝั่ง Go) — base64 พองขึ้น ~1.33 เท่า
# เผื่อ overhead ของ JSON/HTTP ด้วยอีกนิด
MAX_VIDEO_B64_BYTES = 280 * 1024 * 1024

# จำนวนเฟรมสูงสุดที่จะสุ่มมาตรวจต่อวิดีโอหนึ่งคลิป — วิดีโออาจยาวหลายนาทีที่เฟรมเรตสูง
# ตรวจทุกเฟรมจะช้าเกินไปมาก (โมเดลรันบน CPU) สุ่มเป็นระยะพอเพื่อจับภาพรวมว่าใครอยู่ในคลิปบ้าง
#
# ⚠️ ยิ่งค่านี้น้อย ยิ่งมีโอกาสพลาดคนที่โผล่มาสั้น ๆ ระหว่างช่วงที่ไม่ได้สุ่มตรวจ (เข้ามาแล้วออกไป
# ก่อนถึงเฟรมถัดไปที่สุ่ม) เป็น trade-off ความไวกับความครบถ้วนที่ปรับได้ตรงนี้ค่าเดียว
#
# ยิ่งเยอะยิ่งมีโอกาสสุ่มโดนจังหวะหน้าชัด/นิ่ง (bestMatch ฝั่ง Go เก็บคะแนนดีที่สุดต่อคนอยู่แล้ว
# เพิ่มเฟรมมีแต่ทำให้คะแนนเท่าเดิมหรือดีขึ้น ไม่มีทางแย่ลง) แต่แลกกับเวลาประมวลผลต่อคลิป — 32 ยังปลอดภัย
# จาก faceEngineVideoTimeout (90 วิ ฝั่ง Go) ตามที่ประเมินไว้ ถ้าจะเพิ่มกว่านี้ต้องวัดเวลาจริงก่อน
MAX_VIDEO_SAMPLE_FRAMES = 32

# เพดานความยาววิดีโอที่จะ "จำแนกให้" — ยาวเกินนี้ข้ามการจำแนกไปเฉย ๆ (แต่โค้ชยังอัปโหลด/เก็บ/แท็ก
# เองได้ปกติ เหมือนตอน face-service ล่ม) ฟีเจอร์นี้ออกแบบมาสำหรับคลิปสั้น ๆ ที่โพสต์แล้วลบทิ้งเองใน
# 7 วัน ไม่ใช่บันทึกการซ้อมเต็มคาบ — ยิ่งคลิปสั้น ยิ่งได้เฟรมสุ่มถี่ขึ้นด้วย (ดู MAX_VIDEO_SAMPLE_FRAMES)
MAX_VIDEO_DURATION_SECONDS = 8 * 60

# ชื่อโมเดลถูกส่งกลับไปเก็บทุกแถวใน face_images เพราะ embedding ข้ามโมเดลเทียบกันไม่ได้
MODEL_NAME = os.getenv("FACE_MODEL_NAME", "buffalo_l")

# ⚠️ insightface ไม่อ่าน env var ใด ๆ — hardcode ~/.insightface ไว้เป็นค่าดีฟอลต์
# ต้องส่งผ่านพารามิเตอร์ root= เท่านั้น ไม่งั้นตอนรันในคอนเทนเนอร์จะไปหาโมเดล
# ผิดที่แล้วโหลดใหม่ทั้ง 330MB ทุกครั้งที่บูต
MODEL_ROOT = os.getenv("FACE_MODEL_ROOT", "~/.insightface")

app = FastAPI(title="face-service", docs_url=None, redoc_url=None)


def cpu_budget() -> int:
    """จำนวน thread ที่ควรให้ onnxruntime ใช้ต่อ inference — ตั้งให้พอดีกับ vCPU ที่ container ได้จริง

    ⚠️ onnxruntime (1.20 ไม่ได้ build มากับ OpenMP) ตั้ง intra_op_num_threads ดีฟอลต์ตาม "จำนวน
    core ของเครื่อง host" ไม่ใช่โควตา CPU ที่ container ได้จริง บน Railway/K8s ที่ได้ CPU แค่เศษเสี้ยว
    (เช่น host 32 core แต่ได้จริง 1–2 vCPU) มันจะ spawn thread เกินจำนวน CPU จริงมหาศาล → thread
    แย่ง CPU กันเอง (oversubscription) สลับ context ไปมาจน inference ช้าลงกว่าใช้ thread น้อย ๆ ซะอีก
    นี่คือสาเหตุที่ "ช้าบน Railway แต่ไม่ช้าบนเครื่องตัวเอง" ที่พบบ่อยที่สุด

    ตั้งผ่าน ORT_NUM_THREADS ได้ตรง ๆ (แนะนำ = จำนวน vCPU ที่ซื้อ) ถ้าไม่ตั้ง จะพยายามอ่านโควตา
    จริงจาก cgroup v2 ก่อน (Railway/Docker/K8s สมัยใหม่ใช้ cgroup v2) แล้วค่อย fallback เป็น 2
    """
    env = os.getenv("ORT_NUM_THREADS")
    if env:
        return max(1, int(env))

    # cgroup v2: /sys/fs/cgroup/cpu.max = "<quota> <period>" (quota เป็น "max" = ไม่จำกัด)
    # โควตา CPU จริง = quota / period (เช่น "150000 100000" = 1.5 vCPU)
    try:
        with open("/sys/fs/cgroup/cpu.max") as f:
            quota_s, period_s = f.read().split()
        if quota_s != "max":
            cpus = int(quota_s) / int(period_s)
            if cpus >= 1:
                return max(1, round(cpus))
    except (OSError, ValueError):
        pass

    return 2


THREADS = cpu_budget()

# ตั้ง intra_op = โควตา CPU จริง, inter_op = 1 (execution mode เป็น sequential อยู่แล้ว ไม่ต้องมี
# thread รันหลาย op พร้อมกัน) ลด thread รวมให้ไม่เกิน CPU ที่มี → เลี่ยง oversubscription
sess_options = ort.SessionOptions()
sess_options.intra_op_num_threads = THREADS
sess_options.inter_op_num_threads = 1

# โหลดตอนบูตครั้งเดียว — โหลดต่อ request จะช้ามากและกินหน่วยความจำซ้ำซ้อน
# ctx_id=-1 = CPU (พอสำหรับ 10–20 คนต่อคาบ ไม่ต้องใช้ GPU)
#
# allowed_modules เอาเฉพาะที่ใช้จริง: detection ให้ bbox+det_score, recognition ให้ embedding
# ตัด landmark_3d_68 (143MB) กับ genderage ออก ประหยัด RAM และเวลาบูต
model = insightface.app.FaceAnalysis(
    name=MODEL_NAME,
    root=MODEL_ROOT,
    allowed_modules=["detection", "recognition"],
    providers=["CPUExecutionProvider"],
)

# ⚠️ insightface 0.7.3 ไม่มีทางส่ง SessionOptions ผ่าน constructor (get_model ภายในรับแค่
# providers/provider_options แล้วโยนทิ้ง sess_options) จึงต้องสร้าง InferenceSession ใหม่ทับ
# session ของแต่ละ sub-model เอง — intra_op_num_threads ตั้งได้ "ตอนสร้าง session เท่านั้น"
# แก้ทีหลังไม่ได้ ทำ "ก่อน" prepare() ปลอดภัยสุด (input/output name ไม่เปลี่ยน sub-model จึงเรียก
# session ใหม่ได้ตามปกติ) session เดิมที่ FaceAnalysis สร้างจะถูกทิ้งไป เสียเวลาบูตนิดเดียวครั้งเดียว
for sub_model in model.models.values():
    sub_model.session = ort.InferenceSession(
        sub_model.session.model_path,
        sess_options=sess_options,
        providers=["CPUExecutionProvider"],
    )

model.prepare(ctx_id=-1, det_size=(640, 640))

# warmup — model.prepare() แค่โหลด weight แต่ onnxruntime allocate buffer + optimize graph จริง
# ตอน inference "ครั้งแรก" ทำให้ request แรกหลัง deploy/หลังตื่นจากหลับ ช้าเป็นวินาที (เสี่ยงโดน
# /health หรือ timeout ฝั่ง Go มองว่ายังไม่พร้อม) ยิงภาพเปล่าครั้งเดียวตอนบูตให้จบตรงนี้ก่อนเปิดรับ traffic
model.get(np.zeros((640, 640, 3), dtype=np.uint8))

log.info("โหลดโมเดล %s จาก %s (threads=%d) + warmup เรียบร้อย", MODEL_NAME, MODEL_ROOT, THREADS)


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
    # frame_image คือทั้งเฟรมที่ย่อขนาดแล้ว (ไม่ใช่แค่ครอปหน้า) เข้ารหัส JPEG แบบ base64 — มีเฉพาะ
    # ที่มาจาก /embed-all-video เท่านั้น (ดู encode_frame) bbox ด้านบนอ้างอิงรูปนี้เสมอ
    # (สเกลตามรูปที่ย่อแล้ว ไม่ใช่เฟรมต้นฉบับ) รูปจาก /embed-all ไม่ต้องส่งกลับมา เพราะฝั่งเว็บมี
    # ไฟล์รูปต้นฉบับอยู่แล้วเอง วาดกรอบทับเองได้โดยไม่ต้องรอรูปจากที่นี่
    frame_image: str | None = None


class EmbedAllResponse(BaseModel):
    face_count: int
    faces: list[DetectedFace]
    model: str
    # fallback_frame มีค่าเฉพาะ /embed-all-video ตอนที่ "ไม่เจอใบหน้าเลยสักหน้าเดียว" ในทุกเฟรมที่สุ่ม
    # ตรวจ (faces=[] เท่านั้น) — เฟรมตัวแทนหนึ่งเฟรมจากคลิป (ไม่มีกรอบใบหน้ากำกับ เพราะไม่เจอตำแหน่ง)
    # ให้โค้ช/แอดมินเห็นอย่างน้อยว่าคลิปนี้มีเนื้อหาอะไร แทนที่จะไม่มีอะไรให้ดูอ้างอิงเลยแม้แต่นิดเดียว
    # (ดูเหตุผลเต็มที่ embed_all_video) /embed-all (รูป) ไม่ต้องใช้ เพราะฝั่งเว็บมีไฟล์ต้นฉบับอยู่แล้ว
    fallback_frame: str | None = None


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


class VideoTooLongError(Exception):
    """วิดีโอยาวเกิน MAX_VIDEO_DURATION_SECONDS — ไม่ใช่ข้อผิดพลาดของไฟล์ ผู้เรียกควรจับแล้วตอบ
    413 บอกโค้ชว่าไฟล์นี้ยาวเกินจะจำแนกให้ (แต่ยังอัปโหลด/แท็กเองได้ปกติ)"""


def sample_video_frames(path: str) -> list:
    """สุ่มเฟรมจากวิดีโอมาตรวจสูงสุด MAX_VIDEO_SAMPLE_FRAMES เฟรม แทนที่จะตรวจทุกเฟรม

    อิงจาก "จำนวนเฟรมทั้งหมด" หารเฉลี่ยเป็นระยะห่างเท่า ๆ กัน ให้เฟรมที่สุ่มมากระจาย
    ทั่วทั้งคลิปเสมอไม่ว่าคลิปจะยาวแค่ไหน

    ⚠️ ห้ามอิงตามเวลาจริง (FPS × วินาที) แบบเดิม — ถ้าคลิปยาวกว่า MAX_VIDEO_SAMPLE_FRAMES คูณ
    ระยะเวลาที่ตั้งไว้ จะวนอ่านแค่ช่วงต้นคลิปแล้วหยุด (ครบ MAX_VIDEO_SAMPLE_FRAMES ก่อน) ไม่แตะ
    ช่วงหลังของคลิปเลย ทำให้คนที่โผล่มาช่วงกลาง/ท้ายคลิปหลุดการตรวจจับไปทั้งหมดแน่นอน ไม่ใช่แค่บางที

    เช็คความยาวคลิปก่อนเสมอ (ดู VideoTooLongError) — เช็คตรงนี้ที่เดียวครอบทั้งสองเส้นทาง
    (รู้จำนวนเฟรมจาก metadata ตรง ๆ, หรือต้องนับเองเพราะ metadata ไม่บอก) ไม่ต้องเขียนซ้ำสองที่
    """
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        return []

    try:
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        fps = cap.get(cv2.CAP_PROP_FPS) or 0

        if total_frames > 0 and fps > 0 and total_frames / fps > MAX_VIDEO_DURATION_SECONDS:
            raise VideoTooLongError()

        # ไฟล์บางแบบไม่มี metadata จำนวนเฟรม (รายงานเป็น 0) — นับเองแบบเบา ๆ ก่อน (grab ไม่ decode
        # เหมือน read จึงเร็วกว่ามาก) แล้วค่อย seek กลับมาเริ่มสุ่มตามจำนวนที่นับได้จริง
        #
        # ⚠️ ยังต้องมีเพดานตอนนับด้วย ไม่งั้นไฟล์ยาวผิดปกติที่ไม่มี metadata จะนับค้างไม่มีที่สิ้นสุด
        # ประมาณเพดานจาก MAX_VIDEO_DURATION_SECONDS โดยสมมติ FPS ต่ำสุดที่เป็นไปได้จริง (15) คูณ
        # เผื่อ margin ไว้อีกเท่าตัว กันเดา FPS ผิดแล้วตัดวิดีโอที่ยาวไม่เกินจริง ๆ ทิ้งไปทั้งที่ไม่ควร
        if total_frames <= 0:
            frame_ceiling = int(MAX_VIDEO_DURATION_SECONDS * 15 * 2)
            counted = 0
            while cap.grab():
                counted += 1
                if counted > frame_ceiling:
                    raise VideoTooLongError()
            total_frames = counted
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

        if total_frames <= 0:
            return []

        stride = max(1, total_frames // MAX_VIDEO_SAMPLE_FRAMES)
        frames = []
        idx = 0
        while len(frames) < MAX_VIDEO_SAMPLE_FRAMES and idx < total_frames:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ok, frame = cap.read()
            if not ok:
                break
            frames.append(frame)
            idx += stride
    finally:
        cap.release()

    return frames


# ด้านยาวสูงสุดของเฟรมที่ส่งกลับให้หน้าเว็บ (กันรูปหนักเกินไป — เฟรมจากวิดีโอต้นฉบับอาจใหญ่ถึง
# 1080p/4K) เท่ากับที่ฝั่งเบราว์เซอร์ย่อรูปนิ่งเหลือก่อนอัปโหลดอยู่แล้ว (ดู MAX_IMAGE_B64_BYTES)
FRAME_IMAGE_MAX_DIMENSION = 800


def encode_frame(frame) -> tuple[str | None, float]:
    """ย่อทั้งเฟรม (ไม่ใช่แค่ครอปหน้า) ให้ด้านยาวไม่เกิน FRAME_IMAGE_MAX_DIMENSION แล้ว encode
    เป็น JPEG base64 คืนคู่กับ scale ที่ใช้ย่อ — เอาไปสเกล bbox ของแต่ละหน้าในเฟรมนี้ต่อข้างนอก

    ⚠️ เข้ารหัสรูป "ครั้งเดียวต่อเฟรม" ไม่ใช่ต่อหน้า — เฟรมหนึ่งอาจมีหลายหน้า (รูปกลุ่ม) ถ้าเรียก
    ฟังก์ชันนี้ในลูปต่อหน้าจะ resize+encode รูปเดิมซ้ำโดยไม่จำเป็นหลายรอบ (ผลลัพธ์เหมือนเดิมทุกรอบ
    เพราะแหล่งเดียวกัน) ผู้เรียกต้องเรียกครั้งเดียวต่อเฟรมแล้วใช้ scale ที่ได้สเกล bbox ของทุกหน้าเอง

    ส่งกลับ "ทั้งเฟรม" แทนที่จะครอปเฉพาะหน้า เพื่อให้หน้าเว็บวาดกรอบสี่เหลี่ยมทับตำแหน่งจริงได้
    เหมือนที่ทำกับรูปนิ่งอยู่แล้ว (ดู PhotoPreviewWithMarks ฝั่ง frontend)
    """
    h, w = frame.shape[:2]
    scale = min(1.0, FRAME_IMAGE_MAX_DIMENSION / max(h, w))
    # INTER_AREA คือ interpolation ที่ OpenCV เอกสารแนะนำเองสำหรับ "ย่อขนาดลง" โดยเฉพาะ (ต่างจาก
    # ดีฟอลต์ INTER_LINEAR ที่เหมาะกับขยายมากกว่า) ให้ผลเนียนกว่า ไม่ค่อยแตกเป็นบล็อก/aliasing
    # ⚠️ ช่วยแค่ "ภาพที่โชว์ให้โค้ชดู" เท่านั้น ไม่กระทบคะแนนความมั่นใจเลย เพราะ embedding คำนวณ
    # จากเฟรมต้นฉบับก่อนย่อขนาดตรงนี้อยู่แล้ว (ดู embed_all_video ที่เรียก model.get ก่อน encode_frame)
    resized = cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA) if scale < 1.0 else frame

    # quality 90 ไม่ใช่ 80 — โค้ชบ่นว่าภาพแตก/ดูยาก คุณภาพสูงขึ้นแลกกับไฟล์ใหญ่ขึ้นนิดหน่อย
    # (คุ้มเพราะเป็นรูปเดี่ยว ๆ ไม่กี่รูปต่อวิดีโอ ไม่ใช่ทุกเฟรมที่สุ่มตรวจ) ไม่กระทบคะแนนความมั่นใจ
    # เหมือน INTER_AREA ด้านบน เพราะ embedding คำนวณจากเฟรมต้นฉบับก่อนเข้ารหัส JPEG ตรงนี้อยู่แล้ว
    ok, buf = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not ok:
        return None, scale

    return base64.b64encode(buf).decode(), scale


@app.post("/embed-all-video", response_model=EmbedAllResponse)
def embed_all_video(req: EmbedRequest, x_service_key: str | None = Header(default=None)) -> EmbedAllResponse:
    """เหมือน /embed-all แต่รับวิดีโอแทนรูป — สุ่มตรวจเฟรมเป็นระยะ (ดู sample_video_frames)
    แล้วรวมใบหน้าที่เจอจากทุกเฟรมที่สุ่มมาเป็นลิสต์เดียว รูปแบบผลลัพธ์เหมือน /embed-all ทุกอย่าง
    ฝั่ง Go จึงใช้ตรรกะจับคู่นักเรียนชุดเดียวกันได้เลย ไม่ต้องแยกโค้ด

    ⚠️ คนคนเดียวโผล่ในหลายเฟรมที่สุ่มมาได้ นับเป็นหลาย "หน้า" ใน face_count — ไม่ใช่จำนวนคนจริง
    (ฝั่ง Go รวมคะแนนต่อคนอยู่แล้วตอนจับคู่ ไม่กระทบผลจับคู่ แค่ face_count จะดูเยอะกว่าจำนวนคนจริง)
    """
    require_service_key(x_service_key)

    if len(req.image) > MAX_VIDEO_B64_BYTES:
        raise HTTPException(status_code=413, detail="video too large")

    try:
        raw = base64.b64decode(req.image, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="invalid base64")

    # เขียนลงไฟล์ชั่วคราวก่อนเสมอ — cv2.VideoCapture ต้องการ path จริง อ่านจาก buffer ในหน่วยความจำตรง ๆ ไม่ได้
    #
    # ⚠️ ต้องปิด handle ของเราเองก่อนให้ cv2.VideoCapture เปิดไฟล์เดิมนี้ซ้ำ — Windows ล็อกไฟล์ที่ยัง
    # เปิดค้างไว้เข้มกว่า POSIX มาก ถ้าใช้ `with NamedTemporaryFile(...) as tmp:` เฉยๆ (handle ยังไม่ปิด)
    # cv2 จะเปิดไฟล์เดียวกันไม่ได้เลยบน Windows (ได้ "decode failed" ทั้งที่ไฟล์ปกติดี) จึงต้อง
    # delete=False + close() เองก่อน แล้วค่อยลบทิ้งเองใน finally แทน
    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    try:
        tmp.write(raw)
        tmp.close()
        try:
            frames = sample_video_frames(tmp.name)
        except VideoTooLongError:
            raise HTTPException(status_code=413, detail="video too long")
    finally:
        os.unlink(tmp.name)

    if not frames:
        raise HTTPException(status_code=400, detail="decode failed")

    all_faces: list[DetectedFace] = []
    for frame in frames:
        faces_in_frame = model.get(frame)
        if not faces_in_frame:
            continue

        # เข้ารหัสเฟรมนี้ครั้งเดียว ใช้ร่วมกันกับทุกหน้าที่เจอในเฟรมเดียวกัน (ดูคอมเมนต์ encode_frame)
        frame_image, scale = encode_frame(frame)
        for f in faces_in_frame:
            all_faces.append(
                DetectedFace(
                    embedding=f.normed_embedding.tolist(),
                    quality=float(f.det_score),
                    bbox=[v * scale for v in f.bbox.tolist()],
                    frame_image=frame_image,
                )
            )

    fallback_frame = None
    if not all_faces:
        # ไม่เจอใบหน้าเลยสักหน้าเดียวในทุกเฟรมที่สุ่มตรวจ — เอาเฟรมกลางคลิปมาให้ดูเป็นหลักฐานว่า
        # "คลิปนี้มีเนื้อหาอะไร" แทนที่จะไม่มีอะไรให้โค้ช/แอดมินดูอ้างอิงเลยแม้แต่นิดเดียว (เลือกเฟรม
        # กลางแทนเฟรมแรก เผื่อเฟรมแรกเป็นช่วงเปลี่ยนฉาก/มืด/ว่างเปล่ามากกว่าช่วงกลางคลิป)
        fallback_frame, _ = encode_frame(frames[len(frames) // 2])

    return EmbedAllResponse(face_count=len(all_faces), faces=all_faces, model=MODEL_NAME, fallback_frame=fallback_frame)
