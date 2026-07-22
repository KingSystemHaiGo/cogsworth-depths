// 单模型展示台:一次一件,左右切换,参数微调
// 用于管线模型的逐个效果调研与调整
import * as THREE from 'three';
import GUI from 'lil-gui';
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
import { CONFIG } from '../core/config.ts';

interface Exhibit {
  name: string;
  source: string; // 出处
  algo: string; // 算法
  points: number; // 轮廓点数
  make: () => THREE.Object3D;
}

const EXHIBITS: Exhibit[] = [
  { name: '齿轮', source: '手工 Shape+Extrude', algo: 'ExtrudeGeometry', points: 48, make: () => makeGear(1.0, 10, 0.4, 0.6) },
  { name: '高帽', source: 'game-icons top-hat', algo: '轮廓旋成 lathe', points: 17, make: () => makeTopHat() },
  { name: '蒸汽灯笼', source: 'game-icons lantern', algo: '轮廓旋成 lathe', points: 12, make: () => makeSteamLantern() },
  { name: '阀门轮', source: 'game-icons valve', algo: '轮廓旋成 lathe', points: 21, make: () => makeValveWheel() },
  { name: '蜘蛛', source: 'game-icons spider-bot', algo: '轮廓挤出 extrude(膨胀桥接)', points: 34, make: () => makeSpiderBot() },
  { name: '墙面表盘', source: 'game-icons speedometer', algo: '轮廓挤出 extrude', points: 37, make: () => makeWallGauge() },
  { name: '圆盾', source: 'game-icons attached-shield', algo: '轮廓旋成 lathe', points: 17, make: () => makeTowerShield() },
  { name: '双色锅炉', source: '合成双色图', algo: '部件分解 k-means 3件', points: 37, make: () => makeTwoToneBoiler() },
  { name: '测试锅炉', source: '合成剪影', algo: '轮廓旋成 lathe', points: 8, make: () => makeTestBoiler() },
  { name: '玩家 · 疫医', source: '手工拼装+生成帽', algo: '组合体', points: 0, make: () => makePlayerMesh() },
  { name: '发条蜘蛛', source: '管线剪影+发条钥匙', algo: '组合体', points: 34, make: () => makeEnemyMesh('chaser') },
  { name: '哨戒炮', source: '手工拼装', algo: '组合体', points: 0, make: () => makeEnemyMesh('shooter') },
  { name: '自走锅炉', source: '手工拼装', algo: '组合体', points: 0, make: () => makeEnemyMesh('bomber') },
  { name: '弹簧跳蚤', source: '手工拼装', algo: '组合体', points: 0, make: () => makeEnemyMesh('dasher') },
  { name: '分裂球', source: '手工拼装', algo: '组合体', points: 0, make: () => makeEnemyMesh('splitter') },
  { name: '盾卫', source: '生成圆盾+桶身', algo: '组合体', points: 17, make: () => makeEnemyMesh('warden') },
  { name: '迫击手', source: '手工拼装', algo: '组合体', points: 0, make: () => makeEnemyMesh('mortar') },
  { name: '钟表狙击手', source: '手工拼装', algo: '组合体', points: 0, make: () => makeEnemyMesh('sniper') },
  { name: '修补无人机', source: '手工拼装', algo: '组合体', points: 0, make: () => makeEnemyMesh('tinker') },
  { name: '锅炉魔像', source: 'Boss 1', algo: '组合体', points: 0, make: () => makeEnemyMesh('boss') },
  { name: '人偶剧团长', source: 'Boss 2', algo: '组合体', points: 0, make: () => makeEnemyMesh('ringmaster') },
  { name: '钟表巨像', source: 'Boss 3', algo: '组合体', points: 0, make: () => makeEnemyMesh('colossus') },
];

const params = {
  index: 0,
  scale: 1,
  spinSpeed: 0.6,
  wireframe: false,
  camHeight: 7,
  camPitch: CONFIG.camPitchDeg,
  hudDemo: true,
};

