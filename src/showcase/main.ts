// 展示台:全部程序化模型 + HUD 演示,用于管线优化调研
// 左:模型旋转展台(游戏同款渲染链);右/切换:Pixi HUD 全流程演示
import * as THREE from 'three';
import { ThreeStage } from '../three/scene.ts';
import { Overlay } from '../pixi/overlay.ts';
import { makeGear } from '../three/factory/gears.ts';
import { makeTopHat } from '../three/factory/topHat.ts';
import { makeSpiderBot } from '../three/factory/spiderBot.ts';
import { makeValveWheel } from '../three/factory/valveWheel.ts';
import { makeWallGauge } from '../three/factory/wallGauge.ts';
import { makeTowerShield } from '../three/factory/towerShield.ts';
import { makeTwoToneBoiler } from '../three/factory/twoToneBoiler.ts';
import { makeSteamLantern } from '../three/factory/steamLantern.ts';
import { makeTestBoiler } from '../three/factory/testBoiler.ts';
import { makePlayerMesh, makeEnemyMesh, EnemyKind } from '../three/actors.ts';
import { Room } from '../three/room.ts';
import { RNG } from '../core/rng.ts';
import { CONFIG } from '../core/config.ts';

interface Exhibit {
  name: string;
  note: string;
  make: () => THREE.Object3D;
  spin?: boolean;
}

const EXHIBITS: Exhibit[] = [
  { name: '齿轮', note: '手工 Shape+Extrude', make: () => makeGear(0.9, 10, 0.4, 0.6), spin: true },
  { name: '高帽', note: '管线:轮廓旋成 17pt', make: () => makeTopHat() },
  { name: '蒸汽灯笼', note: '管线:轮廓旋成 12pt', make: () => makeSteamLantern() },
  { name: '阀门轮', note: '管线:轮廓旋成 21pt', make: () => makeValveWheel() },
  { name: '蜘蛛', note: '管线:轮廓挤出 34pt', make: () => makeSpiderBot() },
  { name: '墙面表盘', note: '管线:轮廓挤出 37pt', make: () => makeWallGauge() },
  { name: '圆盾', note: '管线:轮廓旋成 17pt', make: () => makeTowerShield() },
  { name: '双色锅炉', note: '管线:部件分解 3件', make: () => makeTwoToneBoiler() },
  { name: '测试锅炉', note: '管线:合成图旋成', make: () => makeTestBoiler() },
  { name: '玩家 · 疫医', note: '手工拼装+生成帽', make: () => makePlayerMesh() },
  { name: '发条蜘蛛', note: '管线剪影+发条钥匙', make: () => makeEnemyMesh('chaser') },
  { name: '哨戒炮', note: '手工拼装', make: () => makeEnemyMesh('shooter') },
  { name: '自走锅炉', note: '手工拼装', make: () => makeEnemyMesh('bomber') },
  { name: '弹簧跳蚤', note: '手工拼装', make: () => makeEnemyMesh('dasher') },
  { name: '分裂球', note: '手工拼装', make: () => makeEnemyMesh('splitter') },
  { name: '盾卫', note: '生成圆盾+桶身', make: () => makeEnemyMesh('warden') },
  { name: '迫击手', note: '手工拼装', make: () => makeEnemyMesh('mortar') },
  { name: '钟表狙击手', note: '手工拼装', make: () => makeEnemyMesh('sniper') },
  { name: '修补无人机', note: '手工拼装', make: () => makeEnemyMesh('tinker') },
  { name: '锅炉魔像', note: 'Boss 1', make: () => makeEnemyMesh('boss') },
  { name: '人偶剧团长', note: 'Boss 2', make: () => makeEnemyMesh('ringmaster') },
  { name: '钟表巨像', note: 'Boss 3', make: () => makeEnemyMesh('colossus') },
];

