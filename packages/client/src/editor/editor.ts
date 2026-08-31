// 碰撞箱 · 图形化地图编辑器（独立页面 /editor.html）
import Phaser from 'phaser';
import { ROOMS, RoomDef } from '../world/rooms';
import {
  GRID,
  ObjRef,
  enemyRect,
  hitTest,
  newRoom,
  parseRoom,
  roomToJSON,
  roomToTS,
  snap,
  snapRect,
} from './roomData';
import { getToken, setToken, saveRoomsToProject } from './save';
import { FEEL, loadFeelOverrides, saveFeelOverrides, clearFeelOverrides, applyFeelOverrides } from '../engine/feel';
// 需逃逸的文本值（房间名等）
const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const COL = {
  bg: 0x12120f,
  grid: 0x22221e,
  gridMajor: 0x2c2c27,
  room: 0x3c3c36,
  solid: 0x3c3a34,
  solidSel: 0x72c9f2,
  spawn: 0x4da6ff,
  transition: 0x6a86a8,
  lock: 0x9a5a3a,
  enemy: 0xe06b4f,
  text: 0x9a9a92,
};

type Tool = 'select' | 'solid' | 'spawn' | 'transition' | 'enemy';

/**
 * 角色参数编辑分组（点路径 key：'attackBox.w' 代表嵌套对象字段）。
 * 后续追加「技能」等新分组直接往这里加 { name, rows } 即可。
 */
const FEEL_GROUPS: { name: string; rows: Array<[string, string]> }[] = [
  { name: '角色体积', rows: [['playerW', '宽'], ['playerH', '高']] },
  { name: '移动', rows: [['runSpeed', '跑速'], ['accel', '加速'], ['friction', '摩擦'], ['airControl', '空中操控']] },
  { name: '跳跃', rows: [['gravity', '重力'], ['jumpVel', '起跳速度'], ['jumpCutMult', '松键切短'], ['fallGravityMult', '下落倍率'], ['maxFall', '最大下落'], ['coyote', '土狼时间'], ['jumpBuffer', '预输入']] },
  { name: '贴墙', rows: [['wallSlideMax', '下滑限速'], ['wallJumpX', '墙跳·横向'], ['wallJumpY', '墙跳·纵向']] },
  { name: '攻击', rows: [['attackCd', '冷却'], ['attackHitWindow', '命中窗口'], ['attackBox.w', '平砍·宽'], ['attackBox.h', '平砍·高'], ['attackOffsetX', '平砍·前伸'], ['upSlashBox.w', '上劈·宽'], ['upSlashBox.h', '上劈·高'], ['upSlashOffsetY', '上劈·偏移'], ['upSlashHop', '上劈·上跃'], ['downSlashBox.w', '下劈·宽'], ['downSlashBox.h', '下劈·高'], ['downSlashOffsetY', '下劈·偏移']] },
  { name: '下劈反跳', rows: [['pogoBounce', '反跳速度']] },
  { name: '灵魂', rows: [['soulMax', '上限'], ['soulPerHit', '每击获得'], ['healCost', '回血消耗'], ['healChannel', '吟唱时长']] },
  { name: '受击 / 生命', rows: [['hurtInvuln', '无敌时长'], ['knockX', '击退·X'], ['knockY', '击退·Y'], ['maxHp', '生命上限']] },
];

/** 读取 FEEL 里的值（支持点路径 'attackBox.w'） */
function feelGet(path: string): number {
  const parts = path.split('.');
  let v: unknown = FEEL;
  for (const p of parts) v = (v as Record<string, unknown>)[p];
  return typeof v === 'number' ? v : 0;
}

interface WorkingSet {
  rooms: Record<string, RoomDef>;
  current: string;
}

const LS_KEY = 'cb_editor_rooms';

function loadSet(): WorkingSet {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const list = JSON.parse(raw) as RoomDef[];
      const rooms: Record<string, RoomDef> = {};
      for (const r of list) rooms[r.id] = r;
      const current = list[0]?.id ?? 'hub';
      if (rooms[current]) return { rooms, current };
    }
  } catch {
    /* 忽略坏存档 */
  }
  return { rooms: JSON.parse(JSON.stringify(ROOMS)) as Record<string, RoomDef>, current: 'hub' };
}

class EditorScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private set!: WorkingSet;
  private room!: RoomDef;

  private tool: Tool = 'select';
  /** 角色参数草稿（点路径 key → 用户输入值，未改则为当前生效值） */
  private feelDraft = new Map<string, number>();
  private selected: ObjRef | null = null;
  private snapOn = true;
  private showGrid = true;

  private undo: string[] = [];
  private redo: string[] = [];

  private panning = false;
  private panStart = { x: 0, y: 0, sx: 0, sy: 0 };
  private drawStart: { x: number; y: number } | null = null;
  private moveDrag: { ref: ObjRef; grabDX: number; grabDY: number; corner: boolean } | null = null;

  private enemyKind: 'crawler' | 'walker' = 'crawler';
  private transTo = 'hub';
  private transSpawn = 'enter';

  constructor() {
    super('EditorScene');
  }

  create(): void {
    // 编辑器也应用已保存的角色覆盖，让面板显示「当前生效手感」
    applyFeelOverrides(loadFeelOverrides() ?? {});
    this.set = loadSet();
    // 把活房间(ROOMS)的 door 同步进工作集：防止旧工作集(无门数据)「保存到工程」时
    // 把已配好的通道门清掉；仅当 live 侧有门才补（用户想删门时保存会写回 undefined，下轮不补）
    for (const [id, live] of Object.entries(ROOMS)) {
      const ws = this.set.rooms[id];
      if (!ws) continue;
      const n = Math.min(ws.transitions.length, live.transitions.length);
      for (let i = 0; i < n; i++) {
        const d = live.transitions[i].door;
        if (d !== undefined) ws.transitions[i].door = d;
      }
    }
    this.room = this.set.rooms[this.set.current] ?? Object.values(this.set.rooms)[0];

    this.cameras.main.setBackgroundColor(COL.bg);
    // 初始相机居中显示房间
    this.cameras.main.centerOn(this.room.w / 2, this.room.h / 2);
    this.cameras.main.setZoom(0.7);

    this.g = this.add.graphics().setDepth(10);
    this.buildPanel();
    this.bindInput();
    this.commit(() => void 0);
  }

  // ================= 历史 =================
  private pushHistory(): void {
    this.undo.push(JSON.stringify(this.room));
    if (this.undo.length > 80) this.undo.shift();
    this.redo = [];
  }
  private commit(mutate: (r: RoomDef) => void): void {
    mutate(this.room);
    this.persist();
    this.redraw();
    this.renderPanel();
  }
  private undoNow(): void {
    const prev = this.undo.pop();
    if (!prev) return;
    this.redo.push(JSON.stringify(this.room));
    this.room = JSON.parse(prev);
    this.selected = null;
    this.persist();
    this.redraw();
    this.renderPanel();
  }
  private redoNow(): void {
    const next = this.redo.pop();
    if (!next) return;
    this.undo.push(JSON.stringify(this.room));
    this.room = JSON.parse(next);
    this.selected = null;
    this.persist();
    this.redraw();
    this.renderPanel();
  }
  private persist(): void {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(Object.values(this.set.rooms)));
      this.set.rooms[this.room.id] = this.room;
    } catch {
      /* 忽略 */
    }
  }

  // ================= 渲染 =================
  /** 创建/复用世界坐标标签（Graphics 无文本能力，用 Text 对象） */
  private label(x: number, y: number, str: string, color: string): void {
    if (!str) return;
    this.labels.push(
      this.add
        .text(x + 1, y + 1, str, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '10px',
          color,
        })
        .setDepth(15)
        .setOrigin(0),
    );
  }

  private redraw(): void {
    const g = this.g;
    g.clear();
    this.labels.forEach((t) => t.destroy());
    this.labels = [];
    const step = GRID;
    if (this.showGrid) {
      g.lineStyle(1, COL.grid, 0.6);
      for (let x = step; x < this.room.w; x += step) g.lineBetween(x, 0, x, this.room.h);
      for (let y = step; y < this.room.h; y += step) g.lineBetween(0, y, this.room.w, y);
      g.lineStyle(1, COL.gridMajor, 0.9);
      for (let x = step * 4; x < this.room.w; x += step * 4) g.lineBetween(x, 0, x, this.room.h);
      for (let y = step * 4; y < this.room.h; y += step * 4) g.lineBetween(0, y, this.room.w, y);
    }
    // 房间边界
    g.lineStyle(2, COL.room, 1);
    g.strokeRect(0, 0, this.room.w, this.room.h);

    // 地形
    this.room.solids.forEach((r, i) => {
      const sel = this.selected?.kind === 'solid' && this.selected.idx === i;
      g.fillStyle(COL.solid, 0.9);
      g.fillRect(r.x, r.y, r.w, r.h);
      g.lineStyle(1, sel ? COL.solidSel : 0x57554e, 1);
      g.strokeRect(r.x, r.y, r.w, r.h);
      if (sel) {
        g.lineStyle(1, COL.solidSel, 1);
        g.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
        // 右下角缩放手柄
        g.fillStyle(COL.solidSel, 1);
        g.fillRect(r.x + r.w - 4, r.y + r.h - 4, 8, 8);
      }
    });
    // 出生点
    this.room.spawns.forEach((sp, i) => {
      const sel = this.selected?.kind === 'spawn' && this.selected.idx === i;
      g.lineStyle(2, COL.spawn, 1);
      g.strokeCircle(sp.x, sp.y, 9);
      g.fillStyle(COL.spawn, sel ? 1 : 0.55);
      g.fillCircle(sp.x, sp.y, 3);
      g.fillStyle(0x0, 0.7);
      g.fillRect(sp.x - 18, sp.y - 30, 90, 14);
      this.label(sp.x - 16, sp.y - 28, `${sp.name}`, '#4da6ff');
    });
    // 通道(过渡)：带 door=需清房解锁的锁门，显示铜橙色
    this.room.transitions.forEach((t, i) => {
      const sel = this.selected?.kind === 'transition' && this.selected.idx === i;
      const c = t.door ? COL.lock : COL.transition;
      g.fillStyle(c, sel ? 0.4 : 0.18);
      g.fillRect(t.rect.x, t.rect.y, t.rect.w, t.rect.h);
      g.lineStyle(1, sel ? COL.solidSel : c, 1);
      g.strokeRect(t.rect.x, t.rect.y, t.rect.w, t.rect.h);
      // 斜纹（锁门更密）
      g.lineStyle(1, c, 0.5);
      const d = Math.max(t.rect.w, t.rect.h);
      const step = t.door ? 7 : 12;
      for (let k = -d; k < d; k += step) {
        g.lineBetween(t.rect.x + k, t.rect.y + t.rect.h, t.rect.x + k + t.rect.h, t.rect.y);
      }
      g.fillStyle(0x0, 0.75);
      g.fillRect(t.rect.x, t.rect.y - 16, 150, 14);
      this.label(t.rect.x + 3, t.rect.y - 15, `→ ${t.to}@${t.spawn}${t.door ? ' 🔒' : ''}`, '#cfcfc8');
    });
    // 敌人
    this.room.enemies.forEach((e, i) => {
      const sel = this.selected?.kind === 'enemy' && this.selected.idx === i;
      const r = enemyRect(e);
      g.fillStyle(sel ? COL.solidSel : COL.enemy, 0.85);
      g.fillTriangle(r.x, r.y + r.h, r.x + r.w / 2, r.y, r.x + r.w, r.y + r.h);
      g.fillStyle(0x0, 0.8);
      g.fillRect(e.x + 6, e.y - 13, 76, 13);
      this.label(e.x + 8, e.y - 12, `${e.kind}`, '#e06b4f');
    });
  }

  // ================= 输入 =================
  private bindInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.middleButtonDown() || p.rightButtonDown()) {
        this.panning = true;
        this.panStart = { x: p.x, y: p.y, sx: this.cameras.main.scrollX, sy: this.cameras.main.scrollY };
        return;
      }
      if (p.leftButtonDown()) this.onLeftDown(p);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.panning && (p.middleButtonDown() || p.rightButtonDown())) {
        const cam = this.cameras.main;
        cam.scrollX = this.panStart.sx - (p.x - this.panStart.x) / cam.zoom;
        cam.scrollY = this.panStart.sy - (p.y - this.panStart.y) / cam.zoom;
        return;
      }
      this.onMove(p);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.panning) this.panning = false;
      this.onUp(p);
    });
    this.input.on(
      'wheel',
      (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
        // 缩放以鼠标指针为焦点：上滚放大、下滚缩小；缩放前后指针下的世界点不动。
        // 相机为 scroll 模式(原点=左上)，世界点 = scroll + 屏幕/zoom
        const cam = this.cameras.main;
        const wpx = cam.scrollX + p.x / cam.zoom;
        const wpy = cam.scrollY + p.y / cam.zoom;
        const z2 = Phaser.Math.Clamp(cam.zoom * (dy < 0 ? 1.1 : 1 / 1.1), 0.25, 3);
        cam.setZoom(z2);
        cam.scrollX = wpx - p.x / z2;
        cam.scrollY = wpy - p.y / z2;
      },
    );
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const el = document.activeElement;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
        this.deleteSelected();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        this.undoNow();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redoNow();
      }
    });
  }

  private onLeftDown(p: Phaser.Input.Pointer): void {
    const wx = p.worldX;
    const wy = p.worldY;
    if (this.tool === 'solid') {
      this.pushHistory();
      this.drawStart = { x: wx, y: wy };
      this.commitDraft({ x: wx, y: wy, w: 1, h: 1 });
      this.redraw();
      this.renderPanel();
      return;
    }
    if (this.tool === 'spawn' || this.tool === 'enemy' || this.tool === 'transition') {
      this.pushHistory();
      const pt = this.snapOn ? snap(wx, wy) : { x: Math.round(wx), y: Math.round(wy) };
      if (this.tool === 'spawn') {
        const name = this.nextSpawnName();
        this.room.spawns.push({ name, x: pt.x, y: pt.y });
        this.selected = { kind: 'spawn', idx: this.room.spawns.length - 1 };
      } else if (this.tool === 'enemy') {
        this.room.enemies.push({ kind: this.enemyKind, x: pt.x, y: pt.y });
        this.selected = { kind: 'enemy', idx: this.room.enemies.length - 1 };
      } else {
        const rect = this.snapOn ? snapRect(pt.x, pt.y, 48, 96) : { x: pt.x, y: pt.y, w: 48, h: 96 };
        this.room.transitions.push({ rect, to: this.transTo, spawn: this.transSpawn });
        this.selected = { kind: 'transition', idx: this.room.transitions.length - 1 };
      }
      this.commit(() => void 0);
      return;
    }
    // select
    const hit = hitTest(this.room, { x: wx, y: wy });
    this.selected = hit;
    if (hit && hit.kind === 'solid') {
      const r = this.room.solids[hit.idx];
      const atCorner =
        wx >= r.x + r.w - 14 && wx <= r.x + r.w + 8 && wy >= r.y + r.h - 14 && wy <= r.y + r.h + 8;
      this.moveDrag = { ref: hit, grabDX: wx - r.x, grabDY: wy - r.y, corner: atCorner };
      this.pushHistory();
      this.redraw();
      this.renderPanel();
    } else {
      this.redraw();
      this.renderPanel();
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const wx = p.worldX;
    const wy = p.worldY;
    if (this.drawStart) {
      const r0 = this.drawStart;
      const x = Math.min(r0.x, wx);
      const y = Math.min(r0.y, wy);
      const w = Math.abs(wx - r0.x);
      const h = Math.abs(wy - r0.y);
      // 实时预览（不吸附）提交绘制对象
      this.ensureDraft({ x, y, w: Math.max(1, w), h: Math.max(1, h) });
      this.redraw();
      return;
    }
    if (this.moveDrag) {
      const { ref, grabDX, grabDY, corner } = this.moveDrag;
      if (ref.kind === 'solid') {
        const r = this.room.solids[ref.idx];
        if (corner) {
          const nx = this.snapOn ? snap(wx, wy) : { x: wx, y: wy };
          r.w = Math.max(GRID, Math.round(nx.x - r.x));
          r.h = Math.max(GRID, Math.round(nx.y - r.y));
        } else {
          const nx = this.snapOn ? snap(wx - grabDX, wy - grabDY) : { x: wx - grabDX, y: wy - grabDY };
          r.x = nx.x;
          r.y = nx.y;
        }
        this.redraw();
      } else if (ref.kind === 'spawn') {
        const sp = this.room.spawns[ref.idx];
        const nx = this.snapOn ? snap(wx, wy) : { x: wx, y: wy };
        sp.x = nx.x;
        sp.y = nx.y;
        this.redraw();
      } else if (ref.kind === 'enemy') {
        const e = this.room.enemies[ref.idx];
        const nx = this.snapOn ? snap(wx, wy) : { x: wx, y: wy };
        e.x = nx.x;
        e.y = nx.y;
        this.redraw();
      } else {
        const t = this.room.transitions[ref.idx];
        const nx = this.snapOn ? snap(wx, wy) : { x: wx, y: wy };
        t.rect.x = nx.x;
        t.rect.y = nx.y;
        this.redraw();
      }
      this.renderPanel();
      return;
    }
  }

  private onUp(_p: Phaser.Input.Pointer): void {
    if (this.drawStart) {
      // 绘制结束：吸附 + 规范化
      const el = this.room.solids[this.room.solids.length - 1];
      const s = this.snapOn ? snapRect(el.x, el.y, el.w, el.h) : el;
      el.x = s.x;
      el.y = s.y;
      el.w = s.w;
      el.h = s.h;
      if (el.w < 1 || el.h < 1) this.room.solids.pop();
      this.selected = { kind: 'solid', idx: this.room.solids.length - 1 };
      this.drawStart = null;
      this.commit(() => void 0);
    }
    if (this.moveDrag) {
      this.moveDrag = null;
      this.persist();
      this.renderPanel();
    }
  }

  private ensureDraft(rect: { x: number; y: number; w: number; h: number }): void {
    const el = this.room.solids[this.room.solids.length - 1];
    el.x = rect.x;
    el.y = rect.y;
    el.w = rect.w;
    el.h = rect.h;
  }
  private commitDraft(rect: { x: number; y: number; w: number; h: number }): void {
    this.room.solids.push({ ...rect, x: rect.x, y: rect.y, w: rect.w, h: rect.h });
  }

  private nextSpawnName(): string {
    let n = 1;
    const names = new Set(this.room.spawns.map((s) => s.name));
    let name = `spawn${n}`;
    while (names.has(name)) name = `spawn${++n}`;
    return name;
  }

  private deleteSelected(): void {
    if (!this.selected) return;
    this.pushHistory();
    const s = this.selected;
    if (s.kind === 'solid') this.room.solids.splice(s.idx, 1);
    else if (s.kind === 'spawn') this.room.spawns.splice(s.idx, 1);
    else if (s.kind === 'transition') this.room.transitions.splice(s.idx, 1);
    else this.room.enemies.splice(s.idx, 1);
    this.selected = null;
    this.commit(() => void 0);
  }

  // ================= 侧栏面板 =================
  private buildPanel(): void {
    const host = document.getElementById('cb-side')!;
    host.innerHTML = `
      <div class="cb-ed-side">
        <section><h3>房间</h3>
          <select data-act="room:select"></select>
          <button data-act="newroom">新建</button>
          <label>名称 <input data-act="room:name" type="text"></label>
          <label>宽 <input data-act="room:w" type="number" step="48"> 高 <input data-act="room:h" type="number" step="48"></label>
        </section>
        <section><h3>地图保存 / 导出</h3>
          <div class="cb-row buttons">
            <button data-act="save:project" class="cb-primary">保存到工程 ⤓</button>
            <button data-act="exp:ts">复制 TS</button>
            <button data-act="exp:json">下载 JSON</button>
            <button data-act="imp:open">导入</button>
          </div>
          <label class="cb-row"><span>map token</span><input data-act="save:token" type="text" placeholder="后端启动日志里的 token" autocomplete="off"></label>
          <textarea data-act="imp:ta" rows="6" hidden></textarea>
          <button data-act="imp:apply" hidden>应用</button>
          <p class="cb-hint"><b>命名规则：</b>通道「目标=目标房间 id」「出生点=目标房间里的出生点名」；<b>门名</b>留空=始终开放，填同名=两侧同开/同关（本房间小怪清空后开）。出生点先在对应房间画好并命名（如 enter / fromCorridor），再让通道指过来。</p>
          <p class="cb-hint">「保存到工程」由本地后端改写 world/rooms.ts，保存后 Vite 自动刷新即可试玩。</p>
        </section>
        <section><h3>选中对象</h3><div data-act="obj:panel">（未选中）</div></section>
        <section><h3>工具</h3>
          <div class="cb-tools" data-act="tool:bar"></div>
          <label class="cb-row"><span>敌人类型</span><select data-act="enemy:kind"><option value="crawler">crawler</option><option value="walker">walker</option></select></label>
          <label class="cb-row"><span>通道→目标</span><select data-act="trans:to"></select></label>
          <label class="cb-row"><span>通道→出生点</span><input data-act="trans:spawn" type="text"></label>
          <label class="cb-row"><input data-act="opt:snap" type="checkbox" checked> 网格吸附</label>
          <label class="cb-row"><input data-act="opt:grid" type="checkbox" checked> 显示网格</label>
        </section>
        <section><h3>角色参数 · 试玩生效</h3>
          <div data-act="feel:panel"></div>
          <div class="cb-row buttons" style="margin-top:8px">
            <button data-act="feel:apply">应用到试玩</button>
            <button data-act="feel:reset">恢复默认</button>
          </div>
          <p class="cb-hint">改完点「应用到试玩」存本地，打开游戏页立即按新参数运行（% 会在下次编辑重载）。</p>
        </section>
        <p class="cb-hint">拖拽：左键选择/移动，右键平移，滚轮缩放(以鼠标为中心)，Del 删除，Ctrl+Z/Y 撤销。</p>
      </div>`;

    host.addEventListener('change', (e) => this.onPanelChange(e));
    host.addEventListener('click', (e) => this.onPanelClick(e));
  }

  private onPanelChange(e: Event): void {
    const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!el) return;
    const act = el.getAttribute('data-act')!;
    const val = (el as HTMLInputElement).value;
    if (act === 'room:select') {
      this.switchRoom(val);
    } else if (act === 'room:name') {
      this.commit((r) => {
        r.name = val;
      });
    } else if (act === 'room:w' || act === 'room:h') {
      const n = parseInt(val, 10);
      if (Number.isFinite(n) && n >= 240) {
        this.commit((r) => {
          if (act === 'room:w') r.w = n;
          else r.h = n;
        });
      }
    } else if (act === 'enemy:kind') {
      this.enemyKind = val as 'crawler' | 'walker';
    } else if (act === 'trans:spawn') {
      this.transSpawn = val;
    } else if (act === 'trans:to') {
      this.transTo = val;
    } else if (act === 'save:token') {
      setToken(val);
    } else if (act.startsWith('cf:')) {
      // 角色参数输入（data-cf 点路径）
      const path = el.getAttribute('data-cf')!;
      const n = Number(val);
      if (Number.isFinite(n)) this.feelDraft.set(path, n);
    } else if (act.startsWith('obj:set-')) {
      // 对象字段编辑（change 时记录一次历史）
      if (this.selected) this.pushHistory();
      this.onObjProp(act, el as HTMLInputElement);
    }
  }

  private onPanelClick(e: Event): void {
    const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!el) return;
    const act = el.getAttribute('data-act')!;
    const side = document.getElementById('cb-side')!;
    if (act === 'newroom') {
      const id = this.nextRoomId();
      this.set.rooms[id] = newRoom(id);
      this.pushHistory();
      this.switchRoom(id, true);
    } else if (act === 'tool') {
      this.tool = el.getAttribute('data-tool') as Tool;
      this.selected = null;
      this.redraw();
      this.renderPanel();
    } else if (act === 'opt:snap') {
      this.snapOn = (el as HTMLInputElement).checked;
    } else if (act === 'opt:grid') {
      this.showGrid = (el as HTMLInputElement).checked;
      this.redraw();
    } else if (act === 'obj:del') {
      this.deleteSelected();
    } else if (act === 'exp:ts') {
      void navigator.clipboard.writeText(roomToTS(this.room));
      this.flash('已复制 TS（替换 rooms.ts 中对应房间）');
    } else if (act === 'exp:json') {
      const blob = new Blob([roomToJSON(this.room)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${this.room.id}.room.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } else if (act === 'imp:open') {
      const ta = side.querySelector<HTMLTextAreaElement>('[data-act="imp:ta"]')!;
      const applyBtn = side.querySelector<HTMLButtonElement>('[data-act="imp:apply"]')!;
      ta.hidden = false;
      applyBtn.hidden = false;
    } else if (act === 'imp:apply') {
      const ta = side.querySelector<HTMLTextAreaElement>('[data-act="imp:ta"]')!;
      const parsed = parseRoom(ta.value);
      if (parsed) {
        this.pushHistory();
        this.room = parsed;
        this.set.current = parsed.id;
        this.set.rooms[parsed.id] = parsed;
        this.selected = null;
        this.commit(() => void 0);
        this.flash(`导入成功：${parsed.id}`);
      } else {
        this.flash('导入失败：不是合法 JSON 或 RoomDef');
      }
    } else if (act === 'save:project') {
      const token = getToken();
      if (!token) {
        this.flash('请先在下方填 map token（后端启动日志里有）');
        return;
      }
      const btn = el as HTMLButtonElement;
      const prev = btn.textContent;
      btn.textContent = '保存中…';
      btn.disabled = true;
      void saveRoomsToProject(Object.values(this.set.rooms), token).then((st) => {
        btn.textContent = prev;
        btn.disabled = false;
        this.flash(st.ok ? `✔ ${st.msg}` : `✘ ${st.msg}`);
      });
    } else if (act === 'feel:apply') {
      // 固化全部面板字段（draft 优先）为 override 写入 localStorage
      const out: Record<string, unknown> = {};
      for (const g of FEEL_GROUPS) {
        for (const [path] of g.rows) {
          const v = this.feelDraft.get(path) ?? feelGet(path);
          const parts = path.split('.');
          if (parts.length === 1) out[parts[0]] = v;
          else {
            const obj = (out[parts[0]] ??= {}) as Record<string, unknown>;
            obj[parts[1]] = v;
          }
        }
      }
      saveFeelOverrides(out);
      this.flash('✔ 角色参数已应用到本地试玩（打开游戏页生效）');
    } else if (act === 'feel:reset') {
      clearFeelOverrides();
      location.reload(); // 重载让 FEEL 恢复默认并重新渲染面板
    } else if (act === 'nav:home') {
      location.href = '/';
    }
  }

  private onObjProp(act: string, el: HTMLInputElement): void {
    if (!this.selected) return;
    const s = this.selected;
    const idx = s.idx;
    const num = () => Number(el.value);
    if (act === 'obj:set-x') {
      if (s.kind === 'solid') this.room.solids[idx].x = num();
      else if (s.kind === 'spawn') this.room.spawns[idx].x = num();
      else if (s.kind === 'transition') this.room.transitions[idx].rect.x = num();
      else this.room.enemies[idx].x = num();
    } else if (act === 'obj:set-y') {
      if (s.kind === 'solid') this.room.solids[idx].y = num();
      else if (s.kind === 'spawn') this.room.spawns[idx].y = num();
      else if (s.kind === 'transition') this.room.transitions[idx].rect.y = num();
      else this.room.enemies[idx].y = num();
    } else if (act === 'obj:set-w' && (s.kind === 'solid' || s.kind === 'transition')) {
      const r = s.kind === 'solid' ? this.room.solids[idx] : this.room.transitions[idx].rect;
      r.w = num();
    } else if (act === 'obj:set-h' && (s.kind === 'solid' || s.kind === 'transition')) {
      const r = s.kind === 'solid' ? this.room.solids[idx] : this.room.transitions[idx].rect;
      r.h = num();
    } else if (act === 'obj:set-name' && s.kind === 'spawn') {
      this.room.spawns[idx].name = el.value.trim();
    } else if (act === 'obj:set-to' && s.kind === 'transition') {
      this.room.transitions[idx].to = el.value.trim();
    } else if (act === 'obj:set-spawnname' && s.kind === 'transition') {
      this.room.transitions[idx].spawn = el.value.trim();
    } else if (act === 'obj:set-door' && s.kind === 'transition') {
      // 门名：空 = 开放；有值 = 本房间清怪后开放（两侧同名同时开/关）
      this.room.transitions[idx].door = el.value.trim() || undefined;
    } else if (act === 'obj:set-kind' && s.kind === 'enemy') {
      this.room.enemies[idx].kind = el.value as 'crawler' | 'walker';
    } else {
      return;
    }
    this.commit(() => void 0);
  }

  private switchRoom(id: string, fresh = false): void {
    const next = this.set.rooms[id];
    if (!next) return;
    this.room = next;
    this.set.current = id;
    this.selected = null;
    this.drawStart = null;
    this.moveDrag = null;
    this.cameras.main.centerOn(this.room.w / 2, this.room.h / 2);
    if (!fresh) this.persist();
    this.commit(() => void 0);
  }

  private nextRoomId(): string {
    let n = 1;
    let id = `room${n}`;
    while (this.set.rooms[id]) id = `room${++n}`;
    return id;
  }

  private renderPanel(): void {
    const panel = document.getElementById('cb-side')!;
    const roomSel = panel.querySelector<HTMLSelectElement>('[data-act="room:select"]')!;
    const roomName = panel.querySelector<HTMLInputElement>('[data-act="room:name"]')!;
    const roomW = panel.querySelector<HTMLInputElement>('[data-act="room:w"]')!;
    const roomH = panel.querySelector<HTMLInputElement>('[data-act="room:h"]')!;
    const toolBar = panel.querySelector<HTMLElement>('[data-act="tool:bar"]')!;
    const objPanel = panel.querySelector<HTMLElement>('[data-act="obj:panel"]')!;
    const transToSel = panel.querySelector<HTMLSelectElement>('[data-act="trans:to"]')!;
    const transSpawn = panel.querySelector<HTMLInputElement>('[data-act="trans:spawn"]')!;
    const snapChk = panel.querySelector<HTMLInputElement>('[data-act="opt:snap"]')!;
    const gridChk = panel.querySelector<HTMLInputElement>('[data-act="opt:grid"]')!;
    const enKindSel = panel.querySelector<HTMLSelectElement>('[data-act="enemy:kind"]')!;
    const feelPanel = panel.querySelector<HTMLElement>('[data-act="feel:panel"]')!;

    // 房间下拉
    roomSel.innerHTML = Object.values(this.set.rooms)
      .map((r) => `<option value="${r.id}" ${r.id === this.room.id ? 'selected' : ''}>${r.name} (${r.id})</option>`)
      .join('');
    roomName.value = this.room.name;
    roomW.value = String(this.room.w);
    roomH.value = String(this.room.h);

    // 工具栏
    const tools: { id: Tool; label: string }[] = [
      { id: 'select', label: '选择' },
      { id: 'solid', label: '地形' },
      { id: 'spawn', label: '出生点' },
      { id: 'transition', label: '通道' },
      { id: 'enemy', label: '敌人' },
    ];
    toolBar.innerHTML = tools
      .map((t) => `<button data-act="tool" data-tool="${t.id}" class="${this.tool === t.id ? 'on' : ''}">${t.label}</button>`)
      .join('');

    // 过渡预设目标/出生点
    const transTargetIds = Object.keys(this.set.rooms).filter((k) => k !== this.room.id);
    transToSel.innerHTML = transTargetIds
      .map((id) => `<option value="${id}" ${id === this.transTo ? 'selected' : ''}>${id}</option>`)
      .join('');
    transSpawn.value = this.transSpawn;
    enKindSel.value = this.enemyKind;
    this.renderFeelPanel(feelPanel);
    snapChk.checked = this.snapOn;
    gridChk.checked = this.showGrid;
    const tokenInp = panel.querySelector<HTMLInputElement>('[data-act="save:token"]');
    if (tokenInp && getToken()) tokenInp.value = getToken();

    // 选中对象字段
    const s = this.selected;
    if (!s) {
      objPanel.textContent = '（未选中）';
      return;
    }
    const n = (label: string, prop: string, value: number | string) =>
      `<label class="cb-row"><span>${label}</span><input data-act="obj:set-${prop}" type="number" value="${value}"></label>`;
    const t = (label: string, prop: string, value: number | string) =>
      `<label class="cb-row"><span>${label}</span><input data-act="obj:set-${prop}" type="text" value="${escapeHtml(String(value))}"></label>`;
    if (s.kind === 'solid') {
      const r = this.room.solids[s.idx];
      if (!r) { objPanel.textContent = '（已删除）'; return; }
      objPanel.innerHTML = `<div class="cb-objtitle">地形 #${s.idx}</div>${n('x', 'x', r.x)}${n('y', 'y', r.y)}${n('宽', 'w', r.w)}${n('高', 'h', r.h)}`;
    } else if (s.kind === 'spawn') {
      const sp = this.room.spawns[s.idx];
      if (!sp) { objPanel.textContent = '（已删除）'; return; }
      objPanel.innerHTML = `<div class="cb-objtitle">出生点</div>${t('名称', 'name', sp.name)}${n('x', 'x', sp.x)}${n('y', 'y', sp.y)}`;
    } else if (s.kind === 'transition') {
      const tr = this.room.transitions[s.idx];
      if (!tr) { objPanel.textContent = '（已删除）'; return; }
      objPanel.innerHTML = `<div class="cb-objtitle">通道${tr.door ? ' · 🔒 锁定' : ' · 开放'}</div>${n('x', 'x', tr.rect.x)}${n('y', 'y', tr.rect.y)}${n('宽', 'w', tr.rect.w)}${n('高', 'h', tr.rect.h)}${t('目标房间', 'to', tr.to)}${t('出生点', 'spawnname', tr.spawn)}${t('门名(空=开放)', 'door', tr.door ?? '')}<p class="cb-hint">填上门名即「关门」——本房间小怪清空后开放；两侧通道填<b>相同门名</b>即双侧同开/同锁。</p>`;
    } else {
      const e = this.room.enemies[s.idx];
      if (!e) { objPanel.textContent = '（已删除）'; return; }
      objPanel.innerHTML = `<div class="cb-objtitle">敌人</div>${
        `<label class="cb-row"><span>类型</span><select data-act="obj:set-kind"><option value="crawler" ${e.kind === 'crawler' ? 'selected' : ''}>crawler</option><option value="walker" ${e.kind === 'walker' ? 'selected' : ''}>walker</option></select></label>`
      }${n('x', 'x', e.x)}${n('y', 'y', e.y)}`;
    }
    objPanel.innerHTML += `<button data-act="obj:del" class="cb-danger">删除选中</button>`;
  }

  /** 角色参数面板：按组渲染数值输入（后续「技能」组自动出现） */
  private renderFeelPanel(host: HTMLElement): void {
    host.innerHTML = FEEL_GROUPS.map((g) => {
      const rows = g.rows
        .map(([path, label]) => {
          const v = this.feelDraft.get(path) ?? feelGet(path);
          return `<label class="cb-row"><span>${label}</span><input data-act="cf:set" data-cf="${path}" type="number" value="${v}"></label>`;
        })
        .join('');
      return `<div class="cb-objtitle">${g.name}</div>${rows}`;
    }).join('');
  }

  private flash(msg: string): void {
    const bar = document.getElementById('cb-side')!;
    const div = document.createElement('div');
    div.className = 'cb-flash';
    div.textContent = msg;
    bar.appendChild(div);
    setTimeout(() => div.remove(), 1800);
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'cb-canvas',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#12120f',
  scene: [EditorScene],
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
});

declare global {
  interface Window {
    __cbEditor?: unknown;
  }
}
window.__cbEditor = { Game: game, EditorScene };
