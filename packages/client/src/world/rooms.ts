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
  /** 通道门：有值=需本房间小怪清空后开放；双侧(双方过渡)用同一个 door 名 → 同时开/关 */
  door?: string;
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
      { x:0, y:648, w:1608, h:120 },
      { x:0, y:0, w:48, h:648 },
      { x:1560, y:0, w:48, h:648 },
      { x:240, y:456, w:340, h:24 },
      { x:648, y:360, w:144, h:24 },
      { x:1220, y:390, w:220, h:22 },
      { x:120, y:552, w:48, h:96 },
      { x:840, y:264, w:264, h:24 },
      { x:1152, y:168, w:408, h:24 }
      ],
      spawns: [
      { name:"enter", x:90, y:618 },
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
      { x:696, y:552, w:480, h:72 },
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
      { name:"fromArena", x:1402, y:538 }
      ],
      transitions: [
      { rect: { x:0, y:460, w:46, h:120 }, to:"hub", spawn:"fromCorridor" },
      { rect: { x:1440, y:440, w:60, h:140 }, to:"arena", spawn:"fromCorridor", door:"arenaGate" }
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
      { x:648, y:480, w:96, h:24 },
      { x:408, y:360, w:96, h:24 },
      { x:792, y:384, w:72, h:24 },
      { x:912, y:504, w:48, h:168 },
      { x:1128, y:432, w:24, h:48 },
      { x:1272, y:456, w:72, h:24 },
      { x:936, y:288, w:96, h:24 },
      { x:840, y:192, w:24, h:24 },
      { x:672, y:168, w:96, h:24 },
      { x:408, y:120, w:240, h:24 },
      { x:0, y:-24, w:504, h:48 },
      { x:600, y:-24, w:1104, h:48 },
      { x:552, y:408, w:48, h:24 },
      { x:960, y:240, w:24, h:48 }
      ],
      spawns: [
      { name:"fromCorridor", x:140, y:638 },
      { name:"formHigh", x:528, y:90 }
      ],
      transitions: [
      { rect: { x:0, y:540, w:46, h:140 }, to:"corridor", spawn:"fromArena", door:"arenaGate" },
      { rect: { x:500, y:-70, w:100, h:96 }, to:"room1", spawn:"fromArena", door:"ArenaHigh" }
      ],
      enemies: [
      { kind:"walker", x:1320, y:648 },
      { kind:"crawler", x:720, y:648 },
      { kind:"crawler", x:1040, y:648 },
      { kind:"crawler", x:984, y:432 },
      { kind:"walker", x:1056, y:456 },
      { kind:"crawler", x:852, y:168 }
      ],
  };
  // High · id="room1"（由碰撞箱地图编辑器生成）
  const room1: RoomDef = {
      id: "room1",
      name: "High",
      w: 3200,
      h: 1500,
      solids: [
      { x:24, y:1440, w:1992, h:72 },
      { x:2136, y:1440, w:1056, h:72 },
      { x:1344, y:0, w:168, h:552 },
      { x:1512, y:360, w:312, h:192 },
      { x:1200, y:696, w:408, h:288 },
      { x:1368, y:984, w:240, h:456 },
      { x:1608, y:1320, w:144, h:24 },
      { x:1800, y:1200, w:192, h:24 },
      { x:2160, y:984, w:264, h:24 },
      { x:2424, y:912, w:144, h:96 },
      { x:2520, y:1008, w:192, h:168 },
      { x:2640, y:816, w:192, h:96 },
      { x:2640, y:912, w:72, h:96 },
      { x:2232, y:1008, w:72, h:24 },
      { x:2352, y:1008, w:24, h:24 },
      { x:2280, y:1032, w:24, h:216 },
      { x:2376, y:624, w:216, h:24 },
      { x:2472, y:648, w:48, h:48 },
      { x:2112, y:528, w:192, h:48 },
      { x:1728, y:792, w:192, h:24 },
      { x:3192, y:0, w:72, h:1512 },
      { x:-48, y:0, w:72, h:1512 },
      { x:-48, y:-48, w:3312, h:48 },
      { x:2688, y:696, w:120, h:24 },
      { x:2040, y:1080, w:72, h:24 },
      { x:768, y:1320, w:96, h:24 },
      { x:600, y:1224, w:72, h:24 },
      { x:504, y:1104, w:48, h:24 },
      { x:408, y:960, w:72, h:24 },
      { x:576, y:864, w:120, h:24 },
      { x:768, y:792, w:120, h:24 },
      { x:960, y:720, w:120, h:24 },
      { x:504, y:1080, w:24, h:24 },
      { x:936, y:840, w:24, h:24 },
      { x:960, y:1032, w:24, h:24 },
      { x:816, y:984, w:24, h:24 },
      { x:1104, y:864, w:24, h:24 }
      ],
      spawns: [
      { name:"fromArena", x:2050, y:1300 }
      ],
      transitions: [
      { rect: { x:2000, y:1470, w:150, h:96 }, to:"arena", spawn:"formHigh", door:"ArenaHigh" }
      ],
      enemies: [
      { kind:"crawler", x:1680, y:1416 },
      { kind:"walker", x:1752, y:1416 },
      { kind:"crawler", x:2424, y:1416 },
      { kind:"walker", x:3024, y:1416 },
      { kind:"walker", x:2736, y:1416 },
      { kind:"crawler", x:2688, y:792 },
      { kind:"crawler", x:2496, y:888 },
      { kind:"crawler", x:2304, y:960 },
      { kind:"crawler", x:2496, y:600 },
      { kind:"crawler", x:1848, y:768 },
      { kind:"crawler", x:1416, y:672 },
      { kind:"crawler", x:1704, y:1296 }
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

/** 本房间小怪清空 → 应解锁的通道门列表（未清空则一个不开）。door 双侧同名 → 同时开/关 */
export function doorsUnlockedByRoom(
  room: RoomDef,
  roomId: string,
  killed: ReadonlySet<string>,
): string[] {
  if (roomLiveEnemies(roomId, room.enemies, killed).length > 0) return [];
  const doors = new Set<string>();
  for (const t of room.transitions) if (t.door) doors.add(t.door);
  return [...doors];
}
