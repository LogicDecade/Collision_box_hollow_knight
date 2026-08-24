// 地图编辑器 · 数据层（Phaser 无关，纯函数，可无头测试）
// 提供：网格吸附、命中检测、RoomDef 的 TS/JSON 导出与导入解析、新房间工厂
import type { EnemyDef, RoomDef, SpawnPoint, TransitionDef } from '../world/rooms';
import type { Rect } from '../engine/rect';
import { pointInRect } from '../engine/rect';

export const GRID = 24;

export type ObjKind = 'solid' | 'spawn' | 'transition' | 'enemy';
export interface ObjRef {
  kind: ObjKind;
  idx: number;
}

// ---------- 吸附 ----------
export function snap(x: number, y: number, g = GRID): { x: number; y: number } {
  return { x: Math.round(x / g) * g, y: Math.round(y / g) * g };
}
export function snapRect(x: number, y: number, w: number, h: number, g = GRID): Rect {
  const p = snap(x, y, g);
  const w2 = Math.max(g, Math.round(w / g) * g || g);
  const h2 = Math.max(g, Math.round(h / g) * g || g);
  return { x: p.x, y: p.y, w: w2, h: h2 };
}

// ---------- 对象几何（用于绘制/命中） ----------
export function enemyRect(def: EnemyDef): Rect {
  return { x: def.x - 14, y: def.y - 10, w: 28, h: 20 };
}
export function spawnRect(sp: SpawnPoint): Rect {
  return { x: sp.x - 10, y: sp.y - 10, w: 20, h: 20 };
}

/** 命中最上层对象（敌人 > 过渡 > 出生点 > 地形） */
export function hitTest(state: RoomDef, p: { x: number; y: number }): ObjRef | null {
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    if (pointInRect(p.x, p.y, enemyRect(state.enemies[i]))) return { kind: 'enemy', idx: i };
  }
  for (let i = state.transitions.length - 1; i >= 0; i--) {
    if (pointInRect(p.x, p.y, state.transitions[i].rect)) return { kind: 'transition', idx: i };
  }
  for (let i = state.spawns.length - 1; i >= 0; i--) {
    if (pointInRect(p.x, p.y, spawnRect(state.spawns[i]))) return { kind: 'spawn', idx: i };
  }
  for (let i = state.solids.length - 1; i >= 0; i--) {
    if (pointInRect(p.x, p.y, state.solids[i])) return { kind: 'solid', idx: i };
  }
  return null;
}

// ---------- 导出 ----------
function fmtRect(r: Rect): string {
  return `{ x:${r.x}, y:${r.y}, w:${r.w}, h:${r.h} }`;
}

/** 导出为可直接替换 world/rooms.ts 某房间的 TS 常量片段 */
export function roomToTS(room: RoomDef): string {
  const line = (arr: string[]) => arr.map((s) => '    ' + s).join(',\n');
  return [
    `// ${room.name} · id="${room.id}"（由碰撞箱地图编辑器生成）`,
    `  ${room.id}: {`,
    `    id: ${JSON.stringify(room.id)},`,
    `    name: ${JSON.stringify(room.name)},`,
    `    w: ${room.w},`,
    `    h: ${room.h},`,
    `    solids: [`,
    line(room.solids.map(fmtRect)),
    `    ],`,
    `    spawns: [`,
    line(room.spawns.map((s) => `{ name:${JSON.stringify(s.name)}, x:${s.x}, y:${s.y} }`)),
    `    ],`,
    `    transitions: [`,
    line(
      room.transitions.map(
        (t) => `{ rect: ${fmtRect(t.rect)}, to:${JSON.stringify(t.to)}, spawn:${JSON.stringify(t.spawn)} }`,
      ),
    ),
    `    ],`,
    `    enemies: [`,
    line(room.enemies.map((e) => `{ kind:${JSON.stringify(e.kind)}, x:${e.x}, y:${e.y} }`)),
    `    ],`,
    `  },`,
  ].join('\n');
}

export function roomToJSON(room: RoomDef): string {
  return JSON.stringify(room, null, 2);
}

// ---------- 导入解析（JSON 优先，其次容纳 TS 对象字面量） ----------
export function parseRoom(input: string): RoomDef | null {
  let raw: unknown = null;
  try {
    raw = JSON.parse(input);
  } catch {
    try {
      // TS 字面量兜底：剥掉收尾逗号/分号后求值。
      // 两种形态分别包法：平铺对象直接用 (…)，"hub: {…}" 属性列表需包成 ({…})。
      const cleaned = input.trim().replace(/[,;]\s*$/, '');
      const candidates = cleaned.startsWith('{')
        ? [cleaned, `{${cleaned}}`]
        : [`{${cleaned}}`, cleaned];
      let ok = false;
      for (const expr of candidates) {
        try {
          raw = new Function(`"use strict"; return (${expr});`)();
          ok = true;
          break;
        } catch {
          /* 试下一种形态 */
        }
      }
      if (!ok) return null;
    } catch {
      return null;
    }
  }
  // 若表达式是 "hub: { ... }" 式片段，解包其第一个属性
  if (raw && typeof raw === 'object' && !('id' in (raw as object)) && !('w' in (raw as object))) {
    const vals = Object.values(raw as Record<string, unknown>);
    if (vals.length === 1) raw = vals[0];
  }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.w !== 'number' || typeof o.h !== 'number') return null;
  return {
    id: o.id,
    name: typeof o.name === 'string' ? o.name : o.id,
    w: o.w,
    h: o.h,
    solids: Array.isArray(o.solids) ? (o.solids as Rect[]) : [],
    spawns: Array.isArray(o.spawns) ? (o.spawns as SpawnPoint[]) : [],
    transitions: Array.isArray(o.transitions) ? (o.transitions as TransitionDef[]) : [],
    enemies: Array.isArray(o.enemies) ? (o.enemies as EnemyDef[]) : [],
  };
}

export function newRoom(id: string): RoomDef {
  return { id, name: id, w: 1600, h: 760, solids: [], spawns: [], transitions: [], enemies: [] };
}
