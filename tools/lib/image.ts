// 图像→轮廓算法库:背景去除 / 轮廓提取 / 对称轴 / 坐标采样 / 曲线简化
// 纯算法,零模型依赖。输入参考图,输出三维建模所需的坐标数据。

export interface RGBA {
  width: number;
  height: number;
  data: Uint8Array; // RGBA 交错
}

/** 背景去除:边缘 flood fill。假设背景是近均匀色(白底/纯色底最佳)。
 *  返回主体 mask(1=主体,0=背景) */
export function extractMask(img: RGBA, tolerance = 30): Uint8Array {
  const { width: w, height: h, data } = img;
  const mask = new Uint8Array(w * h).fill(1);
  // 估计背景色:取四角均值
  let br = 0, bg = 0, bb = 0;
  const corners = [
    [2, 2],
    [w - 3, 2],
    [2, h - 3],
    [w - 3, h - 3],
  ];
  for (const [cx, cy] of corners) {
    const i = (cy * w + cx) * 4;
    br += data[i];
    bg += data[i + 1];
    bb += data[i + 2];
  }
  br /= 4;
  bg /= 4;
  bb /= 4;

  // 从所有边缘像素 flood fill 标记背景
  const visited = new Uint8Array(w * h);
  const queue: number[] = [];
  const isBg = (x: number, y: number): boolean => {
    const i = (y * w + x) * 4;
    const dr = data[i] - br;
    const dg = data[i + 1] - bg;
    const db = data[i + 2] - bb;
    const da = data[i + 3];
    if (da < 16) return true; // 透明也算背景
    return Math.sqrt(dr * dr + dg * dg + db * db) < tolerance;
  };
  const push = (x: number, y: number): void => {
    const idx = y * w + x;
    if (x < 0 || y < 0 || x >= w || y >= h || visited[idx] || !isBg(x, y)) return;
    visited[idx] = 1;
    queue.push(idx);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (queue.length > 0) {
    const idx = queue.pop()!;
    const x = idx % w;
    const y = (idx / w) | 0;
    mask[idx] = 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return mask;
}

export interface Point {
  x: number;
  y: number;
}

/** 主体包围盒 */
export function boundingBox(mask: Uint8Array, w: number, h: number): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

/** 逐行宽度 → 对称轴估计:使左右半径方差最小的 x */
export function symmetryAxis(mask: Uint8Array, w: number, h: number, bb: { minX: number; maxX: number; minY: number; maxY: number }): number {
  let bestX = (bb.minX + bb.maxX) / 2;
  let bestScore = Infinity;
  for (let cand = bb.minX + 2; cand < bb.maxX - 2; cand += 0.5) {
    let score = 0;
    let rows = 0;
    for (let y = bb.minY; y <= bb.maxY; y += 2) {
      let left = -1, right = -1;
      for (let x = 0; x < w; x++) {
        if (mask[y * w + x]) {
          if (left < 0) left = x;
          right = x;
        }
      }
      if (left < 0) continue;
      const dl = cand - left;
      const dr = right - cand;
      score += (dl - dr) * (dl - dr);
      rows++;
    }
    if (rows > 0 && score / rows < bestScore) {
      bestScore = score / rows;
      bestX = cand;
    }
  }
  return bestX;
}

/** 半轮廓采样:按 y 均匀取 n 个点,返回 LatheGeometry 需要的 (半径, 高度) 坐标。
 *  半径取左右两侧均值(比取最大值更能抗边缘噪声,曲线更顺滑)。
 *  输出以底部为 y=0、最大半径为 1 归一化 */
export function sampleProfile(
  mask: Uint8Array,
  w: number,
  h: number,
  bb: { minX: number; maxX: number; minY: number; maxY: number },
  axisX: number,
  n = 48,
): { r: number; y: number }[] {
  const raw: { r: number; y: number }[] = [];
  let maxR = 1;
  for (let i = 0; i < n; i++) {
    const y = Math.round(bb.maxY - (i / (n - 1)) * (bb.maxY - bb.minY)); // 从底到顶
    let left = -1, right = -1;
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        if (left < 0) left = x;
        right = x;
      }
    }
    if (left < 0) continue;
    // 左右半径均值:抗锯齿边缘的单像素毛刺会被平掉
    const r = ((axisX - left) + (right - axisX)) / 2;
    raw.push({ r, y: i / (n - 1) });
    if (r > maxR) maxR = r;
  }
  return raw.map((p) => ({ r: p.r / maxR, y: p.y }));
}

/** Douglas-Peucker 曲线简化(极坐标展开到 r-y 平面) */
export function simplifyProfile(pts: { r: number; y: number }[], epsilon = 0.03): { r: number; y: number }[] {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;

  const dist = (p: { r: number; y: number }, a: { r: number; y: number }, b: { r: number; y: number }): number => {
    const dx = b.r - a.r;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return Math.hypot(p.r - a.r, p.y - a.y);
    return Math.abs(dy * (p.r - a.r) - dx * (p.y - a.y)) / len;
  };
  const recurse = (i0: number, i1: number): void => {
    if (i1 <= i0 + 1) return;
    let maxD = 0;
    let maxI = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = dist(pts[i], pts[i0], pts[i1]);
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > epsilon && maxI > 0) {
      keep[maxI] = 1;
      recurse(i0, maxI);
      recurse(maxI, i1);
    }
  };
  recurse(0, pts.length - 1);
  return pts.filter((_, i) => keep[i]);
}

