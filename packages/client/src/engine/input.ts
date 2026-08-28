// 键盘输入：直接监听 window 的 keydown/keyup，以 event.code 绑定。
// 说明：Phaser 的 addKey(string) 查的是已废弃的 keyCode 表（'LEFT'/'SPACE'/'A'），
// 不认识 event.code（'ArrowLeft'/'KeyA'/'Space'），故不再经过 Phaser 键盘系统。
// 副作用：登录覆盖层打开时（enabled=false）不阻止浏览器默认，输入框可正常打字。

export interface FrameInput {
  /** 水平方向 -1..1（键位/之后可接手柄） */
  lx: number;
  /** 垂直方向 -1..1（用于斜劈瞄准） */
  ly: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  attackPressed: boolean;
  healHeld: boolean;
  pausePressed: boolean;
}

interface KeyState {
  down: boolean;
  /** 本帧刚按下（update() 消费后清零） */
  pressed: boolean;
}

/** action → event.code 列表（同按任一即触发） */
const KEYMAP: Record<string, readonly string[]> = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  a: ['KeyA'],
  d: ['KeyD'],
  w: ['KeyW'],
  s: ['KeyS'],
  jump: ['KeyJ', 'KeyZ', 'Space'],
  atk: ['KeyK', 'KeyX'],
  heal: ['KeyH', 'KeyC', 'KeyL', 'ShiftLeft', 'ShiftRight'],
  pause: ['Escape'],
};

/**
 * 键盘绑定（集中在 KEYMAP，为“设置里改键位”留位）。
 * 默认：A/D + ←/→ 移动，W/↑ 上，S/↓ 下，J/Z/空格 跳，K/X 攻击，
 *       H/C/L/Shift 按住蓄魂回血，Esc 暂停。
 */
export class Input {
  /** false 时忽略所有键盘（登录覆盖层打开等），相应键也不阻止浏览器默认 */
  enabled = true;

  private state = new Map<string, KeyState>();

  constructor() {
    const on = (type: string, fn: EventListener) => window.addEventListener(type, fn);
    on('keydown', (e) => this.onKeyDown(e as KeyboardEvent));
    on('keyup', (e) => {
      const s = this.state.get((e as KeyboardEvent).code);
      if (s) s.down = false;
    });
    // 窗口失焦清空，避免切到别的窗口后“卡键”
    on('blur', () => this.state.clear());
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;
    if (!this.boundCodes.has(e.code)) return;
    const s = this.state.get(e.code);
    if (s) {
      if (!s.down) {
        s.down = true;
        s.pressed = true;
      }
    } else {
      this.state.set(e.code, { down: true, pressed: true });
    }
    // 游戏内阻止浏览器默认（空格/方向键滚动页面）；enabled=false 时不拦，输入框不受影响
    e.preventDefault();
  }

  private get boundCodes(): Set<string> {
    const out = new Set<string>();
    for (const codes of Object.values(KEYMAP)) for (const c of codes) out.add(c);
    return out;
  }

  /** 聚合键任意一个按下 */
  private any(name: string): boolean {
    return (KEYMAP[name] ?? []).some((c) => this.state.get(c)?.down);
  }
  /** 聚合键任意一个本帧刚按下 */
  private just(name: string): boolean {
    return (KEYMAP[name] ?? []).some((c) => this.state.get(c)?.pressed);
  }

  update(): FrameInput {
    const lxRaw =
      ((this.any('right') ? 1 : 0) - (this.any('left') ? 1 : 0)) +
      ((this.any('d') ? 1 : 0) - (this.any('a') ? 1 : 0));
    const ly =
      ((this.any('down') ? 1 : 0) - (this.any('up') ? 1 : 0)) +
      ((this.any('s') ? 1 : 0) - (this.any('w') ? 1 : 0));

    const out: FrameInput = {
      lx: Math.sign(lxRaw),
      ly: Math.sign(ly),
      jumpPressed: this.just('jump'),
      jumpHeld: this.any('jump'),
      attackPressed: this.just('atk'),
      healHeld: this.any('heal'),
      pausePressed: this.just('pause'),
    };
    // 本帧“刚按下”标志已被消费
    for (const s of this.state.values()) s.pressed = false;
    return out;
  }

  /** 清空全部按键状态（暂停恢复/登录释放前调用，防残留触发） */
  reset(): void {
    this.state.clear();
  }

  /** 操作说明（设置/暂停弹窗内展示） */
  static helpText(): string {
    return [
      'A / D · ← →  移动',
      'W / ↑  朝上（斜上劈）',
      'S / ↓  朝下（下劈踏击）',
      'J / Z / 空格  跳跃 · 长按跳更高',
      'K / X  攻击（配合方向斜劈）',
      'H / C / L / Shift  按住蓄魂回血',
      'Esc  暂停',
    ].join('\n');
  }
}
