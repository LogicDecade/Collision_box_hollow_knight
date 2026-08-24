// 敌人：巡逻 / 追击 / 受击 / 死亡 的状态机
import { FEEL } from '../engine/feel';
import { Rect, moveAndSlide, isGroundedBelow, rectsOverlap } from '../engine/rect';
import { FightSpec, Fighter } from '../engine/hitbox';

export type EnemyKind = 'crawler' | 'walker';

interface EnemyStat {
  hp: number;
  w: number;
  h: number;
  speed: number;
  chaseSpeed: number;
  chaseRange: number;
}

const STATS: Record<EnemyKind, EnemyStat> = {
  crawler: { hp: 3, w: 24, h: 20, speed: 52, chaseSpeed: 52, chaseRange: 0 },
  walker: { hp: 6, w: 30, h: 34, speed: 55, chaseSpeed: 125, chaseRange: 280 },
};

let uid = 0;

export class Enemy implements Fighter {
  readonly team = 'enemy' as const;
  readonly id: string;
  readonly kind: EnemyKind;
  alive = true;
  hp: number;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  dir = 1;
  onGround = false;
  flashT = 0;
  private knockT = 0;
  private stat: EnemyStat;
  private state: 'wander' | 'chase' = 'wander';
  /** 上一帧撞到的墙方向（-1 左墙 / 1 右墙 / 0 无），供追击贴墙判定 */
  private wallHitDir = 0;
  /** 追击被挡住后的暂停时长：剩余秒数内转为巡逻（够不到就放弃追击） */
  private chaseHaltT = 0;

  constructor(kind: EnemyKind, x: number, y: number) {
    this.id = `e${uid++}`;
    this.kind = kind;
    this.stat = STATS[kind];
    this.hp = this.stat.hp;
    this.x = x;
    this.y = y;
  }

  get w(): number {
    return this.stat.w;
  }
  get h(): number {
    return this.stat.h;
  }

  rect(): Rect {
    return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
  }
  getHurtRect(): Rect {
    return this.rect();
  }

  takeHit(spec: FightSpec, fromDir: number): void {
    if (!this.alive) return;
    this.hp -= spec.damage;
    this.flashT = 0.12;
    if (this.hp <= 0) {
      this.alive = false;
      this.state = 'wander';
      return;
    }
    this.knockT = 0.14;
    this.vx = fromDir * Math.abs(spec.knockX) * 0.55;
    this.vy = -Math.abs(spec.knockY) * 0.7;
  }

  update(
    dt: number,
    solids: readonly Rect[],
    player: { x: number; y: number; alive: boolean } | null,
  ): void {
    if (!this.alive) return;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.chaseHaltT > 0) this.chaseHaltT -= dt;

    // 重力
    if (!this.onGround) {
      this.vy = Math.min(FEEL.maxFall, this.vy + FEEL.gravity * 0.92 * dt);
    } else {
      this.vy = 0;
    }

    if (this.knockT > 0) {
      this.knockT -= dt;
    } else {
      // 决定朝向与速度
      const dx = player ? player.x - this.x : 0;
      const chase =
        player &&
        player.alive &&
        this.stat.chaseRange > 0 &&
        Math.abs(dx) < this.stat.chaseRange &&
        dx !== 0 &&
        this.chaseHaltT <= 0;
      this.state = chase ? 'chase' : 'wander';
      const speed = this.state === 'chase' ? this.stat.chaseSpeed : this.stat.speed;

      // 基础期望方向：巡逻沿旧方向；追击朝向玩家
      let wantDir = chase ? Math.sign(dx) : this.dir;

      if (this.onGround && !this.probeGroundAhead(wantDir, solids)) {
        // 前方无地面（悬崖）：追击暂停 0.6s 并转身巡逻，不跳崖
        this.chaseHaltT = Math.max(this.chaseHaltT, 0.6);
        wantDir = this.dir * -1;
      } else if (chase && wantDir === this.wallHitDir) {
        // 追击方向刚撞过墙：放弃追击，暂停后转身走开（防卡在门边）
        this.chaseHaltT = Math.max(this.chaseHaltT, 0.6);
        wantDir = this.dir * -1;
      }

      if (wantDir !== 0) this.dir = wantDir;
      this.vx = wantDir * speed;
    }

    if (this.knockT > 0) {
      // 击退中仍受运动学
    }

    // 位移 + 碰撞
    const body = this.rect();
    const res = moveAndSlide(body, { x: this.vx, y: this.vy }, dt, solids);
    this.x = body.x + this.w / 2;
    this.y = body.y + this.h / 2;
    // 接地判定要稳：恰好齐平地板时 moveAndSlide 探测不到重叠，
    // 若只用 res.ground 会逐帧抖动，导致悬崖守卫间歇失效。用脚下探针兜底。
    this.onGround = res.ground || this.probeGroundNow(solids, body);
    if (this.onGround) this.vy = 0;

    // 巡逻换向：撞墙 或 前方悬空（可能是坑）
    if (!this.knockT) {
      if (res.wallLeft) this.dir = 1;
      else if (res.wallRight) this.dir = -1;
      else if (
        this.onGround &&
        !isGroundedBelow(body, this.y + this.h / 2 + 8, solids)
      ) {
        this.dir *= -1;
      }
    }
    this.wallHitDir = res.wallLeft ? -1 : res.wallRight ? 1 : 0;
  }

  /** 脚下是否有地面（紧贴地面时稳定判定） */
  private probeGroundNow(solids: readonly Rect[], body?: Rect): boolean {
    const b = body ?? this.rect();
    const probe: Rect = { x: b.x + 1, y: b.y + b.h + 1, w: Math.max(2, b.w - 2), h: 3 };
    return solids.some((s) => rectsOverlap(probe, s));
  }

  /** 朝 dir 方向前方是否有地面（探脚点），用于悬崖判断 */
  private probeGroundAhead(dir: number, solids: readonly Rect[]): boolean {
    if (dir === 0) return true; // 未定方向视为安全
    const gx = dir > 0 ? this.x + this.w / 2 + 6 : this.x - this.w / 2 - 6;
    const probe: Rect = { x: gx - 2, y: this.y + this.h / 2 + 6, w: 4, h: 3 };
    return solids.some((s) => rectsOverlap(probe, s));
  }

  /** 是否撞到玩家（供场景做接触伤害） */
  overlapsPlayer(playerRect: Rect): boolean {
    return rectsOverlap(this.rect(), playerRect);
  }
}
