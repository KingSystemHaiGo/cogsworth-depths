// 管线 A:参考图 → 轮廓旋成 → Three.js LatheGeometry 工厂代码
// 用法: node tools/img2lathe.mjs <参考图.png> [名称] [高度]
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  extractMask,
  boundingBox,
  symmetryAxis,
  sampleProfile,
  simplifyProfile,
  dominantColors,
} from './lib/image.ts';

const [,, imgPath, name = 'customProp', height = '2'] = process.argv;
if (!imgPath) {
  console.error('用法: node tools/img2lathe.mjs <图片> [名称] [高度]');
  process.exit(1);
}
const H = Number(height);

const img = await sharp(imgPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const rgba = { width: img.info.width, height: img.info.height, data: new Uint8Array(img.data) };

// 1. 背景去除 → 主体 mask
const mask = extractMask(rgba, 36);
const bb = boundingBox(mask, rgba.width, rgba.height);
console.error(`主体: ${bb.maxX - bb.minX}×${bb.maxY - bb.minY}px`);

// 2. 对称轴
const axis = symmetryAxis(mask, rgba.width, rgba.height, bb);
console.error(`对称轴 x=${axis.toFixed(1)}`);

// 3. 半轮廓采样 + 简化 → 三维坐标(半径,高度)
const raw = sampleProfile(mask, rgba.width, rgba.height, bb, axis, 24);
const profile = simplifyProfile(raw, 0.035);
console.error(`轮廓点: ${raw.length} → 简化后 ${profile.length}`);

// 4. 主导色
const colors = dominantColors(rgba, mask, 3);
const hex = (c: number[]): string => `0x${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

// 5. 生成 TS 工厂代码
const vec2 = profile.map((p) => `    new THREE.Vector2(${(p.r * (H / 2)).toFixed(3)}, ${(p.y * H).toFixed(3)}),`).join('\n');
const code = `// 由 tools/img2lathe.mjs 从参考图生成:${imgPath}
import * as THREE from 'three';
import { toonMat, addOutlines, makeBlobShadow } from '../materials.ts';

/** ${name}:轮廓旋成(高 ${H}m) */
export function make${name[0].toUpperCase() + name.slice(1)}(): THREE.Group {
  const g = new THREE.Group();
  const profile = [
${vec2}
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 16), toonMat(${hex(colors[0])}));
  g.add(body);
  addOutlines(g);
  g.add(makeBlobShadow(${(H / 2).toFixed(2)}));
  return g;
}
`;

mkdirSync('tools/out', { recursive: true });
const outPath = `tools/out/${name}.ts`;
writeFileSync(outPath, code);
console.error(`已生成 ${outPath}`);
console.log(code);
