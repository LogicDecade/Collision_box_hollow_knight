// 手感调参：移动 / 跳跃 / 贴墙 / 攻击 / 灵魂 —— 全在此处收敛
// 运行时可被 localStorage 中的「角色编辑器」覆盖（applyFeelOverrides）。
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
  jumpVel: 710,
  /** 上升段重力倍率：按住=1(升满)，松开>1(切短跳跃) */
  jumpCutMult: 2.2,
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
  // 下劈踏击反弹：至少达到点按跳跃高度(jumpVel 710)，连踏可越攀越高
  pogoBounce: 720,

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
};

// ------- 角色参数覆盖（角色编辑器 → localStorage → 游戏运行时生效） -------
const OVERRIDE_KEY = 'cb_feel_over';

export function loadFeelOverrides(): Record<string, unknown> | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

export function saveFeelOverrides(o: Record<string, unknown>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(o));
  } catch {
    /* 隐私模式等静默 */
  }
}

export function clearFeelOverrides(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(OVERRIDE_KEY);
  } catch {
    /* ignore */
  }
}

/** 把覆盖值合并进 FEEL（标量 + 嵌套对象如 attackBox.w/h）；忽略未知/非数值键 */
export function applyFeelOverrides(o: Record<string, unknown>): void {
  const target = FEEL as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || !(k in target)) continue;
    const cur = target[k];
    if (typeof cur === 'number' && typeof v === 'number') {
      target[k] = v;
    } else if (cur && typeof cur === 'object' && v && typeof v === 'object') {
      const curObj = cur as Record<string, unknown>;
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        if (typeof curObj[k2] === 'number' && typeof v2 === 'number') curObj[k2] = v2;
      }
    } else if (typeof v === 'string' && typeof cur === 'string') {
      target[k] = v;
    }
  }
}
