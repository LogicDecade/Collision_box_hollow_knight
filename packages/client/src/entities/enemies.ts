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
  crawler: { hp: 1, w: 24, h: 20, speed: 46, chaseSpeed: 46, chaseRange: 0 },
  walker: { hp: 3, w: 30, h: 34, speed: 55, chaseSpeed: 125, chaseRange: 280 },
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
      const chase = player && player.alive && this.stat.chaseRange > 0 && Math.abs(dx) < this.stat.chaseRange;
      this.state = chase ? 'chase' : 'wander';
      const speed = this.state === 'chase' ? this.stat.chaseSpeed : this.stat.speed;
      const wantDir = dx && chase ? Math.sign(dx) : this.dir;
      if (wantDir !== 0) this.dir = wantDir;
      this.vx = this.dir * speed;
    }

    if (this.knockT > 0) {
      // 击退中仍受运动学
    }

    // 位移 + 碰撞
    const body = this.rect();
    const res = moveAndSlide(body, { x: this.vx, y: this.vy }, dt, solids);
    this.x = body.x + this.w / 2;
    this.y = body.y + this.h / 2;
    this.onGround = res.ground;

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
  }

  /** 是否撞到玩家（供场景做接触伤害） */
  overlapsPlayer(playerRect: Rect): boolean {
    return rectsOverlap(this.rect(), playerRect);
  }
}
