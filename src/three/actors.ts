// 程序化角色网格:玩家机器人 + 三类敌人 + Boss,全几何体拼装
import * as THREE from 'three';
import { PALETTE } from '../core/config.ts';
import { toonMat, glowMat, addOutlines, makeBlobShadow } from './materials.ts';
import { makeGear } from './factory/gears.ts';

const brassMat = toonMat(PALETTE.brass);
const copperMat = toonMat(PALETTE.copper);
const ironMat = toonMat(PALETTE.iron);
const ironDarkMat = toonMat(PALETTE.ironDark);
const leatherMat = toonMat(0x4a3226); // 皮质大衣
const hatMat = toonMat(0x1c1611); // 高帽黑
const emberMat = glowMat(PALETTE.ember, 2.5);
const eyeMat = glowMat(PALETTE.brassLight, 2);

/** 玩家:瘟疫医生人偶 — 高帽 / 鸟嘴面具 / 护目镜 / 皮质大衣
 *  userData.attachments 里是升级形态部件(枪管组/护盾泡/烟囱组),
 *  由 game 按 stats 刷新显示 */
export function makePlayerMesh(): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // 皮质大衣(锥形下摆)
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.56, 0.85, 10), leatherMat);
  coat.position.y = 0.68;
  body.add(coat);
  // 大衣黄铜扣带
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 6, 14), brassMat);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.72;
  body.add(belt);

  // 头部:瘟疫医生面具
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), hatMat);
  head.position.y = 1.28;
  body.add(head);
  // 鸟嘴(圆锥)
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.45, 8), leatherMat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 1.24, 0.42);
  body.add(beak);
  // 护目镜(双发光镜片 + 黄铜镜框)
  for (const side of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8), eyeMat);
    lens.position.set(side * 0.13, 1.34, 0.26);
    body.add(lens);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 12), brassMat);
    rim.position.set(side * 0.13, 1.34, 0.27);
    body.add(rim);
  }
  // 高礼帽(帽筒 + 帽檐)
  const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.34, 10), hatMat);
  hatTop.position.y = 1.62;
  body.add(hatTop);
  const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 12), hatMat);
  hatBrim.position.y = 1.48;
  body.add(hatBrim);
  const hatBand = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 12), brassMat);
  hatBand.rotation.x = Math.PI / 2;
  hatBand.position.y = 1.5;
  body.add(hatBand);

  // 背包小齿轮
  const gear = makeGear(0.3, 8, 0.12, 2.2);
  gear.position.set(0, 0.85, -0.5);
  body.add(gear);
  body.userData.gear = gear;

  // 背部小锅炉 + 连接铜管
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.38, 8), copperMat);
  tank.position.set(-0.2, 0.9, -0.42);
  body.add(tank);
  const tankBand = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 12), brassMat);
  tankBand.rotation.x = Math.PI / 2;
  tankBand.position.set(-0.2, 0.95, -0.42);
  body.add(tankBand);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.46, 6), brassMat);
  pipe.rotation.z = 0.75;
  pipe.position.set(-0.06, 0.72, -0.38);
  body.add(pipe);

  // 枪管组(朝向 +Z):分裂阀升级会增加枪管数量(1/2/3/4)
  const barrels: THREE.Mesh[] = [];
  const barrelGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.7, 8);
  const barrelOffsets = [
    [0],
    [-0.12, 0.12],
    [-0.2, 0, 0.2],
    [-0.28, -0.09, 0.09, 0.28],
  ];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(barrelGeo, ironDarkMat);
    b.rotation.x = Math.PI / 2;
    b.position.set(0.28, 0.8, 0.55);
    b.visible = i === 0;
    body.add(b);
    barrels.push(b);
  }
  body.userData.barrels = barrels;
  body.userData.barrelOffsets = barrelOffsets;

  // 枪口闪光(开火瞬间点亮)
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), glowMat(0xffe6a0, 3));
  muzzle.position.set(0.28, 0.8, 0.95);
  muzzle.visible = false;
  muzzle.userData.noOutline = true;
  body.add(muzzle);
  body.userData.muzzle = muzzle;

  // 烟囱组:蒸汽推进升级让烟囱更高(1/2/3 段)
  const stacks: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Group();
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.3, 6), ironDarkMat);
    c.position.y = i * 0.26;
    seg.add(c);
    seg.position.set(-0.32, 1.28, -0.12);
    seg.visible = i === 0;
    body.add(seg);
    stacks.push(seg);
  }
  const stackCap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.08, 6), brassMat);
  stackCap.position.set(-0.32, 1.5, -0.12);
  body.add(stackCap);
  body.userData.stacks = stacks;
  body.userData.stackCap = stackCap;

  // 蒸汽护盾泡(护盾升级后显示,半透明黄铜壳)
  const bubble = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 14, 10),
    new THREE.MeshBasicMaterial({
      color: 0x9fc8d8,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
  );
  bubble.position.y = 0.8;
  bubble.visible = false;
  bubble.userData.noOutline = true;
  root.add(bubble);
  body.userData.bubble = bubble;

  // 胸前压力表(指针在 game 里驱动)
  const gauge = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 6, 14), copperMat);
  gauge.position.set(0, 0.82, 0.47);
  body.add(gauge);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 0.02), ironDarkMat);
  needle.position.set(0, 0.82, 0.49);
  needle.geometry.translate(0, 0.045, 0);
  body.add(needle);
  body.userData.needle = needle;

  // 腿
  const legGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.5, 6);
  const legL = new THREE.Mesh(legGeo, ironMat);
  legL.position.set(-0.22, 0.25, 0);
  const legR = new THREE.Mesh(legGeo, ironMat);
  legR.position.set(0.22, 0.25, 0);
  root.add(legL, legR);

  root.userData = { body, legL, legR };
  addOutlines(root);
  root.add(makeBlobShadow(0.75));
  return root;
}

