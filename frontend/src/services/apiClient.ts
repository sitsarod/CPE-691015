const BASE_URL = process.env.NEXT_PUBLIC_API_URL ;

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as Record<string, string>) || {}),
  };

  if (typeof window !== 'undefined' && !headers['Authorization']) {
    const token = localStorage.getItem('token');
    if (token) {
      headers['Authorization'] = `Bearer ${token.trim().replace(/[\r\n]/g, '')}`;
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

 
  const text = await response.text();
  let payload: any = null;
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
