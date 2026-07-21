// 部件分解管线:彩色参考图 → 按颜色拆件 → 每部分别建模(挤出) → 组合工厂
// 用法: node tools/img2parts.mts <图片> [名称] [尺寸] [部件数k]
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  extractMask,
  boundingBox,
  colorPartMasks,
  findStart,
  traceContour,
  simplify2D,
} from './lib/image.ts';

const [,, imgPath, name = 'multiProp', sizeArg = '1.5', kArg = '3'] = process.argv;
if (!imgPath) {
  console.error('用法: node tools/img2parts.mts <图片> [名称] [尺寸] [部件数k]');
  process.exit(1);
}
const size = Number(sizeArg);
const k = Number(kArg);

const img = await sharp(imgPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const rgba = { width: img.info.width, height: img.info.height, data: new Uint8Array(img.data) };
const fullMask = extractMask(rgba, 36);
const bb = boundingBox(fullMask, rgba.width, rgba.height);
const parts = colorPartMasks(rgba, fullMask, k);
console.error(`主体 ${bb.maxX - bb.minX}×${bb.maxY - bb.minY}px,拆出 ${parts.length} 个部件`);

const scale = size / Math.min(bb.maxX - bb.minX, bb.maxY - bb.minY);
const cx = (bb.minX + bb.maxX) / 2;
const cy = (bb.minY + bb.maxY) / 2;
const hex = (c: number[]): string => `0x${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

const partCodes: string[] = [];
for (let pi = 0; pi < parts.length; pi++) {
  const part = parts[pi];
  const start = findStart(part.mask, rgba.width, rgba.height, bb);
  if (!start) continue;
  const contour = traceContour(part.mask, rgba.width, rgba.height, start.x, start.y);
  const eps = Math.max(1.2, contour.length * 0.004);
  const simplified = simplify2D(contour, eps);
  if (simplified.length < 3) continue;
  console.error(`部件${pi}: 颜色 ${hex(part.color)} 像素 ${part.count} 轮廓 ${simplified.length} 点`);
  const pts = simplified
    .map((p) => `    [${((p.x - cx) * scale).toFixed(3)}, ${(-(p.y - cy) * scale).toFixed(3)}],`)
    .join('\n');
  partCodes.push(`  {
    color: ${hex(part.color)},
    points: [
${pts}
    ],
  },`);
}

const cap = name[0].toUpperCase() + name.slice(1);
const code = `// 由 tools/img2parts.mts 部件分解生成
import * as THREE from 'three';
import { toonMat, addOutlines, makeBlobShadow } from '../materials.ts';

interface Part {
  color: number;
  points: [number, number][];
}

const PARTS: Part[] = [
${partCodes.join('\n')}
];

/** ${name}(按颜色拆 ${partCodes.length} 件分别挤出) */
export function make${cap}(): THREE.Group {
  const g = new THREE.Group();
  for (const part of PARTS) {
    const shape = new THREE.Shape();
    for (const [x, y] of part.points) shape.lineTo(x, y);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: ${(size * 0.18).toFixed(3)},
      bevelEnabled: true,
      bevelThickness: ${(size * 0.02).toFixed(3)},
      bevelSize: ${(size * 0.015).toFixed(3)},
      bevelSegments: 1,
      curveSegments: 6,
    });
    // 不单独居中:所有部件共享参考图坐标系,保持相对位置
    const mesh = new THREE.Mesh(geo, toonMat(part.color));
    g.add(mesh);
  }
  addOutlines(g);
  g.add(makeBlobShadow(${(size * 0.7).toFixed(2)}));
  return g;
}
`;

mkdirSync('tools/out', { recursive: true });
writeFileSync(`tools/out/${name}.ts`, code);
console.error(`已生成 tools/out/${name}.ts`);
