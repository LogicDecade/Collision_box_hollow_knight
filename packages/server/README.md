# 游戏后端

本地开发：

```bash
npm run dev -w server        # 启动 API，默认 http://localhost:3001
npm run dev -w client        # 另开一个终端：Vite dev，含 /api 代理 → :3001
```

打开 `http://localhost:5173` 即为开发站点。

## 依赖说明

- 运行时仅依赖 `fastify` 与 `@fastify/static`。
- 用户表直接使用 **Node 24 内置 `node:sqlite`**（DatabaseSync），无需任何数据库驱动。
- JWT 用 `crypto.createHmac` 自签 HS256（标准算法实现），不引入 jsonwebtoken。
- electron 安全警告来自 npm 对 node_modules 的通用扫描，可忽略（本机未安装过 Electron）。

## HTTP 接口（同源，免 CORS）

```
POST /api/auth/register    { username, password }
POST /api/auth/login       { username, password }
GET  /api/auth/me          → 当前会话用户（Authorization: Bearer <token>）
GET  /api/health           → { ok:true }
```

生产环境由同一个服务托管 `dist/`（见 server 代码），实现同源部署。
