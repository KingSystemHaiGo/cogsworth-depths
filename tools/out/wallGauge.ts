// 由 tools/img2prop.mts 从参考图生成(自适应分流)
import * as THREE from 'three';
import { toonMat, addOutlines, makeBlobShadow } from '../materials.ts';

/** wallGauge(尺寸 ~0.6m) */
export function makeWallGauge(): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.lineTo(-0.117, 0.300);
  shape.lineTo(-0.038, 0.315);
  shape.lineTo(0.117, 0.300);
  shape.lineTo(0.209, 0.254);
  shape.lineTo(0.287, 0.178);
  shape.lineTo(0.351, 0.007);
  shape.lineTo(0.343, -0.127);
  shape.lineTo(0.294, -0.239);
  shape.lineTo(0.218, -0.214);
  shape.lineTo(0.258, -0.087);
  shape.lineTo(0.185, -0.217);
  shape.lineTo(0.042, -0.217);
  shape.lineTo(0.121, -0.047);
  shape.lineTo(0.028, -0.109);
  shape.lineTo(-0.045, -0.096);
  shape.lineTo(-0.039, -0.016);
  shape.lineTo(0.118, 0.041);
  shape.lineTo(0.068, 0.139);
  shape.lineTo(0.008, 0.188);
  shape.lineTo(-0.028, 0.188);
  shape.lineTo(-0.029, 0.229);
  shape.lineTo(-0.148, 0.181);
  shape.lineTo(-0.172, 0.162);
  shape.lineTo(-0.160, 0.120);
  shape.lineTo(-0.178, 0.102);
  shape.lineTo(-0.218, 0.109);
  shape.lineTo(-0.234, 0.084);
  shape.lineTo(-0.267, -0.029);
  shape.lineTo(-0.224, -0.031);
  shape.lineTo(-0.224, -0.087);
  shape.lineTo(-0.260, -0.092);
  shape.lineTo(-0.218, -0.214);
  shape.lineTo(-0.294, -0.239);
  shape.lineTo(-0.349, -0.095);
  shape.lineTo(-0.337, 0.077);
  shape.lineTo(-0.267, 0.202);
  shape.lineTo(-0.118, 0.299);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.150,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.015,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geo.center();
  const body = new THREE.Mesh(geo, toonMat(0xc4c4c4));
  g.add(body);
  addOutlines(g);
  g.add(makeBlobShadow(0.42));
  return g;
}
