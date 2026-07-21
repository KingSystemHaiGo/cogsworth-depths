// 中英双语:所有玩家可见文案集中在这里
export type Lang = 'zh' | 'en';

const STORAGE_KEY = 'cogsworth-lang';

let current: Lang = (localStorage.getItem(STORAGE_KEY) as Lang) || 'zh';

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  localStorage.setItem(STORAGE_KEY, lang);
}

const TEXTS = {
  'game.subtitle': { zh: '蒸 汽 深 渊 · 程 序 化 肉 鸽', en: 'STEAM DEPTHS · PROCEDURAL ROGUELITE' },
  'game.controls': {
    zh: 'WASD / 方向键 移动 · 鼠标瞄准 · 左键射击<br/>空格 冲刺 · Shift 翻滚 · Esc 暂停<br/>清除每个房间的机械守卫,深入锅炉之心',
    en: 'WASD / Arrows move · Mouse aim · LMB fire<br/>Space dash · Shift roll · Esc pause<br/>Clear each room of clockwork guards, descend into the boiler heart',
  },
  'game.seed': { zh: '种子', en: 'Seed' },
  'game.start': { zh: '启 动 引 擎', en: 'START ENGINE' },
  'game.settings': { zh: '设 置', en: 'SETTINGS' },
  'game.back': { zh: '返 回', en: 'BACK' },

  'pause.title': { zh: '已 暂 停', en: 'PAUSED' },
  'pause.subtitle': { zh: '锅 炉 保 压 中', en: 'BOILER HOLDING PRESSURE' },
  'pause.resume': { zh: '继 续', en: 'RESUME' },
  'pause.restart': { zh: '重 新 开 始', en: 'RESTART' },

  'over.title': { zh: '引 擎 熄 火', en: 'ENGINE DEAD' },
  'over.subtitle': { zh: '你 的 机 壳 散 落 在 深 渊 中', en: 'YOUR HULL LIES SCATTERED IN THE DEPTHS' },
  'over.floor': { zh: '到达层数', en: 'Floor reached' },
  'over.kills': { zh: '击毁机械', en: 'Machines destroyed' },
  'over.time': { zh: '存活时间', en: 'Time survived' },
  'over.seed': { zh: '种子', en: 'Seed' },
  'over.again': { zh: '再 来 一 局', en: 'RUN IT BACK' },
  'over.min': { zh: '分', en: 'm ' },
  'over.sec': { zh: '秒', en: 's' },

  'upgrade.title': { zh: '房 间 清 除', en: 'ROOM CLEARED' },
  'upgrade.subtitle': { zh: '— 选 择 一 项 改 装 (1/2/3) —', en: '— CHOOSE AN UPGRADE (1/2/3) —' },

  'settings.title': { zh: '设 置', en: 'SETTINGS' },
  'settings.lang': { zh: '语言 / Language', en: 'Language / 语言' },
  'settings.music': { zh: '音乐音量', en: 'Music volume' },
  'settings.sfx': { zh: '音效音量', en: 'SFX volume' },

  'room.start': { zh: '出发大厅', en: 'Departure Hall' },
  'room.boss': { zh: 'Boss 房', en: 'Boss Room' },
  'room.treasure': { zh: '宝箱房', en: 'Treasure Room' },
  'room.shop': { zh: '齿轮商店', en: 'Cog Shop' },
  'room.cleared': { zh: '已清除的房间', en: 'Cleared room' },
  'room.combat': { zh: '战斗中!', en: 'In combat!' },
  'hud.floor': { zh: '第 {n} 层', en: 'Floor {n}' },
  'hud.combo': { zh: '连击', en: 'combo' },
  'hud.wave': { zh: '第 {a}/{b} 波', en: 'Wave {a}/{b}' },

  'boss.name': { zh: '锅炉魔像 · 柯格斯沃斯', en: 'Boiler Golem · COGSWORTH' },

  'shop.chest': { zh: '⚙ 改装宝箱', en: '⚙ Upgrade Chest' },
  'shop.noCogs': { zh: '齿轮币不足', en: 'Not enough cogs' },
  'shop.heal': { zh: '回复 {n} 生命', en: 'Heal {n} HP' },
  'shop.upgrade': { zh: '随机改装', en: 'Random upgrade' },
  'shop.maxHp': { zh: '生命上限 +{n}', en: 'Max HP +{n}' },
  'shop.got': { zh: '获得:{n}', en: 'Got: {n}' },
} as const;

export type TextKey = keyof typeof TEXTS;

export function t(key: TextKey, vars?: Record<string, string | number>): string {
  let s: string = TEXTS[key][current];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(`{${k}}`, String(v));
    }
  }
  return s;
}

/** 双语文案对象(升级名称/描述用) */
export interface LText {
  zh: string;
  en: string;
}

export function lt(text: LText): string {
  return text[current];
}
