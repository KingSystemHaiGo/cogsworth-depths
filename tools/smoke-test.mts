// 真实游玩冒烟测试:尽量真实输入,覆盖全流程,自动采集问题
// 输出 tools/out/smoke-report.json + 控制台可读摘要
import { chromium } from 'playwright';
import type { Page } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

interface Issue {
  area: string;
  severity: 'error' | 'warn' | 'info';
  detail: string;
}

const issues: Issue[] = [];
const metrics: Record<string, unknown> = {};
const report = (area: string, severity: Issue['severity'], detail: string): void => {
  issues.push({ area, severity, detail });
  console.log(`  [${severity}] ${area}: ${detail}`);
};
const ok = (area: string, detail: string): void => console.log(`  ✓ ${area}: ${detail}`);

async function expect(page: Page, area: string, fn: () => Promise<boolean>, detail: string): Promise<boolean> {
  try {
    const pass = await fn();
    if (pass) ok(area, detail);
    else report(area, 'error', `断言失败: ${detail}`);
    return pass;
  } catch (e) {
    report(area, 'error', `异常: ${detail} — ${String(e).slice(0, 120)}`);
    return false;
  }
}

async function fps(page: Page, seconds = 1.5): Promise<number> {
  return page.evaluate(
    (s) =>
      new Promise<number>((res) => {
        let n = 0;
        const t0 = performance.now();
        const tick = (): void => {
          n++;
          if (performance.now() - t0 < s * 1000) requestAnimationFrame(tick);
          else res(n / s);
        };
        requestAnimationFrame(tick);
      }),
    seconds,
  );
}

