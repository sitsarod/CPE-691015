# ─── ขั้นที่ 1: build dependency ───
#
# insightface ไม่มี wheel สำเร็จรูป ต้องคอมไพล์จากซอร์ส (ต้องการ Cython + compiler)
# แยกขั้นเพื่อไม่ให้ compiler ติดไปกับอิมเมจที่รันจริง
FROM python:3.11-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        cmake \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# numpy + Cython ต้องมีก่อน ไม่งั้น insightface build ไม่ผ่าน
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir numpy==1.26.4 Cython==3.0.11

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt


# ─── ขั้นที่ 2: ฝังโมเดลลงอิมเมจ ───
#
# buffalo_l ~330MB ถ้าไม่ฝังไว้ คอนเทนเนอร์จะไปโหลดตอนบูตครั้งแรก
# ทำให้ deploy รอนานและ request แรก ๆ timeout — แถมถ้าเน็ตขาดก็บูตไม่ขึ้นเลย
# ⚠️ insightface ไม่อ่าน env var ใด ๆ ต้องส่ง root= เข้าไปตรง ๆ
# (ถ้าใช้ INSIGHTFACE_HOME มันจะเมินแล้วไปลงที่ ~/.insightface แทน)
FROM builder AS model-fetch
ENV PATH="/opt/venv/bin:$PATH"
RUN python -c "\
import insightface; \
app = insightface.app.FaceAnalysis(name='buffalo_l', root='/opt/insightface', allowed_modules=['detection','recognition']); \
app.prepare(ctx_id=-1, det_size=(640, 640)); \
print('โหลดโมเดล buffalo_l ลงอิมเมจเรียบร้อย')"


# ─── ขั้นที่ 3: อิมเมจที่รันจริง ───
FROM python:3.11-slim

# opencv-python-headless ยังต้องการ libGL/libglib แม้จะเป็น headless
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# ไม่รันด้วย root
RUN useradd --create-home --uid 10001 appuser

COPY --from=builder /opt/venv /opt/venv
COPY --from=model-fetch --chown=appuser:appuser /opt/insightface /opt/insightface

# FACE_MODEL_ROOT ต้องตรงกับ root= ที่ใช้ตอน build ไม่งั้นจะหาโมเดลไม่เจอ
# แล้วไปโหลดใหม่ตอนบูต (ซึ่งคือสิ่งที่การฝังโมเดลลงอิมเมจพยายามเลี่ยง)
ENV PATH="/opt/venv/bin:$PATH" \
    FACE_MODEL_ROOT=/opt/insightface \
    PYTHONUNBUFFERED=1
USER appuser
WORKDIR /app
COPY --chown=appuser:appuser main.py .

# ⚠️ bind :: (IPv6) ไม่ใช่ 0.0.0.0 — private network ของ Railway เป็น IPv6 เท่านั้น
# ถ้าฟังแค่ IPv4 backend จะเรียกผ่าน <ชื่อ>.railway.internal ไม่เจอเลย
# (บน Linux ซ็อกเก็ต :: รับ IPv4 ด้วยอยู่แล้ว จึงใช้ได้ทั้งกับ docker compose)
#
# เปิดรับจากทุกที่ในเน็ตเวิร์กภายใน ความปลอดภัยมาจาก "ไม่ผูกโดเมนสาธารณะให้ service นี้"
# กับ shared secret ใน X-Service-Key — ไม่ใช่จากการจำกัดที่อยู่ที่ bind
ENV PORT=8080 \
    HOST=::
EXPOSE 8080
CMD ["sh", "-c", "uvicorn main:app --host ${HOST} --port ${PORT}"]
