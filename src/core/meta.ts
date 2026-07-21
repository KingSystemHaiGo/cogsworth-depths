// 局外成长:齿轮残片(每局结算获得)+ 改装间永久升级,localStorage 持久化
// 参考 Hades 夜之镜:残片不会因死亡丢失,每次开局都更强一点
import type { LText } from './i18n.ts';

const KEY = 'cogsworth-meta';

export interface MetaState {
  scrap: number;
  upgrades: Record<string, number>; // id -> 已购等级
}

export interface MetaUpgrade {
  id: string;
  name: LText;
  desc: LText;
  maxLevel: number;
  cost: (level: number) => number; // 下一级价格
}

export const META_UPGRADES: MetaUpgrade[] = [
  {
    id: 'hull',
    name: { zh: '强化机壳', en: 'Reinforced Hull' },
    desc: { zh: '每局开局生命上限 +25', en: 'Start each run with +25 max HP' },
    maxLevel: 2,
    cost: (l) => [20, 40][l] ?? 999,
  },
  {
    id: 'spares',
    name: { zh: '备用齿轮', en: 'Spare Cogs' },
    desc: { zh: '每局开局携带齿轮币 +5', en: 'Start each run with +5 cogs' },
    maxLevel: 2,
    cost: (l) => [15, 30][l] ?? 999,
  },
  {
    id: 'boiler',
    name: { zh: '高效锅炉', en: 'Efficient Boiler' },
    desc: { zh: '冲刺与翻滚冷却 -15%', en: 'Dash & roll cooldown -15%' },
    maxLevel: 2,
    cost: (l) => [25, 50][l] ?? 999,
  },
  {
    id: 'sparehull',
    name: { zh: '备用机壳', en: 'Spare Hull' },
    desc: { zh: '每局限一次:致命伤害后以 50% 血量复活', en: 'Once per run: revive at 50% HP from a fatal hit' },
    maxLevel: 1,
    cost: () => 80,
  },
];

export function loadMeta(): MetaState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as MetaState;
  } catch {
    /* 忽略 */
  }
  return { scrap: 0, upgrades: {} };
}

export function saveMeta(meta: MetaState): void {
  localStorage.setItem(KEY, JSON.stringify(meta));
}

/** 一局结算:击杀×1 + 到达层数×15 + Boss 击杀×50 */
export function awardScrap(kills: number, floor: number, bossKills: number): number {
  return kills + (floor - 1) * 15 + bossKills * 50;
}
