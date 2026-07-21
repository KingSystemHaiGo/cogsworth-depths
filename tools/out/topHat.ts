// eslint-disable-next-line
// 由 tools/img2lathe.mjs 从参考图生成:tools/refs/top-hat.png
import * as THREE from 'three';
import { toonMat, addOutlines, makeBlobShadow } from '../materials.ts';

/** topHat:轮廓旋成(高 0.9m) */
export function makeTopHat(): THREE.Group {
  const g = new THREE.Group();
  const profile = [
    new THREE.Vector2(0.060, 0.000),
    new THREE.Vector2(0.247, 0.029),
    new THREE.Vector2(0.356, 0.071),
    new THREE.Vector2(0.434, 0.143),
    new THREE.Vector2(0.450, 0.214),
    new THREE.Vector2(0.433, 0.271),
    new THREE.Vector2(0.390, 0.329),
    new THREE.Vector2(0.236, 0.414),
    new THREE.Vector2(0.232, 0.514),
    new THREE.Vector2(0.243, 0.686),
    new THREE.Vector2(0.175, 0.700),
    new THREE.Vector2(0.237, 0.729),
    new THREE.Vector2(0.220, 0.743),
    new THREE.Vector2(0.249, 0.786),
    new THREE.Vector2(0.243, 0.814),
    new THREE.Vector2(0.164, 0.871),
    new THREE.Vector2(0.034, 0.900),
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), toonMat(0x353535));
  g.add(body);
  addOutlines(g);
  g.add(makeBlobShadow(0.45));
  return g;
}