/** 主体颜色提取:轮廓内像素 k-means(k=3) 取主导色,过滤近白/近黑的边缘杂色 */
export function dominantColors(img: RGBA, mask: Uint8Array, k = 3): [number, number, number][] {
  const { width: w, height: h, data } = img;
  const pixels: number[][] = [];
  for (let i = 0; i < w * h; i++) {
    if (mask[i] && data[i * 4 + 3] > 128) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      if (luma > 235 || luma < 12) continue; // 边缘背景杂色
      pixels.push([r, g, b]);
    }
  }
  if (pixels.length === 0) return [[176, 141, 87]];
  // 简单 k-means(10 轮)
  const centers: number[][] = [];
  for (let i = 0; i < k; i++) centers.push([...pixels[Math.floor((i / k) * pixels.length)]]);
  for (let iter = 0; iter < 10; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const p of pixels) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = (p[0] - centers[c][0]) ** 2 + (p[1] - centers[c][1]) ** 2 + (p[2] - centers[c][2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      sums[best][0] += p[0];
      sums[best][1] += p[1];
      sums[best][2] += p[2];
      sums[best][3]++;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][3] > 0) {
        centers[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
      }
    }
  }
  // 按簇大小排序,主导色在前
  const sizes = centers.map((_, ci) => {
    let n = 0;
    for (const p of pixels) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = (p[0] - centers[c][0]) ** 2 + (p[1] - centers[c][1]) ** 2 + (p[2] - centers[c][2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (best === ci) n++;
    }
    return n;
  });
  const order = centers.map((_, i) => i).sort((a, b) => sizes[b] - sizes[a]);
  return order.map((i) => [Math.round(centers[i][0]), Math.round(centers[i][1]), Math.round(centers[i][2])] as [number, number, number]);
}

// ============ 自适应分流与挤出路径 ============

/** 左右对称度评分(0~1,1=完美对称)。>0.85 走旋成,否则走挤出 */
export function symmetryScore(
  mask: Uint8Array,
  w: number,
  bb: { minX: number; maxX: number; minY: number; maxY: number },
  axisX: number,
  h: number,
): number {
  let err = 0;
  let total = 0;
  for (let y = bb.minY; y <= bb.maxY; y += 2) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        if (left < 0) left = x;
        right = x;
      }
    }
    if (left < 0) continue;
    const dl = axisX - left;
    const dr = right - axisX;
    const w2 = Math.max(dl, dr, 1);
    err += Math.abs(dl - dr) / w2;
    total++;
  }
  return total > 0 ? 1 - err / total : 0;
}

/** Moore 邻域追踪(Jacob 停止准则):返回完整有序外轮廓 */
export function traceContour(mask: Uint8Array, w: number, h: number, startX: number, startY: number): Point[] {
  const at = (x: number, y: number): number => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0);
  // 8 邻域顺时针:右、右下、下、左下、左、左上、上、右上
  const dirs = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  const contour: Point[] = [{ x: startX, y: startY }];
  let bx = startX;
  let by = startY;
  // 回溯点:起点左侧(它是背景)
  let px = startX - 1;
  let py = startY;
  const maxSteps = w * h * 4;
  for (let step = 0; step < maxSteps; step++) {
    // 从回溯点的下一个(顺时针)开始找前景
    const startDir = dirs.findIndex(([dx, dy]) => bx + dx === px && by + dy === py);
    let found = false;
    for (let k = 1; k <= 8; k++) {
      const nd = (startDir + k) % 8;
      const nx = bx + dirs[nd][0];
      const ny = by + dirs[nd][1];
      if (at(nx, ny)) {
        // 新回溯点 = 找到的前景邻居的前一个(逆时针)
        const pd = (nd + 7) % 8;
        px = bx + dirs[pd][0];
        py = by + dirs[pd][1];
        bx = nx;
        by = ny;
        found = true;
        break;
      }
    }
    if (!found) break; // 孤立点
    if (bx === startX && by === startY && contour.length > 4) break;
    contour.push({ x: bx, y: by });
  }
  return contour;
}

/** 找主体最上最左像素作为追踪起点 */
export function findStart(mask: Uint8Array, w: number, h: number, bb: { minX: number; maxX: number; minY: number; maxY: number }): Point | null {
  for (let y = bb.minY; y <= bb.maxY; y++) {
    for (let x = bb.minX; x <= bb.maxX; x++) {
      if (mask[y * w + x]) return { x, y };
    }
  }
  return null;
}

