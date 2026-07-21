// 程序化管线工厂:沿随机折线路径生成铜管 + 弯头 + 阀门
import * as THREE from 'three';
import { RNG } from '../../core/rng.ts';
import { PALETTE } from '../../core/config.ts';
import { toonMat } from '../materials.ts';

const copperMat = toonMat(PALETTE.copper);
const brassMat = toonMat(PALETTE.brass);
const ironMat = toonMat(PALETTE.ironDark);

/**
 * 在墙面(局部 XY 平面)上生成一段随机折线铜管。
 * len: 大致水平跨度。返回 Group,调用方负责摆放位置与朝向。
 */
export function makePipeRun(rng: RNG, len: number, wallH: number): THREE.Group {
  const group = new THREE.Group();
  const points: THREE.Vector3[] = [];
  let x = -len / 2;
  let y = rng.range(wallH * 0.25, wallH * 0.8);
  points.push(new THREE.Vector3(x, y, 0));
  const bends = rng.int(2, 4);
  for (let i = 0; i < bends; i++) {
    x += rng.range(len * 0.15, len * 0.35);
    points.push(new THREE.Vector3(x, y, 0)); // 水平段
    y = THREE.MathUtils.clamp(y + rng.range(-wallH * 0.35, wallH * 0.35), wallH * 0.15, wallH * 0.9);
    points.push(new THREE.Vector3(x, y, 0)); // 垂直段
  }
  points.push(new THREE.Vector3(len / 2, y, 0));

  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0);
  const tubeR = rng.range(0.09, 0.16);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, tubeR, 8, false), copperMat);
  group.add(tube);

  // 弯头处的法兰环
  const flangeGeo = new THREE.TorusGeometry(tubeR * 1.35, tubeR * 0.35, 6, 12);
  for (const p of points) {
    const flange = new THREE.Mesh(flangeGeo, ironMat);
    flange.position.copy(p);
    group.add(flange);
  }

  // 随机一个阀门手轮
  if (rng.chance(0.6)) {
    const at = curve.getPoint(rng.range(0.3, 0.7));
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 6, 16), brassMat);
    wheel.position.copy(at).add(new THREE.Vector3(0, 0.1, tubeR + 0.2));
    const spokeGeo = new THREE.BoxGeometry(0.5, 0.04, 0.04);
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(spokeGeo, brassMat);
      s.rotation.z = (i / 3) * Math.PI;
      wheel.add(s);
    }
    wheel.userData.spin = rng.range(-0.5, 0.5);
    group.add(wheel);
  }
  return group;
}
