// 由 tools/img2lathe.mjs 从参考图生成:tools/refs/top-hat.png
import * as THREE from 'three';
import { toonMat, addOutlines, makeBlobShadow } from '../materials.ts';

/** topHat:轮廓旋成(高 0.9m) */
export function makeTopHat(): THREE.Group {
  const g = new THREE.Group();
  const profile = [
    new THREE.Vector2(0.094, 0.000),
    new THREE.Vector2(0.363, 0.078),
    new THREE.Vector2(0.450, 0.196),
    new THREE.Vector2(0.399, 0.313),
    new THREE.Vector2(0.247, 0.430),
    new THREE.Vector2(0.252, 0.665),
    new THREE.Vector2(0.228, 0.704),
    new THREE.Vector2(0.265, 0.783),
    new THREE.Vector2(0.226, 0.861),
    new THREE.Vector2(0.128, 0.900),
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 16), toonMat(0x353535));
  g.add(body);
  addOutlines(g);
  g.add(makeBlobShadow(0.45));
  return g;
}
