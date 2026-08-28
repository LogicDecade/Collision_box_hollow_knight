// 全局常量：逻辑分辨率、配色（碰撞箱美术）、层级
export const WORLD_W = 960;
export const WORLD_H = 540;

export const COLORS = {
  bg: 0x12120f,
  grid: 0x23231f,
  terrain: 0x3a3a36,
  terrainSeam: 0x55554c,
  player: 0x72c9f2,
  playerLine: 0x2e8fb8,
  enemy: 0xe06b4f,
  enemyLine: 0x9c3b24,
  boss: 0xd4a5f0,
  trigger: 0x3a5a7a,
  lock: 0x9a5a3a,
  soulOrb: 0x4da6ff,
  soulBar: 0x2f7fd1,
  hpFull: 0xd8d8d2,
  hpEmpty: 0x2a2a26,
  text: 0xd8d8d2,
  dim: 0x9a9a92,
  accent: 0x72c9f2,
  hurt: 0xffd75e,
} as const;

export const DEPTH = {
  bg: 0,
  room: 5,
  entity: 10,
  fx: 20,
  ui: 100,
} as const;

export const TILE = 24; // 视觉参考格（非网格世界，仅作文案/手感基准）
