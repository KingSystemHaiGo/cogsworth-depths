// DOM 界面层:标题 / 暂停 / 设置 / 结算(全部双语)
import { t, getLang, setLang, Lang, lt } from '../core/i18n.ts';
import { MetaState, META_UPGRADES } from '../core/meta.ts';

const layer = () => document.getElementById('ui-layer')!;

function el(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html.trim();
  return div.firstElementChild as HTMLElement;
}

export function showTitle(
  defaultSeed: string,
  onStart: (seed: string) => void,
  onSettings: () => void,
  onWorkshop: () => void,
  onDaily: () => void,
  scrapCount: number,
  dailyBest: number | null,
): void {
  const screen = el(`
    <div class="screen">
      <h1>COGSWORTH DEPTHS</h1>
      <h2>${t('game.subtitle')}</h2>
      <p class="stats-line">${t('game.controls')}</p>
      <div class="seed-row">
        ${t('game.seed')} <input id="seed-input" type="text" value="${defaultSeed}" maxlength="12"/>
      </div>
      <button class="btn" id="start-btn">${t('game.start')}</button>
      <button class="btn" id="daily-btn">${t('game.daily')}</button>
      <div class="seed-row">${dailyBest !== null ? t('daily.best', { n: dailyBest }) : ''}</div>
      <button class="btn btn-sub" id="workshop-btn">${t('game.workshop')} ⚙${scrapCount}</button>
      <button class="btn btn-sub" id="settings-btn">${t('game.settings')}</button>
    </div>
  `);
  layer().appendChild(screen);
  const input = screen.querySelector<HTMLInputElement>('#seed-input')!;
  screen.querySelector('#start-btn')!.addEventListener('click', () => {
    screen.remove();
    onStart(input.value.trim() || defaultSeed);
  });
  screen.querySelector('#daily-btn')!.addEventListener('click', () => {
    screen.remove();
    onDaily();
  });
  screen.querySelector('#workshop-btn')!.addEventListener('click', () => {
    screen.remove();
    onWorkshop();
  });
  screen.querySelector('#settings-btn')!.addEventListener('click', () => {
    screen.remove();
    onSettings();
  });
}

/** 改装间:用齿轮残片购买永久升级(局外成长) */
export function showWorkshop(
  meta: MetaState,
  onBuy: (id: string) => void,
  onBack: () => void,
): void {
  const cards = META_UPGRADES.map((u) => {
    const lv = meta.upgrades[u.id] ?? 0;
    const maxed = lv >= u.maxLevel;
    const cost = maxed ? null : u.cost(lv);
    const affordable = cost !== null && meta.scrap >= cost;
    return `
      <div class="upgrade-card ${maxed || !affordable ? 'disabled' : ''}" data-id="${u.id}">
        <div class="name">${lt(u.name)} <span class="lv">${lv}/${u.maxLevel}</span></div>
        <div class="desc">${lt(u.desc)}</div>
        <div class="price">${maxed ? t('meta.maxed') : `⚙${cost}`}</div>
      </div>`;
  }).join('');
  const screen = el(`
    <div class="screen">
      <h1>${t('meta.title')}</h1>
      <h2>${t('meta.subtitle', { n: meta.scrap })}</h2>
      <div class="upgrade-cards">${cards}</div>
      <button class="btn" id="back-btn">${t('game.back')}</button>
    </div>
  `);
  layer().appendChild(screen);
  screen.querySelectorAll('.upgrade-card').forEach((card) => {
    card.addEventListener('click', () => {
      const id = (card as HTMLElement).dataset.id!;
      onBuy(id);
    });
  });
  screen.querySelector('#back-btn')!.addEventListener('click', () => {
    screen.remove();
    onBack();
  });
}

