// 升级池:每次清房后三选一,支持多级堆叠(maxStacks 上限)
import type { LText } from '../core/i18n.ts';

export interface PlayerStats {
  damage: number;
  fireRate: number;
  speed: number;
  bulletSpeed: number;
  multiShot: number; // 额外弹道数
  pierce: number; // 穿透次数
  maxHp: number;
  lifeSteal: number; // 击杀回血
  bulletScale: number;
  bounce: number; // 子弹墙面弹射次数
  shield: number; // 蒸汽护盾层数(>0 拥有)
  pet: number; // 齿轮宠物数量
  boom: number; // 爆裂弹头等级(子弹命中爆炸)
  scavenger: number; // 拾荒协议(磁吸范围+齿轮币加成)
}

export interface Upgrade {
  id: string;
  icon: string;
  name: LText;
  desc: LText;
  /** 堆叠上限,Infinity = 不限 */
  maxStacks: number;
  apply: (s: PlayerStats, heal: (n: number) => void) => void;
}

export const UPGRADES: Upgrade[] = [
  {
    id: 'damage',
    maxStacks: Infinity,
    icon: '⚙',
    name: { zh: '双倍齿轮', en: 'Twin Gears' },
    desc: { zh: '伤害 +30%', en: 'Damage +30%' },
    apply: (s) => (s.damage *= 1.3),
  },
  {
    id: 'firerate',
    maxStacks: Infinity,
    icon: '⟳',
    name: { zh: '超速发条', en: 'Overclock Spring' },
    desc: { zh: '射速 +25%', en: 'Fire rate +25%' },
    apply: (s) => (s.fireRate *= 1.25),
  },
  {
    id: 'speed',
    maxStacks: Infinity,
    icon: '➤',
    name: { zh: '蒸汽推进', en: 'Steam Thrusters' },
    desc: { zh: '移动速度 +15%', en: 'Move speed +15%' },
    apply: (s) => (s.speed *= 1.15),
  },
  {
    id: 'multishot',
    maxStacks: 4,
    icon: '⋔',
    name: { zh: '分裂阀', en: 'Splitter Valve' },
    desc: { zh: '额外发射 1 发子弹', en: 'Fire 1 extra bullet' },
    apply: (s) => (s.multiShot += 1),
  },
  {
    id: 'pierce',
    maxStacks: 3,
    icon: '⇶',
    name: { zh: '贯穿弹头', en: 'Piercing Rounds' },
    desc: { zh: '子弹穿透 +1 个敌人', en: 'Bullets pierce +1 enemy' },
    apply: (s) => (s.pierce += 1),
  },
  {
    id: 'hp',
    maxStacks: Infinity,
    icon: '♥',
    name: { zh: '加固锅炉', en: 'Reinforced Boiler' },
    desc: { zh: '生命上限 +30 并回复 30', en: 'Max HP +30 and heal 30' },
    apply: (s, heal) => {
      s.maxHp += 30;
      heal(30);
    },
  },
  {
    id: 'bulletspeed',
    maxStacks: 6,
    icon: '✦',
    name: { zh: '高压弹仓', en: 'High-Pressure Chamber' },
    desc: { zh: '弹速 +30%,子弹变大', en: 'Bullet speed +30%, bigger bullets' },
    apply: (s) => {
      s.bulletSpeed *= 1.3;
      s.bulletScale *= 1.2;
    },
  },
  {
    id: 'lifesteal',
    maxStacks: 5,
    icon: '♨',
    name: { zh: '吸血虹吸', en: 'Siphon Valve' },
    desc: { zh: '每次击杀回复 3 点生命', en: 'Heal 3 HP per kill' },
    apply: (s) => (s.lifeSteal += 3),
  },
  {
    id: 'bounce',
    maxStacks: 2,
    icon: '↯',
    name: { zh: '弹射弹头', en: 'Ricochet Rounds' },
    desc: { zh: '子弹可弹射 1 次墙壁', en: 'Bullets bounce off walls once' },
    apply: (s) => (s.bounce += 1),
  },
  {
    id: 'shield',
    maxStacks: 1,
    icon: '◈',
    name: { zh: '蒸汽护盾', en: 'Steam Aegis' },
    desc: { zh: '完全抵挡一次伤害,12 秒后重新充能', en: 'Block one hit fully. Recharges in 12s' },
    apply: (s) => (s.shield += 1),
  },
  {
    id: 'pet',
    maxStacks: 3,
    icon: '✺',
    name: { zh: '齿轮宠物', en: 'Gear Familiar' },
    desc: { zh: '环绕的齿轮:接触伤害敌人并挡下敌弹', en: 'Orbiting gear: hurts enemies and blocks shots' },
    apply: (s) => (s.pet += 1),
  },
  {
    id: 'boom',
    maxStacks: 2,
    icon: '✹',
    name: { zh: '爆裂弹头', en: 'Burst Rounds' },
    desc: { zh: '子弹命中时爆炸,波及周围敌人', en: 'Bullets explode on hit, splashing nearby enemies' },
    apply: (s) => (s.boom += 1),
  },
  {
    id: 'scavenger',
    maxStacks: 2,
    icon: '⚿',
    name: { zh: '拾荒协议', en: 'Scavenger Protocol' },
    desc: { zh: '拾取磁吸范围 +50%,齿轮币掉率提升', en: 'Pickup magnet range +50%, more cog drops' },
    apply: (s) => (s.scavenger += 1),
  },
];

/** 从池中抽 n 个不重复升级;已达堆叠上限的升级不再出现 */
export function drawUpgrades(
  n: number,
  rngPick: <T>(arr: readonly T[]) => T,
  owned?: ReadonlyMap<string, number>,
): Upgrade[] {
  const pool = UPGRADES.filter((u) => (owned?.get(u.id) ?? 0) < u.maxStacks);
  const out: Upgrade[] = [];
  while (out.length < n && pool.length > 0) {
    const pick = rngPick(pool);
    out.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  return out;
}
