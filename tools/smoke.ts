// 无头冒烟测试：直接驱动 client 的核心玩法逻辑（Player/Enemy/Combat/Rooms），
// 不经浏览器渲染，验证移动/跳跃/攻击/灵魂/踏击/回血/过渡触发/死亡重生。
// 运行：npx tsx tools/smoke.ts
import { Player } from '../packages/client/src/entities/player';
import { Enemy } from '../packages/client/src/entities/enemies';
import { Combat, Fighter } from '../packages/client/src/engine/hitbox';
import { FEEL } from '../packages/client/src/engine/feel';
import { ROOMS, roomLiveEnemies } from '../packages/client/src/world/rooms';
import { parseRoom, roomToJSON, roomToTS, snapRect } from '../packages/client/src/editor/roomData';
import { rectsOverlap } from '../packages/client/src/engine/rect';
import type { FrameInput } from '../packages/client/src/engine/input';

const DT = 1 / 60;
const base: FrameInput = { lx: 0, ly: 0, jumpPressed: false, jumpHeld: false, attackPressed: false, healHeld: false, pausePressed: false };
const inp = (p: Partial<FrameInput>): FrameInput => ({ ...base, ...p });

const hub = ROOMS.hub;
let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✘ ${name}  ${detail}`); }
}

interface Sim {
  player: Player;
  enemies: Enemy[];
  combat: Combat;
  fighters: Fighter[];
  run: (frames: number, input?: (i: number) => FrameInput) => void;
}
function makeSim(
  x: number,
  y: number,
  foes: { kind: 'crawler' | 'walker'; x: number; y: number }[] = [],
  simFoes = true,
  solids: readonly { x: number; y: number; w: number; h: number }[] = hub.solids,
): Sim {
  const player = new Player(x, y);
  const combat = new Combat();
  player.init(combat);
  const enemies = foes.map((f) => new Enemy(f.kind, f.x, f.y));
  const fighters: Fighter[] = [player, ...enemies];
  return {
    player, enemies, combat, fighters,
    run(frames, inputFn) {
      for (let i = 0; i < frames; i++) {
        const cur = inputFn ? inputFn(i) : base;
        player.update(DT, cur, solids);
        if (simFoes) {
          for (const e of enemies) e.update(DT, solids, { x: player.x, y: player.y, alive: player.alive });
        }
        combat.update(DT, fighters);
      }
    },
  };
}

console.log('== 1. 移动：右跑 2 秒，位置应右移且保持在地面 ==');
{
  const s = makeSim(260, 618);
  const x0 = s.player.x;
  s.run(120, () => inp({ lx: 1 }));
  check('x 增大', s.player.x > x0 + 150, `x0=${x0} x=${Math.round(s.player.x)}`);
  check('落地(未坠落)', s.player.y > 500 && s.player.y < 640, `y=${Math.round(s.player.y)}`);
}

console.log('== 2. 跳跃：起跳后上升再落回地面 ==');
{
  const s = makeSim(260, 618);
  s.run(1, () => inp({ lx: 1, jumpPressed: true }));
  const yPeak = s.player.y;
  s.run(10, () => inp({ lx: 0, jumpHeld: true }));
  check('起跳(离地/上升)', s.player.y < yPeak, `y0=${yPeak.toFixed(1)} y1=${s.player.y.toFixed(1)}`);
  s.run(90, () => inp({ lx: 0 }));
  check('落回地面高度', Math.abs(s.player.y - 618) < 8, `y=${Math.round(s.player.y)}`);
}

console.log('== 3. 攻击命中敌人：扣血 / 三刀击杀 / 获得灵魂 ==');
{
  const s = makeSim(400, 619, [{ kind: 'crawler', x: 448, y: 630 }], false);
  s.run(14, (i) => inp({ attackPressed: i === 0 }));
  check('首刀扣血但未死', s.enemies[0].hp < 3 && s.enemies[0].alive, `hp=${s.enemies[0].hp} alive=${s.enemies[0].alive}`);
  check('命中回魂', s.player.soul >= FEEL.soulPerHit, `soul=${s.player.soul}`);
  s.run(60, (i) => inp({ attackPressed: i % 24 === 0 }));
  check('三刀内击杀', !s.enemies[0].alive, `hp=${s.enemies[0].hp}`);
}

console.log('== 4. 下劈踏击(Pogo)：命中下方敌人后玩家反向弹起，判定框全程可见 ==');
{
  const s = makeSim(300, 560, [{ kind: 'walker', x: 304, y: 623 }]); // 玩家在空中，敌人在地面
  let bounceSeen = false;
  let boxFrames = 0;
  s.run(20, (i) => {
    const f = inp({ ly: 1, attackPressed: i === 1 });
    if (s.player.swingBox) boxFrames++;
    if (i > 1 && s.player.vy < -200 && !bounceSeen) { bounceSeen = true; }
    return f;
  });
  check('下劈生效(敌人扣血)', s.enemies[0].hp < 6, `hp=${s.enemies[0].hp}`);
  check('触发踏击弹起', bounceSeen, `vy=${Math.round(s.player.vy)}`);
  check('下劈判定框可见≥4帧(不瞬消)', boxFrames >= 4, `boxFrames=${boxFrames}`);
}

console.log('== 5. 灵魂回血：消耗 33 灵魂，蓄力完成后 +1 HP ==');
{
  const s = makeSim(260, 619);
  s.player.hp = 5;
  s.player.soul = 66;
  s.run(60, () => inp({ healHeld: true }));
  check('HP 增加', s.player.hp > 5, `hp=${s.player.hp}`);
  check('灵魂被消耗', s.player.soul < 66, `soul=${s.player.soul}`);
}

console.log('== 6. [逻辑级] 房间过渡触发：玩家矩形进入过渡区 ==');
{
  const t = hub.transitions[0]; // → corridor
  const s = makeSim(1570, 618, []);
  check('矩形重叠检测命中', rectsOverlap(s.player.rect(), t.rect));
  check('目标房间存在', !!ROOMS[t.to]);
}

console.log('== 7. 死亡与重生：归零 → onDeath → respawn 回满 ==');
{
  const s = makeSim(260, 619);
  let died = false;
  s.player.onDeath = () => { died = true; };
  s.player.hp = 1;
  s.player.invulnT = 0;
  s.player.takeHit({ damage: 1, knockX: 0, knockY: 0 }, 1);
  check('死亡', !s.player.alive && died && s.player.hp === 0, `alive=${s.player.alive} hp=${s.player.hp}`);
  died = false;
  s.player.respawn(260, 619);
  check('复活回满', s.player.alive && s.player.hp === FEEL.maxHp && !died, `alive=${s.player.alive} hp=${s.player.hp}`);
}

console.log('== 8. 追击遇崖：walker 追坑对面玩家应停在崖边不掉落 ==');
{
  const cor = ROOMS.corridor;
  // 玩家在坑左侧地面段，walker 在坑右侧地面段追击 → 冲到 x≈700 崖边应停下
  const s = makeSim(500, 538, [{ kind: 'walker', x: 760, y: 548 }], true, cor.solids);
  s.run(240, () => inp({ lx: 0 }));
  const w = s.enemies[0];
  check('walker 未掉入坑', w.alive && w.y < cor.h, `x=${w.x.toFixed(1)} y=${w.y.toFixed(1)}`);
  check(
    'walker 停在崖边(不越过坑边)',
    w.x >= 700 - 12 && w.y > 500,
    `x=${w.x.toFixed(1)} y=${w.y.toFixed(1)}`,
  );
}

console.log('== 9. 可变跳高：按住跳得更高，快速松键跳得低 ==');
{
  const measure = (hold: boolean) => {
    const s = makeSim(260, 619);
    let minY = 619;
    s.run(1, () => inp({ jumpPressed: true, jumpHeld: hold }));
    s.run(110, () => {
      minY = Math.min(minY, s.player.y);
      return inp({ jumpHeld: hold });
    });
    return minY;
  };
  const hold = measure(true);
  const tap = measure(false);
  check('按住跳更高', hold < tap - 20, `hold=${Math.round(hold)} tap=${Math.round(tap)}`);
}

console.log('== 10. 顶到平台底部：立即停止上升回落，不悬浮 ==');
{
  // hub 平台A(380,490,300x22)，玩家在其正下方地面起跳 → 头顶到达平台底(512)
  const s = makeSim(500, 619);
  let contactSeen = false;
  let hover = 0;
  s.run(1, () => inp({ jumpPressed: true }));
  s.run(90, (i) => {
    const f = inp({ jumpHeld: true });
    const ft = s.player.y - 21; // 头顶
    if (ft <= 512.5) contactSeen = true;
    if (contactSeen && s.player.y >= 525 && s.player.y <= 545) hover++;
    return f;
  });
  const finalY = s.player.y;
  check('确实顶到平台底', contactSeen);
  check('未悬浮(平台底区域逗留<20帧)', hover < 20, `hover=${hover}`);
  check('顶撞后正常回落', finalY > 580, `finalY=${Math.round(finalY)}`);
}

console.log('== 11. 击杀持久化：已击杀的敌人定义不再重生 ==');
{
  const cor = ROOMS.corridor;
  const killed = new Set(['corridor:0']); // 杀掉 crawler(索引0)
  const live = roomLiveEnemies('corridor', cor.enemies, killed);
  check(
    '存活1只且为walker(索引1)',
    live.length === 1 && live[0].idx === 1 && live[0].def.kind === 'walker',
    `n=${live.length}`,
  );
  const all = roomLiveEnemies('corridor', cor.enemies, new Set());
  check('无击杀记录时仍是2只', all.length === 2, `n=${all.length}`);
}

console.log('== 12. 追击撞墙：walker 追到走廊左门处应放弃追击转身巡逻，不卡死 ==');
{
  const cor = ROOMS.corridor;
  // 玩家贴左墙，walker 在右侧追击 → 撞到左墙(x40)后应暂停追击并走开
  const s = makeSim(90, 538, [{ kind: 'walker', x: 300, y: 548 }], true, cor.solids);
  s.run(60, () => inp({ lx: 0 }));
  let minX = Infinity;
  let maxX = -Infinity;
  s.run(180, () => {
    minX = Math.min(minX, s.enemies[0].x);
    maxX = Math.max(maxX, s.enemies[0].x);
    return inp({ lx: 0 });
  });
  const w = s.enemies[0];
  check('未穿墙', minX >= 34, `minX=${minX.toFixed(1)}`);
  check('未永久卡在左门(后续有巡逻移动)', maxX > 120, `maxX=${maxX.toFixed(1)} x=${w.x.toFixed(1)}`);
}

console.log('== 13. 编辑器数据层：TS/JSON 导出→解析往返一致 + 网格吸附 ==');
{
  const hub = ROOMS.hub;
  const same = (a: unknown) => JSON.stringify(a) === JSON.stringify(hub);
  const fromTS = parseRoom(roomToTS(hub));
  const fromJSON = parseRoom(roomToJSON(hub));
  check('TS 片段可解析回原房间', !!fromTS && same(fromTS), fromTS ? '不一致' : '解析失败');
  check('JSON 可解析回原房间', !!fromJSON && same(fromJSON), fromJSON ? '不一致' : '解析失败');
  const r = snapRect(13, 27, 33, 41);
  check(
    '网格吸附(24格)',
    r.x === 24 && r.y === 24 && r.w === 24 && r.h === 48,
    `${r.x},${r.y},${r.w},${r.h}`,
  );
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