/** 2D Douglas-Peucker 简化(用于挤出轮廓) */
export function simplify2D(pts: Point[], epsilon: number): Point[] {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const dist = (p: Point, a: Point, b: Point): number => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
    return Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / len;
  };
  const recurse = (i0: number, i1: number): void => {
    if (i1 <= i0 + 1) return;
    let maxD = 0;
    let maxI = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = dist(pts[i], pts[i0], pts[i1]);
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > epsilon && maxI > 0) {
      keep[maxI] = 1;
      recurse(i0, maxI);
      recurse(maxI, i1);
    }
  };
  recurse(0, pts.length - 1);
  return pts.filter((_, i) => keep[i]);
}

/** 点是否在多边形内(射线法) */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** 提取内孔轮廓:扫描主体内部 0→1 过渡点,追踪并判定为孔 */
export function extractHoles(mask: Uint8Array, w: number, h: number, bb: { minX: number; maxX: number; minY: number; maxY: number }): Point[][] {
  const holes: Point[][] = [];
  const visited = new Set<number>();
  for (let y = bb.minY + 1; y < bb.maxY; y++) {
    for (let x = bb.minX + 1; x < bb.maxX; x++) {
      const idx = y * w + x;
      // 背景像素,左边是主体,且未被访问 → 可能是孔的起始
      if (!mask[idx] && mask[idx - 1] && !visited.has(idx)) {
        // flood fill 该背景区域
        const region: number[] = [idx];
        const stack = [idx];
        visited.add(idx);
        let touchesEdge = false;
        let minX = x, maxX = x, minY = y, maxY = y;
        while (stack.length) {
          const ci = stack.pop()!;
          const cx = ci % w;
          const cy = (ci / w) | 0;
          if (cx <= bb.minX || cx >= bb.maxX || cy <= bb.minY || cy >= bb.maxY) {
            touchesEdge = true;
          }
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx;
            const ny = cy + dy;
            const ni = ny * w + nx;
            if (nx >= 0 && ny >= 0 && nx < w && ny < h && !mask[ni] && !visited.has(ni)) {
              visited.add(ni);
              stack.push(ni);
              region.push(ni);
            }
          }
        }
        // 不触碰主体边缘的封闭背景 = 孔
        if (!touchesEdge && region.length > 20) {
          // 用区域近似多边形(取边界简化为 8 点)
          const holePts: Point[] = [];
          const n = 8;
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          const rx = (maxX - minX) / 2;
          const ry = (maxY - minY) / 2;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            holePts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
          }
          holes.push(holePts);
        }
      }
    }
  }
  return holes;
}

/** 连通比例:逐行统计剪影连续段数,单段行占比。
 *  旋转体(锅炉/帽子/灯笼)每行只有一段;多腿/多管图形会有多段 → 判挤出 */
export function contiguityRatio(mask: Uint8Array, w: number, bb: { minX: number; maxX: number; minY: number; maxY: number }): number {
  let single = 0;
  let total = 0;
  for (let y = bb.minY; y <= bb.maxY; y += 2) {
    let runs = 0;
    let inRun = false;
    for (let x = bb.minX; x <= bb.maxX; x++) {
      const v = mask[y * w + x];
      if (v && !inRun) {
        runs++;
        inRun = true;
      } else if (!v) {
        inRun = false;
      }
    }
    if (runs > 0) {
      total++;
      if (runs === 1) single++;
    }
  }
  return total > 0 ? single / total : 0;
}

/** 轴覆盖率:剪影覆盖对称轴的行数占比。旋转体的躯干必须包轴,
 *  阀门/法兰(轴处有空隙)和多腿生物(腿在两翼)覆盖率低 → 判挤出 */
export function axisCoverage(mask: Uint8Array, w: number, bb: { minX: number; maxX: number; minY: number; maxY: number }, axisX: number): number {
  let covered = 0;
  let total = 0;
  const ax = Math.round(axisX);
  for (let y = bb.minY; y <= bb.maxY; y += 2) {
    let has = false;
    let axisIn = false;
    for (let x = bb.minX; x <= bb.maxX; x++) {
      const v = mask[y * w + x];
      if (v) {
        has = true;
        if (Math.abs(x - ax) <= 2) axisIn = true;
      }
    }
    if (has) {
      total++;
      if (axisIn) covered++;
    }
  }
  return total > 0 ? covered / total : 0;
}

/** 提取最大连通分量(处理图标中分离的小部件,如蜘蛛的拱顶) */
export function largestComponent(mask: Uint8Array, w: number, h: number): Uint8Array {
  const labels = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || labels[i] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [i];
    labels[i] = id;
    while (stack.length) {
      const ci = stack.pop()!;
      size++;
      const cx = ci % w;
      const cy = (ci / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        const ni = ny * w + nx;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[ni] && labels[ni] < 0) {
          labels[ni] = id;
          stack.push(ni);
        }
      }
    }
    sizes.push(size);
  }
  let best = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = labels[i] === best ? 1 : 0;
  return out;
}

/** 形态学膨胀(方形核):把分段的白色部件桥接成整体,供外轮廓追踪 */
export function dilate(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const out = new Uint8Array(mask);
  const w2 = w * h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) continue;
      outer: for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[ny * w + nx]) {
            out[y * w + x] = 1;
            break outer;
          }
        }
      }
    }
  }
  void w2;
  return out;
}
