import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUser, findUserByUsername } from './db.js';
import { hashPassword, verifyPassword, signToken, verifyToken } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });

// ------- 静态托管（生产模式：SERVER=prod，托管 client/dist） -------
// dev 模式（默认）：Vite 承担前端，/api 由 Vite proxy 转发，无需本段。
if (process.env.SERVER === 'prod') {
  const clientDist = join(__dirname, '../../../client/dist');
  if (existsSync(clientDist)) {
    await app.register(fastifyStatic, { root: clientDist, index: [ 'index.html' ] });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not_found' });
    });
    app.log.info({ clientDist }, 'static hosting enabled');
  } else {
    app.log.warn('SERVER=prod but client/dist 不存在，请先构建 client');
  }
}

// ------- 工具 -------
const USERNAME_RE = /^[A-Za-z0-9_]{2,20}$/;
function publicUser(u: { id: number; username: string }) {
  return { id: u.id, username: u.username };
}

interface AuthBody {
  username?: unknown;
  password?: unknown;
}
function readCredentials(body: AuthBody): { username: string; password: string } | null {
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!USERNAME_RE.test(username)) return null;
  if (password.length < 6 || password.length > 72) return null;
  return { username, password };
}

// ------- 路由 -------
app.get('/api/health', async () => ({ ok: true }));

app.post('/api/auth/register', async (req, reply) => {
  const cred = readCredentials(req.body as AuthBody);
  if (!cred) {
    return reply.code(400).send({ error: '用户名需为 2-20 位字母数字下划线，密码 6-72 位' });
  }
  if (findUserByUsername(cred.username)) {
    return reply.code(409).send({ error: '用户名已被占用' });
  }
  const user = createUser(cred.username, hashPassword(cred.password));
  const token = signToken({ sub: user.id, username: user.username });
  return reply.code(201).send({ token, user: publicUser(user) });
});

app.post('/api/auth/login', async (req, reply) => {
  const cred = readCredentials(req.body as AuthBody);
  if (!cred) {
    return reply.code(400).send({ error: '请求格式不正确' });
  }
  const user = findUserByUsername(cred.username);
  if (!user || !verifyPassword(cred.password, user.password_hash)) {
    return reply.code(401).send({ error: '用户名或密码错误' });
  }
  const token = signToken({ sub: user.id, username: user.username });
  return reply.send({ token, user: publicUser(user) });
});

app.get('/api/auth/me', async (req) => {
  const auth = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  const payload = auth ? verifyToken(auth) : null;
  if (!payload) return { user: null };
  return { user: { id: payload.sub, username: payload.username } };
});

const port = Number(process.env.PORT || 3001);
await app.listen({ port, host: '0.0.0.0' });
app.log.info(`collision-box API listening on :${port} (prod=${process.env.SERVER === 'prod'})`);
