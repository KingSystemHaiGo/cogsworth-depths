// 自适应管线:对称度评分自动分流 旋成(lathe) ↔ 挤出(extrude)
// 用法: node tools/img2prop.mts <图片> [名称] [尺寸] [--mode=auto|lathe|extrude] [--depth=N] [--eps=N]
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  extractMask,
  boundingBox,
  symmetryAxis,
  symmetryScore,
  contiguityRatio,
  axisCoverage,
  sampleProfile,
  simplifyProfile,
  dominantColors,
  traceContour,
  findStart,
  simplify2D,
  extractHoles,
  largestComponent,
  dilate,
} from './lib/image.ts';

const args = process.argv.slice(2);
const imgPath = args[0];
const name = args[1] ?? 'customProp';
const size = Number(args[2] ?? 1.5);
const opt = (k: string, d: string): string => {
  const f = args.find((a) => a.startsWith(`--${k}=`));
  return f ? f.split('=')[1] : d;
};
const mode = opt('mode', 'auto');
const depthArg = Number(opt('depth', '0'));

if (!imgPath) {
  console.error('用法: node tools/img2prop.mts <图片> [名称] [尺寸] [--mode=auto|lathe|extrude] [--depth=N]');
  process.exit(1);
}

const img = await sharp(imgPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const rgba = { width: img.info.width, height: img.info.height, data: new Uint8Array(img.data) };
const mask = extractMask(rgba, 36);
const bb = boundingBox(mask, rgba.width, rgba.height);
const axis = symmetryAxis(mask, rgba.width, rgba.height, bb);
const score = symmetryScore(mask, rgba.width, bb, axis, rgba.height);
const contiguity = contiguityRatio(mask, rgba.width, bb);
const coverage = axisCoverage(mask, rgba.width, bb, axis);
const colors = dominantColors(rgba, mask, 3);
const hex = (c: number[]): string => `0x${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

console.error(`主体 ${bb.maxX - bb.minX}×${bb.maxY - bb.minY}px 对称度 ${(score * 100).toFixed(1)}% 连通率 ${(contiguity * 100).toFixed(1)}% 轴覆盖 ${(coverage * 100).toFixed(1)}%`);

// 旋转体判定:镜像对称 + 躯干包轴(阀门轴处有空隙、多腿生物腿在两翼,都不算)
const useLathe = mode === 'lathe' || (mode === 'auto' && score > 0.85 && contiguity > 0.5 && coverage > 0.8);
console.error(`路径: ${useLathe ? '旋成(lathe)' : '挤出(extrude)'}`);

let code: string;
if (useLathe) {
  const raw = sampleProfile(mask, rgba.width, rgba.height, bb, axis, 64);
  const profile = simplifyProfile(raw, 0.012);
  console.error(`轮廓: ${raw.length} 采样 → ${profile.length} 点`);
  const vec2 = profile.map((p) => `    new THREE.Vector2(${(p.r * size).toFixed(3)}, ${(p.y * size).toFixed(3)}),`).join('\n');
  code = genFactory(name, `const profile = [\n${vec2}\n  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), toonMat(${hex(colors[0])}));
  g.add(body);`, size);
} else {
  // 分段式图标(部件间有黑缝)先膨胀桥接,再取最大连通分量
  const dilated = dilate(mask, rgba.width, rgba.height, 10);
  const mainMask = largestComponent(dilated, rgba.width, rgba.height);
  const start = findStart(mainMask, rgba.width, rgba.height, bb);
  if (!start) throw new Error('找不到主体');
  const contour = traceContour(mainMask, rgba.width, rgba.height, start.x, start.y);
  const perimeter = contour.length;
  const eps = Math.max(1.2, perimeter * 0.004);
  const simplified = simplify2D(contour, eps);
  console.error(`轮廓: ${perimeter}px 周长 → ${simplified.length} 点(ε=${eps.toFixed(1)})`);
  const holes = extractHoles(mask, rgba.width, rgba.height, bb);
  console.error(`内孔: ${holes.length} 个`);

  // 坐标归一化:以包围盒中心为原点,短边归一到 size
  const scale = size / Math.min(bb.maxX - bb.minX, bb.maxY - bb.minY);
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;
  const pt = (p: { x: number; y: number }): string =>
    `${((p.x - cx) * scale).toFixed(3)}, ${(-(p.y - cy) * scale).toFixed(3)}`;
  const depth = depthArg > 0 ? depthArg : Math.max(0.15, size * 0.22);

  const shapePts = simplified.map((p) => `shape.lineTo(${pt(p)});`).join('\n  ');
  const holeCode = holes
    .map(
      (hole, i) => `
  const hole${i} = new THREE.Path();
  ${hole.map((p, j) => `${j === 0 ? `hole${i}.moveTo(${pt(p)});` : `hole${i}.lineTo(${pt(p)});`}`).join('\n  ')}
  shape.holes.push(hole${i});`,
    )
    .join('\n');

  code = genFactory(
    name,
    `const shape = new THREE.Shape();
  ${shapePts}
  shape.closePath();${holeCode}
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: ${depth.toFixed(3)},
    bevelEnabled: true,
    bevelThickness: ${(depth * 0.12).toFixed(3)},
    bevelSize: ${(depth * 0.1).toFixed(3)},
    bevelSegments: 2,
    curveSegments: 6,
  });
  geo.center();
  const body = new THREE.Mesh(geo, toonMat(${hex(colors[0])}));
  g.add(body);`,
    size,
  );
}

function genFactory(n: string, body: string, s: number): string {
  const cap = n[0].toUpperCase() + n.slice(1);
  return `// 由 tools/img2prop.mts 从参考图生成(自适应分流)
import * as THREE from 'three';
import { toonMat, addOutlines, makeBlobShadow } from '../materials.ts';

/** ${n}(尺寸 ~${s}m) */
export function make${cap}(): THREE.Group {
  const g = new THREE.Group();
  ${body}
  addOutlines(g);
  g.add(makeBlobShadow(${(s * 0.7).toFixed(2)}));
  return g;
}
`;
}

mkdirSync('tools/out', { recursive: true });
writeFileSync(`tools/out/${name}.ts`, code);
console.error(`已生成 tools/out/${name}.ts`);
