// 程序化角色网格:玩家机器人 + 三类敌人 + Boss,全几何体拼装
import * as THREE from 'three';
import { PALETTE } from '../core/config.ts';
import { toonMat, glowMat, addOutlines, makeBlobShadow } from './materials.ts';
import { makeGear } from './factory/gears.ts';
import { makeTopHat } from './factory/topHat.ts';
import { makeSpiderBot } from './factory/spiderBot.ts';
import { makeTowerShield } from './factory/towerShield.ts';

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
  // 高礼帽(参考图→轮廓旋成管线生成,比手工拼的更挺括)
  const hat = makeTopHat();
  hat.scale.setScalar(0.52);
  hat.position.y = 1.42;
  body.add(hat);

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

export type EnemyKind =
  | 'chaser'
  | 'shooter'
  | 'bomber'
  | 'dasher'
  | 'splitter'
  | 'mini'
  | 'warden'
  | 'mortar'
  | 'sniper'
  | 'tinker'
  | 'boss'
  | 'ringmaster'
  | 'colossus';

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
    sniper: 0.55,
    tinker: 0.5,
    boss: 1.9,
    ringmaster: 1.7,
    colossus: 1.8,
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
      // 发条蜘蛛:参考图挤出的真实蜘蛛剪影(含腿)+ 发光复眼 + 背后发条钥匙
      const g = new THREE.Group();
      const spider = makeSpiderBot();
      spider.rotation.x = -Math.PI / 2; // 平放在地面,俯视就是真蜘蛛
      spider.scale.setScalar(0.62);
      g.add(spider);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), emberMat);
      eye.position.set(0, 0.5, 0.3);
      g.add(eye);
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
      keyGroup.position.set(0, 0.55, -0.5);
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
      // 正面大盾(参考图管线生成的圆盾,+Z 朝向)
      const shield = makeTowerShield();
      shield.scale.setScalar(0.85);
      shield.rotation.x = -Math.PI / 2; // 旋成体立起朝前
      shield.position.set(0, 0.65, 0.62);
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
    case 'sniper': {
      // 钟表狙击手:瘦高怀表身 + 长枪管,蓄力时亮出激光线
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 1.1, 8), brassMat);
      body.position.y = 0.55;
      g.add(body);
      // 表盘脸
      const dial = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), toonMat(0xd8cdb4));
      dial.position.set(0, 0.85, 0.31);
      g.add(dial);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.01), ironDarkMat);
      hand.geometry.translate(0, 0.08, 0);
      hand.position.set(0, 0.85, 0.32);
      g.add(hand);
      g.userData.hand = hand;
      // 长枪管
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.1, 8), ironDarkMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.2, 0.6, 0.6);
      g.add(barrel);
      // 激光瞄准线(蓄力时显示,由 game 驱动)
      const laser = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.04, 1),
        new THREE.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 0.6 }),
      );
      laser.visible = false;
      laser.userData.noOutline = true;
      g.add(laser);
      g.userData.laser = laser;
      // 尖顶帽
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.35, 8), ironDarkMat);
      hat.position.y = 1.25;
      g.add(hat);
      return g;
    }
    case 'tinker': {
      // 修补无人机:悬浮小铜球 + 旋翼 + 扳手尾
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), copperMat);
      body.position.y = 0.7;
      g.add(body);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), glowMat(0x7ec86a, 2.2));
      eye.position.set(0, 0.72, 0.28);
      g.add(eye);
      // 旋翼
      const rotor = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.08), ironDarkMat);
      rotor.position.y = 1.05;
      g.add(rotor);
      g.userData.rotor = rotor;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), ironDarkMat);
      mast.position.y = 0.95;
      g.add(mast);
      // 尾部扳手
      const wrench = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.03, 5, 8, Math.PI * 1.4), ironMat);
      wrench.position.set(0, 0.5, -0.3);
      g.add(wrench);
      return g;
    }
    case 'ringmaster': {
      // 人偶剧团长:巨型木偶头 + 拉夫领 + 高帽,悬浮
      const g = new THREE.Group();
      // 拉夫领(扇形叠环)
      for (let i = 0; i < 3; i++) {
        const ruff = new THREE.Mesh(new THREE.TorusGeometry(0.9 + i * 0.18, 0.09, 6, 18), i % 2 === 0 ? brassMat : copperMat);
        ruff.rotation.x = Math.PI / 2;
        ruff.position.y = 1.1 - i * 0.12;
        g.add(ruff);
      }
      // 木偶头
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 12), toonMat(0xd8cdb4));
      head.position.y = 1.9;
      g.add(head);
      // 关节缝线(嘴)
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.04), ironDarkMat);
      mouth.position.set(0, 1.7, 0.72);
      g.add(mouth);
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), emberMat);
        eye.position.set(side * 0.26, 2.05, 0.62);
        g.add(eye);
      }
      // 高帽
      const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 0.8, 10), ironDarkMat);
      hatTop.position.y = 2.9;
      g.add(hatTop);
      const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 12), ironDarkMat);
      hatBrim.position.y = 2.52;
      g.add(hatBrim);
      const hatBand = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 12), brassMat);
      hatBand.rotation.x = Math.PI / 2;
      hatBand.position.y = 2.56;
      g.add(hatBand);
      // 提线(连到天上,木偶剧氛围)
      for (const side of [-1, 1]) {
        const string = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.5, 4), ironDarkMat);
        string.position.set(side * 0.4, 4.6, 0);
        g.add(string);
      }
      return g;
    }
    case 'colossus': {
      // 钟表巨像:巨型落地钟躯干 + 指针 + 钟摆
      const g = new THREE.Group();
      // 钟柜
      const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.8), toonMat(0x4a3226));
      cabinet.position.y = 1.2;
      g.add(cabinet);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.86), brassMat);
      trim.position.y = 2.3;
      g.add(trim);
      // 表盘
      const dial = new THREE.Mesh(new THREE.CircleGeometry(0.52, 20), toonMat(0xd8cdb4));
      dial.position.set(0, 1.85, 0.42);
      g.add(dial);
      const dialRim = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.06, 8, 24), brassMat);
      dialRim.position.set(0, 1.85, 0.42);
      g.add(dialRim);
      // 指针(由 game 驱动)
      const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.02), ironDarkMat);
      hourHand.geometry.translate(0, 0.14, 0);
      hourHand.position.set(0, 1.85, 0.44);
      g.add(hourHand);
      const minHand = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.02), ironDarkMat);
      minHand.geometry.translate(0, 0.21, 0);
      minHand.position.set(0, 1.85, 0.44);
      g.add(minHand);
      g.userData.hourHand = hourHand;
      g.userData.minHand = minHand;
      // 钟摆
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), brassMat);
      rod.geometry.translate(0, -0.45, 0);
      rod.position.set(0, 1.3, 0.3);
      const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 12), copperMat);
      bob.rotation.x = Math.PI / 2;
      bob.position.y = -0.9;
      rod.add(bob);
      g.add(rod);
      g.userData.pendulum = rod;
      // 顶部铃铛
      const bell = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 8), brassMat);
      bell.position.y = 2.55;
      g.add(bell);
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
