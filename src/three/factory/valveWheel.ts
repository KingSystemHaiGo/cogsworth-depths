// 由 tools/img2prop.mts 从参考图生成(自适应分流)
import * as THREE from 'three';
import { toonMat, addOutlines, makeBlobShadow } from '../materials.ts';

/** valveWheel(尺寸 ~0.9m) */
export function makeValveWheel(): THREE.Group {
  const g = new THREE.Group();
  const profile = [
    new THREE.Vector2(0.033, 0.000),
    new THREE.Vector2(0.092, 0.014),
    new THREE.Vector2(0.139, 0.086),
    new THREE.Vector2(0.213, 0.129),
    new THREE.Vector2(0.213, 0.186),
    new THREE.Vector2(0.900, 0.200),
    new THREE.Vector2(0.900, 0.214),
    new THREE.Vector2(0.213, 0.229),
    new THREE.Vector2(0.213, 0.257),
    new THREE.Vector2(0.900, 0.271),
    new THREE.Vector2(0.900, 0.443),
    new THREE.Vector2(0.213, 0.457),
    new THREE.Vector2(0.213, 0.514),
    new THREE.Vector2(0.338, 0.571),
    new THREE.Vector2(0.338, 0.614),
    new THREE.Vector2(0.088, 0.671),
    new THREE.Vector2(0.088, 0.714),
    new THREE.Vector2(0.631, 0.771),
    new THREE.Vector2(0.631, 0.814),
    new THREE.Vector2(0.033, 0.871),
    new THREE.Vector2(0.033, 0.900),
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), toonMat(0xb08d57));
  g.add(body);
  addOutlines(g);
  g.add(makeBlobShadow(0.63));
  return g;
}