export function showPause(onResume: () => void, onRestart: () => void, onSettings: () => void): void {
  const screen = el(`
    <div class="screen">
      <h1>${t('pause.title')}</h1>
      <h2>${t('pause.subtitle')}</h2>
      <button class="btn" id="resume-btn">${t('pause.resume')}</button>
      <button class="btn" id="settings-btn">${t('game.settings')}</button>
      <button class="btn" id="restart-btn">${t('pause.restart')}</button>
    </div>
  `);
  layer().appendChild(screen);
  screen.querySelector('#resume-btn')!.addEventListener('click', () => {
    screen.remove();
    onResume();
  });
  screen.querySelector('#settings-btn')!.addEventListener('click', () => {
    screen.remove();
    onSettings();
  });
  screen.querySelector('#restart-btn')!.addEventListener('click', () => {
    screen.remove();
    onRestart();
  });
}

export interface SettingsValues {
  musicVolume: number;
  sfxVolume: number;
}

/** 设置页:语言切换 + 音乐/音效音量 */
export function showSettings(
  values: SettingsValues,
  onChange: (v: SettingsValues) => void,
  onBack: () => void,
): void {
  const screen = el(`
    <div class="screen">
      <h1>${t('settings.title')}</h1>
      <div class="setting-row">
        <label>${t('settings.lang')}</label>
        <div class="lang-toggle">
          <button class="btn btn-sub" id="lang-zh">中文</button>
          <button class="btn btn-sub" id="lang-en">EN</button>
        </div>
      </div>
      <div class="setting-row">
        <label>${t('settings.music')}</label>
        <input type="range" id="vol-music" min="0" max="100" value="${Math.round(values.musicVolume * 100)}"/>
        <span id="vol-music-val">${Math.round(values.musicVolume * 100)}</span>
      </div>
      <div class="setting-row">
        <label>${t('settings.sfx')}</label>
        <input type="range" id="vol-sfx" min="0" max="100" value="${Math.round(values.sfxVolume * 100)}"/>
        <span id="vol-sfx-val">${Math.round(values.sfxVolume * 100)}</span>
      </div>
      <button class="btn" id="back-btn">${t('game.back')}</button>
    </div>
  `);
  layer().appendChild(screen);

  const current = { ...values };
  const emit = () => onChange({ ...current });

  const musicInput = screen.querySelector<HTMLInputElement>('#vol-music')!;
  const sfxInput = screen.querySelector<HTMLInputElement>('#vol-sfx')!;
  musicInput.addEventListener('input', () => {
    current.musicVolume = Number(musicInput.value) / 100;
    screen.querySelector('#vol-music-val')!.textContent = musicInput.value;
    emit();
  });
  sfxInput.addEventListener('input', () => {
    current.sfxVolume = Number(sfxInput.value) / 100;
    screen.querySelector('#vol-sfx-val')!.textContent = sfxInput.value;
    emit();
  });

  const markLang = () => {
    screen.querySelector('#lang-zh')!.classList.toggle('active', getLang() === 'zh');
    screen.querySelector('#lang-en')!.classList.toggle('active', getLang() === 'en');
  };
  markLang();
  screen.querySelector('#lang-zh')!.addEventListener('click', () => {
    setLang('zh' as Lang);
    screen.remove();
    showSettings(current, onChange, onBack); // 重绘以应用新语言
  });
  screen.querySelector('#lang-en')!.addEventListener('click', () => {
    setLang('en' as Lang);
    screen.remove();
    showSettings(current, onChange, onBack);
  });

  screen.querySelector('#back-btn')!.addEventListener('click', () => {
    screen.remove();
    onBack();
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
      <h1>${t('over.title')}</h1>
      <h2>${t('over.subtitle')}</h2>
      <p class="stats-line">
        ${t('over.floor')}:${stats.floor}<br/>
        ${t('over.kills')}:${stats.kills}<br/>
        ${t('over.time')}:${mins}${t('over.min')}${secs}${t('over.sec')}<br/>
        ${t('over.seed')}:${stats.seed}
      </p>
      <button class="btn" id="restart-btn">${t('over.again')}</button>
    </div>
  `);
  layer().appendChild(screen);
  screen.querySelector('#restart-btn')!.addEventListener('click', () => {
    screen.remove();
    onRestart();
  });
}
