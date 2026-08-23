// 暂停 / 设置 · 纯 DOM 覆盖层（继续、帮助、退出登录）
import { clearToken } from '../net/api';
import { Input } from '../engine/input';

let overlay: HTMLElement | null = null;
let onResumeCb: (() => void) | null = null;

const CSS_ID = 'cb-pause-css';
const CSS = `
.cb-pause {
  position: fixed; inset: 0;
  display: none; align-items: center; justify-content: center;
  background: rgba(12,12,10,0.82);
  z-index: 900;
}
.cb-pause-panel { width: min(420px, 90vw); padding: 40px 44px; }
.cb-pause-title { font-size: 22px; font-weight: 500; letter-spacing: 0.1em; color: #d8d8d2; margin: 0 0 8px; }
.cb-pause-sub { color: #9a9a92; font-size: 12px; margin: 0 0 26px; letter-spacing: 0.04em; }
.cb-pause-help {
  color: #b8b8b0; font-size: 13px; line-height: 1.9;
  white-space: pre-line; border-top: 1px solid #2c2c28; border-bottom: 1px solid #2c2c28;
  padding: 16px 0; margin-bottom: 26px;
}
.cb-pause-btns { display: flex; gap: 12px; }
.cb-btn {
  flex: 1; padding: 11px 0; font-size: 14px; letter-spacing: 0.08em;
  background: transparent; cursor: pointer; border: 1px solid #3a3a36; color: #d8d8d2;
}
.cb-btn:hover { border-color: #72c9f2; color: #72c9f2; }
.cb-btn.cb-primary { border-color: #72c9f2; color: #72c9f2; }
`;

function ensureStyle(): void {
  if (document.getElementById(CSS_ID)) return;
  const s = document.createElement('style');
  s.id = CSS_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

function build(): void {
  ensureStyle();
  overlay = document.createElement('div');
  overlay.className = 'cb-pause';
  document.getElementById('app')!.appendChild(overlay);

  const panel = document.createElement('div');
  panel.className = 'cb-pause-panel';
  overlay.appendChild(panel);

  const title = document.createElement('div');
  title.className = 'cb-pause-title';
  title.textContent = '已暂停';
  panel.appendChild(title);

  const sub = document.createElement('div');
  sub.className = 'cb-pause-sub';
  sub.textContent = 'PAUSED · 留白时刻';
  panel.appendChild(sub);

  const help = document.createElement('div');
  help.className = 'cb-pause-help';
  help.textContent = Input.helpText();
  panel.appendChild(help);

  const btns = document.createElement('div');
  btns.className = 'cb-pause-btns';
  panel.appendChild(btns);

  const resumeBtn = document.createElement('button');
  resumeBtn.className = 'cb-btn cb-primary';
  resumeBtn.textContent = '继续';
  btns.appendChild(resumeBtn);

  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'cb-btn';
  logoutBtn.textContent = '退出登录';
  btns.appendChild(logoutBtn);

  resumeBtn.onclick = () => onResumeCb?.();
  logoutBtn.onclick = () => {
    clearToken();
    location.reload();
  };
}

export function showPause(onResume: () => void): void {
  if (!overlay) build();
  onResumeCb = onResume;
  overlay!.style.display = 'flex';
}

export function hidePause(): void {
  if (overlay) overlay.style.display = 'none';
}

export function isPauseOpen(): boolean {
  return overlay !== null && overlay.style.display === 'flex';
}
