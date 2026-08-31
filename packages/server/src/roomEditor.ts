// 编辑器「保存到工程」写文件模块。
// 只允许替换指定 TS 文件内由围栏标记圈定的数据段，其余一律不动；
// 写前用 esbuild 做语法校验、写前备份 .bak、写后原子落盘，失败不破坏原文件。
// 支持 rooms.ts（地图数据）与 feel.ts（角色参数）。
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
// packages/server/src → packages → 工程根 → packages/client/src/world/rooms.ts
// 测试可经 EDITOR_ROOMS_PATH / EDITOR_FEEL_PATH 指向临时文件
const ROOMS_TS = process.env.EDITOR_ROOMS_PATH || join(__dirname, '../../client/src/world/rooms.ts');
const FEEL_TS = process.env.EDITOR_FEEL_PATH || join(__dirname, '../../client/src/engine/feel.ts');
const BAK_DIR = join(__dirname, '../../../.map-backups');

export const FENCE_START = '// ==== EDITOR_DATA_START ====';
export const FENCE_END = '// ==== EDITOR_DATA_END ====';
export const FENCE_FEEL_START = '// ==== EDITOR_ROLE_START ====';
export const FENCE_FEEL_END = '// ==== EDITOR_ROLE_END ====';

interface SaveResult {
  ok: boolean;
  error?: string;
  /** 写入后的区块行数（区域也变了，新数组行数可能和旧的不同——此值用于汇报） */
  blockLines?: number;
}

/**
 * 把 target 文件两个围栏标记之间的内容整体替换为 block（含备份/校验/原子写）。
 * @param target 目标文件路径
 * @param startMarker/endMarker 围栏标记
 * @param block 新数据块源码
 * @param fileLabel 报错时用于标记文件名的文案
 * @param bakTag 备份文件名前缀
 */
async function writeFenceBlock(
  target: string,
  startMarker: string,
  endMarker: string,
  block: string,
  fileLabel: string,
  bakTag: string,
): Promise<SaveResult> {
  let src: string;
  try {
    src = readFileSync(target, 'utf8');
  } catch {
    return { ok: false, error: `读不到 ${target}` };
  }
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker);
  if (start < 0 || end < 0 || end <= start + startMarker.length) {
    return { ok: false, error: `${fileLabel} 缺少有效的编辑器围栏（${startMarker.trim()} … ${endMarker.trim()}）` };
  }

  // 校验：以数据块为 AST 根做一次 esbuild transform，语法错会 throw
  try {
    await build({ stdin: { contents: block, sourcefile: `${bakTag}_editor_block.ts`, loader: 'ts' }, write: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message.split('\n').find((l) => l.includes('ERROR')) || e.message : String(e);
    return { ok: false, error: `写入内容有语法错误，已放弃保存：${msg}` };
  }

  const indent = '  ';
  const newBlock = block
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => indent + l)
    .join('\n');
  const updated = src.slice(0, start) + startMarker + '\n' + newBlock + '\n' + endMarker + src.slice(end + endMarker.length);

  // 写前备份（同内容不重复留档）
  try {
    mkdirSync(BAK_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const bak = join(BAK_DIR, `${bakTag}-${stamp}.bak`);
    writeFileSync(bak, src, 'utf8');
  } catch {
    /* 备份失败不阻断主流程 */
  }

  // 临时文件 → 原子替换，避免写一半崩溃留下坏文件
  const tmp = target + '.tmp';
  try {
    writeFileSync(tmp, updated, 'utf8');
    renameSync(tmp, target);
  } catch (e) {
    return { ok: false, error: `写入失败：${e instanceof Error ? e.message : String(e)}` };
  }
  return { ok: true, blockLines: newBlock.split('\n').length };
}

/** 地图数据 → rooms.ts 围栏段（pathOverride 供测试指向临时文件） */
export function writeRoomsBlock(block: string, pathOverride?: string): Promise<SaveResult> {
  return writeFenceBlock(pathOverride || ROOMS_TS, FENCE_START, FENCE_END, block, 'rooms.ts', 'rooms');
}

/** 角色参数 → feel.ts 围栏段（pathOverride 供测试指向临时文件） */
export function writeFeelBlock(block: string, pathOverride?: string): Promise<SaveResult> {
  return writeFenceBlock(pathOverride || FEEL_TS, FENCE_FEEL_START, FENCE_FEEL_END, block, 'feel.ts', 'feel');
}
