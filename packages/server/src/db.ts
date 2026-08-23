import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// 数据库文件位置：SERVER_DATA_DIR 优先，其次 CWD/data
const dataDir = process.env.SERVER_DATA_DIR || join(process.cwd(), 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, 'game.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS saves (
    user_id  INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data     TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
}

export function createUser(username: string, passwordHash: string): UserRow {
  const stmt = db.prepare(
    `INSERT INTO users (username, password_hash) VALUES (?, ?)`,
  );
  const res = stmt.run(username, passwordHash);
  const id = Number(res.lastInsertRowid);
  const row = db
    .prepare(`SELECT id, username, password_hash, created_at FROM users WHERE id = ?`)
    .get(id) as unknown as UserRow;
  return row;
}

export function findUserByUsername(username: string): UserRow | undefined {
  const row = db
    .prepare(`SELECT id, username, password_hash, created_at FROM users WHERE username = ?`)
    .get(username) as unknown as UserRow | undefined;
  return row;
}

// 云端存档（MVP 后启用；预留 schema 与读写）
export function saveUserData(userId: number, data: string): void {
  db.prepare(
    `INSERT INTO saves (user_id, data, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')`,
  ).run(userId, data);
}

export function loadUserData(userId: number): string | undefined {
  const row = db.prepare(`SELECT data FROM saves WHERE user_id = ?`).get(userId) as
    | { data: string }
    | undefined;
  return row?.data;
}
