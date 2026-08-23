# 碰撞箱 Collision Box —— 类银河城网页游戏

以空洞骑士为蓝本的类银河城网页游戏。美术以「碰撞箱」为核心构成，保留自定义贴图扩展空间。

## 技术选型

- **客户端**：Phaser 3 + TypeScript（Vite 构建）
- **服务端**：Node 24 + Fastify + SQLite（内置 `node:sqlite`），JWT 会话
- **部署**：Render（静态前端 + Node API 同源）

## 仓库结构

```
packages/
  client/   Phaser 3 网页游戏（含登录/Settings/元界面前端）
  server/   Fastify API（注册/登录/会话） + 生产静态托管
tools/      杂项脚本（房间区块标注、解密工具等，未接入构建）
```

## 常用命令

```bash
npm install            # 根目录一次
npm run dev -w client  # Vite dev（含 /api 代理 → :3001）
npm run dev -w server  # Fastify API（:3001）
npm run build -w client
npm run dev -w server  # 生产模式启动：SERVER=prod npm run dev -w server
```

## 路线图

见 `docs/` 与各包 README。MVP 目标：注册/登录闭环、手感、上下劈与灵魂回血、2-3 个房间、1-2 种敌人、本地存档。

> 项目名「碰撞箱 Collision Box」为占位，随时可改。
