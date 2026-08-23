// 本地存档（浏览器 localStorage）。云端存档在 MVP 之后复用同一结构。
export interface SaveData {
  hp: number;
  soul: number;
  room: string;
  spawn: string;
}

const KEY = 'cb_save';

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    if (typeof d.hp !== 'number' || typeof d.soul !== 'number') return null;
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
