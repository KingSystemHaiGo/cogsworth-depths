// 由 tools/img2prop.mts 从参考图生成(自适应分流)
import * as THREE from 'three';
import { toonMat, addOutlines, makeBlobShadow } from '../materials.ts';

/** spiderBot(尺寸 ~1.2m) */
export function makeSpiderBot(): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.lineTo(-0.081, 0.600);
  shape.lineTo(0.037, 0.626);
  shape.lineTo(0.091, 0.590);
  shape.lineTo(0.158, 0.340);
  shape.lineTo(0.225, 0.346);
  shape.lineTo(0.258, 0.163);
  shape.lineTo(0.502, 0.284);
  shape.lineTo(0.628, -0.590);
  shape.lineTo(0.577, -0.590);
  shape.lineTo(0.397, -0.130);
  shape.lineTo(0.361, -0.148);
  shape.lineTo(0.436, -0.464);
  shape.lineTo(0.382, -0.461);
  shape.lineTo(0.287, -0.287);
  shape.lineTo(0.307, -0.626);
  shape.lineTo(0.220, -0.626);
  shape.lineTo(0.078, -0.189);
  shape.lineTo(0.027, -0.454);
  shape.lineTo(-0.027, -0.454);
  shape.lineTo(-0.078, -0.189);
  shape.lineTo(-0.220, -0.626);
  shape.lineTo(-0.307, -0.626);
  shape.lineTo(-0.287, -0.287);
  shape.lineTo(-0.384, -0.466);
  shape.lineTo(-0.436, -0.466);
  shape.lineTo(-0.361, -0.148);
  shape.lineTo(-0.392, -0.130);
  shape.lineTo(-0.577, -0.590);
  shape.lineTo(-0.628, -0.590);
  shape.lineTo(-0.502, 0.284);
  shape.lineTo(-0.258, 0.163);
  shape.lineTo(-0.225, 0.346);
  shape.lineTo(-0.158, 0.340);
  shape.lineTo(-0.084, 0.597);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.264,
    bevelEnabled: true,
    bevelThickness: 0.032,
    bevelSize: 0.026,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geo.center();
  const body = new THREE.Mesh(geo, toonMat(0xc4c4c4));
  g.add(body);
  addOutlines(g);
  g.add(makeBlobShadow(0.84));
  return g;
}