async function main(): Promise<void> {
  const stage = new ThreeStage(document.getElementById('three-canvas') as HTMLCanvasElement);
  const overlay = new Overlay();
  await overlay.init(document.getElementById('pixi-canvas') as HTMLCanvasElement);

  const info = document.getElementById('info')!;
  const counter = document.getElementById('counter')!;

  let current: THREE.Object3D | null = null;
  function show(i: number): void {
    params.index = ((i % EXHIBITS.length) + EXHIBITS.length) % EXHIBITS.length;
    if (current) stage.scene.remove(current);
    const ex = EXHIBITS[params.index];
    current = ex.make();
    current.scale.setScalar(params.scale);
    stage.scene.add(current);
    counter.textContent = `${params.index + 1} / ${EXHIBITS.length}`;
    info.innerHTML = `<b>${ex.name}</b><br/>出处:${ex.source}<br/>算法:${ex.algo}${ex.points > 0 ? `<br/>轮廓:${ex.points} 点` : ''}`;
  }

  // 切换:按钮 + 方向键 + 滚轮
  document.getElementById('prev')!.addEventListener('click', () => show(params.index - 1));
  document.getElementById('next')!.addEventListener('click', () => show(params.index + 1));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') show(params.index - 1);
    if (e.code === 'ArrowRight' || e.code === 'KeyD') show(params.index + 1);
  });
  window.addEventListener('wheel', (e) => show(params.index + (e.deltaY > 0 ? 1 : -1)));

  // 参数面板
  const gui = new GUI({ title: '精调' });
  gui.add(params, 'scale', 0.3, 3, 0.05).name('缩放').onChange((v: number) => current?.scale.setScalar(v));
  gui.add(params, 'spinSpeed', 0, 3, 0.1).name('转速');
  gui.add(params, 'wireframe').name('线框').onChange((v: boolean) => {
    current?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) ((m.material as THREE.MeshToonMaterial).wireframe = v);
    });
  });
  gui.add(params, 'camHeight', 4, 24, 0.5).name('相机视野').onChange((v: number) => {
    CONFIG.viewHeight = v;
    stage.updateCameraFrustum();
  });
  gui.add(params, 'camPitch', 20, 85, 1).name('相机俯角').onChange((v: number) => (CONFIG.camPitchDeg = v));
  gui.add(params, 'hudDemo').name('HUD 演示');

  CONFIG.viewHeight = params.camHeight;
  stage.updateCameraFrustum();
  stage.setTarget(0, 0.6, 0);
  show(0);

  // HUD 演示(可关)
  overlay.setMinimap(
    [
      { id: 0, gx: 0, gy: 0, kind: 'start', cleared: true, links: { e: 1 } },
      { id: 1, gx: 1, gy: 0, kind: 'normal', cleared: true, links: { w: 0, s: 2 } },
      { id: 2, gx: 1, gy: 1, kind: 'boss', cleared: false, links: { n: 1 } },
    ],
    2,
  );
  overlay.setWeapon('steamgun');
  overlay.setCooldowns(1, 0.4);
  overlay.setCrosshairVisible(true);
  const mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false };
  window.addEventListener('pointermove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  window.addEventListener('pointerdown', () => {
    mouse.down = true;
    overlay.crosshairFireKick();
  });
  window.addEventListener('pointerup', () => (mouse.down = false));

  let last = performance.now();
  let demoT = 0;
  function frame(now: number): void {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    demoT += dt;
    if (current) current.rotation.y += dt * params.spinSpeed;

    if (params.hudDemo) {
      const hp = 100 - Math.abs(Math.sin(demoT * 0.4)) * 50;
      overlay.setHUD(hp, 130, 1, '展示台', 42);
      overlay.setBossHp('展示 Boss', 1 - (demoT % 10) / 10);
      overlay.setCombo(Math.floor(demoT % 8) + 1);
      if (Math.floor(demoT) !== Math.floor(demoT - dt)) {
        overlay.damageNumber(0, 0, Math.floor(Math.random() * 90 + 10), Math.random() < 0.3);
        const out = { x: mouse.x, y: mouse.y };
        overlay.sparkBurst(out.x, out.y, 0xffd980, 5);
      }
      overlay.update(dt, mouse.x, mouse.y, mouse.down, hp / 130);
    } else {
      overlay.setHUD(0, 1, 0, '', 0);
      overlay.hideBossHp();
      overlay.setCombo(0);
      overlay.update(dt, -999, -999, false, 1);
    }

    stage.update(dt);
    stage.render(now / 1000);
  }
  requestAnimationFrame(frame);
}

void main();
