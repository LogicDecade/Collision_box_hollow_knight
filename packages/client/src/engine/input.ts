import Phaser from 'phaser';

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

/**
 * 键盘绑定（集中管理，为“设置里改键位”留位）。
 * 默认：A/D + ←/→ 移动，W/↑ 上，S/↓ 下，J/Z/空格 跳，K/X 攻击，
 *       H/C/L/左Shift 按住蓄魂回血，Esc 暂停。
 */
export class Input {
  private keys = new Map<string, Phaser.Input.Keyboard.Key>();

  constructor(private scene: Phaser.Scene) {
    const K = Phaser.Input.Keyboard.KeyCodes;
    const defs: Record<string, number[]> = {
      left: [K.LEFT], right: [K.RIGHT], up: [K.UP], down: [K.DOWN],
      a: [K.A], d: [K.D], w: [K.W], s: [K.S],
      jump: [K.J, K.Z, K.SPACE],
      atk: [K.K, K.X],
      heal: [K.H, K.C, K.L, K.SHIFT],
      pause: [K.ESC],
    };
    for (const [name, codes] of Object.entries(defs)) {
      if (codes.length === 1) {
        this.keys.set(name, this.scene.input.keyboard!.addKey(codes[0]));
      } else {
        // 同按任一即触发：分别登记后聚合
        const members = new Map<number, Phaser.Input.Keyboard.Key>();
        for (const c of codes) members.set(c, this.scene.input.keyboard!.addKey(c));
        this.keys.set(name, {
          isDown: () => !!(this.keys.get(name) as unknown as { isDown: boolean }).isDown,
          isAggregated: true,
          members,
          anyDown: () => [...members.values()].some((k) => k.isDown),
          anyJustDown: () => [...members.values()].some((k) => Phaser.Input.Keyboard.JustDown(k)),
        } as unknown as Phaser.Input.Keyboard.Key);
      }
    }
  }

  /** 聚合键任意一个按下 */
  private any(name: string): boolean {
    const k = this.keys.get(name) as unknown as { anyDown?: () => boolean; isDown?: boolean };
    return k.anyDown ? k.anyDown() : !!k.isDown;
  }
  /** 聚合键任意一个本帧刚按下 */
  private just(name: string): boolean {
    const k = this.keys.get(name) as unknown as { anyJustDown?: () => boolean };
    return k.anyJustDown ? k.anyJustDown() : Phaser.Input.Keyboard.JustDown(this.keys.get(name)!);
  }

  update(): FrameInput {
    const lxRaw =
      ((this.any('right') ? 1 : 0) - (this.any('left') ? 1 : 0)) +
      ((this.any('d') ? 1 : 0) - (this.any('a') ? 1 : 0));
    const ly =
      ((this.any('down') ? 1 : 0) - (this.any('up') ? 1 : 0)) +
      ((this.any('s') ? 1 : 0) - (this.any('w') ? 1 : 0));

    return {
      lx: Math.sign(lxRaw),
      ly: Math.sign(ly),
      jumpPressed: this.just('jump'),
      jumpHeld: this.any('jump'),
      attackPressed: this.just('atk'),
      healHeld: this.any('heal'),
      pausePressed: this.just('pause'),
    };
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
