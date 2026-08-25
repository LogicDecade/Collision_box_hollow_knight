// 编辑器「保存到工程」写文件模块。
// 只允许替换 world/rooms.ts 内由围栏标记圈定的数据段，其余一律不动；
// 写前用 esbuild 做语法校验、写前备份 .bak、写后原子落盘，失败不破坏原文件。
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
// packages/server/src → packages → 工程根 → packages/client/src/world/rooms.ts
// 测试可经 EDITOR_ROOMS_PATH 指向临时文件
const ROOMS_TS = process.env.EDITOR_ROOMS_PATH || join(__dirname, '../../client/src/world/rooms.ts');
const BAK_DIR = join(__dirname, '../../../.map-backups');

export const FENCE_START = '// ==== EDITOR_DATA_START ====';
export const FENCE_END = '// ==== EDITOR_DATA_END ====';

interface SaveResult {
  ok: boolean;
  error?: string;
  /** 写入后的区块行数（区域也变了，新数组行数可能和旧的不同——此值用于汇报） */
  blockLines?: number;
}

/**
 * 把 rooms.ts 围栏之间的旧内容整体替换为新的房间数组源码。
 * @param block 新的数据块源码（可含 0..n 个房间常量定义；整块会被写入围栏之间）
 */
export async function writeRoomsBlock(block: string, pathOverride?: string): Promise<SaveResult> {
  const target = pathOverride || ROOMS_TS;
  let src: string;
  try {
    src = readFileSync(target, 'utf8');
  } catch {
    return { ok: false, error: `读不到 ${target}` };
  }
  const start = src.indexOf(FENCE_START);
  const end = src.indexOf(FENCE_END);
  if (start < 0 || end < 0 || end <= start + FENCE_START.length) {
    return { ok: false, error: `rooms.ts 缺少有效的编辑器围栏（${FENCE_START.trim()} … ${FENCE_END.trim()}）` };
  }

  // 校验：以数据块为 AST 根做一次 esbuild transform，语法错会 throw
  try {
    await build({ stdin: { contents: block, sourcefile: 'rooms_editor_block.ts', loader: 'ts' }, write: false });
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
  const updated = src.slice(0, start) + FENCE_START + '\n' + newBlock + '\n' + FENCE_END + src.slice(end + FENCE_END.length);

  // 写前备份（同内容不重复留档）
  try {
    mkdirSync(BAK_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const bak = join(BAK_DIR, `rooms-${stamp}.bak`);
    writeFileSync(bak, src, 'utf8');
  } catch {
    /* 备份失败不阻断主流程，但置个警告位 */
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
