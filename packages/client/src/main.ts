// 入口：启动 Phaser，校验会话，展示登录或直接进游戏
import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { COLORS, WORLD_H, WORLD_W } from './engine/constants';
import { apiMe, clearToken, getToken } from './net/api';
import { hideLogin, showLogin } from './ui/login';
import { applyFeelOverrides, loadFeelOverrides } from './engine/feel';

// 角色参数覆盖（本地试玩时由编辑器「应用到试玩」写入 localStorage）须在场景创建前生效
applyFeelOverrides(loadFeelOverrides() ?? {});

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: WORLD_W,
  height: WORLD_H,
  backgroundColor: `#${COLORS.bg.toString(16).padStart(6, '0')}`,
  scene: [GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  pixelArt: true,
});

declare global {
  interface Window {
    __cb?: { game: Phaser.Game };
  }
}
window.__cb = { game };

async function boot(): Promise<void> {
  const token = getToken();
  let authed = false;
  if (token) {
    const me = await apiMe();
    authed = !!me;
    if (!authed) clearToken();
  }
  if (authed) hideLogin();
  else showLogin();
}

void boot();
