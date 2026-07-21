// 楼层布局生成:种子化随机游走,产出房间图
import { RNG } from '../core/rng.ts';
import type { DoorSide } from '../three/room.ts';

export interface RoomNode {
  id: number;
  gx: number;
  gy: number;
  kind: 'start' | 'normal' | 'boss' | 'treasure' | 'shop';
  /** 邻居房间 id(生成后填充) */
  links: Partial<Record<DoorSide, number>>;
  cleared: boolean;
}

export interface Floor {
  rooms: RoomNode[];
  startId: number;
  bossId: number;
}

const DIRS: { side: DoorSide; opposite: DoorSide; dx: number; dy: number }[] = [
  { side: 'n', opposite: 's', dx: 0, dy: -1 },
  { side: 's', opposite: 'n', dx: 0, dy: 1 },
  { side: 'e', opposite: 'w', dx: 1, dy: 0 },
  { side: 'w', opposite: 'e', dx: -1, dy: 0 },
];

const key = (x: number, y: number): string => `${x},${y}`;

  /** 生成一层:从起点随机游走 roomCount 步,末端为 Boss 房 */
export function generateFloor(rng: RNG, roomCount: number): Floor {
  const rooms: RoomNode[] = [];
  const byPos = new Map<string, RoomNode>();

  const start: RoomNode = { id: 0, gx: 0, gy: 0, kind: 'start', links: {}, cleared: true };
  rooms.push(start);
  byPos.set(key(0, 0), start);

  let cur = start;
  while (rooms.length < roomCount) {
    const dir = rng.pick(DIRS);
    const nx = cur.gx + dir.dx;
    const ny = cur.gy + dir.dy;
    const existing = byPos.get(key(nx, ny));
    if (existing) {
      // 走到已有房间:补上连接并继续
      cur.links[dir.side] = existing.id;
      existing.links[dir.opposite] = cur.id;
      cur = existing;
      continue;
    }
    const node: RoomNode = { id: rooms.length, gx: nx, gy: ny, kind: 'normal', links: {}, cleared: false };
    rooms.push(node);
    byPos.set(key(nx, ny), node);
    cur.links[dir.side] = node.id;
    node.links[dir.opposite] = cur.id;
    cur = node;
  }
  // 游走终点即 Boss 房
  cur.kind = 'boss';

  // 支线挂一个宝箱房和一个商店(挂在随机普通房的空方向上)
  attachSpecial(rng, rooms, byPos, 'treasure');
  attachSpecial(rng, rooms, byPos, 'shop');

  return { rooms, startId: start.id, bossId: cur.id };
}

/** 在随机普通房的空方向上挂一个特殊房间 */
function attachSpecial(
  rng: RNG,
  rooms: RoomNode[],
  byPos: Map<string, RoomNode>,
  kind: RoomNode['kind'],
): void {
  const bases = rooms.filter((r) => r.kind === 'normal');
  for (let tries = 0; tries < 12; tries++) {
    const base = rng.pick(bases);
    const dir = rng.pick(DIRS);
    const nx = base.gx + dir.dx;
    const ny = base.gy + dir.dy;
    if (byPos.has(key(nx, ny))) continue;
    const node: RoomNode = { id: rooms.length, gx: nx, gy: ny, kind, links: {}, cleared: false };
    rooms.push(node);
    byPos.set(key(nx, ny), node);
    base.links[dir.side] = node.id;
    node.links[dir.opposite] = base.id;
    return;
  }
}
