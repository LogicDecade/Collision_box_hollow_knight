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
  // 横向解算：移动后若与实心重叠，按速度方向把身体推回该实心边界。
  // 唯一例外：该实心在竖直方向几乎完全包住身体（即 body 底远低于 solid 顶，
  // 又 body 顶远高于 solid 底 = 真·横墙）才横推；若只是「脚踩/头顶/钻入地面」
  // 这类竖直重叠（solid 顶在身体中部以下），把它当墙横推会把角色横向甩飞。
  // 判定：body 的竖直范围与 solid 竖直范围的重叠深度 ≥ 身体高的 40% 即视为横墙。
  const prevX = body.x;
  body.x += vel.x * dt;
  let wallLeft = false;
  let wallRight = false;
  if (vel.x !== 0 && body.x !== prevX) {
    for (const s of solids) {
      if (!rectsOverlap(body, s)) continue;
      // 竖直重叠深度：身高的 40% 以下视为“浅接触”（脚踩地/贴屋顶），非横墙
      const gapY = Math.min(body.y + body.h, s.y + s.h) - Math.max(body.y, s.y);
      if (gapY < body.h * 0.4) continue;
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
