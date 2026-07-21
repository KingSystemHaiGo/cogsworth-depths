// 入口:装配渲染层、游戏逻辑、调参面板与主循环
import './style.css';
import * as THREE from 'three';
import Stats from 'stats.js';
import GUI from 'lil-gui';
import { CONFIG } from './core/config.ts';
import { Input } from './core/input.ts';
import { randomSeed, RNG } from './core/rng.ts';
import { ThreeStage } from './three/scene.ts';
import { Room } from './three/room.ts';
import { makePlayerMesh, makeEnemyMesh, EnemyKind } from './three/actors.ts';
import { Overlay } from './pixi/overlay.ts';
import { Game } from './game/game.ts';
import { synth } from './audio/synth.ts';
import { music } from './audio/music.ts';
import { showTitle, showPause, showGameOver, showSettings, showWorkshop, showCodex, SettingsValues } from './ui/screens.ts';
import { TouchControls } from './ui/touch.ts';
import { loadMeta, saveMeta, awardScrap, META_UPGRADES } from './core/meta.ts';
import { loadCodex } from './core/codex.ts';

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

/** 加载预热:离屏生成所有材质类型的物体并预编译 shader,
 *  避免点开始游戏时爆发首次编译卡顿(核显上可卡数秒) */
async function warmup(stage: ThreeStage, overlay: Overlay): Promise<void> {
  const g = new THREE.Group();
  // 覆盖所有材质与几何类型:房间装饰 + 玩家 + 全部敌人 + Boss
  const room = new Room(new RNG('warmup'), []);
  g.add(room.group);
  g.add(makePlayerMesh());
  const kinds: EnemyKind[] = [
    'chaser', 'shooter', 'bomber', 'dasher', 'splitter',
    'warden', 'mortar', 'sniper', 'tinker', 'boss', 'ringmaster',
  ];
  kinds.forEach((k, i) => {
    const m = makeEnemyMesh(k);
    m.position.set(i * 2 - 10, 0, 40); // 摆到视野外
    g.add(m);
  });
  stage.scene.add(g);
  // 预编译全部着色器(优先异步 API)
  const renderer = stage.renderer as THREE.WebGLRenderer & {
    compileAsync?: (s: THREE.Scene, c: THREE.Camera) => Promise<void>;
  };
  if (renderer.compileAsync) {
    await renderer.compileAsync(stage.scene, stage.camera);
  } else {
    renderer.compile(stage.scene, stage.camera);
  }
  // 实际渲染几帧,驱动后处理链与 Pixi 完成首次编译
  for (let i = 0; i < 3; i++) {
    stage.render(i * 0.016);
    overlay.update(0.016, 0, 0, false, 1);
    await new Promise((r) => requestAnimationFrame(r));
  }
  stage.scene.remove(g);
}

/** 性能画像:实测帧时间,核显自动从低档起步,独显保持高档 */
async function measureAndSetTier(stage: ThreeStage): Promise<void> {
  if (CONFIG.quality !== 'auto') return;
  const avg = await new Promise<number>((resolve) => {
    const times: number[] = [];
    let last = performance.now();
    const tick = (): void => {
      const now = performance.now();
      times.push(now - last);
      last = now;
      if (times.length < 40) requestAnimationFrame(tick);
      else resolve(times.reduce((a, b) => a + b, 0) / times.length);
    };
    requestAnimationFrame(tick);
  });
  if (avg > 25) stage.setQualityTier(2);
  else if (avg > 17) stage.setQualityTier(1);
}

