// 实例化子弹池:1 个 InstancedMesh 装下全部子弹,一次 draw call
// 参考 three.js 官方 instancing 示例,替代逐 Mesh 池(原来满池 384 次 draw call)
import * as THREE from 'three';

export interface Bullet {
  active: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  dmg: number;
  life: number;
  pierce: number;
  bounce: number;
  scale: number;
  crit: boolean;
  r: number;
}

const ZERO_SCALE = new THREE.Matrix4().makeScale(0, 0, 0);

export class BulletPool {
  readonly mesh: THREE.InstancedMesh;
  readonly items: Bullet[] = [];
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene, color: number, radius: number, count: number) {
    const geo = new THREE.SphereGeometry(radius, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; // 子弹遍布全图,跳过视锥剔除
    scene.add(this.mesh);
    for (let i = 0; i < count; i++) {
      this.items.push({
        active: false,
        x: 0,
        z: 0,
        vx: 0,
        vz: 0,
        dmg: 0,
        life: 0,
        pierce: 0,
        bounce: 0,
        scale: 1,
        crit: false,
        r: radius + 0.04,
      });
      this.mesh.setMatrixAt(i, ZERO_SCALE);
    }
  }

  /** 每帧同步一次实例矩阵 */
  sync(): void {
    for (let i = 0; i < this.items.length; i++) {
      const b = this.items[i];
      if (!b.active) {
        this.mesh.setMatrixAt(i, ZERO_SCALE);
        continue;
      }
      this.dummy.position.set(b.x, 0.8, b.z);
      this.dummy.scale.setScalar(b.scale);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  findFree(): Bullet | undefined {
    return this.items.find((b) => !b.active);
  }

  clear(): void {
    for (const b of this.items) b.active = false;
  }
}
