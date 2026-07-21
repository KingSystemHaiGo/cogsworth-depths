// 图鉴(蒸汽手账):敌人/改装收集册,击杀与拾取自动解锁,localStorage 持久化
import type { LText } from './i18n.ts';

const KEY = 'cogsworth-codex';

export interface CodexState {
  /** 敌人:kind -> 击杀数 */
  kills: Record<string, number>;
  /** 已获得的升级 id */
  upgrades: string[];
}

export function loadCodex(): CodexState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as CodexState;
  } catch {
    /* 忽略 */
  }
  return { kills: {}, upgrades: [] };
}

export function saveCodex(state: CodexState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

/** 敌人图鉴文案(双语) */
export const ENEMY_LORE: Record<string, { name: LText; desc: LText }> = {
  chaser: {
    name: { zh: '发条蜘蛛', en: 'Wind-up Spider' },
    desc: { zh: '批量生产的最廉价守卫,背后发条钥匙永不停歇。', en: 'Cheapest guards in mass production. The key on its back never stops.' },
  },
  shooter: {
    name: { zh: '哨戒炮', en: 'Sentry Turret' },
    desc: { zh: '固定在原位的火力点,懂得保持距离的聪明家伙。', en: 'A stationary gun smart enough to keep its distance.' },
  },
  bomber: {
    name: { zh: '自走锅炉', en: 'Walking Boiler' },
    desc: { zh: '压力超载的移动炸弹,炉心烧红时快跑。', en: 'An over-pressurized bomb on legs. Run when the core glows red.' },
  },
  dasher: {
    name: { zh: '弹簧跳蚤', en: 'Spring Flea' },
    desc: { zh: '蹲下就是要扑了——横向翻滚是唯一的礼貌回应。', en: 'A crouch means a pounce. A sideways roll is the polite reply.' },
  },
  splitter: {
    name: { zh: '分裂球', en: 'Splitter Orb' },
    desc: { zh: '一颗会裂成两颗的铁蛋,接缝发光时最危险。', en: 'An iron egg that splits in two. Most dangerous when the seam glows.' },
  },
  mini: {
    name: { zh: '小发条蛛', en: 'Clockwork Spiderling' },
    desc: { zh: '分裂球的子代,跑得比它们的母亲快得多。', en: 'Offspring of the splitter, much faster than their mother.' },
  },
  warden: {
    name: { zh: '盾卫', en: 'Shield Warden' },
    desc: { zh: '正面几乎无敌的重甲,转身慢是它的死穴。', en: 'Heavy armor, near-immune from the front. Its slow turn is the weakness.' },
  },
  mortar: {
    name: { zh: '迫击手', en: 'Mortarhand' },
    desc: { zh: '矮胖的抛物线专家,落点红圈是最后的警告。', en: 'A stubby ballistics expert. The red ring is your last warning.' },
  },
  sniper: {
    name: { zh: '钟表狙击手', en: 'Clockwork Sniper' },
    desc: { zh: '激光亮起的 1.2 秒,是你唯一的逃生窗口。', en: 'The 1.2s laser charge is your only window to dodge.' },
  },
  tinker: {
    name: { zh: '修补无人机', en: 'Tinker Drone' },
    desc: { zh: '战地医生,先打它,否则战斗永远打不完。', en: 'A field medic. Kill it first, or the fight never ends.' },
  },
  boss: {
    name: { zh: '锅炉魔像 · 柯格斯沃斯', en: 'Boiler Golem Cogsworth' },
    desc: { zh: '深渊动力核心失控后凝聚的钢铁怒意。', en: 'Steel fury condensed from the runaway power core of the depths.' },
  },
  ringmaster: {
    name: { zh: '人偶剧团长 · 玛戈', en: 'Ringmaster Margot' },
    desc: { zh: '为不存在的观众导演了十年的木偶大师。', en: 'A puppet master who has directed for an empty house for ten years.' },
  },
  colossus: {
    name: { zh: '钟表巨像 · 克罗诺斯', en: 'Chron Colossus Kronos' },
    desc: { zh: '它不快,但时间站在它那边。', en: 'It is not fast. But time is on its side.' },
  },
};
