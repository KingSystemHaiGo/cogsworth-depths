// 由 tools/img2prop.mts 从参考图生成(自适应分流)
import * as THREE from 'three';
import { toonMat, addOutlines, makeBlobShadow } from '../materials.ts';

/** pipeJoint(尺寸 ~1.4m) */
export function makePipeJoint(): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.lineTo(new THREE.Vector2(-0.396, 0.700));
  shape.lineTo(new THREE.Vector2(-0.264, 0.700));
  shape.lineTo(new THREE.Vector2(-0.261, 0.349));
  shape.lineTo(new THREE.Vector2(0.066, 0.349));
  shape.lineTo(new THREE.Vector2(0.066, 0.217));
  shape.lineTo(new THREE.Vector2(-0.343, 0.217));
  shape.lineTo(new THREE.Vector2(-0.364, 0.225));
  shape.lineTo(new THREE.Vector2(-0.396, 0.267));
  shape.lineTo(new THREE.Vector2(-0.396, 0.697));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.308,
    bevelEnabled: true,
    bevelThickness: 0.037,
    bevelSize: 0.031,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geo.center();
  const body = new THREE.Mesh(geo, toonMat(0xc8c8c8));
  g.add(body);
  addOutlines(g);
  g.add(makeBlobShadow(0.98));
  return g;
}
