// 战斗判定：ActiveHit(命中盒) ↔ Fighter(受伤判定盒) 的统一结算
import type { Rect } from './rect';
import { rectsOverlap } from './rect';

export interface FightSpec {
  damage: number;
  /** 施加给被击者的击退方向与力度 */
  knockX: number;
  knockY: number;
  /** 命中后给攻击方补充的灵魂 */
  soul?: number;
  /** 命中回调（如踏击弹跳、回血联动） */
  onHit?: (target: Fighter) => void;
  /** 是否穿透（命中后不消失，可继续命中其它目标） */
  pierce?: boolean;
}

export interface Fighter {
  id: string;
  team: 'player' | 'enemy';
  alive: boolean;
  getHurtRect(): Rect;
  takeHit(spec: FightSpec, fromDir: number): void;
  /** 命中敌人时攻击方回魂（可选） */
  gainSoul?(n: number): void;
}

export interface ActiveHit {
  id: number;
  owner: Fighter;
  rect: Rect;
  spec: FightSpec;
  /** 剩余存活时间（秒） */
  ttl: number;
  alreadyHit: Set<string>;
  dead: boolean;
}

export class Combat {
  private hits: ActiveHit[] = [];
  private nextId = 1;

  add(owner: Fighter, rect: Rect, spec: FightSpec, ttl = 0.16): ActiveHit {
    const hit: ActiveHit = {
      id: this.nextId++,
      owner,
      rect,
      spec,
      ttl,
      alreadyHit: new Set(),
      dead: false,
    };
    this.hits.push(hit);
    return hit;
  }

  remove(hit: ActiveHit): void {
    hit.dead = true;
  }

  clearOwner(owner: Fighter): void {
    for (const h of this.hits) {
      if (h.owner === owner) h.dead = true;
    }
  }

  update(dt: number, fighters: readonly Fighter[]): void {
    for (const h of this.hits) {
      if (h.dead) continue;
      h.ttl -= dt;
      if (h.ttl <= 0) {
        h.dead = true;
        continue;
      }
      for (const f of fighters) {
        if (!f.alive || f === h.owner || h.alreadyHit.has(f.id)) continue;
        if (f.team === h.owner.team) continue;
        if (rectsOverlap(h.rect, f.getHurtRect())) {
          h.alreadyHit.add(f.id);
          f.takeHit(h.spec, h.owner.getHurtRect().x < f.getHurtRect().x ? 1 : -1);
          h.spec.onHit?.(f);
          if (h.spec.soul) h.owner.gainSoul?.(h.spec.soul);
          if (!h.spec.pierce) h.dead = true;
        }
      }
    }
    this.hits = this.hits.filter((h) => !h.dead);
  }
}
