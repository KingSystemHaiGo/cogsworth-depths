// 由 tools/img2prop.mts 从参考图生成(自适应分流)
import * as THREE from 'three';
import { toonMat, addOutlines, makeBlobShadow } from '../materials.ts';

/** gearPair(尺寸 ~1.2m) */
export function makeGearPair(): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.lineTo(-0.200, 0.603);
  shape.lineTo(-0.075, 0.546);
  shape.lineTo(-0.116, 0.452);
  shape.lineTo(-0.057, 0.368);
  shape.lineTo(0.050, 0.378);
  shape.lineTo(0.062, 0.241);
  shape.lineTo(-0.050, 0.228);
  shape.lineTo(-0.090, 0.146);
  shape.lineTo(-0.068, 0.116);
  shape.lineTo(0.027, 0.164);
  shape.lineTo(0.096, 0.045);
  shape.lineTo(0.228, 0.083);
  shape.lineTo(0.228, 0.223);
  shape.lineTo(0.363, 0.223);
  shape.lineTo(0.363, 0.083);
  shape.lineTo(0.501, 0.045);
  shape.lineTo(0.569, 0.164);
  shape.lineTo(0.600, 0.149);
  shape.lineTo(0.600, -0.603);
  shape.lineTo(0.368, -0.603);
  shape.lineTo(0.447, -0.534);
  shape.lineTo(0.470, -0.414);
  shape.lineTo(0.406, -0.307);
  shape.lineTo(0.320, -0.269);
  shape.lineTo(0.208, -0.292);
  shape.lineTo(0.129, -0.389);
  shape.lineTo(0.131, -0.506);
  shape.lineTo(0.223, -0.603);
  shape.lineTo(-0.208, -0.603);
  shape.lineTo(-0.231, -0.513);
  shape.lineTo(-0.371, -0.513);
  shape.lineTo(-0.371, -0.378);
  shape.lineTo(-0.231, -0.378);
  shape.lineTo(-0.192, -0.246);
  shape.lineTo(-0.315, -0.169);
  shape.lineTo(-0.251, -0.052);
  shape.lineTo(-0.124, -0.121);
  shape.lineTo(-0.024, -0.022);
  shape.lineTo(-0.057, 0.027);
  shape.lineTo(-0.134, -0.029);
  shape.lineTo(-0.208, 0.068);
  shape.lineTo(-0.292, 0.060);
  shape.lineTo(-0.340, -0.050);
  shape.lineTo(-0.465, 0.004);
  shape.lineTo(-0.419, 0.116);
  shape.lineTo(-0.473, 0.185);
  shape.lineTo(-0.587, 0.175);
  shape.lineTo(-0.600, 0.310);
  shape.lineTo(-0.490, 0.325);
  shape.lineTo(-0.455, 0.414);
  shape.lineTo(-0.513, 0.501);
  shape.lineTo(-0.406, 0.580);
  shape.lineTo(-0.340, 0.498);
  shape.lineTo(-0.243, 0.511);
  shape.lineTo(-0.200, 0.600);
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
  const body = new THREE.Mesh(geo, toonMat(0xd3d3d3));
  g.add(body);
  addOutlines(g);
  g.add(makeBlobShadow(0.84));
  return g;
}
