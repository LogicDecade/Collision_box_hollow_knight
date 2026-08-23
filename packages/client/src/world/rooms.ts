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

const hub: RoomDef = {
  id: 'hub',
  name: '客厅 · Hub',
  w: 1600,
  h: 760,
  solids: [
    { x: 0, y: 640, w: 1600, h: 120 }, // 地板
    { x: 0, y: 0, w: 40, h: 640 }, // 左墙
    { x: 1560, y: 0, w: 40, h: 640 }, // 右墙
    { x: 380, y: 490, w: 300, h: 22 }, // 平台 A
    { x: 860, y: 460, w: 240, h: 22 }, // 平台 B
    { x: 1220, y: 390, w: 220, h: 22 }, // 平台 C
    { x: 130, y: 560, w: 60, h: 80 }, // 装饰立柱
  ],
  spawns: [
    { name: 'enter', x: 260, y: 618 },
    { name: 'fromCorridor', x: 1500, y: 618 },
  ],
  transitions: [{ rect: { x: 1540, y: 480, w: 60, h: 160 }, to: 'corridor', spawn: 'fromHub' }],
  enemies: [{ kind: 'crawler', x: 520, y: 628 }],
};

const corridor: RoomDef = {
  id: 'corridor',
  name: '狭道 · Corridor',
  w: 1500,
  h: 620,
  solids: [
    { x: 0, y: 560, w: 520, h: 60 }, // 地面段 1（左侧有坑）
    { x: 700, y: 560, w: 520, h: 60 }, // 地面段 2
    { x: 1280, y: 560, w: 220, h: 60 }, // 地面段 3（通arena）
    { x: 0, y: 0, w: 40, h: 560 }, // 左墙
    { x: 1460, y: 0, w: 40, h: 560 }, // 右墙
    { x: 560, y: 430, w: 120, h: 20 }, // 坑上方平台
    { x: 980, y: 480, w: 130, h: 20 },
    { x: 380, y: 350, w: 120, h: 20 }, // 高台
  ],
  spawns: [
    { name: 'fromHub', x: 120, y: 538 },
    { name: 'fromArena', x: 1380, y: 538 },
  ],
  transitions: [
    { rect: { x: 0, y: 460, w: 46, h: 120 }, to: 'hub', spawn: 'fromCorridor' },
    { rect: { x: 1440, y: 440, w: 60, h: 140 }, to: 'arena', spawn: 'fromCorridor' },
  ],
  enemies: [
    { kind: 'crawler', x: 260, y: 548 },
    { kind: 'walker', x: 900, y: 548 },
  ],
};

const arena: RoomDef = {
  id: 'arena',
  name: '演武场 · Arena',
  w: 1700,
  h: 760,
  solids: [
    { x: 0, y: 660, w: 1700, h: 100 }, // 地板
    { x: 0, y: 0, w: 40, h: 660 }, // 左墙
    { x: 1660, y: 0, w: 40, h: 660 }, // 右墙
    { x: 480, y: 520, w: 240, h: 22 },
    { x: 900, y: 460, w: 220, h: 22 },
    { x: 1300, y: 540, w: 220, h: 22 },
  ],
  spawns: [{ name: 'fromCorridor', x: 140, y: 638 }],
  transitions: [{ rect: { x: 0, y: 540, w: 46, h: 140 }, to: 'corridor', spawn: 'fromArena' }],
  enemies: [
    { kind: 'walker', x: 1320, y: 648 },
    { kind: 'crawler', x: 720, y: 648 },
    { kind: 'crawler', x: 1040, y: 648 },
  ],
};

export const ROOMS: Record<string, RoomDef> = { hub, corridor, arena };
export const START_ROOM = 'hub';
export const START_SPAWN = 'enter';
