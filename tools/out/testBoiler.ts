// 由 tools/img2prop.mts 从参考图生成(自适应分流)
import * as THREE from 'three';
import { toonMat, addOutlines, makeBlobShadow } from '../materials.ts';

/** testBoiler(尺寸 ~2.2m) */
export function makeTestBoiler(): THREE.Group {
  const g = new THREE.Group();
  const profile = [
    new THREE.Vector2(0.733, 0.000),
    new THREE.Vector2(2.200, 0.070),
    new THREE.Vector2(2.200, 0.943),
    new THREE.Vector2(2.062, 1.083),
    new THREE.Vector2(1.647, 1.257),
    new THREE.Vector2(2.200, 1.327),
    new THREE.Vector2(1.757, 1.397),
    new THREE.Vector2(0.927, 1.432),
    new THREE.Vector2(0.401, 1.746),
    new THREE.Vector2(0.401, 2.200),
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), toonMat(0x8a5a2a));
  g.add(body);
  addOutlines(g);
  g.add(makeBlobShadow(1.54));
  return g;
}
