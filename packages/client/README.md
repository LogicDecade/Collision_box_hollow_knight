# 游戏客户端

启动开发服务器（含 API 代理）：

- `npm install` 在仓库根目录执行一次
- `npm run dev -w client` —— 启动 Vite dev 服务器（默认 http://localhost:5173）

## 设计原则

- 框架与业务解耦：`engine/` 下对 Phaser 的访问尽量收敛；业务代码不直接 `import Phaser`。
- 物理：碰撞命中的统一进入 `core/physics`（AABB）。
- 界面皆游戏内 Scene（`ui/`），登录页是唯一一个例外（`login/`）。
- 手感参数集中在 `core/feel.ts`。

> 启动后若端口被占用，Vite 会自动换端口（终端会显示实际地址）。
