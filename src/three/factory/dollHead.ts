// 由 tools/img2prop.mts 从参考图生成(自适应分流)
import * as THREE from 'three';
import { toonMat, addOutlines, makeBlobShadow } from '../materials.ts';

/** dollHead(尺寸 ~1m) */
export function makeDollHead(): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.lineTo(-0.079, 0.500);
  shape.lineTo(0.081, 0.504);
  shape.lineTo(0.119, 0.447);
  shape.lineTo(0.119, 0.351);
  shape.lineTo(0.239, 0.441);
  shape.lineTo(0.321, 0.433);
  shape.lineTo(0.435, 0.254);
  shape.lineTo(0.519, 0.216);
  shape.lineTo(0.506, 0.113);
  shape.lineTo(0.391, 0.106);
  shape.lineTo(0.374, 0.222);
  shape.lineTo(0.271, 0.342);
  shape.lineTo(0.104, 0.235);
  shape.lineTo(0.066, 0.071);
  shape.lineTo(0.066, -0.056);
  shape.lineTo(0.142, -0.258);
  shape.lineTo(0.308, -0.363);
  shape.lineTo(0.399, -0.372);
  shape.lineTo(0.412, -0.494);
  shape.lineTo(0.289, -0.506);
  shape.lineTo(0.264, -0.437);
  shape.lineTo(0.064, -0.298);
  shape.lineTo(-0.026, -0.144);
  shape.lineTo(-0.098, -0.374);
  shape.lineTo(-0.266, -0.454);
  shape.lineTo(-0.302, -0.517);
  shape.lineTo(-0.418, -0.489);
  shape.lineTo(-0.403, -0.378);
  shape.lineTo(-0.294, -0.374);
  shape.lineTo(-0.157, -0.298);
  shape.lineTo(-0.146, 0.028);
  shape.lineTo(-0.106, 0.075);
  shape.lineTo(-0.125, 0.256);
  shape.lineTo(-0.279, 0.338);
  shape.lineTo(-0.378, 0.203);
  shape.lineTo(-0.365, 0.119);
  shape.lineTo(-0.409, 0.071);
  shape.lineTo(-0.508, 0.089);
  shape.lineTo(-0.517, 0.191);
  shape.lineTo(-0.443, 0.226);
  shape.lineTo(-0.336, 0.431);
  shape.lineTo(-0.254, 0.439);
  shape.lineTo(-0.113, 0.353);
  shape.lineTo(-0.081, 0.498);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.220,
    bevelEnabled: true,
    bevelThickness: 0.026,
    bevelSize: 0.022,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geo.center();
  const body = new THREE.Mesh(geo, toonMat(0xd8cdb4));
  g.add(body);
  addOutlines(g);
  g.add(makeBlobShadow(0.70));
  return g;
}
