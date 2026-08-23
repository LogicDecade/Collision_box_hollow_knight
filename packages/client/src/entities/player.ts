// 玩家：手感状态机 + 攻击(平/上/下劈+踏击) + 灵魂(回血)
import { FEEL } from '../engine/feel';
import { Rect, moveAndSlide, rectsOverlap } from '../engine/rect';
import type { FrameInput } from '../engine/input';
import { Combat, ActiveHit, FightSpec, Fighter } from '../engine/hitbox';

export type PlayerState =
  | 'idle'
  | 'run'
  | 'jump'
  | 'fall'
  | 'wallslide'
  | 'attack'
  | 'upattack'
  | 'downattack'
  | 'heal'
  | 'hurt'
  | 'dead';

type BoxShape = { w: number; h: number };

export class Player implements Fighter {
  readonly id = 'player';
  readonly team = 'player' as const;
  alive = true;

  x: number;
  y: number; // 中心坐标
  vx = 0;
  vy = 0;
  facing = 1;
  hp: number = FEEL.maxHp;
  soul = 0;
  state: PlayerState = 'idle';
  private stateT = 0;
  private coyoteT = 0;
  private bufT = 0;
  private atkCdT = 0;
  private healChargedT = 0;
  private activeHit: ActiveHit | null = null;
  private combat: Combat | null = null;
  private onGround = false;
  private wallDir = 0;
  invulnT = 0;
  hitFlash = 0;

  onHudUpdate?: () => void;
  onDeath?: () => void;
  onHealFlash?: () => void;
  onHurt?: () => void;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  get w(): number {
    return FEEL.playerW;
  }
  get h(): number {
    return FEEL.playerH;
  }

  rect(): Rect {
    return {
      x: this.x - this.w / 2,
      y: this.y - this.h / 2,
      w: this.w,
      h: this.h,
    };
  }
  getHurtRect(): Rect {
    return this.rect();
  }

  /** 当前攻击命中框（供场景绘制调试/特效） */
  get activeHitRect(): Rect | null {
    return this.activeHit?.rect ?? null;
  }

  init(combat: Combat): void {
    this.combat = combat;
  }

