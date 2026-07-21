// 数值配置表:所有游戏数值集中在这里,难度曲线用多项式缩放
// 调整平衡时只改这个文件,不要散落在逻辑里硬编码

export const BALANCE = {
  player: {
    hp: 100,
    speed: 8.5,
    fireRate: 3.2,
    damage: 12,
    bulletSpeed: 22,
    bulletLife: 1.4,
    dashCd: 0.9,
    rollCd: 1.2,
    invulnAfterHit: 0.7,
  },

  // 敌人基础数值(floor=1)
  enemies: {
    chaser: { hp: 30, speed: 4.2, r: 0.55, dmg: 12 },
    shooter: { hp: 40, speed: 2.4, r: 0.6, dmg: 10 },
    bomber: { hp: 25, speed: 3.4, r: 0.5, dmg: 25 },
    dasher: { hp: 35, speed: 2.8, r: 0.55, dmg: 16 },
    splitter: { hp: 60, speed: 2.6, r: 0.8, dmg: 14 },
    mini: { hp: 12, speed: 5.2, r: 0.3, dmg: 8 },
    warden: { hp: 90, speed: 1.5, r: 0.75, dmg: 18 },
    mortar: { hp: 45, speed: 2.0, r: 0.6, dmg: 16 },
    boss: { hp: 950, speed: 1.8, r: 1.6, dmg: 20 },
  },

  /** 难度曲线:血量按二次多项式增长(前期平缓,后期陡峭) */
  hpScale(floor: number): number {
    const f = floor - 1;
    return 1 + 0.22 * f + 0.05 * f * f;
  },

  /** 伤害按线性缓慢增长 */
  dmgScale(floor: number): number {
    return 1 + 0.08 * (floor - 1);
  },

  /** Boss 血量曲线:高基数 + 每层大幅增加,保证二阶段能打完 */
  bossHp(floor: number): number {
    return 950 + 420 * (floor - 1);
  },

  /** 每层房间数 */
  roomCount(floor: number): number {
    return 5 + Math.min(3, floor);
  },

  /** 每房敌人数量(基础值 + 随机 0~2) */
  spawnCount(floor: number, rngInt: (a: number, b: number) => number): number {
    return 3 + floor + rngInt(0, 2);
  },

  drops: {
    heartChance: 0.15,
    cogChance: 0.3,
    heartHeal: 15,
    bossCogs: 8,
    /** 磁吸:进入此半径的掉落物加速飞向玩家 */
    magnetRadius: 3.4,
    magnetSpeed: 16,
  },

  shop: {
    heal: { cost: 3, amount: 40 },
    upgrade: { cost: 8 },
    maxHp: { cost: 6, amount: 15 },
  },

  pet: {
    orbitRadius: 1.4,
    orbitSpeed: 2.6,
    tickInterval: 0.35,
    dmgBase: 10,
    dmgRatio: 0.3, // 占玩家攻击力比例
    blockRadius: 0.55,
  },

  mortar: {
    shellDur: 1.1, // 炮弹飞行时间
    radius: 2.2, // 落点爆炸半径
    fireCd: 3.2,
    arcHeight: 3.5,
  },

  shield: {
    recharge: 12,
  },

  combo: {
    window: 3,
  },
} as const;
