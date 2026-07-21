// eslint-disable-next-line
// 由 tools/img2lathe.mjs 从参考图生成:tools/refs/lantern.png
import * as THREE from 'three';
import { toonMat, addOutlines, makeBlobShadow } from '../materials.ts';

/** steamLantern:轮廓旋成(高 1.6m) */
export function makeSteamLantern(): THREE.Group {
  const g = new THREE.Group();
  const profile = [
    new THREE.Vector2(0.649, 0.000),
    new THREE.Vector2(0.649, 0.127),
    new THREE.Vector2(0.498, 0.203),
    new THREE.Vector2(0.498, 0.863),
    new THREE.Vector2(0.800, 0.965),
    new THREE.Vector2(0.290, 1.194),
    new THREE.Vector2(0.333, 1.244),
    new THREE.Vector2(0.359, 1.321),
    new THREE.Vector2(0.354, 1.397),
    new THREE.Vector2(0.331, 1.448),
    new THREE.Vector2(0.218, 1.549),
    new THREE.Vector2(0.041, 1.600),
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), toonMat(0xc6c6c6));
  g.add(body);
  addOutlines(g);
  g.add(makeBlobShadow(0.80));
  return g;
}
