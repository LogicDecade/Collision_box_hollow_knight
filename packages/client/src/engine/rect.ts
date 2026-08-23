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
