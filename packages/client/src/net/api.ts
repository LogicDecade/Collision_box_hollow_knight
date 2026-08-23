// 后端 API 客户端 + 会话令牌
const TOKEN_KEY = 'cb_token';

export interface PublicUser {
  id: number;
  username: string;
}
export interface AuthResp {
  token: string;
  user: PublicUser;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(t: string): void {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  body?: unknown,
  method = 'POST',
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
  } & T;
  if (!res.ok) throw new Error(data.error || `请求失败(${res.status})`);
  return data;
}

export function apiRegister(username: string, password: string) {
  return request<AuthResp>('/auth/register', { username, password });
}
export function apiLogin(username: string, password: string) {
  return request<AuthResp>('/auth/login', { username, password });
}
export async function apiMe(): Promise<PublicUser | null> {
  try {
    const res = await request<{ user: PublicUser | null }>('/auth/me', undefined, 'GET');
    return res.user;
  } catch {
    return null;
  }
}
