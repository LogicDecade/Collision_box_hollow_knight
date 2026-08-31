import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUser, findUserByUsername } from './db.js';
import { hashPassword, verifyPassword, signToken, verifyToken } from './auth.js';
import { writeRoomsBlock, writeFeelBlock, FENCE_START, FENCE_END } from './roomEditor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IS_PROD = process.env.SERVER === 'prod';

// 生产必须显式配置 JWT_SECRET，拒绝用默认值（否则任何人都能伪造会话）
if (IS_PROD && !process.env.JWT_SECRET) {
  console.error('[fatal] 生产环境必须设置环境变量 JWT_SECRET（Render 控制台 or render.yaml 会自动生成）');
  process.exit(1);
}

// ------- 编辑器写文件用的一次性 token（仅本地开发；生产不暴露该能力） -------
function ensureEditorToken(): string {
  // 持久化到工程根的 .dev-token（map 前导 + 24 字节随机 hex = 49 字符）
  const p = resolve(__dirname, '../../../.dev-token'); // src→server→packages→仓库根
  try {
    const existing = readFileSync(p, 'utf8').trim();
    if (/^map_[0-9a-f]{48}$/.test(existing)) return existing;
  } catch {
    /* 无旧 token，生成新的 */
  }
  const t = 'map_' + randomBytes(24).toString('hex');
  try {
    writeFileSync(p, t, 'utf8');
  } catch {
    /* 写不进去（只读分区等）就纯内存 */
  }
  return t;
}
const EDITOR_TOKEN = IS_PROD ? '' : ensureEditorToken();
if (!IS_PROD && !process.env.SERVER_QUIET) {
  console.log('\n──────────────────────────────────────────────');
  console.log(`  地图编辑器保存 token：${EDITOR_TOKEN}`);
  console.log('  在编辑器「保存到工程」里贴一次即可（浏览器记住）。');
  console.log('──────────────────────────────────────────────\n');
}

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });

// ------- 静态托管（生产模式：SERVER=prod，托管 client/dist） -------
// dev 模式（默认）：Vite 承担前端，/api 由 Vite proxy 转发，无需本段。
if (IS_PROD) {
  // 从编译产物 dist/ 到 packages/client/dist：dist → server → packages → client/dist
  const clientDist = join(__dirname, '../../client/dist');
  if (existsSync(clientDist)) {
    await app.register(fastifyStatic, { root: clientDist, index: [ 'index.html' ] });
    app.setNotFoundHandler((req, reply) => {
      // 编辑器是开发工具，生产明确不可达
      if (req.url.startsWith('/editor')) {
        return reply.code(404).send({ error: 'not_found' });
      }
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

// ------- 编辑器：保存到工程（需 map token；仅本地开发，生产不暴露写盘能力） -------
if (!IS_PROD) {
  app.post('/api/editor/save-room', async (req, reply) => {
    const body = (req.body ?? {}) as { token?: unknown; block?: unknown };
    if (body.token !== EDITOR_TOKEN) {
      return reply.code(401).send({ error: '无效的保存 token（请填启动日志里的 map token）' });
    }
    const block = typeof body.block === 'string' ? body.block : '';
    if (!block.trim()) return reply.code(400).send({ error: '缺少地图数据' });
    const res = await writeRoomsBlock(block);
    if (!res.ok) return reply.code(400).send({ error: res.error });
    app.log.info({ blockLines: res.blockLines }, 'editor saved rooms.ts');
    return reply.send({ ok: true, hint: '已写回 rooms.ts（Vite 会自动刷新页面）' });
  });

  app.get('/api/editor/fences', async () => ({
    start: FENCE_START,
    end: FENCE_END,
  }));

  app.post('/api/editor/save-feel', async (req, reply) => {
    const body = (req.body ?? {}) as { token?: unknown; block?: unknown };
    if (body.token !== EDITOR_TOKEN) {
      return reply.code(401).send({ error: '无效的保存 token（请填启动日志里的 map token）' });
    }
    const block = typeof body.block === 'string' ? body.block : '';
    if (!block.trim()) return reply.code(400).send({ error: '缺少角色参数数据' });
    const res = await writeFeelBlock(block);
    if (!res.ok) return reply.code(400).send({ error: res.error });
    app.log.info({ blockLines: res.blockLines }, 'editor saved feel.ts');
    return reply.send({ ok: true, hint: '已写回 feel.ts（刷新/重启后生效，随仓库发布到线上同手感）' });
  });
}

const port = Number(process.env.PORT || 3001);
await app.listen({ port, host: '0.0.0.0' });
app.log.info(`collision-box API listening on :${port} (prod=${process.env.SERVER === 'prod'})`);
