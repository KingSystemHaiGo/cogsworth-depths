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

/** 半轮廓采样:按 y 均匀取 n 个点,返回 LatheGeometry 需要的 (半径, 高度) 坐标
 *  输出以底部为 y=0、最大半径为 1 归一化 */
export function sampleProfile(
  mask: Uint8Array,
  w: number,
  h: number,
  bb: { minX: number; maxX: number; minY: number; maxY: number },
  axisX: number,
  n = 20,
): { r: number; y: number }[] {
  const pts: { r: number; y: number }[] = [];
  let maxR = 1;
  const raw: { r: number; y: number }[] = [];
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
    const r = Math.max(axisX - left, right - axisX);
    raw.push({ r, y: i / (n - 1) });
    if (r > maxR) maxR = r;
  }
  for (const p of raw) pts.push({ r: p.r / maxR, y: p.y });
  return pts;
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