async function main(): Promise<void> {
  const stage = new ThreeStage(document.getElementById('three-canvas') as HTMLCanvasElement);
  const overlay = new Overlay();
  await overlay.init(document.getElementById('pixi-canvas') as HTMLCanvasElement);

  // 环境:直接复用游戏房间当地台(更真实的展示语境)
  const room = new Room(new RNG('showcase'), []);
  stage.scene.add(room.group);

  // 网格布局摆展品
  const cols = 5;
  const gap = 4.2;
  const rows = Math.ceil(EXHIBITS.length / cols);
  const items: { obj: THREE.Object3D; spin: boolean; cx: number; cz: number; name: string; note: string }[] = [];
  EXHIBITS.forEach((ex, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = (col - (cols - 1) / 2) * gap;
    const cz = (row - (rows - 1) / 2) * gap;
    const obj = ex.make();
    obj.position.set(cx, 0, cz);
    stage.scene.add(obj);
    items.push({ obj, spin: ex.spin ?? true, cx, cz, name: ex.name, note: ex.note });
  });

  // 标签层
  const labelsRoot = document.getElementById('labels')!;
  const tags = items.map((it) => {
    const div = document.createElement('div');
    div.className = 'tag';
    div.innerHTML = `<b>${it.name}</b><span>${it.note}</span>`;
    labelsRoot.appendChild(div);
    return div;
  });

  // 相机:视角随布局调整
  CONFIG.viewHeight = rows * gap + 4;
  stage.updateCameraFrustum();
  stage.setTarget(0, 0, 0);

  // HUD 演示状态
  const demoFloor = {
    rooms: [
      { id: 0, gx: 0, gy: 0, kind: 'start', cleared: true, links: { e: 1 } },
      { id: 1, gx: 1, gy: 0, kind: 'normal', cleared: true, links: { w: 0, e: 2 } },
      { id: 2, gx: 2, gy: 0, kind: 'normal', cleared: false, links: { w: 1, s: 3 } },
      { id: 3, gx: 2, gy: 1, kind: 'boss', cleared: false, links: { n: 2 } },
      { id: 4, gx: 1, gy: 1, kind: 'treasure', cleared: true, links: { e: 2 } },
    ],
    startId: 0,
    bossId: 3,
  };
  overlay.setMinimap(demoFloor.rooms, 2);
  overlay.setWeapon('railgun');
  overlay.setCooldowns(0.7, 1);
  overlay.setCrosshairVisible(true);

  let demoT = 0;
  let hpPhase = 0;
  const mouse = { x: window.innerWidth * 0.62, y: window.innerHeight * 0.45, down: false };
  window.addEventListener('pointermove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  window.addEventListener('pointerdown', () => {
    mouse.down = true;
    overlay.crosshairFireKick();
  });
  window.addEventListener('pointerup', () => (mouse.down = false));

  const v3 = new THREE.Vector3();
  let last = performance.now();
  function frame(now: number): void {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const time = now / 1000;
    demoT += dt;

    // 展台旋转
    for (const it of items) {
      if (it.spin) it.obj.rotation.y += dt * 0.6;
    }
    room.update(dt, time);

    // 标签投影
    items.forEach((it, i) => {
      v3.set(it.cx, 2.2, it.cz);
      const out = { x: 0, y: 0 };
      stage.worldToScreen(v3, out);
      tags[i].style.left = `${out.x}px`;
      tags[i].style.top = `${out.y + 30}px`;
    });

    // HUD 演示:血量呼吸波动 + 周期性打击数字/连击/Boss 血条
    hpPhase += dt * 0.4;
    const hp = 100 - Math.abs(Math.sin(hpPhase)) * 55;
    overlay.setHUD(hp, 130, 3, '展示厅', 42);
    overlay.setCombo(2 + Math.floor((demoT % 6) / 1.5));
    overlay.setBossHp('展示 Boss · 柯格斯沃斯', 1 - (demoT % 12) / 12);
    if (Math.floor(demoT * 2) !== Math.floor((demoT - dt) * 2)) {
      const wx = (Math.random() - 0.5) * 8;
      const wz = (Math.random() - 0.5) * 6;
      const out = { x: 0, y: 0 };
      stage.worldToScreen(v3.set(wx, 1, wz), out);
      overlay.damageNumber(0, 0, Math.floor(Math.random() * 90 + 10), Math.random() < 0.3);
      void out;
      overlay.sparkBurst(out.x + window.innerWidth / 2 - 640, out.y, 0xffd980, 5);
    }

    stage.update(dt);
    overlay.update(dt, mouse.x, mouse.y, mouse.down, hp / 130);
    stage.render(time);
  }
  requestAnimationFrame(frame);
}

void main();
