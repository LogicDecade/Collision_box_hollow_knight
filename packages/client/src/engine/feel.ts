// 手感调参：移动 / 跳跃 / 贴墙 / 攻击 / 灵魂 —— 全在此处收敛。
// 运行时可被 localStorage 中的「角色编辑器试玩覆盖」再叠加（applyFeelOverrides）。
// 编辑器「保存到工程」直接改写下方 EDITOR_ROLE 围栏段，随仓库发布 → 本地/线上手感一致。
// ==== EDITOR_ROLE_START ====
  /** 角色基础参数（默认手感）。编辑器「保存到工程」会改写本段。 */
  const FEEL_BASE = {
    playerW: 26,
    playerH: 42,
    runSpeed: 235,
    accel: 2600,
    friction: 3100,
    airControl: 0.62,
    gravity: 1900,
    jumpVel: 710,
    jumpCutMult: 2.2,
    fallGravityMult: 1.28,
    maxFall: 660,
    coyote: 0.1,
    jumpBuffer: 0.12,
    wallSlideMax: 110,
    wallJumpX: 430,
    wallJumpY: 500,
    attackCd: 0.34,
    attackDur: 0.24,
    attackHitWindow: 0.14,
    attackOffsetX: 36,
    upSlashOffsetY: -56,
    upSlashHop: 180,
    downSlashOffsetY: 36,
    pogoBounce: 420,
    soulMax: 100,
    soulPerHit: 11,
    healCost: 33,
    healChannel: 0.8,
    hurtInvuln: 1,
    knockX: 260,
    knockY: 240,
    maxHp: 6,
    attackBox: { w: 64, h: 52 },
    upSlashBox: { w: 56, h: 66 },
    downSlashBox: { w: 54, h: 62 },
  };
// ==== EDITOR_ROLE_END ====

/** 运行时手感（= 工程默认 FEEL_BASE + 本地试玩覆盖）。 */
export const FEEL: typeof FEEL_BASE = { ...FEEL_BASE };

/** 角色编辑器可调参数分组（点路径 key；追加「技能」等新组直接在这里加） */
export const FEEL_GROUPS: { name: string; rows: Array<[string, string]> }[] = [
  { name: '角色体积', rows: [['playerW', '宽'], ['playerH', '高']] },
  { name: '移动', rows: [['runSpeed', '跑速'], ['accel', '加速'], ['friction', '摩擦'], ['airControl', '空中操控']] },
  { name: '跳跃', rows: [['gravity', '重力'], ['jumpVel', '起跳速度'], ['jumpCutMult', '松键切短倍率'], ['fallGravityMult', '下落倍率'], ['maxFall', '最大下落'], ['coyote', '土狼时间'], ['jumpBuffer', '预输入']] },
  { name: '贴墙', rows: [['wallSlideMax', '下滑限速'], ['wallJumpX', '墙跳·横向'], ['wallJumpY', '墙跳·纵向']] },
  { name: '攻击', rows: [['attackCd', '冷却'], ['attackDur', '总时长'], ['attackHitWindow', '命中窗口'], ['attackBox.w', '平砍·宽'], ['attackBox.h', '平砍·高'], ['attackOffsetX', '平砍·前伸'], ['upSlashBox.w', '上劈·宽'], ['upSlashBox.h', '上劈·高'], ['upSlashOffsetY', '上劈·偏移'], ['upSlashHop', '上劈·上跃'], ['downSlashBox.w', '下劈·宽'], ['downSlashBox.h', '下劈·高'], ['downSlashOffsetY', '下劈·偏移']] },
  { name: '下劈反跳', rows: [['pogoBounce', '反跳']] },
  { name: '灵魂', rows: [['soulMax', '上限'], ['soulPerHit', '每击获得'], ['healCost', '回血消耗'], ['healChannel', '吟唱时长']] },
  { name: '受击 / 生命', rows: [['hurtInvuln', '无敌时长'], ['knockX', '击退·X'], ['knockY', '击退·Y'], ['maxHp', '生命上限']] },
];

/** 读 FEEL 某个点路径值（'attackBox.w' → FEEL.attackBox.w） */
export function feelGet(path: string): number {
  const parts = path.split('.');
  let v: unknown = FEEL;
  for (const p of parts) v = (v as Record<string, unknown>)?.[p];
  return typeof v === 'number' ? v : 0;
}

/** 把「点路径 → 数值」的参数表渲染成 feel.ts 围栏块源码（编辑器「保存到工程」用） */
export function feelParamsToBlock(paths: Record<string, number>): string {
  const flat: Array<[string, number]> = [];
  const boxes: Record<string, { w: number; h: number }> = {};
  for (const [k, v] of Object.entries(paths)) {
    if (!Number.isFinite(v)) continue;
    const parts = k.split('.');
    if (parts.length === 1) flat.push([k, v]);
    else (boxes[parts[0]] ??= { w: 0, h: 0 })[parts[1] as 'w' | 'h'] = v;
  }
  const lines: string[] = [
    '/** 角色基础参数（默认手感）。编辑器「保存到工程」会改写本段。 */',
    'const FEEL_BASE = {',
  ];
  for (const [k, v] of flat) lines.push(`  ${k}: ${v},`);
  for (const [k, b] of Object.entries(boxes)) lines.push(`  ${k}: { w: ${b.w}, h: ${b.h} },`);
  lines.push('};');
  return lines.join('\n');
}

// ------- 角色参数试玩覆盖（角色编辑器「应用到试玩」→ localStorage → 游戏运行时生效） -------
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
