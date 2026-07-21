// 由 tools/img2prop.mts 从参考图生成(自适应分流)
import * as THREE from 'three';
import { toonMat, addOutlines, makeBlobShadow } from '../materials.ts';

/** steamLantern(尺寸 ~1.6m) */
export function makeSteamLantern(): THREE.Group {
  const g = new THREE.Group();
  const profile = [
    new THREE.Vector2(1.298, 0.000),
    new THREE.Vector2(1.298, 0.127),
    new THREE.Vector2(0.996, 0.203),
    new THREE.Vector2(0.996, 0.863),
    new THREE.Vector2(1.600, 0.965),
    new THREE.Vector2(0.580, 1.194),
    new THREE.Vector2(0.666, 1.244),
    new THREE.Vector2(0.719, 1.321),
    new THREE.Vector2(0.709, 1.397),
    new THREE.Vector2(0.661, 1.448),
    new THREE.Vector2(0.436, 1.549),
    new THREE.Vector2(0.081, 1.600),
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), toonMat(0xc6c6c6));
  g.add(body);
  addOutlines(g);
  g.add(makeBlobShadow(1.12));
  return g;
}
