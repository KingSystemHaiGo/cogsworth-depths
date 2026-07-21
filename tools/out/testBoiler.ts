// 由 tools/img2lathe.mjs 从参考图生成:tools/refs/boiler-ref.png
import * as THREE from 'three';
import { toonMat, addOutlines, makeBlobShadow } from '../materials.ts';

/** testBoiler:轮廓旋成(高 2.2m) */
export function makeTestBoiler(): THREE.Group {
  const g = new THREE.Group();
  const profile = [
    new THREE.Vector2(0.367, 0.000),
    new THREE.Vector2(1.100, 0.096),
    new THREE.Vector2(1.100, 0.957),
    new THREE.Vector2(0.796, 1.243),
    new THREE.Vector2(1.100, 1.339),
    new THREE.Vector2(0.464, 1.435),
    new THREE.Vector2(0.201, 1.722),
    new THREE.Vector2(0.201, 2.200),
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 16), toonMat(0x8a5a2a));
  g.add(body);
  addOutlines(g);
  g.add(makeBlobShadow(1.10));
  return g;
}