async function main(): Promise<void> {
  // 加载提示(预热期间挡住)
  const loading = document.createElement('div');
  loading.className = 'screen';
  loading.style.pointerEvents = 'auto';
  loading.innerHTML = '<h1 style="font-size:28px">锅 炉 加 压 中 …</h1>';
  document.getElementById('ui-layer')!.appendChild(loading);

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
  const meta = loadMeta();
  // 触屏设备:启用虚拟双摇杆(左移动/右瞄准射击)
  const touch = new TouchControls(input, () => game.state === 'playing');
  if (touch.active) {
    input.moveAxisOverride = () => touch.touchAxis();
  }

  // 预热:预编译所有 shader,完成后撤掉加载界面
  await warmup(stage, overlay);
  overlay.warmup();
  loading.remove();

  // 性能画像:预热后实测 40 帧,自动选择初始画质档(画质优先,只降分辨率)
  await measureAndSetTier(stage);

  const game = new Game(stage, overlay, input, () => {
    music.stop();
    // 局外成长:结算齿轮残片
    meta.scrap += awardScrap(game.kills, game.floorIndex, game.bossKills);
    saveMeta(meta);
    // 每日挑战最佳
    if (game.seed.startsWith('DAILY-')) {
      const key = `cogsworth-daily-${dailyKey()}`;
      const prev = Number(localStorage.getItem(key) ?? 0);
      if (game.floorIndex > prev) localStorage.setItem(key, String(game.floorIndex));
    }
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

  // 每日挑战:日期种子 + 今日最佳记录
  function dailyKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function dailyBest(): number | null {
    const v = localStorage.getItem(`cogsworth-daily-${dailyKey()}`);
    return v ? Number(v) : null;
  }
  function startGame(seed: string): void {
    synth.init();
    const ctx = synth.audioContext;
    const bus = synth.inputBus;
    if (ctx && bus) music.init(ctx, bus);
    applyVolumes(volumes);
    synth.startAmbient();
    game.start(seed);
    input.requestLock();
    music.start();
  }

  // 标题界面(可重入:设置/改装间返回后再次显示)
  function showTitleScreen(): void {
    showTitle(
      randomSeed(),
      startGame,
      () => openSettings(showTitleScreen),
      () => openWorkshop(),
      () => showCodex(loadCodex(), showTitleScreen),
      () => startGame(`DAILY-${dailyKey()}`),
      meta.scrap,
      dailyBest(),
    );
  }
  showTitleScreen();

  function openWorkshop(): void {
    showWorkshop(
      meta,
      (id) => {
        const u = META_UPGRADES.find((x) => x.id === id)!;
        const lv = meta.upgrades[id] ?? 0;
        if (lv >= u.maxLevel) return;
        const cost = u.cost(lv);
        if (meta.scrap < cost) return;
        meta.scrap -= cost;
        meta.upgrades[id] = lv + 1;
        saveMeta(meta);
        // 重绘
        document.querySelector('.screen')?.remove();
        openWorkshop();
      },
      showTitleScreen,
    );
  }

  // 暂停(Esc 或鼠标锁丢失时触发——锁定下按 Esc 浏览器会直接解锁,收不到按键)
  let pauseOpen = false;
  function openPause(): void {
    // 已有任何界面(暂停/设置)在显示时不再重复打开,防止叠屏
    if (document.querySelector('.screen')) return;
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
    if (e.code !== 'Escape') return;
    if (game.state === 'paused' && pauseOpen) {
      // 暂停中再按 Esc = 继续
      const resumeBtn = document.querySelector('#resume-btn') as HTMLElement | null;
      resumeBtn?.click();
      return;
    }
    openPause();
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
    // 画质优先:只有帧率明显不够(<42)才降档,升档也偏保守
    if (emaFps < 42 && tier < 2) {
      lowTimer += dt;
      highTimer = 0;
      if (lowTimer > 2.5) {
        stage.setQualityTier((tier + 1) as 0 | 1 | 2);
        lowTimer = 0;
      }
    } else if (emaFps > 56 && tier > 0) {
      highTimer += dt;
      lowTimer = 0;
      if (highTimer > 8) {
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
    // 无条件调用:update 内部自己处理状态,死亡动画在非战斗状态也要推进
    game.update(dt, time);
    overlay.update(dt, input.mouseX, input.mouseY, input.mouseDown, game.hpRatio);
    stage.render(time);
    stats.end();
  }
  requestAnimationFrame(frame);
}

void main();
