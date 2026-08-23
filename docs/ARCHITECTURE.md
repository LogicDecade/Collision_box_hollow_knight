# 架构与决策记录

> 梦幻短时间收敛的真实记录：类银河城 + 网页化 + 碰撞箱美术。所有面向你的关键决策都写在这里，便于回顾与调整。

## 一、为什么是这套技术栈

调研结论与你的硬需求结合（详见会话历史）：

| 需求（你的原话） | 落地方案 |
|---|---|
| 在网页运行 | TypeScript + Phaser 3（浏览器原生，免 WASM 体积与导出摩擦） |
| 后端用轻量云服务器 | Node + Fastify + SQLite（node:sqlite 内置驱动，零原生依赖） |
| 注册与登录 | 登录/注册 API + 自签 HS256 JWT（30 天）+ scrypt 密码哈希 |
| 非网格地图 | 房间 = 自由摆放的地形矩形（JSON 数据），不用格子/tilemap |
| 只有碰撞箱美术 | 全部实体渲染为矩形 + 描边；贴图槽接口预留在渲染层 |
| UI 简洁留白 | DOM 覆盖层（登录/暂停）+ 游戏内 Canvas HUD 极简化 |

弃用的调研结论：Metroidvania-System 的「网格房间」模型与你的非网格需求冲突，仅继承其*对象持久 ID / 存档分层*思想。

## 二、目录分层

```
packages/client/src
  engine/    Phaser 无关注解：constants(配色/层级) rect(AABB+moveAndSlide)
             feel(手感参数) input(键位) hitbox(战斗结算) save(本地存档)
  entities/  player(手感状态机) enemies(巡逻/追击/受击/死亡)
  world/     rooms(房间/地形/过渡/出生点) —— 数据驱动
  scenes/    GameScene(世界装配/相机/HUD/存档/暂停/过渡)
  ui/        login(登录注册 DOM) pause(暂停/设置 DOM)
  net/       api(客户端) 
packages/server/src
  index.ts   Fastify 路由 + 生产静态托管
  auth.ts    scrypt 哈希 + HS256 JWT
  db.ts      node:sqlite 用户/存档表
tools/smoke.ts  无头玩法冒烟测试（回归用）
```

## 三、关键实现决策

- **手感即代码**：coyote / jump buffer / variable jump / wallslide+walljump / pogo —— 全部收敛在 `engine/feel.ts`（纯常数）+ `player.ts` 状态机，与引擎解耦。
- **世界 = 数据**：房间/地形/敌人/过渡全是 `world/rooms.ts` 数据，加关卡改数据不动代码。
- **碰撞统一入口**：`rect.moveAndSlide`（AABB 轴分离）。这是整个游戏的物理基座。
  - ⚠️ 曾修过的一个真 bug：位移忘了乘 `dt`，Player 0.03s 撞墙穿地。所有速度必须经 `moveAndSlide(dt)` 换算。
- **战斗 = ActiveHit ↔ Fighter**：攻击是带 ttl 的命中盒进 `Combat.update`；受击方是 `Fighter.getHurtRect`。敌人接触伤害走玩家 `takeHit` 同一个入口。
- **灵魂数据驱动**：`FEEL.soul*` 参数 + `Combat` 命中回魂 + 玩家 heal 蓄力。特殊攻击技能位 = 预留的 `FightSpec.onHit / pierce` 等扩展点。
- **贴图槽**：`rebuildEntityVisuals()` 中所有 `Rectangle` 即默认贴图（纯色盒），将来替换为 `Sprite` 加载自定贴图，更换不侵入逻辑层。
- **会话**：JWT Bearer 存 localStorage；生产同源（Fastify 托管 dist），开发用 Vite `/api` 代理，均免 CORS。

## 四、MVP 范围（已达成 vs 后置）

已达成：注册/登录/会话；跑/跳/墙跳/下劈踏击/平A/上劈；灵魂积攒+回血（技能位空置）；3 房间非网格世界+过渡；3 种敌人(巡逻/追击)；本地存档；HUD/暂停/设置。

后置（明确不做进本轮）：贴图上传来源、云端存档同步、灵魂特殊攻击实装、战斗音效、性能分包（当前主包 1.5MB 未拆）。

## 五、运行

```bash
npm install
npm run dev -w server   # :3001
npm run dev -w client   # :5173（Vite 代理 /api）
# 浏览器打开 http://localhost:5173
npx tsx tools/smoke.ts  # 玩法回归
```

## 六、部署（Render）

- 包 `client/dist` 由 server 静态托管（`SERVER=prod`）。
- ⚠️ Render 免费实例文件系统是临时的：SQLite 数据重启即丢。上生产前需：
  1. Render Disk（付费）挂载 `SERVER_DATA_DIR`，或
  2. 换 PostgreSQL（`node:pg`），或
  3. 接受试玩期数据易失。
- `JWT_SECRET` 必须设置环境变量，勿用默认值。
