// 编辑器「保存到工程」的网络辅助：带上 map token，把整块 TS 发给本地后端写回 rooms.ts。
import type { RoomDef } from '../world/rooms';
import { workingSetToEntryTS } from './roomData';

export const TOKEN_LS_KEY = 'cb_editor_token';

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_LS_KEY) || '';
  } catch {
    return '';
  }
}
export function setToken(t: string): void {
  try {
    localStorage.setItem(TOKEN_LS_KEY, t.trim());
  } catch {
    /* 无痕模式等，忽略 */
  }
}

export interface SaveStatus {
  ok: boolean;
  msg: string;
}

export async function saveRoomsToProject(rooms: readonly RoomDef[], token: string): Promise<SaveStatus> {
  return postSave('/api/editor/save-room', workingSetToEntryTS(rooms), token);
}

/** 角色参数 → 后端写回 feel.ts 围栏段 */
export async function saveFeelToProject(block: string, token: string): Promise<SaveStatus> {
  return postSave('/api/editor/save-feel', block, token);
}

async function postSave(path: string, block: string, token: string): Promise<SaveStatus> {
  if (!token.trim()) return { ok: false, msg: '先填 map token（启动后端日志里有）' };
  setToken(token);
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token.trim(), block }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; hint?: string };
    if (res.ok) return { ok: true, msg: data.hint || '已保存' };
    if (res.status === 401) {
      setToken('');
      return { ok: false, msg: data.error || 'token 无效，请重新填写' };
    }
    return { ok: false, msg: data.error || `保存失败（HTTP ${res.status}）` };
  } catch {
    return { ok: false, msg: '无法连接后端（后端没起？）' };
  }
}
