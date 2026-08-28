// 移动端触屏控制：左半屏虚拟摇杆（方向二值，非无极变速）+ 右侧动作键（跳/攻/魂/暂停）。
// 攻击方向由摇杆的上下决定（上=上劈 / 下=下劈 / 水平或居中=平砍），替代原三态方向键。
// 全部用 Pointer Events；仅主要指针为触屏(coarse)时挂载；竖屏提示横屏，按钮避开 Safari 安全区。
import type { FrameInput } from './input';

const CSS_ID = 'cb-touch-css';
const CSS = `
.cb-touch { position: fixed; inset: 0; z-index: 800; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.cb-touch-move { position: absolute; left: 0; top: 0; width: 58%; height: 100%; touch-action: none; }
.cb-touch-stick { position: absolute; width: 96px; height: 96px; margin: -48px 0 0 -48px; border-radius: 50%; border: 2px solid rgba(114,201,242,0.35); background: rgba(114,201,242,0.10); pointer-events: none; display: none; }
.cb-touch-axis { position: absolute; pointer-events: none; display: none; }
.cb-axis-h { left: 0; right: 0; top: 50%; height: 1px; background: rgba(114,201,242,0.18); }
.cb-axis-v { top: 0; bottom: 0; left: 50%; width: 1px; background: rgba(114,201,242,0.18); }
.cb-touch-btns { position: absolute; right: 16px; bottom: calc(30px + env(safe-area-inset-bottom)); display: flex; flex-direction: column-reverse; align-items: flex-end; gap: 14px; }
.cb-touch-key { width: 76px; height: 76px; border-radius: 50%; border: 1.5px solid rgba(216,216,210,0.4); background: rgba(28,28,24,0.5); color: #d8d8d2; font-size: 15px; letter-spacing: 0.06em; display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; touch-action: none; -webkit-touch-callout: none; }
.cb-touch-key:active { background: rgba(114,201,242,0.28); border-color: #72c9f2; }
.cb-touch-key.cb-key-heal { background: rgba(224,107,79,0.22); border-color: rgba(224,107,79,0.5); color: #ffc9bd; }
.cb-touch-pause { position: absolute; right: 16px; top: max(16px, env(safe-area-inset-top)); width: 46px; height: 46px; font-size: 14px; border-radius: 8px; }
.cb-rotate { position: fixed; inset: 0; z-index: 850; display: none; align-items: center; justify-content: center; background: rgba(18,18,15,0.97); color: #d8d8d2; font-size: 16px; letter-spacing: 0.08em; text-align: center; padding: 32px; font-family: system-ui, sans-serif; }
`;

/** 仅“主要输入是指针(coarse)=手机/平板”或至少支持触摸时才启用触屏控件 */
export const isTouchDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia?.('(pointer: coarse)')?.matches) return true;
  } catch {
    /* 老环境 */
  }
  return 'ontouchstart' in window;
};

const DEAD = 14; // 摇杆死区(px)：以内视为无方向

export class TouchControls {
  private lx = 0; // 移动方向：-1/0/1（二值，无无极变速）
  private ly = 0; // 攻击方向（摇杆上下）：-1 上劈 / 0 平砍 / +1 下劈
  private jumpTick = false;
  private jumpHeld = false;
  private atkTick = false;
  private healHeld = false;
  private pauseTick = false;
  private activeId: number | null = null;
  private anchorX = 0;
  private anchorY = 0;
  private root: HTMLElement | null = null;
  private stick: HTMLElement | null = null;
  private rotateEl: HTMLElement | null = null;

