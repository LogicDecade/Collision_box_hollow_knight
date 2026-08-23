// 本地存档（浏览器 localStorage）。云端存档在 MVP 之后复用同一结构。
export interface SaveData {
  hp: number;
  soul: number;
  room: string;
  spawn: string;
  /** 已击杀敌人 key 列表（`房间id:定义索引`），跨房间往返不复活 */
  killed?: string[];
}

const KEY = 'cb_save';

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    if (typeof d.hp !== 'number' || typeof d.soul !== 'number') return null;
    if (!Array.isArray(d.killed)) d.killed = [];
    return d;
  } catch {
    return null;
  }
}

export function saveSave(d: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // 隐私模式等场景下静默失败
  }
}
