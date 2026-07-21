// 程序化齿轮工厂
import * as THREE from 'three';
import { PALETTE } from '../../core/config.ts';
import { toonMat } from '../materials.ts';

const brassMat = toonMat(PALETTE.brass);
const copperMat = toonMat(PALETTE.copper);
const ironMat = toonMat(PALETTE.iron);

/**
 * 生成一个齿轮网格。Shape 画齿形轮廓 → ExtrudeGeometry 拉伸出厚度。
 * userData.spin 为旋转速度(rad/s),由外部驱动。
 */
export function makeGear(radius: number, teeth: number, thickness: number, spin = 0): THREE.Mesh {
  const shape = new THREE.Shape();
  const rootR = radius * 0.82;
  const tipR = radius;
  const steps = teeth * 4; // 每齿 4 段:根-升-顶-降
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const phase = i % 4;
    const r = phase === 1 || phase === 2 ? tipR : rootR;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  // 中心轴孔
  const hole = new THREE.Path();
  hole.absarc(0, 0, radius * 0.22, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 1,
    curveSegments: 4,
  });
  geo.center();

  const mesh = new THREE.Mesh(geo, pickMat(radius));
  // 辐条(嵌在齿轮正面的细条,纯装饰)
  const spokes = Math.max(3, Math.floor(teeth / 3));
  const spokeGeo = new THREE.BoxGeometry(radius * 1.3, radius * 0.1, thickness * 0.3);
  for (let i = 0; i < spokes; i++) {
    const spoke = new THREE.Mesh(spokeGeo, ironMat);
    spoke.rotation.z = (i / spokes) * Math.PI;
    mesh.add(spoke);
  }
  mesh.userData.spin = spin;
  return mesh;
}

function pickMat(radius: number): THREE.Material {
  if (radius > 1.6) return brassMat;
  if (radius > 0.8) return copperMat;
  return ironMat;
}

/** 更新一组齿轮的旋转(互相啮合的齿轮方向相反、速度与半径成反比更有味道) */
export function spinGears(gears: THREE.Mesh[], dt: number): void {
  for (const g of gears) {
    g.rotation.z += (g.userData.spin as number) * dt;
  }
}
