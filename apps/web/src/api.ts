export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const isMockMode = import.meta.env.VITE_USE_MOCK_DATA === 'true';

export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (isMockMode) {
    const { mockApi } = await import('./mock-api');
    return mockApi<T>(path, body);
  }
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, typeof data?.message === 'string' ? data.message : 'เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่');
  return data as T;
}

export type Profile = {
  user: { id: string; email: string; displayName: string };
  tenant: { id: string; name: string };
  branches: { id: string; name: string }[];
  role: 'OWNER' | 'MANAGER' | 'CASHIER';
};
export type Product = { id: string; name: string; sku: string; barcode: string | null; price: string; quantity: string; active: boolean };
