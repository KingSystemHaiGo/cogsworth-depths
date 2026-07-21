// 由 tools/img2parts.mts 部件分解生成
import * as THREE from 'three';
import { toonMat, addOutlines, makeBlobShadow } from '../materials.ts';

interface Part {
  color: number;
  points: [number, number][];
}

const PARTS: Part[] = [
  {
    color: 0xb87333,
    points: [
    [-0.698, 0.245],
    [-0.208, 0.182],
    [0.698, 0.245],
    [0.836, 0.069],
    [0.950, -0.195],
    [1.000, -0.522],
    [1.000, -2.447],
    [-1.000, -2.447],
    [-0.987, -0.371],
    [-0.899, -0.057],
    [-0.711, 0.233],
    ],
  },
  {
    color: 0xb28f5a,
    points: [
    [-0.283, 0.686],
    [0.409, 0.673],
    [0.748, 0.610],
    [0.937, 0.535],
    [1.000, 0.472],
    [1.000, 0.409],
    [0.937, 0.346],
    [0.711, 0.258],
    [0.836, 0.082],
    [0.698, 0.258],
    [0.208, 0.195],
    [-0.208, 0.195],
    [-0.698, 0.258],
    [-0.786, 0.157],
    [-0.711, 0.258],
    [-0.937, 0.346],
    [-1.000, 0.409],
    [-1.000, 0.472],
    [-0.937, 0.535],
    [-0.748, 0.610],
    [-0.296, 0.673],
    ],
  },
  {
    color: 0x1c1611,
    points: [
    [-0.182, 2.447],
    [0.182, 2.447],
    [0.182, 1.201],
    [-0.182, 1.201],
    [-0.182, 2.434],
    ],
  },
];

/** twoToneBoiler(按颜色拆 3 件分别挤出) */
export function makeTwoToneBoiler(): THREE.Group {
  const g = new THREE.Group();
  for (const part of PARTS) {
    const shape = new THREE.Shape();
    for (const [x, y] of part.points) shape.lineTo(x, y);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.360,
      bevelEnabled: true,
      bevelThickness: 0.040,
      bevelSize: 0.030,
      bevelSegments: 1,
      curveSegments: 6,
    });
    // 不单独居中:所有部件共享参考图坐标系,保持相对位置
    const mesh = new THREE.Mesh(geo, toonMat(part.color));
    g.add(mesh);
  }
  addOutlines(g);
  g.add(makeBlobShadow(1.40));
  return g;
}
