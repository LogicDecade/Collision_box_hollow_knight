import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';

// ---------- 密码哈希：Node 内置 scrypt，零依赖 ----------

export interface PasswordHash {
  salt: string;
  hash: string;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// ---------- 自签 HS256 JWT（标准算法，避免依赖 jsonwebtoken） ----------

const secret = (): string =>
  process.env.JWT_SECRET || 'cb-dev-secret-change-me';

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

export interface TokenPayload {
  sub: number; // user id
  username: string;
  iat: number;
  exp: number;
}

export function signToken(payload: { sub: number; username: string }): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(
    JSON.stringify({
      sub: payload.sub,
      username: payload.username,
      iat: now,
      exp: now + 60 * 60 * 24 * 30, // 30 天
    } satisfies TokenPayload),
  );
  const sig = b64url(createHmac('sha256', secret()).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = b64url(createHmac('sha256', secret()).update(`${header}.${body}`).digest());
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (typeof payload.sub !== 'number') return null;
    return payload;
  } catch {
    return null;
  }
}
