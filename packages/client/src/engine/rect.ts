// AABB 矩形几何 + 轴分离移动碰撞（世界全是矩形：地形、实体）
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

export interface MoveResult {
  ground: boolean;
  wallLeft: boolean;
  wallRight: boolean;
  ceiling: boolean;
}

/** 沿轴依次移动并解算碰撞（vel 为速度，乘 dt 转位移）。返回本帧碰撞到的面。 */
export function moveAndSlide(
  body: Rect,
  vel: { x: number; y: number },
  dt: number,
  solids: readonly Rect[],
): MoveResult {
  // 移动前已与实心重叠 = 出生点嵌入/卡实体。此时不做水平弹飞，
  // 交由 Y 轴统一向上/向下归位，避免被当作“撞墙”横向甩出。
  const embeddedBeforeX = vel.x !== 0 && solids.some((s) => rectsOverlap(body, s));

  body.x += vel.x * dt;
  let wallLeft = false;
  let wallRight = false;
  if (vel.x !== 0 && !embeddedBeforeX) {
    for (const s of solids) {
      if (rectsOverlap(body, s)) {
        if (vel.x > 0) {
          body.x = s.x - body.w;
          wallRight = true;
        } else if (vel.x < 0) {
          body.x = s.x + s.w;
          wallLeft = true;
        }
        break;
      }
    }
  }

  body.y += vel.y * dt;
  let ground = false;
  let ceiling = false;
  if (vel.y !== 0) {
    for (const s of solids) {
      if (rectsOverlap(body, s)) {
        if (vel.y > 0) {
          body.y = s.y - body.h;
          ground = true;
        } else if (vel.y < 0) {
          body.y = s.y + s.h;
          ceiling = true;
        }
        break;
      }
    }
  }
  return { ground, wallLeft, wallRight, ceiling };
}

/** 判断 body 正下方有没有实心（用于敌人换向等） */
export function isGroundedBelow(body: Rect, groundCheckY: number, solids: readonly Rect[]): boolean {
  const probe: Rect = { x: body.x + 1, y: groundCheckY, w: body.w - 2, h: 3 };
  return solids.some((s) => rectsOverlap(probe, s));
}

/**
 * 把矩形从所有重叠实心中推出（去嵌入）。用于限制重生/出生点位置：
 * 若出生点被摆进墙或地里，将其推到最近的合法位置——优先垂直（向上脱困，
 * 贴地落下），取最小位移避免大跳变。返回推出后的新矩形。
 */
export function depenetrate(rect: Rect, solids: readonly Rect[]): Rect {
  const r = { ...rect };
  // 迭代处理连锁重叠（推出后可能又压到相邻实心）
  for (let iter = 0; iter < 8; iter++) {
    const s = solids.find((c) => rectsOverlap(r, c));
    if (!s) break;
    // 四向推出量（单位：把 r 移到 s 之外的移动距离）
    const up = r.y + r.h - s.y; // 上移使底贴 s.顶
    const down = s.y + s.h - r.y; // 下移使顶贴 s.底
    const left = r.x + r.w - s.x; // 左移使右贴 s.左
    const right = s.x + s.w - r.x; // 右移使左贴 s.右
    // 选最小正位移；两向相等时偏垂直（优先向上）
    const upMove = { d: up, axis: 'y' as const, sign: -1 as const };
    const downMove = { d: down, axis: 'y' as const, sign: 1 as const };
    const leftMove = { d: left, axis: 'x' as const, sign: -1 as const };
    const rightMove = { d: right, axis: 'x' as const, sign: 1 as const };
    const moves = [upMove, downMove, leftMove, rightMove].sort(
      (a, b) => a.d - b.d || (a.axis === 'y' ? -1 : 1),
    );
    const best = moves[0];
    if (best.axis === 'y') r.y += best.sign * best.d;
    else r.x += best.sign * best.d;
  }
  return r;
}
