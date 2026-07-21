// 由 tools/img2prop.mts 从参考图生成(自适应分流)
import * as THREE from 'three';
import { toonMat, addOutlines, makeBlobShadow } from '../materials.ts';

/** towerShield(尺寸 ~1.3m) */
export function makeTowerShield(): THREE.Group {
  const g = new THREE.Group();
  const profile = [
    new THREE.Vector2(0.067, 0.000),
    new THREE.Vector2(0.311, 0.041),
    new THREE.Vector2(0.491, 0.103),
    new THREE.Vector2(0.794, 0.268),
    new THREE.Vector2(1.003, 0.454),
    new THREE.Vector2(0.768, 0.495),
    new THREE.Vector2(0.782, 0.516),
    new THREE.Vector2(1.201, 0.537),
    new THREE.Vector2(1.259, 0.640),
    new THREE.Vector2(1.262, 0.722),
    new THREE.Vector2(0.913, 0.743),
    new THREE.Vector2(0.934, 0.784),
    new THREE.Vector2(1.236, 0.805),
    new THREE.Vector2(1.283, 0.949),
    new THREE.Vector2(1.300, 1.135),
    new THREE.Vector2(0.428, 1.217),
    new THREE.Vector2(0.009, 1.300),
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), toonMat(0xb08d57));
  g.add(body);
  addOutlines(g);
  g.add(makeBlobShadow(0.91));
  return g;
}
