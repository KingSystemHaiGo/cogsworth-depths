// 由 tools/img2prop.mts 从参考图生成(自适应分流)
import * as THREE from 'three';
import { toonMat, addOutlines, makeBlobShadow } from '../materials.ts';

/** glowBulb(尺寸 ~0.5m) */
export function makeGlowBulb(): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.lineTo(-0.017, 0.252);
  shape.lineTo(-0.014, 0.259);
  shape.lineTo(0.007, 0.259);
  shape.lineTo(0.019, 0.231);
  shape.lineTo(0.049, 0.262);
  shape.lineTo(0.071, 0.262);
  shape.lineTo(0.072, 0.209);
  shape.lineTo(0.096, 0.157);
  shape.lineTo(0.192, 0.071);
  shape.lineTo(0.207, 0.042);
  shape.lineTo(0.227, 0.042);
  shape.lineTo(0.250, 0.010);
  shape.lineTo(0.261, -0.026);
  shape.lineTo(0.261, -0.077);
  shape.lineTo(0.247, -0.083);
  shape.lineTo(0.251, -0.117);
  shape.lineTo(0.215, -0.179);
  shape.lineTo(0.184, -0.208);
  shape.lineTo(0.160, -0.204);
  shape.lineTo(0.143, -0.232);
  shape.lineTo(0.096, -0.251);
  shape.lineTo(0.031, -0.262);
  shape.lineTo(-0.004, -0.262);
  shape.lineTo(-0.005, -0.254);
  shape.lineTo(-0.046, -0.262);
  shape.lineTo(-0.068, -0.259);
  shape.lineTo(-0.086, -0.241);
  shape.lineTo(-0.087, -0.252);
  shape.lineTo(-0.108, -0.252);
  shape.lineTo(-0.164, -0.230);
  shape.lineTo(-0.207, -0.199);
  shape.lineTo(-0.208, -0.179);
  shape.lineTo(-0.227, -0.179);
  shape.lineTo(-0.240, -0.160);
  shape.lineTo(-0.261, -0.093);
  shape.lineTo(-0.254, -0.005);
  shape.lineTo(-0.234, -0.004);
  shape.lineTo(-0.223, 0.038);
  shape.lineTo(-0.197, 0.079);
  shape.lineTo(-0.067, 0.182);
  shape.lineTo(-0.018, 0.251);
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
  const body = new THREE.Mesh(geo, toonMat(0xe8c877));
  g.add(body);
  addOutlines(g);
  g.add(makeBlobShadow(0.35));
  return g;
}
