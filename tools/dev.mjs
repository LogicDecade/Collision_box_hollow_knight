// 一键开发启动：同时拉起后端(3001)与前端(5173)，任一退出则整体退出。
// 用法：node tools/dev.mjs   （等价于 npm run dev）
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function up(pkg, cmd, args) {
  const cwd = join(root, 'packages', pkg);
  if (!existsSync(join(cwd, 'package.json'))) {
    console.error(`[dev] 缺少 packages/${pkg}`);
    process.exit(1);
  }
  const child = spawn(cmd, args, { cwd, shell: true, stdio: 'inherit' });
  child.on('exit', (code) => {
    console.error(`[dev] ${pkg} 退出(${code})，整体退出`);
    process.exit(code ?? 1);
  });
  return child;
}

console.log('[dev] 后端: http://localhost:3001  前端: http://localhost:5173');
console.log('[dev] 编辑器「保存到工程」用的 map token 见上方后端启动日志。');
up('server', 'npx', ['tsx', 'src/index.ts']);
up('client', 'npx', ['vite', '--host', '0.0.0.0', '--port', '5173', '--strictPort']);

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