  attach(): void {
    if (this.root) return;
    if (!document.getElementById(CSS_ID)) {
      const s = document.createElement('style');
      s.id = CSS_ID;
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    // 防 iOS 橡皮筋滚动/下拉刷新干扰
    document.body.style.overscrollBehavior = 'none';
    document.body.style.touchAction = 'none';

    const root = document.createElement('div');
    root.className = 'cb-touch';
    root.innerHTML = `
      <div class="cb-touch-move">
        <div class="cb-touch-axis cb-axis-h"></div>
        <div class="cb-touch-axis cb-axis-v"></div>
      </div>
      <div class="cb-touch-stick"></div>
      <div class="cb-touch-btns">
        <button class="cb-touch-key cb-key-heal" data-k="heal">魂</button>
        <button class="cb-touch-key" data-k="atk">攻</button>
        <button class="cb-touch-key" data-k="jump">跳</button>
      </div>
      <button class="cb-touch-key cb-touch-pause" data-k="pause">❚❚</button>
      <div class="cb-rotate">请横屏游玩<br>（旋转设备后再继续）</div>`;
    document.getElementById('app')!.appendChild(root);
    this.root = root;
    this.stick = root.querySelector<HTMLElement>('.cb-touch-stick');
    this.rotateEl = root.querySelector<HTMLElement>('.cb-rotate');

    root.addEventListener('contextmenu', (e) => e.preventDefault());

    // 左半屏虚拟摇杆：跟第一个按下的指针
    const move = root.querySelector<HTMLElement>('.cb-touch-move')!;
    move.addEventListener('pointerdown', (e) => this.moveDown(e));
    move.addEventListener('pointermove', (e) => this.moveMove(e));
    move.addEventListener('pointerup', (e) => this.moveEnd(e));
    move.addEventListener('pointercancel', (e) => this.moveEnd(e));

    // 动作键
    for (const btn of root.querySelectorAll<HTMLElement>('[data-k]')) {
      const k = btn.dataset.k!;
      if (k === 'pause') {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          this.pauseTick = true;
        });
        continue;
      }
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (k === 'atk') this.atkTick = true;
        else if (k === 'jump') {
          this.jumpTick = true;
          this.jumpHeld = true;
        } else if (k === 'heal') this.healHeld = true;
      });
      const up = (): void => {
        if (k === 'jump') this.jumpHeld = false;
        else if (k === 'heal') this.healHeld = false;
      };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    }

    // 竖屏 → 全屏提示横屏（auto），横屏恢复
    window.addEventListener('orientationchange', () => this.refreshOrientation());
    window.addEventListener('resize', () => this.refreshOrientation());
    this.refreshOrientation();
  }

  private refreshOrientation(): void {
    if (!this.rotateEl) return;
    const portrait = window.matchMedia('(orientation: portrait)').matches;
    this.rotateEl.style.display = portrait ? 'flex' : 'none';
  }

  private moveDown(e: PointerEvent): void {
    if (this.activeId !== null) return;
    this.activeId = e.pointerId;
    this.anchorX = e.clientX;
    this.anchorY = e.clientY;
    this.lx = 0;
    this.ly = 0;
    if (this.stick) {
      this.stick.style.display = 'block';
      this.stick.style.left = `${e.clientX}px`;
      this.stick.style.top = `${e.clientY}px`;
    }
  }

  private moveMove(e: PointerEvent): void {
    if (e.pointerId !== this.activeId) return;
    const dx = e.clientX - this.anchorX;
    const dy = e.clientY - this.anchorY;
    // 二值方向（死区内无方向）：取消位移→变速的无极变速；上下同时作为攻击方向
    this.lx = Math.abs(dx) < DEAD ? 0 : Math.sign(dx);
    this.ly = Math.abs(dy) < DEAD ? 0 : Math.sign(dy);
    if (this.stick) {
      this.stick.style.left = `${e.clientX}px`;
      this.stick.style.top = `${e.clientY}px`;
    }
    e.preventDefault();
  }

  private moveEnd(e: PointerEvent): void {
    if (e.pointerId !== this.activeId) return;
    this.activeId = null;
    this.lx = 0;
    this.ly = 0;
    if (this.stick) this.stick.style.display = 'none';
  }

  detach(): void {
    this.root?.remove();
    this.root = null;
    this.stick = null;
    this.rotateEl = null;
    this.lx = 0;
    this.ly = 0;
    this.jumpHeld = false;
    this.healHeld = false;
    this.activeId = null;
  }

  /** 采样一帧输入（just-pressed 标志读取后复位；攻击方向由摇杆上下给出） */
  sample(): FrameInput {
    const out: FrameInput = {
      lx: this.lx,
      ly: this.ly,
      jumpPressed: this.jumpTick,
      jumpHeld: this.jumpHeld,
      attackPressed: this.atkTick,
      healHeld: this.healHeld,
      pausePressed: this.pauseTick,
    };
    this.jumpTick = false;
    this.atkTick = false;
    this.pauseTick = false;
    return out;
  }
}