  /** 受击（统一入口：敌人接触/敌人攻击均走这里） */
  takeHit(spec: FightSpec, fromDir: number): void {
    if (this.invulnT > 0 || !this.alive) return;
    this.hp -= spec.damage;
    this.invulnT = FEEL.hurtInvuln;
    this.hitFlash = 0.14;
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
      return;
    }
    this.combat?.clearOwner(this);
    this.setState('hurt');
    this.vx = -fromDir * FEEL.knockX;
    this.vy = -FEEL.knockY;
    this.onHurt?.();
    this.onHudUpdate?.();
  }

  private die(): void {
    this.alive = false;
    this.combat?.clearOwner(this);
    this.setState('dead');
    this.onDeath?.();
  }

  respawn(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.hp = FEEL.maxHp;
    this.invulnT = 1.0;
    this.alive = true;
    this.setState('idle');
    this.onHudUpdate?.();
  }

  gainSoul(n: number): void {
    this.soul = Math.min(FEEL.soulMax, this.soul + n);
    this.onHudUpdate?.();
  }

  private setState(s: PlayerState): void {
    if (this.state !== s) {
      this.state = s;
      this.stateT = 0;
    }
  }

  private canAct(): boolean {
    return (
      this.state === 'idle' ||
      this.state === 'run' ||
      this.state === 'jump' ||
      this.state === 'fall' ||
      this.state === 'wallslide'
    );
  }

  /** 攻击几何：按状态给出判定盒大小与相对玩家的偏移 */
  private attackGeometry(state: PlayerState): { box: BoxShape; ox: number; oy: number } {
    if (state === 'upattack') {
      return { box: FEEL.upSlashBox, ox: 0, oy: FEEL.upSlashOffsetY };
    }
    if (state === 'downattack') {
      return { box: FEEL.downSlashBox, ox: 0, oy: FEEL.downSlashOffsetY };
    }
    return { box: FEEL.attackBox, ox: this.facing * FEEL.attackOffsetX, oy: 0 };
  }

  /** 可见挥击框：整段攻击动画期间跟随玩家（伤害判定仍由 Combat 的 ttl 命中窗控制） */
  get swingBox(): Rect | null {
    if (this.state !== 'attack' && this.state !== 'upattack' && this.state !== 'downattack') {
      return null;
    }
    const { box, ox, oy } = this.attackGeometry(this.state);
    return { x: this.x + ox - box.w / 2, y: this.y + oy - box.h / 2, w: box.w, h: box.h };
  }

  private startAttack(kind: 'attack' | 'upattack' | 'downattack'): void {
    this.combat?.clearOwner(this);
    this.setState(kind);
    this.stateT = 0;
    this.atkCdT = FEEL.attackCd;
    if (kind === 'upattack') {
      this.vy = -FEEL.upSlashHop;
    }
    const { box, ox, oy } = this.attackGeometry(kind);
    const hitRect: Rect = {
      x: this.x + ox - box.w / 2,
      y: this.y + oy - box.h / 2,
      w: box.w,
      h: box.h,
    };
    const spec: FightSpec = {
      damage: 1,
      knockX: 170,
      knockY: -130,
      soul: FEEL.soulPerHit,
      onHit: kind === 'downattack' ? () => this.pogo() : undefined,
    };
    this.activeHit = this.combat?.add(this, hitRect, spec, FEEL.attackHitWindow) ?? null;
  }

  /** 下劈踏击：命中敌人瞬间向上弹跳；保持 downattack，命中框继续跟随挥击 */
  private pogo(): void {
    if (this.state !== 'downattack') return;
    this.vy = -FEEL.pogoBounce;
    // 不主动销毁命中框：挥击窗口内仍可命中其它敌人（多怪连踏）
  }

  update(dt: number, input: FrameInput, solids: readonly Rect[]): void {
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    this.stateT += dt;
    if (this.invulnT > 0) this.invulnT -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.atkCdT > 0) this.atkCdT -= dt;

    if (this.state === 'dead') return;

    // ---- 攻击输入 ----
    if (input.attackPressed && this.atkCdT <= 0 && this.canAct()) {
      if (input.ly < 0) this.startAttack('upattack');
      else if (input.ly > 0) this.startAttack('downattack');
      else this.startAttack('attack');
    }

    // ---- 跳跃缓冲 ----
    if (input.jumpPressed) this.bufT = FEEL.jumpBuffer;
    if (this.bufT > 0) this.bufT -= dt;

    // ---- 各状态更新 ----
    const isAttack = this.state === 'attack' || this.state === 'upattack' || this.state === 'downattack';

    if (this.state === 'heal') {
      // 蓄力回血：锁定移动，读满即消耗
      if (input.healHeld && this.soul >= FEEL.healCost) {
        this.healChargedT += dt;
        if (this.healChargedT >= FEEL.healChannel) {
          this.soul -= FEEL.healCost;
          this.hp = Math.min(FEEL.maxHp, this.hp + 1);
          this.healChargedT = 0;
          this.onHealFlash?.();
          this.onHudUpdate?.();
        }
      } else {
        this.healChargedT = 0;
        this.setState('idle');
      }
    } else if (isAttack) {
      // 攻击空中可下落，但不能横移
      if (!this.onGround) {
        let g = FEEL.gravity;
        if (this.vy > 0) g *= FEEL.fallGravityMult;
        this.vy = Math.min(FEEL.maxFall, this.vy + g * dt);
      }
      // 命中窗内更新 hitbox 位置；窗口结束移除（伤害判定不再延续）
      if (this.activeHit && this.stateT < FEEL.attackHitWindow) {
        this.activeHit.rect = this.rectMove();
      } else if (this.activeHit) {
        this.combat?.remove(this.activeHit);
        this.activeHit = null;
      }
      if (this.stateT >= FEEL.attackDur) {
        this.setState(this.onGround ? 'idle' : 'fall');
      }
    } else if (this.state === 'hurt') {
      // 受击：只有重力 + 击退速度衰减
      this.vy = Math.min(FEEL.maxFall, this.vy + FEEL.gravity * dt);
      if (this.onGround && this.stateT > 0.2) this.setState('idle');
    } else if (this.canAct()) {
      // ---- 常规移动态 ----
      // 贴墙检测
      this.wallDir = 0;
      if (!this.onGround && input.lx !== 0) {
        const front: Rect = {
          x: input.lx > 0 ? this.x + this.w / 2 : this.x - this.w / 2 - 2,
          y: this.y - this.h / 2,
          w: 2,
          h: this.h,
        };
        if (solids.some((s) => rectsOverlap(front, s))) this.wallDir = input.lx;
      }

      // 重力
      if (!this.onGround) {
        let g = FEEL.gravity;
        if (this.vy < 0 && !input.jumpHeld) g *= FEEL.jumpCutMult;
        else if (this.vy > 0) g *= FEEL.fallGravityMult;
        this.vy = Math.min(FEEL.maxFall, this.vy + g * dt);
      }

      // 贴墙滑
      const wallSliding =
        !this.onGround && this.wallDir !== 0 && input.lx === this.wallDir;
      if (wallSliding) {
        this.vy = Math.min(this.vy, FEEL.wallSlideMax);
        this.setState('wallslide');
      } else {
        // 水平控制
        const target = input.lx * FEEL.runSpeed;
        const ground = this.onGround ? 1 : FEEL.airControl;
        if (input.lx !== 0) {
          this.vx += clamp(target - this.vx, -FEEL.accel * ground * dt, FEEL.accel * ground * dt);
          this.facing = input.lx;
        } else {
          const f = FEEL.friction * (this.onGround ? 1 : 0.6);
          this.vx -= clamp(this.vx, -f * dt, f * dt);
        }
      }

      // 跳跃 & 墙跳
      if (this.bufT > 0) {
        const canGroundJump = this.onGround || this.coyoteT > 0;
        if (canGroundJump) {
          this.vy = -FEEL.jumpVel;
          this.onGround = false;
          this.coyoteT = 0;
          this.bufT = 0;
          this.setState('jump');
        } else if (this.wallDir !== 0) {
          this.vy = -FEEL.wallJumpY;
          this.vx = -this.wallDir * FEEL.wallJumpX;
          this.facing = -this.wallDir;
          this.wallDir = 0;
          this.bufT = 0;
          this.setState('jump');
        }
      }
    }

    // ---- 状态整理（仅移动态） ----
    if (
      this.state === 'idle' ||
      this.state === 'run' ||
      this.state === 'jump' ||
      this.state === 'fall' ||
      this.state === 'wallslide'
    ) {
      if (this.onGround) this.setState(input.lx !== 0 ? 'run' : 'idle');
      else if (this.state !== 'wallslide') {
        this.setState(this.vy < 0 ? 'jump' : 'fall');
      }
    }

    // ---- 蓄力回血入口 ----
    if (input.healHeld && this.canAct() && this.soul >= FEEL.healCost && this.state !== 'heal') {
      this.setState('heal');
      this.healChargedT = 0;
    }

    // ---- 整合碰撞位移 ----
    const body = this.rect();
    const res = moveAndSlide(body, { x: this.vx, y: this.vy }, dt, solids);
    this.x = body.x + this.w / 2;
    this.y = body.y + this.h / 2;
    const wasGrounded = this.onGround;
    this.onGround = res.ground;

    // coyote：离开平台后短暂仍可跳
    if (this.onGround) this.coyoteT = FEEL.coyote;
    else if (res.wallLeft || res.wallRight) this.coyoteT = FEEL.coyote;
    else if (wasGrounded && !this.onGround) this.coyoteT = FEEL.coyote;
    else this.coyoteT = Math.max(0, this.coyoteT - dt);
  }

  /** 依据当前攻击状态计算命中盒新位置（中心跟随玩家） */
  private rectMove(): Rect {
    const { box, ox, oy } = this.attackGeometry(this.state);
    return {
      x: this.x + ox - box.w / 2,
      y: this.y + oy - box.h / 2,
      w: box.w,
      h: box.h,
    };
  }
}
