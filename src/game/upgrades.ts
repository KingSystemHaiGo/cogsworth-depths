// 升级池:每次清房后三选一
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
}

export interface Upgrade {
  id: string;
  icon: string;
  name: string;
  desc: string;
  /** 堆叠上限,Infinity = 不限 */
  maxStacks: number;
  apply: (s: PlayerStats, heal: (n: number) => void) => void;
}

export const UPGRADES: Upgrade[] = [
  {
    id: 'damage',
    maxStacks: Infinity,
    icon: '⚙',
    name: '双倍齿轮',
    desc: '伤害 +30%',
    apply: (s) => (s.damage *= 1.3),
  },
  {
    id: 'firerate',
    maxStacks: Infinity,
    icon: '⟳',
    name: '超速发条',
    desc: '射速 +25%',
    apply: (s) => (s.fireRate *= 1.25),
  },
  {
    id: 'speed',
    maxStacks: Infinity,
    icon: '➤',
    name: '蒸汽推进',
    desc: '移动速度 +15%',
    apply: (s) => (s.speed *= 1.15),
  },
  {
    id: 'multishot',
    maxStacks: 4,
    icon: '⋔',
    name: '分裂阀',
    desc: '额外发射 1 发子弹',
    apply: (s) => (s.multiShot += 1),
  },
  {
    id: 'pierce',
    maxStacks: 3,
    icon: '⇶',
    name: '贯穿弹头',
    desc: '子弹穿透 +1 个敌人',
    apply: (s) => (s.pierce += 1),
  },
  {
    id: 'hp',
    maxStacks: Infinity,
    icon: '♥',
    name: '加固锅炉',
    desc: '生命上限 +30 并回复 30',
    apply: (s, heal) => {
      s.maxHp += 30;
      heal(30);
    },
  },
  {
    id: 'bulletspeed',
    maxStacks: 6,
    icon: '✦',
    name: '高压弹仓',
    desc: '弹速 +30%,子弹变大',
    apply: (s) => {
      s.bulletSpeed *= 1.3;
      s.bulletScale *= 1.2;
    },
  },
  {
    id: 'lifesteal',
    maxStacks: 5,
    icon: '♨',
    name: '吸血虹吸',
    desc: '每次击杀回复 3 点生命',
    apply: (s) => (s.lifeSteal += 3),
  },
  {
    id: 'bounce',
    maxStacks: 2,
    icon: '↯',
    name: '弹射弹头',
    desc: '子弹可弹射 1 次墙壁',
    apply: (s) => (s.bounce += 1),
  },
  {
    id: 'shield',
    maxStacks: 1,
    icon: '◈',
    name: '蒸汽护盾',
    desc: '完全抵挡一次伤害,12 秒后重新充能',
    apply: (s) => (s.shield += 1),
  },
  {
    id: 'pet',
    maxStacks: 3,
    icon: '✺',
    name: '齿轮宠物',
    desc: '环绕的齿轮:接触伤害敌人并挡下敌弹',
    apply: (s) => (s.pet += 1),
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
