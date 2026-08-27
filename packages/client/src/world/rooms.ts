// 世界数据：非网格房间。每个房间由「地形矩形」自由拼出，导出为可编辑 JSON 的 TS 数据。
import type { Rect } from '../engine/rect';
import type { EnemyKind } from '../entities/enemies';

export interface SpawnPoint {
  name: string;
  x: number;
  y: number;
}

export interface TransitionDef {
  rect: Rect;
  to: string;
  spawn: string;
}

export interface EnemyDef {
  kind: EnemyKind;
  x: number;
  y: number;
}

export interface RoomDef {
  id: string;
  name: string;
  w: number;
  h: number;
  solids: Rect[];
  spawns: SpawnPoint[];
  transitions: TransitionDef[];
  enemies: EnemyDef[];
}

// ════ 数据围栏（编辑器「保存到工程」只重写标记之间的内容；标记与类型/导出勿动） ════
// ==== EDITOR_DATA_START ====
  // 客厅 · Hub · id="hub"（由碰撞箱地图编辑器生成）
  const hub: RoomDef = {
      id: "hub",
      name: "客厅 · Hub",
      w: 1600,
      h: 760,
      solids: [
      { x:0, y:640, w:1600, h:120 },
      { x:0, y:0, w:40, h:640 },
      { x:1560, y:0, w:40, h:640 },
      { x:240, y:456, w:340, h:24 },
      { x:648, y:360, w:144, h:24 },
      { x:1220, y:390, w:220, h:22 },
      { x:130, y:560, w:60, h:80 },
      { x:840, y:264, w:264, h:24 },
      { x:1152, y:168, w:408, h:24 }
      ],
      spawns: [
      { name:"enter", x:260, y:618 },
      { name:"fromCorridor", x:1500, y:618 }
      ],
      transitions: [
      { rect: { x:1540, y:480, w:60, h:160 }, to:"corridor", spawn:"fromHub" }
      ],
      enemies: [
      { kind:"crawler", x:520, y:628 },
      { kind:"crawler", x:504, y:432 },
      { kind:"walker", x:1272, y:624 }
      ],
  };
  // 狭道 · Corridor · id="corridor"（由碰撞箱地图编辑器生成）
  const corridor: RoomDef = {
      id: "corridor",
      name: "狭道 · Corridor",
      w: 1500,
      h: 620,
      solids: [
      { x:0, y:552, w:408, h:72 },
      { x:672, y:552, w:504, h:72 },
      { x:1248, y:552, w:264, h:72 },
      { x:0, y:0, w:40, h:560 },
      { x:1464, y:0, w:48, h:552 },
      { x:432, y:456, w:72, h:24 },
      { x:240, y:360, w:144, h:24 },
      { x:168, y:288, w:72, h:96 },
      { x:312, y:216, w:288, h:24 },
      { x:1344, y:360, w:24, h:192 },
      { x:1224, y:312, w:48, h:24 },
      { x:1128, y:384, w:72, h:24 },
      { x:1296, y:456, w:48, h:24 },
      { x:1416, y:432, w:48, h:24 },
      { x:984, y:288, w:120, h:24 },
      { x:864, y:216, w:48, h:24 },
      { x:960, y:120, w:72, h:24 },
      { x:696, y:96, w:144, h:24 }
      ],
      spawns: [
      { name:"fromHub", x:120, y:538 },
      { name:"fromArena", x:1380, y:538 }
      ],
      transitions: [
      { rect: { x:0, y:460, w:46, h:120 }, to:"hub", spawn:"fromCorridor" },
      { rect: { x:1440, y:440, w:60, h:140 }, to:"arena", spawn:"fromCorridor" }
      ],
      enemies: [
      { kind:"crawler", x:260, y:548 },
      { kind:"walker", x:900, y:548 }
      ],
  };
  // 演武场 · Arena · id="arena"（由碰撞箱地图编辑器生成）
  const arena: RoomDef = {
      id: "arena",
      name: "演武场 · Arena",
      w: 1700,
      h: 760,
      solids: [
      { x:0, y:672, w:1704, h:96 },
      { x:0, y:0, w:24, h:672 },
      { x:1656, y:0, w:48, h:672 },
      { x:816, y:552, w:96, h:24 },
      { x:912, y:480, w:240, h:24 },
      { x:1392, y:552, w:120, h:24 },
      { x:600, y:456, w:120, h:24 },
      { x:408, y:360, w:96, h:24 },
      { x:816, y:336, w:96, h:24 },
      { x:912, y:504, w:48, h:168 },
      { x:1128, y:432, w:24, h:48 },
      { x:1272, y:456, w:72, h:24 }
      ],
      spawns: [
      { name:"fromCorridor", x:140, y:638 }
      ],
      transitions: [
      { rect: { x:0, y:540, w:46, h:140 }, to:"corridor", spawn:"fromArena" }
      ],
      enemies: [
      { kind:"walker", x:1320, y:648 },
      { kind:"crawler", x:720, y:648 },
      { kind:"crawler", x:1040, y:648 },
      { kind:"crawler", x:984, y:432 },
      { kind:"walker", x:1056, y:456 }
      ],
  };
  // room1 · id="room1"（由碰撞箱地图编辑器生成）
  const room1: RoomDef = {
      id: "room1",
      name: "room1",
      w: 1600,
      h: 760,
      solids: [
      ],
      spawns: [
      ],
      transitions: [
      ],
      enemies: [
      ],
  };
  const ROOMS_EDITOR: RoomDef[] = [hub, corridor, arena, room1];
// ==== EDITOR_DATA_END ====
// ════ 围栏结束 ════
// 围栏内是编辑器维护的数据（房间常量 + ROOMS_EDITOR 汇总，随保存自动更新）；
// 下方是只读的派生与导出，勿手改：
export const ROOMS: Record<string, RoomDef> = Object.fromEntries(
  ROOMS_EDITOR.map((r) => [r.id, r]),
);
export const START_ROOM = 'hub';
export const START_SPAWN = 'enter';

/** 已被击杀的敌人其定义索引 */
export interface SpawnedEnemyRef {
  def: EnemyDef;
  /** 在 room.enemies 中的原始索引（持久化 key 的稳定标识） */
  idx: number;
}

/** 依据击杀记录筛选仍然存活的敌人定义（跨房间往返不复活） */
export function roomLiveEnemies(
  roomId: string,
  defs: readonly EnemyDef[],
  killed: ReadonlySet<string>,
): SpawnedEnemyRef[] {
  const out: SpawnedEnemyRef[] = [];
  defs.forEach((def, i) => {
    if (!killed.has(`${roomId}:${i}`)) out.push({ def, idx: i });
  });
  return out;
}
