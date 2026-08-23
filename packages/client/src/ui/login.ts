// 登录 / 注册 · 纯 DOM 覆盖层（保持留白风格，与游戏引擎解耦）
import { apiLogin, apiRegister, setToken } from '../net/api';

let overlay: HTMLElement | null = null;

const CSS_ID = 'cb-login-css';
const CSS = `
.cb-login {
  position: fixed; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(18,18,15,0.97);
  z-index: 1000;
}
.cb-panel { width: min(360px, 88vw); padding: 56px 40px 40px; }
.cb-title {
  font-size: 30px; font-weight: 500; letter-spacing: 0.12em;
  color: #d8d8d2; margin: 0 0 6px;
}
.cb-sub { color: #9a9a92; font-size: 13px; letter-spacing: 0.04em; margin: 0 0 40px; }
.cb-form { display: flex; flex-direction: column; gap: 14px; }
.cb-input {
  background: transparent; border: 1px solid #3a3a36; border-radius: 0;
  color: #d8d8d2; padding: 11px 12px; font-size: 14px; outline: none;
}
.cb-input:focus { border-color: #72c9f2; }
.cb-err { color: #e06b4f; font-size: 12px; margin-top: 12px; min-height: 16px; }
.cb-btns { display: flex; gap: 12px; margin-top: 26px; }
.cb-btn {
  flex: 1; padding: 11px 0; font-size: 14px; letter-spacing: 0.08em;
  background: transparent; cursor: pointer; border: 1px solid #3a3a36; color: #d8d8d2;
}
.cb-btn:hover { border-color: #72c9f2; color: #72c9f2; }
.cb-btn.cb-primary { border-color: #72c9f2; color: #72c9f2; }
.cb-btn:disabled { opacity: 0.4; cursor: default; }
.cb-note { color: #6a6a62; font-size: 11px; margin-top: 28px; letter-spacing: 0.03em; }
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
  const root = document.getElementById('app')!;
  overlay = document.createElement('div');
  overlay.className = 'cb-login';

  const box = document.createElement('div');
  box.className = 'cb-panel';
  overlay.appendChild(box);

  const title = document.createElement('h1');
  title.className = 'cb-title';
  title.textContent = '碰撞箱';
  box.appendChild(title);

  const sub = document.createElement('p');
  sub.className = 'cb-sub';
  sub.textContent = 'COLLISION BOX · 类银河城 · 只有碰撞箱';
  box.appendChild(sub);

  const form = document.createElement('form');
  form.className = 'cb-form';
  box.appendChild(form);

  const u = document.createElement('input');
  u.className = 'cb-input';
  u.placeholder = '用户名（2-20 位字母数字下划线）';
  u.autocomplete = 'username';
  u.value = localStorage.getItem('cb_last_user') || '';
  form.appendChild(u);

  const p = document.createElement('input');
  p.className = 'cb-input';
  p.type = 'password';
  p.placeholder = '密码（至少 6 位）';
  p.autocomplete = 'current-password';
  form.appendChild(p);

  const err = document.createElement('div');
  err.className = 'cb-err';
  box.appendChild(err);

  const btns = document.createElement('div');
  btns.className = 'cb-btns';
  box.appendChild(btns);

  const loginBtn = document.createElement('button');
  loginBtn.type = 'button';
  loginBtn.className = 'cb-btn cb-primary';
  loginBtn.textContent = '登录';
  btns.appendChild(loginBtn);

  const regBtn = document.createElement('button');
  regBtn.type = 'button';
  regBtn.className = 'cb-btn';
  regBtn.textContent = '注册';
  btns.appendChild(regBtn);

  const note = document.createElement('p');
  note.className = 'cb-note';
  note.textContent = '本地存档 · 云端存档后置 · 用账号开始你的探索';
  box.appendChild(note);

  let busy = false;
  const showErr = (s: string) => {
    err.textContent = s;
  };
  const submit = async (mode: 'login' | 'register') => {
    if (busy) return;
    const username = u.value.trim();
    const password = p.value;
    if (!/^[A-Za-z0-9_]{2,20}$/.test(username)) {
      showErr('用户名需 2-20 位字母数字下划线');
      return;
    }
    if (password.length < 6) {
      showErr('密码至少 6 位');
      return;
    }
    busy = true;
    loginBtn.disabled = true;
    regBtn.disabled = true;
    try {
      const resp =
        mode === 'login'
          ? await apiLogin(username, password)
          : await apiRegister(username, password);
      setToken(resp.token);
      localStorage.setItem('cb_last_user', username);
      hideLogin();
    } catch (e) {
      showErr((e as Error).message);
    } finally {
      busy = false;
      loginBtn.disabled = false;
      regBtn.disabled = false;
    }
  };

  loginBtn.onclick = () => void submit('login');
  regBtn.onclick = () => void submit('register');
  form.onsubmit = (e) => {
    e.preventDefault();
    void submit('login');
  };

  root.appendChild(overlay);
  u.focus();
}

export function showLogin(): void {
  if (!overlay) build();
  overlay!.style.display = 'flex';
}

export function hideLogin(): void {
  if (overlay) overlay.style.display = 'none';
}

export function isLoginOpen(): boolean {
  return overlay !== null && overlay.style.display !== 'none';
}
