# 碰撞箱 Collision Box

仿《空洞骑士》的**类银河城网页游戏**：非网格地图、AABB 碰撞箱美术、Phaser 3 + Node 全栈。

> 线上试玩：**https://collision-box.onrender.com**（免费实例，首次访问可能要等 30-60 秒冷启动）

## 玩法

角色在非网格房间中探索，击杀敌人积攒灵魂（Soul），消耗灵魂回血。

**键盘操作**

| 按键 | 动作 |
| --- | --- |
| `A / D` `← / →` | 移动 |
| `W / ↑` | 朝上（斜上劈） |
| `S / ↓` | 朝下（斜下劈；**仅空中** = 下劈踏击 Pogo，踩怪弹起） |
| `J / Z / 空格` | 跳跃（长按跳更高，预输入/土狼时间） |
| `K / X` | 攻击（配合方向斜劈） |
| `H / C / L / Shift` | 按住蓄魂回血（**空中蓄魂会悬浮**） |
| `Esc` | 暂停（继续 / **重新开始** / 退出登录） |

**移动端触屏**（`pointer: coarse` 设备自动启用）

- 左半屏按住拖动 = 移动（跟随拇指摇杆）
- 右下按钮：`魂`（按住回血）/ `攻` / `跳`（长按跳高）
- `→↑↓` 循环切换攻击方向（平砍/上劈/下劈）；右上 `❚❚` 暂停

## 技术栈

- **客户端**：Phaser 3 + TypeScript + Vite（多页：游戏主页 `index.html`；构建产物**不含**编辑器）
- **服务端**：Node ≥22.5 + Fastify + SQLite（内置 `node:sqlite`，零原生依赖）、scrypt 密码哈希、自签 HS256 JWT（30 天会话）
- **部署**：Render Blueprint（单 Web Service，后端同源托管前端，免 CORS）
- 依赖仅 `fastify` / `@fastify/static` / `phaser` / `vite` / `typescript` / `tsx` / `esbuild`

## 仓库结构

```
packages/
  client/     Phaser 3 游戏（src/engine 引擎层 · entities 实体 · world 房间 · scenes 场景 · ui 覆盖层 · editor 地图编辑器 · net 网络）
  server/     Fastify API（auth 认证 · db SQLite · 编辑器写盘(仅 dev)）+ 生产静态托管
tools/
  dev.mjs     一键开发（同时拉起前后端）
  smoke.ts    无头冒烟回归（驱动核心玩法逻辑，不经浏览器）
docs/         架构笔记
render.yaml   Render Blueprint 部署定义
```

- `world/rooms.ts`：**数据驱动房间**。地形/出生点/过渡/敌人都是矩形数组；编辑器只会改写
  `EDITOR_DATA_START … EDITOR_DATA_END` 围栏之间的数据段。
- `engine/feel.ts`：手感参数集中（重力/跳跃/攻击/灵魂），调平衡只动这一处。
- `net/api.ts`：相对路径 `/api/*`（dev 走 Vite 代理 → :3001；生产同源）。

## 本地开发

```bash
npm install        # 根目录一次（npm workspaces）
npm run dev        # 同时启动：后端 :3001 + 前端 http://localhost:5173
```

- 游戏：http://localhost:5173/
- **地图编辑器**：http://localhost:5173/editor.html —— 画房间 → 填 `map token` → 「保存到工程」直接写回 `rooms.ts`（token 见 `npm run dev` 终端日志，浏览器记住一次）。上线(生产)版**不含**编辑器。

## 测试与构建

```bash
npm test          # 无头冒烟：42 用例（移动/跳跃/攻击/蓄魂/下劈/敌人AI/击杀持久化 → 编辑器围栏替换/去嵌入）
npm run typecheck # 双包 tsc 零错误
npm run build:all # client(仅游戏页) + server 编译 → packages/*/dist
```

## 部署（Render）

1. 推到 GitHub：
   ```bash
   git remote add origin https://github.com/<你>/collision-box-hollow-knight.git
   git push -u origin master
   ```
2. Render 控制台 → **New + → Blueprint** → 选该仓库，自动读取 `render.yaml`（Node 24、`npm ci && build:all`、启动 `npm run start:server`、健康检查 `/api/health`）。
3. `JWT_SECRET` 由 Blueprint 自动生成注入（生产缺失会拒绝启动）。

**免费版限制**：每月 750h、无流量 15 分钟休眠（冷启动 30-60s）、**SQLite 数据随实例重置而清空**（无持久磁盘）。账号数据要长期保留时，需加 Render 持久磁盘或改外部数据库。

## 设计要点

- **碰撞即美术**：一切实体都是矩形（无贴图），骨架代码预留了「皮肤槽」（Rectangle → 贴图）扩展位。
- **击杀持久化**：击杀记录 `房间id:敌人索引` 随本地存档落盘，跨房间往返不复活；「重新开始」清空。
- **重生安全**：出生点即便被摆进地形，`depenetrate` 也会在进入房间/重生时把玩家推出到最近合法落点。
- **编辑器写盘仅本地**：`/api/editor/*`、`editor.html` 生产一律 404，防止线上被改写工程文件。

> 项目名「碰撞箱 Collision Box」为占位，随时可改。
