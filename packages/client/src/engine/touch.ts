// 移动端触屏控制：左半屏「跟随拇指」虚拟摇杆 + 右侧动作键（跳/攻/魂/方向/暂停）。
// 仅在触屏设备上挂载（桌面键盘不受影响）；登录层(1000)/暂停层(900) z-index 更高，
// 打开时会自然盖住本控件，触屏输入随之失效。
import type { FrameInput } from './input';

const CSS_ID = 'cb-touch-css';
const CSS = `
.cb-touch { position: fixed; inset: 0; z-index: 800; touch-action: none; user-select: none; -webkit-user-select: none; }
.cb-touch-move { position: absolute; left: 0; top: 0; width: 58%; height: 100%; }
.cb-touch-stick { position: absolute; width: 90px; height: 90px; margin: -45px 0 0 -45px; border-radius: 50%; border: 2px solid rgba(114,201,242,0.35); background: rgba(114,201,242,0.10); pointer-events: none; display: none; }
.cb-touch-btns { position: absolute; right: 16px; bottom: 30px; display: flex; flex-direction: column-reverse; align-items: flex-end; gap: 14px; }
.cb-touch-key { width: 78px; height: 78px; border-radius: 50%; border: 1.5px solid rgba(216,216,210,0.4); background: rgba(28,28,24,0.5); color: #d8d8d2; font-size: 15px; letter-spacing: 0.06em; display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; }
.cb-touch-key:active { background: rgba(114,201,242,0.28); border-color: #72c9f2; }
.cb-touch-key.cb-key-heal { background: rgba(224,107,79,0.22); border-color: rgba(224,107,79,0.5); color: #ffc9bd; }
.cb-touch-dir { width: 62px; height: 62px; font-size: 20px; }
.cb-touch-pause { position: absolute; right: 16px; top: max(16px, env(safe-area-inset-top)); width: 46px; height: 46px; font-size: 14px; border-radius: 8px; }
`;

export const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

export class TouchControls {
  private lx = 0;
  private dirIdx = 0; // 攻击方向循环：0→(0) / 1↑(-1) / 2↓(+1)
  private jumpTick = false;
  private jumpHeld = false;
  private atkTick = false;
  private healHeld = false;
  private pauseTick = false;
  private anchorX = 0;
  private activeTouchId = -1;
  private root: HTMLElement | null = null;
  private stick: HTMLElement | null = null;

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
      <div class="cb-touch-move"></div>
      <div class="cb-touch-stick"></div>
      <div class="cb-touch-btns">
        <button class="cb-touch-key cb-key-heal" data-k="heal">魂</button>
        <button class="cb-touch-key" data-k="atk">攻</button>
        <button class="cb-touch-key" data-k="jump">跳</button>
        <button class="cb-touch-key cb-touch-dir" data-k="dir">→</button>
      </div>
      <button class="cb-touch-key cb-touch-pause" data-k="pause">❚❚</button>`;
    document.getElementById('app')!.appendChild(root);
    this.root = root;
    this.stick = root.querySelector<HTMLElement>('.cb-touch-stick');

    const move = root.querySelector<HTMLElement>('.cb-touch-move')!;
    move.addEventListener('touchstart', (e) => this.onMoveStart(e), { passive: true });
    move.addEventListener('touchmove', (e) => this.onMove(e), { passive: false });
    move.addEventListener('touchend', (e) => this.onMoveEnd(e), { passive: true });
    move.addEventListener('touchcancel', (e) => this.onMoveEnd(e), { passive: true });

    for (const btn of root.querySelectorAll<HTMLElement>('[data-k]')) {
      const k = btn.dataset.k!;
      if (k === 'dir') {
        btn.addEventListener('click', () => {
          this.dirIdx = (this.dirIdx + 1) % 3;
          btn.textContent = ['→', '↑', '↓'][this.dirIdx];
        });
        continue;
      }
      if (k === 'pause') {
        btn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          this.pauseTick = true;
        }, { passive: false });
        continue;
      }
      // 攻 / 跳 / 魂：touchstart 设标志，touchend 清除按住态
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (k === 'atk') this.atkTick = true;
        else if (k === 'jump') { this.jumpPressed(); }
        else if (k === 'heal') this.healHeld = true;
      }, { passive: false });
      btn.addEventListener('touchend', () => {
        if (k === 'jump') this.jumpHeld = false;
        else if (k === 'heal') this.healHeld = false;
      }, { passive: true });
      btn.addEventListener('touchcancel', () => {
        if (k === 'jump') this.jumpHeld = false;
        else if (k === 'heal') this.healHeld = false;
      }, { passive: true });
    }
  }

  private jumpPressed(): void {
    this.jumpTick = true;
    this.jumpHeld = true;
  }

  private onMoveStart(e: TouchEvent): void {
    const t = e.touches[0];
    if (!t || this.activeTouchId !== -1) return;
    this.activeTouchId = t.identifier;
    this.anchorX = t.clientX;
    this.lx = 0;
    if (this.stick) {
      this.stick.style.display = 'block';
      this.stick.style.left = `${t.clientX}px`;
      this.stick.style.top = `${t.clientY}px`;
    }
  }

  private onMove(e: TouchEvent): void {
    for (const t of Array.from(e.touches)) {
      if (t.identifier !== this.activeTouchId) continue;
      const dx = t.clientX - this.anchorX;
      const dead = 14;
      this.lx = Math.max(-1, Math.min(1, (Math.abs(dx) < dead ? 0 : (dx - Math.sign(dx) * dead)) / 54));
      if (this.stick) {
        this.stick.style.left = `${t.clientX}px`;
        this.stick.style.top = `${t.clientY}px`;
      }
      e.preventDefault();
      break;
    }
  }

  private onMoveEnd(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.activeTouchId) {
        this.activeTouchId = -1;
        this.lx = 0;
        if (this.stick) this.stick.style.display = 'none';
        break;
      }
    }
  }

  detach(): void {
    this.root?.remove();
    this.root = null;
    this.stick = null;
    this.lx = 0;
    this.jumpHeld = false;
    this.healHeld = false;
  }

  /** 采样一帧输入（just-pressed 标志读取后复位；方向按钮给 ly 作为攻击方向） */
  sample(): FrameInput {
    const out: FrameInput = {
      lx: this.lx,
      ly: [0, -1, 1][this.dirIdx],
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
