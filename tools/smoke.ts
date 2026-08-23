// 无头冒烟测试：直接驱动 client 的核心玩法逻辑（Player/Enemy/Combat/Rooms），
// 不经浏览器渲染，验证移动/跳跃/攻击/灵魂/踏击/回血/过渡触发/死亡重生。
// 运行：npx tsx tools/smoke.ts
import { Player } from '../packages/client/src/entities/player';
import { Enemy } from '../packages/client/src/entities/enemies';
import { Combat, Fighter } from '../packages/client/src/engine/hitbox';
import { FEEL } from '../packages/client/src/engine/feel';
import { ROOMS } from '../packages/client/src/world/rooms';
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
function makeSim(x: number, y: number, foes: { kind: 'crawler' | 'walker'; x: number; y: number }[] = []): Sim {
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
        player.update(DT, cur, hub.solids);
        for (const e of enemies) e.update(DT, hub.solids, { x: player.x, y: player.y, alive: player.alive });
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

console.log('== 3. 攻击命中敌人：扣血 / 击杀 / 获得灵魂 ==');
{
  const s = makeSim(400, 619, [{ kind: 'crawler', x: 448, y: 630 }]);
  s.run(1, () => inp({ attackPressed: true }));
  s.run(12, () => inp({}));
  check('敌人被扣血', s.enemies[0].hp < 1 || !s.enemies[0].alive, `hp=${s.enemies[0].hp} alive=${s.enemies[0].alive}`);
  check('敌人阵亡', !s.enemies[0].alive);
  check('玩家获得灵魂', s.player.soul >= FEEL.soulPerHit, `soul=${s.player.soul}`);
}

console.log('== 4. 下劈踏击(Pogo)：命中下方敌人后玩家反向弹起 ==');
{
  const s = makeSim(300, 560, [{ kind: 'walker', x: 304, y: 623 }]); // 玩家在空中，敌人在地面
  let bounceSeen = false;
  let didHit = false;
  s.run(20, (i) => {
    const f = inp({ ly: 1, attackPressed: i === 1 });
    if (i > 1 && s.player.vy < -200 && !bounceSeen) { bounceSeen = true; }
    return f;
  });
  check('下劈生效(敌人扣血)', s.enemies[0].hp < 3, `hp=${s.enemies[0].hp}`);
  check('触发踏击弹起', bounceSeen, `vy=${Math.round(s.player.vy)}`);
  void didHit;
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

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
