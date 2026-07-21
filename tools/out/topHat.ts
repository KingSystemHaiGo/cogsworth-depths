// 由 tools/img2prop.mts 从参考图生成(自适应分流)
import * as THREE from 'three';
import { toonMat, addOutlines, makeBlobShadow } from '../materials.ts';

/** topHat(尺寸 ~0.9m) */
export function makeTopHat(): THREE.Group {
  const g = new THREE.Group();
  const profile = [
    new THREE.Vector2(0.120, 0.000),
    new THREE.Vector2(0.494, 0.029),
    new THREE.Vector2(0.711, 0.071),
    new THREE.Vector2(0.868, 0.143),
    new THREE.Vector2(0.900, 0.214),
    new THREE.Vector2(0.866, 0.271),
    new THREE.Vector2(0.780, 0.329),
    new THREE.Vector2(0.473, 0.414),
    new THREE.Vector2(0.463, 0.514),
    new THREE.Vector2(0.486, 0.686),
    new THREE.Vector2(0.351, 0.700),
    new THREE.Vector2(0.475, 0.729),
    new THREE.Vector2(0.440, 0.743),
    new THREE.Vector2(0.498, 0.786),
    new THREE.Vector2(0.486, 0.814),
    new THREE.Vector2(0.328, 0.871),
    new THREE.Vector2(0.069, 0.900),
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), toonMat(0x353535));
  g.add(body);
  addOutlines(g);
  g.add(makeBlobShadow(0.63));
  return g;
}
