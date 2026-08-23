// GameScene：世界（房间/地形/过渡）、实体（玩家/敌人）、战斗结算、HUD、本地存档
import Phaser from 'phaser';
import { COLORS, DEPTH, WORLD_H, WORLD_W } from '../engine/constants';
import { FEEL } from '../engine/feel';
import { Input } from '../engine/input';
import { Combat, Fighter } from '../engine/hitbox';
import { rectsOverlap } from '../engine/rect';
import { Player } from '../entities/player';
import { Enemy } from '../entities/enemies';
import { ROOMS, RoomDef, roomLiveEnemies, START_ROOM, START_SPAWN } from '../world/rooms';
import { loadSave, saveSave } from '../engine/save';
import { showPause, hidePause } from '../ui/pause';

interface PlayerVisual {
  c: Phaser.GameObjects.Container;
  aura: Phaser.GameObjects.Rectangle;
  body: Phaser.GameObjects.Rectangle;
  face: Phaser.GameObjects.Rectangle;
}
interface EnemyVisual {
  c: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Rectangle;
}

export class GameScene extends Phaser.Scene {
  private inputManager!: Input;
  private combat!: Combat;
  private player!: Player;
  private enemies: Enemy[] = [];
  private room!: RoomDef;
  private roomId = START_ROOM;
  private currentSpawnName = START_SPAWN;
  private transitionCd = 0;
  private healFlashTimer = 0;
  private hitstopT = 0;
  private saveTimer = 0;
  private loaded = false;
  /** 已击杀敌人 key（房间id:定义索引）→ 存档持久化，重进房间不复活 */
  private killedEnemies = new Set<string>();
  private enemyDefIndex = new Map<Enemy, number>();

  private roomLayer!: Phaser.GameObjects.Container;
  private entityLayer!: Phaser.GameObjects.Container;
  private followTarget!: Phaser.GameObjects.Rectangle;
  private hitDebug!: Phaser.GameObjects.Rectangle;
  private fadeRect!: Phaser.GameObjects.Rectangle;
  private hudGfx!: Phaser.GameObjects.Graphics;
  private roomLabel!: Phaser.GameObjects.Text;

