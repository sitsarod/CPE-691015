const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options?.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText} (${response.status})`);
  }

  return response.json() as Promise<T>;
}