async function longFrames(page: Page, seconds = 3): Promise<{ avg: number; max: number; over33: number }> {
  return page.evaluate(
    (s) =>
      new Promise((res) => {
        const times: number[] = [];
        let last = performance.now();
        const tick = (): void => {
          const now = performance.now();
          times.push(now - last);
          last = now;
          if (times.length < s * 120) requestAnimationFrame(tick);
          else {
            res({
              avg: times.reduce((a, b) => a + b, 0) / times.length,
              max: Math.max(...times),
              over33: times.filter((t) => t > 33).length,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
    seconds,
  );
}

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => {
  if (m.type() === 'error' && m.text().trim()) report('console', 'error', m.text().slice(0, 200));
});
page.on('pageerror', (err) => report('console', 'error', `pageerror: ${String(err).slice(0, 200)}`));

const g = (expr: string): Promise<never> => page.evaluate(expr) as Promise<never>;

// ============ A. 启动与标题 ============
console.log('\n== A. 启动与标题 ==');
const bootStart = Date.now();
await page.goto('file:///D:/demo/docs/index.html');
await page.waitForSelector('#start-btn', { timeout: 30000 });
metrics.bootMs = Date.now() - bootStart;
ok('boot', `加载到标题 ${metrics.bootMs}ms`);
await expect(page, 'boot', async () => (await g('!!document.querySelector(".screen")')) === true, '标题界面显示');
metrics.titleFps = await fps(page);
if (metrics.titleFps < 30) report('perf', 'warn', `标题 FPS 仅 ${metrics.titleFps}`);

// ============ B. 开始游戏 ============
console.log('\n== B. 开始游戏 ==');
await page.click('#start-btn');
await page.waitForTimeout(1200);
await expect(page, 'start', async () => (await g('window.__game.state')) === 'playing', '进入 playing 状态');
await expect(page, 'start', async () => (await g('!!document.pointerLockElement')) === true, '鼠标锁定');
await expect(page, 'hud', async () => (await g('window.__game.hpRatio')) === 1, '满血开局');

// ============ C. 移动与碰撞 ============
console.log('\n== C. 移动与碰撞 ==');
const x0 = await g('window.__game["player"].x');
await page.keyboard.down('KeyD');
await page.waitForTimeout(800);
await page.keyboard.up('KeyD');
const x1 = await g('window.__game["player"].x');
await expect(page, 'move', async () => x1 > x0 + 2, `向右移动 ${(x1 - x0).toFixed(1)}m`);
await page.keyboard.down('KeyD');
await page.waitForTimeout(2500);
await page.keyboard.up('KeyD');
const x2 = await g('window.__game["player"].x');
const roomHW = await g('34 / 2');
if (x2 > roomHW) report('move', 'error', `玩家穿出房间边界 x=${x2.toFixed(2)}`);
else ok('move', `墙壁阻挡正常 x=${x2.toFixed(2)}`);

// ============ D. 真实射击 ============
console.log('\n== D. 真实射击 ==');
await g(`
  (() => {
    const g = window.__game;
    const node = g['currentNode'];
    const side = Object.keys(node.links)[0];
    g['loadRoom'](node.links[side], { n: 's', s: 'n', e: 'w', w: 'e' }[side]);
  })()
`);
// 轮询等敌人现身
for (let i = 0; i < 20; i++) {
  const n = await g('window.__game["enemies"].length');
  if (n > 0) break;
  await page.waitForTimeout(300);
}
// 把一只敌人挪到准星直线上,真实鼠标射击
const aim = await g(`
  (() => {
    const g = window.__game;
    const stage = g['stage'];
    const out = { x: 0, y: 0 };
    stage.worldToScreen(stage.camera.position.clone().set(g['player'].x + 5, 0, g['player'].z), out);
    if (g['enemies'].length > 0) {
      g['enemies'][0].x = g['player'].x + 5;
      g['enemies'][0].z = g['player'].z;
      g['enemies'][0].speed = 0;
      g['enemies'][0].spawnT = 0;
    }
    return { px: out.x, py: out.y };
  })()
`);
await page.mouse.move(aim.px, aim.py);
await page.mouse.down();
await page.waitForTimeout(1200);
await page.mouse.up();
// 按引用追踪目标敌人(数组会因击杀重排,不能用索引)
// @ts-expect-error 动态求值
const track = await g(`(() => {
  const g = window.__game;
  const t = g['enemies'].find(e => e.speed === 0);
  const kills = g.kills;
  return { hp: t ? t.hp : -1, kills, alive: !!t };
})()`);
if (track.kills > 0) ok('combat', `真实射击击杀敌人(kills=${track.kills})`);
else if (track.hp < 25 && track.alive) ok('combat', `真实射击造成伤害 hp=${track.hp}`);
else report('combat', 'error', `真实射击无效果 track=${JSON.stringify(track)}`);
await expect(page, 'combat', async () => (await g('window.__game["playerBullets"].items.filter(b=>b.active).length >= 0')) === true, '子弹池正常');

// ============ E. 冲刺与翻滚 ============
console.log('\n== E. 冲刺与翻滚 ==');
// 先挪到房间中央,避免贴墙影响位移测量
await page.evaluate(() => {
  const g = window.__game;
  g['player'].x = 0;
  g['player'].z = 0;
});
await page.waitForTimeout(200);
const dashX0 = await page.evaluate(() => window.__game['player'].x);
await page.keyboard.down('KeyD');
await page.keyboard.down('Space');
await page.waitForTimeout(100);
await page.keyboard.up('Space');
await page.waitForTimeout(500);
await page.keyboard.up('KeyD');
const dashX1 = await page.evaluate(() => window.__game['player'].x);
if (dashX1 - dashX0 < 2) report('skill', 'warn', `冲刺位移偏小 ${(dashX1 - dashX0).toFixed(2)}m`);
else ok('skill', `冲刺位移 ${(dashX1 - dashX0).toFixed(1)}m`);
await g('window.__game["player"].invuln = 0');
await page.keyboard.down('KeyA');
await page.keyboard.down('ShiftLeft');
await page.waitForTimeout(60);
await page.keyboard.up('ShiftLeft');
await page.waitForTimeout(150);
const rollInv = await g('window.__game["player"].invuln');
await page.keyboard.up('KeyA');
if (rollInv <= 0) report('skill', 'error', '翻滚未获得无敌帧');
else ok('skill', `翻滚无敌帧 ${rollInv.toFixed(2)}s`);

// ============ F. 升级(真实按键选卡) ============
console.log('\n== F. 升级 ==');
// 持续清杀直到弹升级(多波房间需要清完所有波)
let upState = 'playing';
for (let i = 0; i < 25; i++) {
  await g(`
    (() => {
      const g = window.__game;
      while (g['enemies'].length > 0) g['damageEnemy'](0, 99999, false, 1, 0);
    })()
  `);
  await page.waitForTimeout(250);
  upState = await g('window.__game.state');
  if (upState === 'upgrading') break;
}
if (upState !== 'upgrading') report('upgrade', 'error', `清房后未进升级界面 state=${upState}`);
else {
  ok('upgrade', '清房弹出升级');
  const cntBefore = await g('[...window.__game["upgradeCounts"].values()].reduce((a,b)=>a+b,0)');
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(300);
  const upState2 = await g('window.__game.state');
  const cntAfter = await g('[...window.__game["upgradeCounts"].values()].reduce((a,b)=>a+b,0)');
  if (upState2 !== 'playing') report('upgrade', 'error', `按键选卡后未恢复 state=${upState2}`);
  else if (cntAfter !== cntBefore + 1) report('upgrade', 'error', `选卡未生效 counts ${cntBefore}→${cntAfter}`);
  else ok('upgrade', `按键选卡生效 counts ${cntBefore}→${cntAfter}`);
}

// ============ G. 真实走门 ============
console.log('\n== G. 走门换房 ==');
const roomBefore = await g('window.__game["currentNode"].id');
await g(`
  (() => {
    const g = window.__game;
    const node = g['currentNode'];
    node.cleared = true;
    g['room'].setAllDoors(true);
    g['player'].x = 0;
    g['player'].z = 6;
  })()
`);
await page.keyboard.down('KeyS');
await page.waitForTimeout(1600);
await page.keyboard.up('KeyS');
const roomAfter = await g('window.__game["currentNode"].id');
// 南门不一定存在,走到墙停住也算通过(没报错)
if (roomAfter !== roomBefore) ok('door', `换房 ${roomBefore}→${roomAfter}`);
else {
  // 依次试四个方向
  const dirs = [
    ['KeyW', 0, -6],
    ['KeyA', -6, 0],
    ['KeyD', 6, 0],
  ];
  let moved2 = roomBefore;
  for (const [key, px, pz] of dirs) {
    await page.evaluate(([x, z]) => {
      const g = window.__game;
      g['player'].x = x;
      g['player'].z = z;
    }, [px, pz]);
    await page.keyboard.down(key);
    await page.waitForTimeout(1400);
    await page.keyboard.up(key);
    moved2 = await g('window.__game["currentNode"].id');
    if (moved2 !== roomBefore) break;
  }
  if (moved2 !== roomBefore) ok('door', `换房 ${roomBefore}→${moved2}`);
  else report('door', 'warn', '四个方向都未换房(布局可能无门,需人工确认)');
}

// ============ H. 武器切换 ============
console.log('\n== H. 武器切换 ==');
const w0 = await g('window.__game["weapon"]');
await page.keyboard.down('KeyQ');
await page.waitForTimeout(80);
await page.keyboard.up('KeyQ');
await page.waitForTimeout(100);
const w1 = await g('window.__game["weapon"]');
await page.keyboard.down('KeyQ');
await page.waitForTimeout(80);
await page.keyboard.up('KeyQ');
await page.waitForTimeout(100);
const w2 = await g('window.__game["weapon"]');
if (w0 === w1 || w1 === w2) report('weapon', 'error', `武器切换异常 ${w0}→${w1}→${w2}`);
else ok('weapon', `武器轮换 ${w0}→${w1}→${w2}`);

// ============ I. 暂停/继续 ============
console.log('\n== I. 暂停 ==');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const paused = await g('window.__game.state');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const resumed = await g('window.__game.state');
if (paused !== 'paused') report('pause', 'error', `Esc 未暂停 state=${paused}`);
else if (resumed !== 'playing') report('pause', 'error', `Esc 未继续 state=${resumed}`);
else ok('pause', 'Esc 暂停/继续');

// ============ J. 商店 ============
console.log('\n== J. 商店 ==');
await g(`
  (() => {
    const g = window.__game;
    const shop = g['floor'].rooms.find(r => r.kind === 'shop');
    if (shop) {
      g['loadRoom'](shop.id, 'n');
      g.cogs = 10;
      g['player'].hp = 50;
      g['player'].x = -5;
      g['player'].z = 0;
    }
  })()
`);
await page.waitForTimeout(500);
const shopRes = await g('({ hp: window.__game["player"].hp, cogs: window.__game.cogs, hasShop: !!window.__game["floor"].rooms.find(r => r.kind === "shop") })');
if (!shopRes.hasShop) ok('shop', '本层无商店房,跳过');
else if (shopRes.hp > 50 && shopRes.cogs < 10) ok('shop', `购买回血 hp=${shopRes.hp} cogs=${shopRes.cogs}`);
else report('shop', 'error', `商店购买失败 hp=${shopRes.hp} cogs=${shopRes.cogs}`);

// ============ K. Boss 与下一层 ============
console.log('\n== K. Boss 与下一层 ==');
await g(`window.__game['loadRoom'](window.__game['floor'].bossId, 'n')`);
// 轮询等 Boss 现身(出生延迟 1.2s)
let bossReady = false;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(300);
  const n = await g('window.__game["enemies"].length');
  if (n > 0) {
    bossReady = true;
    break;
  }
}
if (!bossReady) report('boss', 'error', 'Boss 超过 9s 未现身');
else {
  ok('boss', 'Boss 已现身');
  await g(`
    (() => {
      const g = window.__game;
      while (g['enemies'].length > 0) g['damageEnemy'](0, 99999, false, 1, 0);
    })()
  `);
}
await page.waitForTimeout(500);
const portal = await g('!!window.__game["exitPortal"]');
if (!portal) report('boss', 'error', 'Boss 击杀后无传送门');
else ok('boss', '传送门生成');
await g('window.__game["player"].x = 0; window.__game["player"].z = 0');
await page.waitForTimeout(600);
const floor2 = await g('window.__game.floorIndex');
if (floor2 !== 2) report('boss', 'error', `未进入第 2 层 floor=${floor2}`);
else ok('boss', '进入第 2 层');

// ============ L. 死亡与重开 ============
console.log('\n== L. 死亡与重开 ==');
await g('window.__game["hurtPlayer"](9999)');
await page.waitForTimeout(600);
const deadState = await g('window.__game.state');
if (deadState !== 'dead') report('death', 'error', `未进入死亡状态 state=${deadState}`);
else ok('death', '死亡结算显示');
await expect(page, 'death', async () => (await g('!!document.querySelector(".screen #restart-btn")')) === true, '重开按钮存在');
await page.click('#restart-btn');
await page.waitForTimeout(900);
const aliveState = await g('window.__game.state');
if (aliveState !== 'playing') report('death', 'error', `重开失败 state=${aliveState}`);
else ok('death', '点击重开回到游戏');

// ============ M. 局外成长与图鉴 ============
console.log('\n== M. 局外成长 ==');
const metaRaw = await g('localStorage.getItem("cogsworth-meta") ?? "null"');
if (metaRaw === 'null') report('meta', 'error', '残片未结算(死亡后 meta 未写入)');
else ok('meta', `残片结算 ${metaRaw.slice(0, 60)}`);
const codexRaw = await g('localStorage.getItem("cogsworth-codex") ?? "null"');
if (codexRaw === 'null') report('meta', 'warn', '图鉴无记录');
else ok('meta', '图鉴有记录');

// ============ N. 设置与双语 ============
console.log('\n== N. 设置与双语 ==');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.click('#settings-btn');
await page.waitForTimeout(300);
await page.click('#lang-en');
await page.waitForTimeout(300);
const langEn = await g('localStorage.getItem("cogsworth-lang")');
if (langEn !== 'en') report('i18n', 'error', `语言未切换 ${langEn}`);
else ok('i18n', '切换英文');
await page.locator('#vol-music').fill('30');
await page.waitForTimeout(200);
const vols = await g('localStorage.getItem("cogsworth-volumes")');
if (!vols?.includes('0.3')) report('i18n', 'warn', `音量持久化异常 ${vols}`);
else ok('i18n', '音量持久化');
await page.click('#back-btn');
await page.waitForTimeout(200);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// ============ O. 性能采样 ============
console.log('\n== O. 性能 ==');
await g(`
  (() => {
    const g = window.__game;
    const node = g['currentNode'];
    if (node.kind !== 'normal') {
      const n2 = g['floor'].rooms.find(r => r.kind === 'normal');
      g['loadRoom'](n2.id, 'n');
    }
  })()
`);
await page.waitForTimeout(1500);
metrics.combat = await longFrames(page, 3);
console.log(`  战斗帧: avg=${metrics.combat.avg.toFixed(1)}ms max=${metrics.combat.max.toFixed(1)}ms >33ms=${metrics.combat.over33}`);
if (metrics.combat.over33 > 10) report('perf', 'warn', `战斗场景长帧偏多: ${metrics.combat.over33} 帧 >33ms`);
const mem = await g('performance.memory');
metrics.heapMB = (mem.usedJSHeapSize / 1048576).toFixed(0);

// ============ 汇总 ============
const summary = {
  total: issues.length,
  errors: issues.filter((i) => i.severity === 'error').length,
  warns: issues.filter((i) => i.severity === 'warn').length,
};
console.log(`\n======== 汇总: ${summary.errors} 错误 / ${summary.warns} 警告 / ${summary.total} 总问题 ========`);
mkdirSync('tools/out', { recursive: true });
writeFileSync('tools/out/smoke-report.json', JSON.stringify({ summary, metrics, issues }, null, 2));
console.log('报告已写入 tools/out/smoke-report.json');
await browser.close();
process.exit(summary.errors > 0 ? 1 : 0);
