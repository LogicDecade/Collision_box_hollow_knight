// 手感调参：移动 / 跳跃 / 贴墙 / 攻击 / 灵魂 —— 全在此处收敛
export const FEEL = {
  // 实体尺寸
  playerW: 26,
  playerH: 42,

  // 移动
  runSpeed: 235,
  accel: 2600,
  friction: 3100,
  airControl: 0.62,

  // 跳跃（y 向下为正，起跳为负速度）
  gravity: 1900,
  jumpVel: 600,
  jumpCutMult: 0.48,
  fallGravityMult: 1.28,
  maxFall: 660,
  coyote: 0.1,
  jumpBuffer: 0.12,

  // 贴墙滑 / 墙跳
  wallSlideMax: 110,
  wallJumpX: 430,
  wallJumpY: 500,

  // 攻击
  attackCd: 0.34,
  attackDur: 0.24, // 包含前摇的总时长，命中窗见各攻击
  attackHitWindow: 0.14,
  attackBox: { w: 64, h: 52 },
  attackOffsetX: 36,
  upSlashBox: { w: 56, h: 66 },
  upSlashOffsetY: -56,
  upSlashHop: 180,
  downSlashBox: { w: 54, h: 62 },
  downSlashOffsetY: 36,
  pogoBounce: 360,

  // 灵魂
  soulMax: 100,
  soulPerHit: 11,
  healCost: 33,
  healChannel: 0.8,

  // 受击
  hurtInvuln: 1.15,
  knockX: 260,
  knockY: 240,

  maxHp: 6,
} as const;