  private playerVisual: PlayerVisual | null = null;
  private enemyVisuals = new Map<Enemy, EnemyVisual>();

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);

    this.inputManager = new Input(this);
    this.combat = new Combat();
    this.player = new Player(0, 0);
    this.player.init(this.combat);
    this.player.onHudUpdate = () => void 0;
    this.player.onDeath = () => this.handleDeath();
    this.player.onHealFlash = () => {
      this.healFlashTimer = 0.5;
    };
    this.player.onHurt = () => this.cameras.main.shake(140, 0.004);

    // 卡肉：玩家命中敌人时短暂冻结世界 + 轻微抖动
    this.combat.onHit = (owner) => {
      if (owner.team === 'player') {
        this.hitstopT = 0.07;
        this.cameras.main.shake(60, 0.0025);
      }
    };

    this.fadeRect = this.add
      .rectangle(0, 0, WORLD_W, WORLD_H, 0x000000, 1)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui + 20)
      .setAlpha(0);

    this.roomLayer = this.add.container(0, 0).setDepth(DEPTH.room);
    this.entityLayer = this.add.container(0, 0).setDepth(DEPTH.entity);
    this.followTarget = this.add.rectangle(0, 0, 1, 1).setVisible(false);

    this.hitDebug = this.add
      .rectangle(0, 0, 8, 8, COLORS.accent, 0.28)
      .setDepth(DEPTH.fx)
      .setVisible(false);

    this.buildHud();

    // 读本地存档决定初始位置与击杀记录
    const save = loadSave();
    const startRoom = save && ROOMS[save.room] ? save.room : START_ROOM;
    const startSpawn = save && ROOMS[save.room] ? save.spawn : START_SPAWN;
    if (save) {
      this.player.hp = save.hp;
      this.player.soul = save.soul;
      this.killedEnemies = new Set(save.killed ?? []);
    }
    this.loadRoom(startRoom, startSpawn);
    this.loaded = true;

    this.cameras.main.startFollow(this.followTarget, true, 0.12, 0.12);
    this.cameras.main.setBounds(0, 0, this.room.w, this.room.h);

    // 关闭页面时保存
    window.addEventListener('beforeunload', () => this.save());

    // 调试句柄
    (window as unknown as Record<string, unknown>).__cb = {
      scene: this,
      player: this.player,
      game: this.game,
    };
  }

  // ---------------- 房间加载 ----------------
  private loadRoom(id: string, spawn: string): void {
    this.save();
    this.roomId = id;
    this.room = ROOMS[id];
    const sp = this.room.spawns.find((s) => s.name === spawn) ?? this.room.spawns[0];
    if (!sp) throw new Error(`room ${id} 无出生点`);
    this.currentSpawnName = sp.name;

    this.player.x = sp.x;
    this.player.y = sp.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.invulnT = 0.8;

    // 按击杀记录生成存活敌人（击杀的在本房间不再出现）
    const liveRefs = roomLiveEnemies(this.roomId, this.room.enemies, this.killedEnemies);
    this.enemies = [];
    this.enemyDefIndex.clear();
    for (const ref of liveRefs) {
      const e = new Enemy(ref.def.kind, ref.def.x, ref.def.y);
      this.enemyDefIndex.set(e, ref.idx);
      this.enemies.push(e);
    }
    this.enemies.forEach((e) => this.settleEnemy(e));

    this.rebuildRoomLayer();
    this.rebuildEntityVisuals();

    this.cameras.main.setBounds(0, 0, this.room.w, this.room.h);
    this.followTarget.x = this.player.x;
    this.followTarget.y = this.player.y;
    this.roomLabel.setText(this.room.name);
    this.transitionCd = 0.6;
  }

  /** 敌人出生点自动落到覆盖其横向跨度的最近地面（防初始嵌入后被碰撞轴向弹飞） */
  private settleEnemy(e: Enemy): void {
    const half = e.w / 2;
    const topY = e.y - e.h / 2;
    const below = this.room.solids
      .filter((s) => e.x + half > s.x && e.x - half < s.x + s.w)
      .filter((s) => s.y >= topY)
      .sort((a, b) => a.y - b.y)[0];
    if (below) e.y = below.y - e.h / 2 - 0.5;
  }

  private rebuildRoomLayer(): void {
    this.roomLayer.removeAll(true);
    const g = this.add.graphics();
    g.lineStyle(1, COLORS.grid);
    g.strokeRect(0, 0, this.room.w, this.room.h);
    g.fillStyle(COLORS.grid, 0.55);
    for (let x = 48; x < this.room.w; x += 48) {
      for (let y = 48; y < this.room.h; y += 48) {
        g.fillCircle(x, y, 1.2);
      }
    }
    this.roomLayer.add(g);

    for (const s of this.room.solids) {
      const r = this.add
        .rectangle(s.x + s.w / 2, s.y + s.h / 2, s.w, s.h, COLORS.terrain)
        .setStrokeStyle(1, COLORS.terrainSeam, 0.9);
      this.roomLayer.add(r);
    }
    for (const t of this.room.transitions) {
      const r = this.add
        .rectangle(t.rect.x + t.rect.w / 2, t.rect.y + t.rect.h / 2, t.rect.w, t.rect.h, COLORS.trigger, 0.16)
        .setStrokeStyle(1, COLORS.trigger, 0.5);
      this.roomLayer.add(r);
    }
  }

  private rebuildEntityVisuals(): void {
    this.entityLayer.removeAll(true);
    this.enemyVisuals.clear();

    // 玩家视觉
    const aura = this.add.rectangle(0, 0, this.player.w + 16, this.player.h + 16, COLORS.soulOrb, 0.22).setVisible(false);
    let body = this.add.rectangle(0, 0, this.player.w, this.player.h, COLORS.player).setStrokeStyle(1.5, COLORS.playerLine);
    const face = this.add.rectangle(0, -6, 6, 6, COLORS.playerLine);
    const pc = this.add.container(this.player.x, this.player.y);
    pc.add(aura);
    pc.add(body);
    pc.add(face);
    this.entityLayer.add(pc);
    this.playerVisual = { c: pc, aura, body, face };

    // 敌人视觉
    for (const e of this.enemies) {
      const eb = this.add.rectangle(0, 0, e.w, e.h, COLORS.enemy).setStrokeStyle(1.5, COLORS.enemyLine);
      const ec = this.add.container(e.x, e.y);
      ec.add(eb);
      this.entityLayer.add(ec);
      this.enemyVisuals.set(e, { c: ec, body: eb });
    }
    // 换肤预留：以上 Rectangle 即“贴图槽”的默认实现（纯色盒子）
  }

  // ---------------- HUD ----------------
  private buildHud(): void {
    this.hudGfx = this.add.graphics().setDepth(DEPTH.ui + 1).setScrollFactor(0);
    this.roomLabel = this.add
      .text(0, 8, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        color: '#9a9a92',
      })
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui + 1);
    this.roomLabel.setX((WORLD_W - this.roomLabel.width) / 2);
  }

  private drawHud(): void {
    const g = this.hudGfx;
    g.clear();
    const pad = 14;
    const segW = 16;
    const segH = 7;
    const gap = 4;
    // 血量段
    for (let i = 0; i < FEEL.maxHp; i++) {
      const filled = i < this.player.hp;
      g.fillStyle(filled ? COLORS.hpFull : COLORS.hpEmpty, 1);
      g.fillRect(pad + i * (segW + gap), pad, segW, segH);
      if (!filled) {
        g.lineStyle(1, COLORS.dim);
        g.strokeRect(pad + i * (segW + gap), pad, segW, segH);
      }
    }
    // 灵魂条
    const soulW = 120;
    const soulH = 5;
    const sy = pad + segH + 8;
    g.fillStyle(COLORS.hpEmpty, 1);
    g.fillRect(pad, sy, soulW, soulH);
    g.fillStyle(COLORS.soulBar, 1);
    g.fillRect(pad, sy, soulW * (this.player.soul / FEEL.soulMax), soulH);
    g.lineStyle(1, COLORS.dim);
    g.strokeRect(pad, sy, soulW, soulH);
  }

  // ---------------- 存档/死亡 ----------------
  private save(): void {
    if (!this.loaded) return;
    saveSave({
      hp: this.player.hp,
      soul: this.player.soul,
      room: this.roomId,
      spawn: this.currentSpawnName,
      killed: [...this.killedEnemies],
    });
  }

  private handleDeath(): void {
    this.save();
    this.fadeRect.setAlpha(0);
    this.tweens.add({
      targets: this.fadeRect,
      alpha: 1,
      duration: 420,
      onComplete: () => {
        const sp = this.room.spawns.find((s) => s.name === this.currentSpawnName) ?? this.room.spawns[0];
        // 重生：重置当前房间（敌人复活），回到出生点
        this.loadRoom(this.roomId, sp.name);
        this.player.respawn(sp.x, sp.y);
        this.tweens.add({ targets: this.fadeRect, alpha: 0, duration: 420 });
      },
    });
  }

  // ---------------- 主循环 ----------------
  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 1 / 30);
    if (this.healFlashTimer > 0) this.healFlashTimer -= dt;
    if (this.transitionCd > 0) this.transitionCd -= dt;

    const inp = this.inputManager.update();
    if (inp.pausePressed) this.openPause();

    // 卡肉（hitstop）：世界冻结，只渲染不推进
    if (this.hitstopT > 0) {
      this.hitstopT -= dt;
      this.drawHud();
      this.renderAll(dt);
      return;
    }

    if (!this.player.alive) {
      // 死亡流程已在 handleDeath 中处理，这里只维持渲染
      this.renderAll(dt);
      return;
    }

    this.player.update(dt, inp, this.room.solids);

    for (const e of this.enemies) {
      e.update(dt, this.room.solids, {
        x: this.player.x,
        y: this.player.y,
        alive: this.player.alive,
      });
    }

    // 战斗结算
    const fighters: Fighter[] = [this.player, ...this.enemies];
    this.combat.update(dt, fighters);

    // 敌人死亡 → 写入击杀记录（跨房间往返不再复活）
    for (const e of this.enemies) {
      if (!e.alive) {
        const idx = this.enemyDefIndex.get(e);
        if (idx !== undefined) {
          const key = `${this.roomId}:${idx}`;
          if (!this.killedEnemies.has(key)) {
            this.killedEnemies.add(key);
            this.save();
          }
        }
      }
    }

    // 敌人接触伤害
    if (this.player.invulnT <= 0) {
      for (const e of this.enemies) {
        if (e.alive && e.overlapsPlayer(this.player.rect())) {
          this.player.takeHit(
            { damage: 1, knockX: FEEL.knockX * 0.8, knockY: FEEL.knockY * 0.6 },
            e.x < this.player.x ? 1 : -1,
          );
          break;
        }
      }
    }

    // 掉落出界
    if (this.player.alive && this.player.y > this.room.h + 90) {
      this.player.takeHit({ damage: 99, knockX: 0, knockY: 0 }, 1);
    }

    // 房间过渡
    if (this.transitionCd <= 0) {
      for (const t of this.room.transitions) {
        if (rectsOverlap(this.player.rect(), t.rect)) {
          this.loadRoom(t.to, t.spawn);
          break;
        }
      }
    }

    // 相机跟随 + 前视
    this.followTarget.x = this.player.x;
    this.followTarget.y = this.player.y;
    this.cameras.main.setFollowOffset(this.player.facing * 70, 0);

    // 定期存档
    this.saveTimer += dt;
    if (this.saveTimer > 12) {
      this.saveTimer = 0;
      this.save();
    }

    this.drawHud();
    this.renderAll(dt);
  }

  private renderAll(dt: number): void {
    const pv = this.playerVisual;
    if (pv && this.player.alive === false) {
      pv.c.setVisible(false);
    }
    if (pv) {
      pv.c.setVisible(true);
      pv.c.setPosition(this.player.x, this.player.y);
      pv.face.setPosition(this.player.facing * 9, -6);
      const flash = this.player.hitFlash > 0;
      pv.body.setFillStyle(flash ? COLORS.hurt : COLORS.player, 1);
      const blink = this.player.invulnT > 0 && Math.floor(this.player.invulnT * 12) % 2 === 0;
      pv.c.setAlpha(blink ? 0.35 : 1);
      const healing = this.player.state === 'heal';
      pv.aura.setVisible(healing || this.healFlashTimer > 0).setAlpha(healing ? 0.26 : 0.1);
    }

    for (const [e, v] of this.enemyVisuals) {
      if (!e.alive) {
        v.c.setVisible(false);
        continue;
      }
      v.c.setVisible(true);
      v.c.setPosition(e.x, e.y);
      v.body.setFillStyle(e.flashT > 0 ? COLORS.hurt : COLORS.enemy, 1);
    }

    // 攻击判定框（debug 视觉）：整段挥击期间可见、随玩家移动
    const sb = this.player.swingBox;
    if (sb) {
      this.hitDebug.setPosition(sb.x + sb.w / 2, sb.y + sb.h / 2).setSize(sb.w, sb.h).setVisible(true);
    } else {
      this.hitDebug.setVisible(false);
    }
    void dt;
  }

  private openPause(): void {
    this.scene.pause();
    showPause(() => {
      hidePause();
      this.scene.resume();
    });
  }
}
