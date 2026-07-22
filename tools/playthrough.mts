// 通关测试:连续打穿 3 层(3 个 Boss 轮换),BFS 遍历全部房间
// 加速清场用 evaluate,流程动作尽量真实输入
import { chromium } from 'playwright';

const issues: string[] = [];
const report = (s: string): void => {
  issues.push(s);
  console.log(`  [问题] ${s}`);
};
const ok = (s: string): void => console.log(`  ✓ ${s}`);

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => {
  if (m.type() === 'error' && m.text().trim()) report(`console: ${m.text().slice(0, 200)}`);
});
page.on('pageerror', (err) => report(`pageerror: ${String(err).slice(0, 200)}`));

const g = (expr: string): Promise<never> => page.evaluate(expr) as Promise<never>;

await page.goto('file:///D:/demo/docs/index.html');
await page.waitForSelector('#start-btn');
await page.click('#start-btn');
await page.waitForTimeout(1200);

const BOSSES = ['boss', 'ringmaster', 'colossus'];

for (let floor = 1; floor <= 3; floor++) {
  console.log(`\n======== 第 ${floor} 层 ========`);
  // 楼层结构校验
  const layout = await g(`window.__game['floor'].rooms.map(r => r.kind + ':' + r.cleared)`);
  console.log('  布局:', layout);

  // BFS 遍历全部房间
  const visitOrder = await g(`
    (() => {
      const g = window.__game;
      const floor = g['floor'];
      const seen = new Set([floor.startId]);
      const order = [floor.startId];
      const queue = [floor.startId];
      while (queue.length) {
        const id = queue.shift();
        for (const next of Object.values(floor.rooms[id].links)) {
          if (next !== undefined && !seen.has(next)) {
            seen.add(next);
            seen.add(next);
            queue.push(next);
            order.push(next);
          }
        }
      }
      return order;
    })()
  `);

  for (const roomId of visitOrder) {
    const info = await g(`(() => {
      const g = window.__game;
      g['loadRoom'](${roomId}, 'n');
      const n = g['currentNode'];
      return { id: n.id, kind: n.kind, cleared: n.cleared, elite: n.elite ?? null };
    })()`);

    if (info.kind === 'treasure' || info.kind === 'shop') {
      // 宝箱/商店:直接交互
      await g(`
        (() => {
          const g = window.__game;
          for (const it of g['interactives']) {
            if (!it.used && it.cost === 0) {
              g['player'].x = it.x;
              g['player'].z = it.z;
            }
          }
        })()
      `);
      await page.waitForTimeout(400);
      const st = await g('window.__game.state');
      if (info.kind === 'treasure' && st === 'upgrading') {
        await page.keyboard.press('Digit1');
        await page.waitForTimeout(250);
      }
      ok(`房间 ${roomId}(${info.kind})交互`);
      continue;
    }

    if (info.kind === 'boss') {
      // Boss 房:等现身 → 打到 50% 触发二阶段 → 击杀 → 传送门
      let bossFound = false;
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(300);
        const n = await g('window.__game["enemies"].length');
        if (n > 0) {
          bossFound = true;
          break;
        }
      }
      if (!bossFound) {
        report(`第 ${floor} 层 Boss 未现身`);
        continue;
      }
      const bossKind = await g('window.__game["enemies"][0].kind');
      const fiNow = await g('window.__game.floorIndex');
      const expected = BOSSES[(fiNow - 1) % 3];
      if (bossKind !== expected) report(`第 ${floor} 层 Boss 类型错误:期望 ${expected},实际 ${bossKind}`);
      else ok(`Boss 房:${bossKind}`);

      // 打到 50% 触发二阶段
      await g(`
        (() => {
          const g = window.__game;
          const b = g['enemies'][0];
          b.hp = b.maxHp * 0.45;
        })()
      `);
      await page.waitForTimeout(600);
      const enraged = await g('window.__game["enemies"][0] ? window.__game["enemies"][0].enraged : false');
      if (!enraged) report(`第 ${floor} 层 Boss 二阶段未触发`);
      else ok(`二阶段狂暴触发`);
      await page.screenshot({ path: `shots/clear-f${floor}-boss.png` });

      // 击杀
      await g(`
        (() => {
          const g = window.__game;
          while (g['enemies'].length > 0) g['damageEnemy'](0, 99999, false, 1, 0);
        })()
      `);
      await page.waitForTimeout(500);
      const portal = await g('!!window.__game["exitPortal"]');
      if (!portal) report(`第 ${floor} 层无传送门`);
      else {
        // 走进传送门
        await g('window.__game["player"].x = 0; window.__game["player"].z = 0');
        await page.waitForTimeout(600);
        const f = await g('window.__game.floorIndex');
        if (f !== floor + 1) report(`第 ${floor} 层传送失败 floor=${f}`);
        else ok(`进入第 ${f} 层`);
      }
      // 传送后已换层:终止本层遍历,防止旧 visitOrder 误伤新层房间
      break;
    }

    // 普通/精英/挑战房:清完所有波
    let cleared = false;
    for (let i = 0; i < 25; i++) {
      await g(`
        (() => {
          const g = window.__game;
          while (g['enemies'].length > 0) g['damageEnemy'](0, 99999, false, 1, 0);
        })()
      `);
      await page.waitForTimeout(250);
      const st = await g('window.__game.state');
      if (st === 'upgrading') {
        cleared = true;
        break;
      }
      const done = await g('window.__game["currentNode"].cleared');
      if (done) {
        cleared = true;
        break;
      }
    }
    if (!cleared) {
      report(`房间 ${roomId}(${info.kind}${info.elite ? '/' + info.elite : ''})未清完`);
      continue;
    }
    const st2 = await g('window.__game.state');
    if (st2 === 'upgrading') {
      await page.keyboard.press('Digit1');
      await page.waitForTimeout(250);
    }
    ok(`房间 ${roomId}(${info.kind}${info.elite ? '/' + info.elite : ''})已清`);
  }

  // 层末状态校验
  const hp = await g('window.__game["player"].hp');
  const stats = await g('JSON.stringify({dmg: window.__game.stats.damage, hp: window.__game.stats.maxHp, cogs: window.__game.cogs})');
  console.log(`  层末:hp=${hp.toFixed(0)} ${stats}`);
}

// 通关后:主动死亡,验证结算
console.log('\n======== 通关后结算 ========');
await g('window.__game["hurtPlayer"](9999)');
await page.waitForTimeout(600);
const endState = await g('window.__game.state');
if (endState !== 'dead') report(`通关后死亡结算异常 state=${endState}`);
const scrap = await g(`JSON.parse(localStorage.getItem('cogsworth-meta') ?? '{"scrap":0}').scrap`);
console.log(`  残片余额:${scrap}`);
await page.screenshot({ path: 'shots/clear-end.png' });

console.log(`\n======== 通关测试汇总:${issues.length} 个问题 ========`);
issues.forEach((s) => console.log(' -', s));
await browser.close();
process.exit(issues.length > 0 ? 1 : 0);
