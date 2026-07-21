// DOM 界面层:标题 / 暂停 / 升级三选一 / 结算
import type { Upgrade } from '../game/upgrades.ts';

const layer = () => document.getElementById('ui-layer')!;

function el(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html.trim();
  return div.firstElementChild as HTMLElement;
}

export function showTitle(defaultSeed: string, onStart: (seed: string) => void): void {
  const screen = el(`
    <div class="screen">
      <h1>COGSWORTH DEPTHS</h1>
      <h2>蒸 汽 深 渊 · 程 序 化 肉 鸽</h2>
      <p class="stats-line">
        WASD / 方向键 移动 · 鼠标瞄准 · 左键射击<br/>
        空格 冲刺 · Shift 翻滚 · Esc 暂停<br/>
        清除每个房间的机械守卫,深入锅炉之心
      </p>
      <div class="seed-row">
        种子 <input id="seed-input" type="text" value="${defaultSeed}" maxlength="12"/>
      </div>
      <button class="btn" id="start-btn">启 动 引 擎</button>
    </div>
  `);
  layer().appendChild(screen);
  const input = screen.querySelector<HTMLInputElement>('#seed-input')!;
  screen.querySelector('#start-btn')!.addEventListener('click', () => {
    screen.remove();
    onStart(input.value.trim() || defaultSeed);
  });
}

export function showPause(onResume: () => void, onRestart: () => void): void {
  const screen = el(`
    <div class="screen">
      <h1>已 暂 停</h1>
      <h2>锅 炉 保 压 中</h2>
      <button class="btn" id="resume-btn">继 续</button>
      <button class="btn" id="restart-btn">重 新 开 始</button>
    </div>
  `);
  layer().appendChild(screen);
  screen.querySelector('#resume-btn')!.addEventListener('click', () => {
    screen.remove();
    onResume();
  });
  screen.querySelector('#restart-btn')!.addEventListener('click', () => {
    screen.remove();
    onRestart();
  });
}

export function showUpgradeChoice(upgrades: Upgrade[], onPick: (u: Upgrade) => void): void {
  const cards = upgrades
    .map(
      (u, i) => `
      <div class="upgrade-card" data-i="${i}">
        <div class="icon">${u.icon}</div>
        <div class="name">${u.name}</div>
        <div class="desc">${u.desc}</div>
      </div>`,
    )
    .join('');
  const screen = el(`
    <div class="screen">
      <h1>房 间 清 除</h1>
      <h2>选 择 一 项 改 装</h2>
      <div class="upgrade-cards">${cards}</div>
    </div>
  `);
  layer().appendChild(screen);
  screen.querySelectorAll('.upgrade-card').forEach((card) => {
    card.addEventListener('click', () => {
      const i = Number((card as HTMLElement).dataset.i);
      screen.remove();
      onPick(upgrades[i]);
    });
  });
}

export function showGameOver(
  stats: { floor: number; kills: number; timeSec: number; seed: string },
  onRestart: () => void,
): void {
  const mins = Math.floor(stats.timeSec / 60);
  const secs = Math.floor(stats.timeSec % 60);
  const screen = el(`
    <div class="screen">
      <h1>引 擎 熄 火</h1>
      <h2>你 的 机 壳 散 落 在 深 渊 中</h2>
      <p class="stats-line">
        到达层数:${stats.floor}<br/>
        击毁机械:${stats.kills}<br/>
        存活时间:${mins}分${secs}秒<br/>
        种子:${stats.seed}
      </p>
      <button class="btn" id="restart-btn">再 来 一 局</button>
    </div>
  `);
  layer().appendChild(screen);
  screen.querySelector('#restart-btn')!.addEventListener('click', () => {
    screen.remove();
    onRestart();
  });
}