export type EnemyKind = 'chaser' | 'shooter' | 'bomber' | 'dasher' | 'splitter' | 'mini' | 'warden' | 'mortar' | 'boss';

export function makeEnemyMesh(kind: EnemyKind): THREE.Group {
  const g = buildEnemyMesh(kind);
  addOutlines(g);
  const shadowR: Record<EnemyKind, number> = {
    chaser: 0.6,
    shooter: 0.7,
    bomber: 0.6,
    dasher: 0.6,
    splitter: 0.85,
    mini: 0.35,
    warden: 0.9,
    mortar: 0.7,
    boss: 1.9,
  };
  g.add(makeBlobShadow(shadowR[kind]));
  return g;
}

function buildEnemyMesh(kind: EnemyKind): THREE.Group {
  switch (kind) {
    case 'mini': {
      // 分裂小蜘蛛:chaser 的缩小版
      const g = buildEnemyMesh('chaser');
      g.scale.setScalar(0.55);
      return g;
    }
    case 'dasher': {
      // 弹簧跳蚤:锥形身体 + 压缩弹簧腿,蓄力后扑击
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 8), copperMat);
      body.position.y = 0.85;
      g.add(body);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), emberMat);
      eye.position.set(0, 0.95, 0.32);
      g.add(eye);
      // 弹簧(叠环)
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 6, 12), ironMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.15 + i * 0.16;
        g.add(ring);
      }
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.1, 8), ironDarkMat);
      foot.position.y = 0.05;
      g.add(foot);
      g.userData.body = body;
      return g;
    }
    case 'splitter': {
      // 分裂球:带接缝的大铁球,死亡裂成两只小蜘蛛
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.68, 12, 10), ironMat);
      body.position.y = 0.68;
      g.add(body);
      // 中间接缝(裂缝发光,预示会裂开)
      const seam = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.05, 6, 20), emberMat);
      seam.rotation.x = Math.PI / 2;
      seam.position.y = 0.68;
      g.add(seam);
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), emberMat);
        eye.position.set(side * 0.22, 0.78, 0.55);
        g.add(eye);
      }
      // 顶部铆钉冠
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), brassMat);
        rivet.position.set(Math.cos(a) * 0.35, 1.28, Math.sin(a) * 0.35);
        g.add(rivet);
      }
      return g;
    }
    case 'chaser': {
      // 发条蜘蛛:铁球身体 + 细腿 + 头顶发条齿轮壳
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), ironMat);
      body.position.y = 0.55;
      g.add(body);
      const shell = makeGear(0.3, 8, 0.1, 1.6);
      shell.rotation.x = Math.PI / 2;
      shell.position.y = 0.98;
      g.add(shell);
      g.userData.gear = shell;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), emberMat);
      eye.position.set(0, 0.6, 0.4);
      g.add(eye);
      const legGeo = new THREE.CylinderGeometry(0.04, 0.02, 0.7, 5);
      for (let i = 0; i < 6; i++) {
        const leg = new THREE.Mesh(legGeo, ironDarkMat);
        const a = (i / 6) * Math.PI * 2;
        leg.position.set(Math.cos(a) * 0.5, 0.35, Math.sin(a) * 0.5);
        leg.rotation.z = Math.cos(a) * 0.7;
        leg.rotation.x = -Math.sin(a) * 0.7;
        g.add(leg);
      }
      // 背后发条钥匙(人偶标志,持续旋转)
      const keyGroup = new THREE.Group();
      const keyStem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6), brassMat);
      keyStem.rotation.x = Math.PI / 2;
      keyGroup.add(keyStem);
      const wingGeo = new THREE.BoxGeometry(0.22, 0.1, 0.03);
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(wingGeo, brassMat);
        wing.position.set(side * 0.11, 0, 0.11);
        keyGroup.add(wing);
      }
      keyGroup.position.set(0, 0.65, -0.55);
      g.add(keyGroup);
      g.userData.keyWings = keyGroup;
      return g;
    }
    case 'shooter': {
      // 哨戒炮:底座 + 可旋转炮塔
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.4, 10), ironDarkMat);
      base.position.y = 0.2;
      g.add(base);
      // 底座铆钉环
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 6, 16), brassMat);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.38;
      g.add(band);
      const turret = new THREE.Group();
      turret.position.y = 0.55;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), copperMat);
      turret.add(head);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.9, 8), ironMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0, 0.6);
      turret.add(barrel);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), emberMat);
      eye.position.set(0, 0.12, 0.3);
      turret.add(eye);
      g.add(turret);
      g.userData.turret = turret;
      return g;
    }
    case 'bomber': {
      // 自走锅炉:铜罐 + 发光炉心,临爆时闪烁
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), copperMat);
      body.position.y = 0.5;
      g.add(body);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), emberMat.clone());
      core.position.y = 0.5;
      g.add(core);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.3, 8), ironMat);
      cap.position.y = 1.0;
      g.add(cap);
      // 侧面压力表
      const gauge = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 6, 14), brassMat);
      gauge.position.set(0, 0.55, 0.48);
      g.add(gauge);
      const dial = new THREE.Mesh(new THREE.CircleGeometry(0.1, 10), ironDarkMat);
      dial.position.set(0, 0.55, 0.47);
      g.add(dial);
      g.userData.core = core;
      return g;
    }
    case 'warden': {
      // 盾卫:重甲桶身 + 正面黄铜大盾,转身缓慢逼迫绕后
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.58, 1.0, 10), ironDarkMat);
      body.position.y = 0.5;
      g.add(body);
      const helm = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        ironMat,
      );
      helm.position.y = 1.0;
      g.add(helm);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), emberMat);
      eye.position.set(0, 1.02, 0.3);
      g.add(eye);
      // 正面大盾(+Z 朝向)
      const shield = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.25, 0.12), brassMat);
      shield.position.set(0, 0.65, 0.6);
      g.add(shield);
      const shieldRim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 14), copperMat);
      shieldRim.position.set(0, 0.7, 0.67);
      g.add(shieldRim);
      for (const [rx, ry] of [
        [-0.45, 1.1],
        [0.45, 1.1],
        [-0.45, 0.2],
        [0.45, 0.2],
      ]) {
        const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), copperMat);
        rivet.position.set(rx, ry, 0.67);
        g.add(rivet);
      }
      return g;
    }
    case 'mortar': {
      // 迫击手:矮铜壶 + 斜置炮管,抛射爆破弹
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 10), copperMat);
      body.position.y = 0.48;
      g.add(body);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 16), brassMat);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.5;
      g.add(band);
      // 斜置炮管
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.8, 8), ironDarkMat);
      barrel.position.set(0, 0.95, 0.15);
      barrel.rotation.x = -Math.PI / 4;
      g.add(barrel);
      const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.04, 6, 12), brassMat);
      muzzleRing.position.set(0, 1.25, 0.45);
      muzzleRing.rotation.x = -Math.PI / 4;
      g.add(muzzleRing);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), emberMat);
      eye.position.set(0, 0.55, 0.48);
      g.add(eye);
      // 三条矮腿
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.35, 6), ironDarkMat);
        leg.position.set(Math.cos(a) * 0.4, 0.18, Math.sin(a) * 0.4);
        g.add(leg);
      }
      return g;
    }
    case 'boss': {
      // 锅炉魔像:大齿轮躯干 + 双肩烟囱
      const g = new THREE.Group();
      const gear = makeGear(1.4, 12, 0.8, 0.8);
      gear.rotation.x = Math.PI / 2;
      gear.position.y = 1.2;
      g.add(gear);
      g.userData.gear = gear;
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.7, 10), brassMat);
      head.position.y = 2.6;
      g.add(head);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), emberMat);
      eye.position.set(0, 2.6, 0.55);
      g.add(eye);
      // 胸前炉膛口
      const furnace = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.15), emberMat);
      furnace.position.set(0, 1.2, 0.72);
      g.add(furnace);
      // 双肩齿轮(随主齿轮一起转)
      for (const side of [-1, 1]) {
        const sg = makeGear(0.42, 8, 0.18, side * 1.4);
        sg.position.set(side * 1.35, 2.3, 0);
        g.add(sg);
        g.userData[side < 0 ? 'gearL' : 'gearR'] = sg;
      }
      for (const side of [-1, 1]) {
        const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.0, 8), ironDarkMat);
        chimney.position.set(side * 1.1, 2.3, 0);
        g.add(chimney);
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.6, 8), ironMat);
        arm.position.set(side * 1.3, 1.0, 0);
        g.add(arm);
      }
      return g;
    }
  }
}
