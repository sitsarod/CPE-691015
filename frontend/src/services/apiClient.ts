const BASE_URL = process.env.NEXT_PUBLIC_API_URL ;

/** สร้าง header มาตรฐาน (แนบ token ถ้ามี) — ใช้ร่วมกันทั้ง apiFetch และ apiFetchBlob */
function buildHeaders(options?: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {
    ...((options?.headers as Record<string, string>) || {}),
  };

  // ⚠️ ห้ามตั้ง Content-Type เองเมื่อ body เป็น FormData — เบราว์เซอร์ต้องเป็นคนเติม
  // boundary ให้เอง ถ้าตั้งทับ boundary จะหาย แล้วเซิร์ฟเวอร์แยก field ไม่ออก
  const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData;
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (typeof window !== 'undefined' && !headers['Authorization']) {
    const token = localStorage.getItem('token');
    if (token) {
      headers['Authorization'] = `Bearer ${token.trim().replace(/[\r\n]/g, '')}`;
    }
  }

  return headers;
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  const response = await fetch(url, {
    // ค่าเริ่มต้นไม่ให้ browser/Next แคช เพื่อให้ได้ข้อมูลล่าสุดเสมอ
    // (แก้ปัญหา: แก้เนื้อหาในแอดมินแล้วรีเฟรชหน้าแรกยังเห็นข้อมูลเก่า)
    // ผู้เรียกยัง override ได้ด้วยการส่ง cache มาใน options
    cache: 'no-store',
    ...options,
    headers: buildHeaders(options),
  });

  const text = await response.text();
  let payload: { error?: string; message?: string } | null = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload?.error || payload?.message || `API error: ${response.statusText} (${response.status})`;
    throw new Error(message);
  }

  return payload as T;
}

/**
 * apiFetchBlob ดึงไฟล์ (ไม่ใช่ JSON) จาก API ที่ต้องแนบ token
 * เช่น /face-images/:id/raw ซึ่งใช้ <img src> ตรง ๆ ไม่ได้เพราะ img แนบ header ไม่ได้
 *
 * ⚠️ ผู้เรียกต้อง URL.revokeObjectURL() ตอนเลิกใช้
 */
export async function apiFetchBlob(path: string, options?: RequestInit): Promise<Blob> {
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...options,
    headers: buildHeaders(options),
  });

  if (!response.ok) {
    let message = `API error: ${response.statusText} (${response.status})`;
    try {
      const payload = await response.json();
      message = payload?.error || payload?.message || message;
    } catch {
      // ไม่ใช่ JSON ก็ใช้ข้อความเริ่มต้น
    }
    throw new Error(message);
  }

  return response.blob();
}
