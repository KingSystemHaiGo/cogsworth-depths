// 入口:装配渲染层、游戏逻辑、调参面板与主循环
import './style.css';
import * as THREE from 'three';
import Stats from 'stats.js';
import GUI from 'lil-gui';
import { CONFIG } from './core/config.ts';
import { Input } from './core/input.ts';
import { randomSeed } from './core/rng.ts';
import { ThreeStage } from './three/scene.ts';
import { Overlay } from './pixi/overlay.ts';
import { Game } from './game/game.ts';
import { synth } from './audio/synth.ts';
import { music } from './audio/music.ts';
import { showTitle, showPause, showGameOver, showSettings, SettingsValues } from './ui/screens.ts';

const VOL_KEY = 'cogsworth-volumes';

function loadVolumes(): SettingsValues {
  try {
    const raw = localStorage.getItem(VOL_KEY);
    if (raw) return JSON.parse(raw) as SettingsValues;
  } catch {
    /* 忽略 */
  }
  return { musicVolume: CONFIG.musicVolume, sfxVolume: CONFIG.masterVolume };
}

function saveVolumes(v: SettingsValues): void {
  localStorage.setItem(VOL_KEY, JSON.stringify(v));
}

async function main(): Promise<void> {
  const threeCanvas = document.getElementById('three-canvas') as HTMLCanvasElement;
  const pixiCanvas = document.getElementById('pixi-canvas') as HTMLCanvasElement;

  // 读取持久化的音量设置
  const volumes = loadVolumes();
  CONFIG.musicVolume = volumes.musicVolume;
  CONFIG.masterVolume = volumes.sfxVolume;

  const stage = new ThreeStage(threeCanvas);
  const overlay = new Overlay();
  await overlay.init(pixiCanvas);
  // 世界→屏幕桥:打击数字/火花挂在世界坐标上(y=1 约为敌人头顶)
  overlay.setWorldToScreen((x, z, out) => {
    stage.worldToScreen(new THREE.Vector3(x, 1, z), out);
  });

  const input = new Input(threeCanvas);

  const game = new Game(stage, overlay, input, () => {
    music.stop();
    showGameOver(
      { floor: game.floorIndex, kills: game.kills, timeSec: game.timeSec, seed: game.seed },
      restart,
    );
  });
  // 调试挂钩
  (window as unknown as { __game: Game }).__game = game;
  (window as unknown as { __cfg: typeof CONFIG }).__cfg = CONFIG;

  function applyVolumes(v: SettingsValues): void {
    Object.assign(volumes, v);
    CONFIG.musicVolume = v.musicVolume;
    CONFIG.masterVolume = v.sfxVolume;
    synth.setVolume(v.sfxVolume);
    music.setVolume(v.musicVolume);
    saveVolumes(v);
  }

  function openSettings(onBack: () => void): void {
    showSettings({ ...volumes }, applyVolumes, onBack);
  }

  function restart(): void {
    overlay.clearFx();
    game.start(game.seed || randomSeed());
    input.requestLock();
    music.start();
  }

  // 标题界面(可重入:设置返回后再次显示)
  function showTitleScreen(): void {
    showTitle(
      randomSeed(),
      (seed) => {
        synth.init();
        const ctx = synth.audioContext;
        const bus = synth.inputBus;
        if (ctx && bus) music.init(ctx, bus);
        applyVolumes(volumes); // 音频上下文就绪后应用一次
        synth.startAmbient();
        game.start(seed);
        input.requestLock();
        music.start();
      },
      () => openSettings(showTitleScreen),
    );
  }
  showTitleScreen();

  // 暂停(Esc 或鼠标锁丢失时触发——锁定下按 Esc 浏览器会直接解锁,收不到按键)
  let pauseOpen = false;
  function openPause(): void {
    // 允许从暂停或游戏中进入(后者用于设置页返回时重绘)
    if (game.state !== 'playing' && game.state !== 'paused') return;
    if (game.state === 'playing') {
      game.state = 'paused';
      input.exitLock();
    }
    pauseOpen = true;
    showPause(
      () => {
        game.state = 'playing';
        pauseOpen = false;
        input.requestLock();
      },
      () => {
        pauseOpen = false;
        restart();
      },
      () => openSettings(openPause),
    );
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') openPause();
  });
  // 锁定丢失(如锁定下按 Esc)且仍在游戏中 → 弹出暂停
  document.addEventListener('pointerlockchange', () => {
    if (!input.locked) openPause();
  });
  // 游戏中未锁定时点击画面即可重新锁定
  threeCanvas.addEventListener('pointerdown', () => {
    if (game.state === 'playing' && !input.locked) input.requestLock();
  });

  // 调参面板
  const gui = new GUI({ title: '锅炉控制台' });
  gui.add(CONFIG, 'viewHeight', 12, 32, 0.5).name('视野高度').onChange(() => stage.updateCameraFrustum());
  gui.add(CONFIG, 'camPitchDeg', 30, 80, 1).name('相机俯角');
  gui.add(CONFIG, 'bloom').name('泛光');
  gui.add(CONFIG, 'bloomStrength', 0, 1.5, 0.05).name('泛光强度');
  gui.add(CONFIG, 'fogDensity', 0, 0.08, 0.002).name('雾密度').onChange((v: number) => {
    (stage.scene.fog as { density: number }).density = v;
  });
  gui.add(CONFIG, 'masterVolume', 0, 1, 0.05).name('音量').onChange((v: number) => synth.setVolume(v));
  gui.add(CONFIG, 'musicVolume', 0, 1, 0.05).name('音乐音量').onChange((v: number) => music.setVolume(v));
  gui
    .add(CONFIG, 'quality', { 自动: 'auto', 高: 'high', 中: 'medium', 低: 'low' })
    .name('画质')
    .onChange(() => applyQualityMode());
  const gameplay = gui.addFolder('手感');
  gameplay.add(CONFIG, 'aimSensitivity', 0.3, 3, 0.1).name('准星灵敏度');
  gameplay.add(CONFIG, 'playerSpeed', 4, 14, 0.5).name('移动速度');
  gameplay.add(CONFIG, 'fireRate', 1, 10, 0.2).name('射速');
  gameplay.add(CONFIG, 'bulletDamage', 4, 40, 1).name('伤害');
  const style = gui.addFolder('风格滤镜');
  style.add(CONFIG, 'pixelSize', 0, 6, 0.5).name('像素化');
  style.add(CONFIG, 'posterize', 0, 16, 1).name('色调分离级数');
  style.add(CONFIG, 'styleOutline').name('墨线描边');
  style.add(CONFIG, 'vignette', 0, 1, 0.05).name('暗角');
  style.add(CONFIG, 'grain', 0, 0.15, 0.005).name('噪点');
  style.add(CONFIG, 'warmGrade', 0, 1, 0.05).name('暖黄做旧');
  style.add(CONFIG, 'splitTone', 0, 1, 0.05).name('分离色调');
  gui.hide(); // 默认收起,按 F1 呼出
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F1') {
      e.preventDefault();
      gui._hidden ? gui.show() : gui.hide();
    }
  });

  // FPS 统计(放右下,避免和小地图重叠;提高层级确保可见)
  const stats = new Stats();
  stats.showPanel(0);
  stats.dom.style.position = 'fixed';
  stats.dom.style.left = 'auto';
  stats.dom.style.right = '8px';
  stats.dom.style.top = 'auto';
  stats.dom.style.bottom = '8px';
  stats.dom.style.zIndex = '30';
  document.body.appendChild(stats.dom);

  window.addEventListener('resize', () => stage.resize());

  // 主循环(固定上限 dt,防止切后台后跳变)
  // FPS 指数移动平均 + 自动画质:低于 48fps 持续 2s 降档,高于 57fps 持续 10s 回升
  let emaFps = 60;
  let lowTimer = 0;
  let highTimer = 0;

  function applyQualityMode(): void {
    if (CONFIG.quality === 'high') stage.setQualityTier(0);
    else if (CONFIG.quality === 'medium') stage.setQualityTier(1);
    else if (CONFIG.quality === 'low') stage.setQualityTier(2);
    // auto:交给帧率监控
  }

  function autoQuality(dt: number): void {
    if (dt > 0) emaFps = emaFps * 0.95 + (1 / dt) * 0.05;
    if (CONFIG.quality !== 'auto') return;
    const tier = stage.qualityTier;
    if (emaFps < 48 && tier < 2) {
      lowTimer += dt;
      highTimer = 0;
      if (lowTimer > 2) {
        stage.setQualityTier((tier + 1) as 0 | 1 | 2);
        lowTimer = 0;
      }
    } else if (emaFps > 57 && tier > 0) {
      highTimer += dt;
      lowTimer = 0;
      if (highTimer > 10) {
        stage.setQualityTier((tier - 1) as 0 | 1 | 2);
        highTimer = 0;
      }
    } else {
      lowTimer = 0;
      highTimer = 0;
    }
  }

  let last = performance.now();
  function frame(now: number): void {
    requestAnimationFrame(frame);
    stats.begin();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const time = now / 1000;

    autoQuality(dt);
    // 注意顺序:先更新相机(含跟随),再跑游戏逻辑。
    // 否则瞄准时用的是上一帧的相机矩阵,相机滑动时炮口和准星会有偏差
    stage.update(dt);
    if (game.state === 'playing') {
      game.update(dt, time);
    }
    overlay.update(dt, input.mouseX, input.mouseY, input.mouseDown, game.hpRatio);
    stage.render(time);
    stats.end();
  }
  requestAnimationFrame(frame);
}

void main();
