// 由 tools/img2lathe.mjs 从参考图生成:tools/refs/lantern.png
import * as THREE from 'three';
import { toonMat, addOutlines, makeBlobShadow } from '../materials.ts';

/** steamLantern:轮廓旋成(高 1.6m) */
export function makeSteamLantern(): THREE.Group {
  const g = new THREE.Group();
  const profile = [
    new THREE.Vector2(0.675, 0.000),
    new THREE.Vector2(0.675, 0.070),
    new THREE.Vector2(0.521, 0.209),
    new THREE.Vector2(0.521, 0.835),
    new THREE.Vector2(0.800, 0.974),
    new THREE.Vector2(0.312, 1.183),
    new THREE.Vector2(0.376, 1.322),
    new THREE.Vector2(0.336, 1.461),
    new THREE.Vector2(0.042, 1.600),
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 16), toonMat(0xc6c6c6));
  g.add(body);
  addOutlines(g);
  g.add(makeBlobShadow(0.80));
  return g;
}
