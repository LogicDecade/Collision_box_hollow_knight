// 移动端触屏控制：左半屏「跟随拇指」虚拟摇杆 + 右侧动作键（跳/攻/魂/方向/暂停）。
// 全部用 Pointer Events（鼠标/触摸/笔统一），且仅当主要指针是触屏(coarse)才挂载，
// 避免带触屏的笔记本在桌面鼠标模式下误显示却点不动。
import type { FrameInput } from './input';

const CSS_ID = 'cb-touch-css';
const CSS = `
.cb-touch { position: fixed; inset: 0; z-index: 800; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.cb-touch-move { position: absolute; left: 0; top: 0; width: 58%; height: 100%; touch-action: none; }
.cb-touch-stick { position: absolute; width: 90px; height: 90px; margin: -45px 0 0 -45px; border-radius: 50%; border: 2px solid rgba(114,201,242,0.35); background: rgba(114,201,242,0.10); pointer-events: none; display: none; }
.cb-touch-btns { position: absolute; right: 16px; bottom: 30px; display: flex; flex-direction: column-reverse; align-items: flex-end; gap: 14px; }
.cb-touch-key { width: 78px; height: 78px; border-radius: 50%; border: 1.5px solid rgba(216,216,210,0.4); background: rgba(28,28,24,0.5); color: #d8d8d2; font-size: 15px; letter-spacing: 0.06em; display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; touch-action: none; -webkit-touch-callout: none; }
.cb-touch-key:active { background: rgba(114,201,242,0.28); border-color: #72c9f2; }
.cb-touch-key.cb-key-heal { background: rgba(224,107,79,0.22); border-color: rgba(224,107,79,0.5); color: #ffc9bd; }
.cb-touch-dir { width: 62px; height: 62px; font-size: 20px; }
.cb-touch-pause { position: absolute; right: 16px; top: max(16px, env(safe-area-inset-top)); width: 46px; height: 46px; font-size: 14px; border-radius: 8px; }
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

export class TouchControls {
  private lx = 0;
  private dirIdx = 0; // 攻击方向循环：0→(0) / 1↑(-1) / 2↓(+1)
  private jumpTick = false;
  private jumpHeld = false;
  private atkTick = false;
  private healHeld = false;
  private pauseTick = false;
  private activeId: number | null = null;
  private anchorX = 0;
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

    // 长按弹右键菜单/选中
    root.addEventListener('contextmenu', (e) => e.preventDefault());

    // 左半屏移动区：只跟第一个按下的指针（多指时其余忽略）
    const move = root.querySelector<HTMLElement>('.cb-touch-move')!;
    move.addEventListener('pointerdown', (e) => this.moveDown(e));
    move.addEventListener('pointermove', (e) => this.moveMove(e));
    move.addEventListener('pointerup', (e) => this.moveEnd(e));
    move.addEventListener('pointercancel', (e) => this.moveEnd(e));

    // 动作键
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
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          this.pauseTick = true;
        });
        continue;
      }
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (k === 'atk') this.atkTick = true;
        else if (k === 'jump') this.jumpTick = true;
        else if (k === 'heal') this.healHeld = true;
      });
      const up = (): void => {
        if (k === 'jump') this.jumpHeld = false;
        else if (k === 'heal') this.healHeld = false;
      };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    }
  }

  private moveDown(e: PointerEvent): void {
    if (this.activeId !== null) return;
    this.activeId = e.pointerId;
    this.anchorX = e.clientX;
    this.lx = 0;
    if (this.stick) {
      this.stick.style.display = 'block';
      this.stick.style.left = `${e.clientX}px`;
      this.stick.style.top = `${e.clientY}px`;
    }
  }

  private moveMove(e: PointerEvent): void {
    if (e.pointerId !== this.activeId) return;
    const dx = e.clientX - this.anchorX;
    const dead = 14;
    this.lx = Math.max(-1, Math.min(1, (Math.abs(dx) < dead ? 0 : (dx - Math.sign(dx) * dead)) / 54));
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
    if (this.stick) this.stick.style.display = 'none';
  }

  detach(): void {
    this.root?.remove();
    this.root = null;
    this.stick = null;
    this.lx = 0;
    this.jumpHeld = false;
    this.healHeld = false;
    this.activeId = null;
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
