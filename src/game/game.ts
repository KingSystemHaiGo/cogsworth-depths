// 游戏主逻辑:实体、战斗、房间流转、肉鸽循环
import * as THREE from 'three';
import { RNG } from '../core/rng.ts';
import { Input } from '../core/input.ts';
import { CONFIG, PALETTE } from '../core/config.ts';
import { ThreeStage } from '../three/scene.ts';
import { Room, DoorSide } from '../three/room.ts';
import { makePlayerMesh, makeEnemyMesh, EnemyKind } from '../three/actors.ts';
import { makeGear } from '../three/factory/gears.ts';
import { SteamVent } from '../three/factory/steam.ts';
import { BulletPool, Bullet } from '../three/bulletPool.ts';
import { generateFloor, Floor, RoomNode } from './rooms.ts';
import { BALANCE, WeaponId, WEAPON_ORDER } from './balance.ts';
import { t, lt } from '../core/i18n.ts';
import { loadMeta } from '../core/meta.ts';
import { loadCodex, saveCodex, CodexState } from '../core/codex.ts';
import { PlayerStats, Upgrade, drawUpgrades } from './upgrades.ts';
import { Overlay } from '../pixi/overlay.ts';
import { synth } from '../audio/synth.ts';
import { music } from '../audio/music.ts';

export type GameState = 'title' | 'playing' | 'paused' | 'upgrading' | 'dead';

interface Enemy {
  kind: EnemyKind;
  mesh: THREE.Group;
  x: number;
  z: number;
  vx: number;
  vz: number;
  kbx: number; // 受击击退速度
  kbz: number;
  hp: number;
  maxHp: number;
  r: number;
  speed: number;
  dmg: number;
  fireCd: number;
  fuse: number; // bomber 引信,-1 未点燃
  stateT: number; // boss 状态计时
  phase: number; // boss 阶段
  enraged: boolean; // boss 二阶段
  spawnT: number; // 出生入场动画剩余时间
  hitPop: number; // 受击挤压脉冲 0..1
  affix: 'swift' | 'splitting' | 'shielded' | null;
  dmgTaken: number; // 承伤系数(坚盾 0.5)
}

interface Drop {
  mesh: THREE.Mesh;
  x: number;
  z: number;
  t: number;
  kind: 'heart' | 'cog';
}

interface Pet {
  mesh: THREE.Group;
  angle: number;
}

interface Interactive {
  x: number;
  z: number;
  r: number;
  kind: 'chest' | 'shopItem';
  cost: number;
  label: string;
  mesh: THREE.Group;
  used: boolean;
  effect: () => void;
}


export class Game {
  state: GameState = 'title';
  seed = '';
  floorIndex = 1;
  kills = 0;
  bossKills = 0;
  timeSec = 0;
  private reviveUsed = false;
  private codex: CodexState = loadCodex();

  private rng = new RNG('init');
  private floor: Floor | null = null;
  private currentNode: RoomNode | null = null;
  private room: Room | null = null;

  private player = {
    mesh: null as THREE.Group | null,
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    hp: CONFIG.playerHp,
    fireCd: 0,
    invuln: 0,
    muzzleT: 0,
    shieldUp: false,
    shieldCd: 0,
    slowT: 0,
    aimX: 1,
    aimZ: 0,
  };
  stats: PlayerStats = this.baseStats();

  private enemies: Enemy[] = [];
  /** 敌人网格对象池:生成/死亡复用,避免 GC 与重复构造 */
  private meshPool = new Map<EnemyKind, THREE.Group[]>();
  private pendingSpawns: { kind: EnemyKind; x: number; z: number; t: number; affix: Enemy['affix'] }[] = [];
  private wavesTotal = 0;
  private challengeTimer = -1;
  private weapon: WeaponId = 'steamgun';
  private qHeld = false;
  private wavesDone = 0;
  private waveSize = 0;
  private waveBreather = 0;
  private dying: { mesh: THREE.Group; kind: EnemyKind; t: number }[] = [];
  private playerBullets: BulletPool;
  private enemyBullets: BulletPool;
  private drops: Drop[] = [];
  private pets: Pet[] = [];
  private petTick = 0;
  private petShootCd = 0;
  private interactives: Interactive[] = [];
  private mortarShells: { sx: number; sz: number; tx: number; tz: number; x: number; z: number; t: number; mesh: THREE.Mesh }[] = [];
  /** 蒸汽喷射机关:周期性喷发的地面喷口 */
  private steamJets: { x: number; z: number; vent: SteamVent; timer: number; phase: number }[] = [];
  cogs = 0; // 齿轮币
  private exitPortal: THREE.Group | null = null;
  private dashT = 0;
  private dashCd = 0;
  private dashX = 0;
  private dashZ = 0;
  private rollT = 0;
  private rollCd = 0;
  private rollX = 0;
  private rollZ = 0;
  private stridePhase = 0; // 步幅相位(随位移推进)
  private comboCount = 0;
  private comboTimer = 0;
  private enemyHpList: { x: number; z: number; ratio: number }[] = [];
  private upgradeCounts = new Map<string, number>();

  constructor(
    private stage: ThreeStage,
    private overlay: Overlay,
    private input: Input,
    private onGameOver: () => void,
  ) {
    // 子弹池:实例化渲染,双方子弹各 1 次 draw call
    this.playerBullets = new BulletPool(stage.scene, PALETTE.playerBullet, 0.14, 128);
    this.enemyBullets = new BulletPool(stage.scene, PALETTE.enemyBullet, 0.17, 256);
  }

  private baseStats(): PlayerStats {
    return {
      damage: CONFIG.bulletDamage,
      fireRate: CONFIG.fireRate,
      speed: CONFIG.playerSpeed,
      bulletSpeed: CONFIG.bulletSpeed,
      multiShot: 0,
      pierce: 0,
      maxHp: CONFIG.playerHp,
      lifeSteal: 0,
      bulletScale: 1,
      bounce: 0,
      shield: 0,
      pet: 0,
      boom: 0,
      scavenger: 0,
      boomBounce: 0,
      petShoot: 0,
    };
  }

  get hpRatio(): number {
    return this.player.hp / this.stats.maxHp;
  }

  // ---------- 开局 / 楼层 ----------

  start(seed: string): void {
    this.seed = seed;
    this.floorIndex = 1;
    this.kills = 0;
    this.bossKills = 0;
    this.timeSec = 0;
    this.stats = this.baseStats();
    this.upgradeCounts.clear();
    // 局外成长生效
    const meta = loadMeta();
    const hullLv = meta.upgrades['hull'] ?? 0;
    if (hullLv > 0) this.stats.maxHp += 25 * hullLv;
    this.cogs = 5 * (meta.upgrades['spares'] ?? 0);
    this.reviveUsed = false;
    this.player.hp = this.stats.maxHp;
    this.player.shieldUp = false;
    this.player.shieldCd = 0;
    for (const pet of this.pets) this.stage.scene.remove(pet.mesh);
    this.pets = [];
    this.newFloor();
    this.state = 'playing';
    this.overlay.setCrosshairVisible(true);
    this.overlay.setWeapon(this.weapon);
  }

  private newFloor(): void {
    this.rng = new RNG(`${this.seed}#${this.floorIndex}`);
    const roomCount = BALANCE.roomCount(this.floorIndex);
    this.floor = generateFloor(this.rng, roomCount);
    this.loadRoom(this.floor.startId, null);
    // 楼层剧情横幅:层名 + 疫医日志
    const fi = Math.min(this.floorIndex, 4);
    const key = `floor.${fi}` as 'floor.1' | 'floor.2' | 'floor.3' | 'floor.4';
    const loreKey = `${key}.lore` as 'floor.1.lore' | 'floor.2.lore' | 'floor.3.lore' | 'floor.4.lore';
    this.overlay.banner(t(key), t(loreKey), 0xe8c877);
  }

  private loadRoom(nodeId: number, enterFrom: DoorSide | null): void {
    if (!this.floor) return;
    // 离开前保存波次进度(中途离开再回来不重打已过的波次)
    if (this.currentNode && !this.currentNode.cleared) {
      this.currentNode.wavesSpawned = this.wavesDone;
      this.currentNode.waveSize = this.waveSize;
    }
    // 清理旧房间
    if (this.room) this.stage.scene.remove(this.room.group);
    for (const e of this.enemies) this.releaseMesh(e.kind, e.mesh);
    this.enemies = [];
    this.pendingSpawns = [];
    for (const d of this.dying) this.releaseMesh(d.kind, d.mesh);
    this.dying = [];
    for (const d of this.drops) this.stage.scene.remove(d.mesh);
    this.drops = [];
    for (const it of this.interactives) this.stage.scene.remove(it.mesh);
    this.interactives = [];
    this.affordWarned.clear();
    for (const s of this.mortarShells) this.stage.scene.remove(s.mesh);
    this.mortarShells = [];
    for (const j of this.steamJets) this.stage.scene.remove(j.vent);
    this.steamJets = [];
    this.clearBullets();
    if (this.exitPortal) {
      this.stage.scene.remove(this.exitPortal);
      this.exitPortal = null;
    }
    this.overlay.clearFx();
    this.overlay.hideBossHp();

    const node = this.floor.rooms[nodeId];
    this.currentNode = node;
    const doorSides = Object.keys(node.links) as DoorSide[];
    this.room = new Room(this.rng, doorSides);
    this.stage.scene.add(this.room.group);
    this.room.setAllDoors(node.cleared);

    // 玩家进场位置:从进入方向的门内走出来
    const enter = enterFrom ? this.entryPos(enterFrom) : { x: 0, z: 0 };
    this.player.x = enter.x;
    this.player.z = enter.z;
    if (!this.player.mesh) {
      this.player.mesh = makePlayerMesh();
      this.stage.scene.add(this.player.mesh);
    }

    // 只有战斗房和 Boss 房生成波次;宝箱/商店不生成怪物,也不该有预警
    if (!node.cleared && (node.kind === 'normal' || node.kind === 'boss' || node.kind === 'challenge')) {
      this.startWaves(node);
      if (node.kind === 'challenge') {
        this.challengeTimer = BALANCE.challenge.time;
        this.overlay.banner(t('room.challenge'), t('challenge.intro'), 0xffb347);
      }
    }
    // Boss 房只在未清时亮血条和战歌(清空后再进不应触发)
    if (node.kind === 'boss' && !node.cleared) {
      this.overlay.setBossHp(this.bossName(this.bossKindForFloor()), 1);
      music.setIntensity(1);
    } else {
      music.setIntensity(0);
    }
    // 特殊房间:宝箱/商店,无敌人,门常开
    if (node.kind === 'treasure' || node.kind === 'shop') {
      node.cleared = true;
      this.room.setAllDoors(true);
      this.setupSpecialRoom(node.kind);
      if (node.kind === 'shop') this.overlay.banner(t('room.shop'), t('shop.welcome'), 0xe8c877);
    }
    // 蒸汽喷射机关:战斗房 1-2 个,周期性喷发逼迫走位
    if (!node.cleared && node.kind === 'normal') {
      const jetCount = this.floorIndex >= 2 ? this.rng.int(1, 2) : this.rng.int(0, 1);
      for (let i = 0; i < jetCount; i++) {
        const jx = this.rng.range(-CONFIG.roomW / 2 + 5, CONFIG.roomW / 2 - 5);
        const jz = this.rng.range(-CONFIG.roomD / 2 + 5, CONFIG.roomD / 2 - 5);
        if (Math.hypot(jx, jz) < 4) continue;
        const vent = new SteamVent(this.rng, 26, 3.2);
        vent.position.set(jx, 0.1, jz);
        this.stage.scene.add(vent);
        this.steamJets.push({ x: jx, z: jz, vent, timer: this.rng.range(0, 2), phase: 0 });
      }
    }
    this.overlay.setMinimap(this.floor.rooms, nodeId);
  }

  /** 宝箱房:中央一只免费改装宝箱;商店:三个商品台座 */
  private setupSpecialRoom(kind: 'treasure' | 'shop'): void {
    if (kind === 'treasure') {
      const mesh = this.makeChestMesh();
      mesh.position.set(0, 0, 0);
      this.stage.scene.add(mesh);
      this.interactives.push({
        x: 0,
        z: 0,
        r: 1.5,
        kind: 'chest',
        cost: 0,
        label: t('shop.chest'),
        mesh,
        used: false,
        effect: () => this.offerUpgrade(),
      });
      this.overlay.floatText(0, -1.6, t('shop.chest'), 0xe8c877);
      return;
    }
    // 商店:三个台座
    const items: { x: number; cost: number; label: string; color: number; effect: () => void }[] = [
      { x: -5, cost: BALANCE.shop.heal.cost, label: t('shop.heal', { n: BALANCE.shop.heal.amount }), color: 0x7ec86a, effect: () => this.heal(BALANCE.shop.heal.amount) },
      {
        x: 0,
        cost: BALANCE.shop.upgrade.cost,
        label: t('shop.upgrade'),
        color: 0xe8c877,
        effect: () => {
          const opts = drawUpgrades(1, (arr) => this.rng.pick(arr), this.upgradeCounts);
          if (opts.length > 0) {
            opts[0].apply(this.stats, (n) => this.heal(n));
            this.upgradeCounts.set(opts[0].id, (this.upgradeCounts.get(opts[0].id) ?? 0) + 1);
            this.overlay.floatText(0, -3, t('shop.got', { n: lt(opts[0].name) }), 0xe8c877);
          }
        },
      },
      {
        x: 5,
        cost: BALANCE.shop.maxHp.cost,
        label: t('shop.maxHp', { n: BALANCE.shop.maxHp.amount }),
        color: 0x9fb4c0,
        effect: () => {
          this.stats.maxHp += BALANCE.shop.maxHp.amount;
          this.heal(BALANCE.shop.maxHp.amount);
        },
      },
    ];
    for (const item of items) {
      const mesh = this.makePedestalMesh(item.color);
      mesh.position.set(item.x, 0, 0);
      this.stage.scene.add(mesh);
      this.interactives.push({
        x: item.x,
        z: 0,
        r: 1.5,
        kind: 'shopItem',
        cost: item.cost,
        label: item.label,
        mesh,
        used: false,
        effect: item.effect,
      });
      this.overlay.floatText(item.x, -1.6, `${item.label} · ⚙${item.cost}`, 0xd8c9a3);
    }
  }

  private makeChestMesh(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.6, 0.75),
      new THREE.MeshToonMaterial({ color: 0x6a4a2a }),
    );
    body.position.y = 0.3;
    g.add(body);
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(1.14, 0.25, 0.79),
      new THREE.MeshToonMaterial({ color: 0xb08d57 }),
    );
    lid.position.y = 0.68;
    g.add(lid);
    const clasp = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.2, 0.06),
      new THREE.MeshToonMaterial({ color: 0xe8c877, emissive: 0xe8c877, emissiveIntensity: 1.2 }),
    );
    clasp.position.set(0, 0.55, 0.4);
    g.add(clasp);
    return g;
  }

  private makePedestalMesh(color: number): THREE.Group {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.65, 0.5, 10),
      new THREE.MeshToonMaterial({ color: 0x3a4149 }),
    );
    base.position.y = 0.25;
    g.add(base);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.06, 6, 14),
      new THREE.MeshToonMaterial({ color: 0xb08d57 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.5;
    g.add(rim);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 8),
      new THREE.MeshToonMaterial({ color, emissive: color, emissiveIntensity: 2 }),
    );
    glow.position.y = 0.9;
    g.add(glow);
    return g;
  }

  private entryPos(from: DoorSide): { x: number; z: number } {
    const hw = CONFIG.roomW / 2 - 2;
    const hd = CONFIG.roomD / 2 - 2;
    switch (from) {
      case 'n': return { x: 0, z: -hd };
      case 's': return { x: 0, z: hd };
      case 'e': return { x: hw, z: 0 };
      case 'w': return { x: -hw, z: 0 };
    }
  }

  /** 波次遭遇:进场只出第一波,清完间歇后出下一波(参考 Hades 房间节奏) */
  private startWaves(node: RoomNode): void {
    this.wavesDone = 0;
    this.waveBreather = 0;
    if (node.kind === 'boss') {
      this.wavesTotal = 1;
      this.waveSize = 1;
      // 三位 Boss 按层轮换
      const bossKind = this.bossKindForFloor();
      this.overlay.banner(
        this.bossName(bossKind),
        bossKind === 'boss' ? t('boss1.intro') : bossKind === 'ringmaster' ? t('boss2.intro') : t('boss3.intro'),
      );
      this.stage.shake(0.6);
      this.scheduleWave(bossKind);
      return;
    }
    const count = BALANCE.spawnCount(this.floorIndex, (a, b) => this.rng.int(a, b));
    if (node.elite) this.overlay.banner(t(`elite.${node.elite}` as 'elite.swift' | 'elite.splitting' | 'elite.shielded'), undefined, 0xffb347);
    this.wavesTotal = this.floorIndex >= 4 ? 3 : this.floorIndex >= 2 ? 2 : 1;
    this.waveSize = node.waveSize > 0 ? node.waveSize : Math.ceil(count / this.wavesTotal);
    // 恢复中途离开时的波次进度
    this.wavesDone = Math.min(node.wavesSpawned, this.wavesTotal);
    node.waveSize = this.waveSize;
    if (this.wavesDone >= this.wavesTotal) {
      // 波次已经全部出完了(可能之前全灭过一波),不再重复生成
      return;
    }
    this.waveSize = Math.min(this.waveSize, count);
    this.scheduleWave(null);
  }

  /** 当前层数的敌人种类配比 */
  private pickEnemyKind(): EnemyKind {
    const roll = this.rng.next();
    if (this.floorIndex >= 3) {
      return roll < 0.3 ? 'chaser' : roll < 0.48 ? 'shooter' : roll < 0.58 ? 'bomber' : roll < 0.72 ? 'dasher' : roll < 0.84 ? 'splitter' : roll < 0.92 ? 'warden' : 'mortar';
    }
    if (this.floorIndex >= 2) {
      return roll < 0.38 ? 'chaser' : roll < 0.6 ? 'shooter' : roll < 0.72 ? 'bomber' : roll < 0.86 ? 'dasher' : 'splitter';
    }
    return roll < 0.55 ? 'chaser' : roll < 0.82 ? 'shooter' : 'bomber';
  }

  /** 出一波:先打预警圈(≥0.55s,给玩家反应窗口),敌人错落现身。
   *  预警圈与怪物一一对应,位置避开障碍物和玩家 */
  private scheduleWave(forced: EnemyKind | null): void {
    this.wavesDone++;
    for (let i = 0; i < this.waveSize; i++) {
      const kind = forced ?? this.pickEnemyKind();
      let x = 0;
      let z = -4;
      if (!forced) {
        for (let tries = 0; tries < 12; tries++) {
          x = this.rng.range(-CONFIG.roomW / 2 + 3, CONFIG.roomW / 2 - 3);
          z = this.rng.range(-CONFIG.roomD / 2 + 3, CONFIG.roomD / 2 - 3);
          if (Math.hypot(x - this.player.x, z - this.player.z) < 6) continue;
          if (this.insideObstacle(x, z)) continue;
          break;
        }
        // 12 次都失败则兜底挪到房间边缘
        if (this.insideObstacle(x, z)) {
          x = -CONFIG.roomW / 2 + 3;
          z = 0;
        }
      }
      const delay = (kind === 'boss' ? 1.2 : 0.55) + i * 0.12;
      this.pendingSpawns.push({ kind, x, z, t: delay, affix: this.currentNode?.elite ?? null });
      const tmp = { x: 0, y: 0 };
      this.worldToScreen(x, z, tmp);
      this.overlay.ring(tmp.x, tmp.y, kind === 'boss' ? 0xff5522 : 0xff7733, kind === 'boss' ? 90 : 40, delay);
    }
  }

  private spawnEnemy(kind: EnemyKind, x: number, z: number, hpScale: number, affix: Enemy['affix'] = null): void {
    const def = BALANCE.enemies[kind];
    const mesh = this.acquireMesh(kind);
    mesh.position.set(x, 0, z);
    this.enemies.push({
      kind,
      mesh,
      x,
      z,
      vx: 0,
      vz: 0,
      kbx: 0,
      kbz: 0,
      hp: this.isBoss(kind) ? BALANCE.bossHp(this.floorIndex) : def.hp * hpScale,
      maxHp: this.isBoss(kind) ? BALANCE.bossHp(this.floorIndex) : def.hp * hpScale,
      r: def.r,
      speed: def.speed,
      dmg: def.dmg,
      fireCd: 1 + Math.random() * 1.5,
      fuse: -1,
      stateT: 0,
      phase: 0,
      enraged: false,
      spawnT: this.isBoss(kind) ? 0.5 : 0.22,
      hitPop: 0,
      affix,
      dmgTaken: affix === 'shielded' ? 0.5 : 1,
    });
    if (affix === 'swift') this.enemies[this.enemies.length - 1].speed *= 1.5;
  }

  /** 从对象池取敌人网格(没有才新建),并重置所有可变状态 */
  private acquireMesh(kind: EnemyKind): THREE.Group {
    let pool = this.meshPool.get(kind);
    if (!pool) {
      pool = [];
      this.meshPool.set(kind, pool);
    }
    const mesh = pool.pop() ?? makeEnemyMesh(kind);
    // 重置变换与零件状态
    mesh.scale.set(1, 1, 1);
    mesh.rotation.set(0, 0, 0);
    mesh.visible = true;
    const laser = mesh.userData.laser as THREE.Mesh | undefined;
    if (laser) laser.visible = false;
    const core = mesh.userData.core as THREE.Mesh | undefined;
    if (core) {
      (core.material as THREE.MeshToonMaterial).emissiveIntensity = 2.5;
      core.scale.setScalar(1);
    }
    const body = mesh.userData.body as THREE.Group | undefined;
    if (body) body.scale.set(1, 1, 1);
    this.stage.scene.add(mesh);
    return mesh;
  }

  /** 回收敌人网格到对象池 */
  private releaseMesh(kind: EnemyKind, mesh: THREE.Group): void {
    this.stage.scene.remove(mesh);
    this.meshPool.get(kind)!.push(mesh);
  }

  // ---------- 主更新 ----------

  update(dt: number, time: number): void {
    // 死亡爆散动画无条件推进(否则升级界面弹出时会冻结在半截,网格也不进池)
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += dt;
      const s = Math.max(0.01, 1 - d.t / 0.16);
      d.mesh.scale.setScalar(s);
      d.mesh.rotation.y += dt * 14;
      if (d.t >= 0.16) {
        this.releaseMesh(d.kind, d.mesh);
        this.dying.splice(i, 1);
      }
    }
    if (this.state !== 'playing') return;
    this.timeSec += dt;
    if (this.room) this.room.update(dt, time);

    // 子步进模拟:低帧率下把 dt 切成 ≤1/90s 的小步,
    // 子弹不会一帧飞跃敌人(穿透),射击手感在任何帧率下一致
    const steps = Math.max(1, Math.min(6, Math.ceil(dt / (1 / 90))));
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      this.updatePlayer(sdt);
      this.updateEnemies(sdt, time);
      this.updateBullets(sdt, this.playerBullets.items, true);
      this.updateBullets(sdt, this.enemyBullets.items, false);
      this.updateDrops(sdt, time);
      this.updateShells(sdt);
    }
    this.playerBullets.sync();
    this.enemyBullets.sync();
    this.checkDoors();
    this.updateCameraTarget();

    // 连击窗口衰减
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboCount = 0;
    }
    this.overlay.setCombo(this.comboCount);

    // 护盾充能
    const p = this.player;
    if (this.stats.shield > 0 && !p.shieldUp) {
      p.shieldCd -= dt;
      if (p.shieldCd <= 0) {
        p.shieldUp = true;
        synth.pickup();
        const tmp = { x: 0, y: 0 };
        this.worldToScreen(p.x, p.z, tmp);
        this.overlay.ring(tmp.x, tmp.y, 0x9fb4c0, 45);
      }
    }

    this.updatePets(dt, time);
    this.updateInteractives(dt, time);
    this.refreshPlayerAttachments();
    this.updateSteamJets(dt, time);
    // 敌人头顶血条(只显示受伤的,Boss 用底部大血条)
    this.enemyHpList.length = 0;
    for (const e of this.enemies) {
      if (e.hp < e.maxHp && !this.isBoss(e.kind)) {
        this.enemyHpList.push({ x: e.x, z: e.z, ratio: e.hp / e.maxHp });
      }
    }
    this.overlay.setEnemyHp(this.enemyHpList);
    this.overlay.setCooldowns(
      1 - Math.max(0, this.dashCd) / (BALANCE.player.dashCd * this.cdMult()),
      1 - Math.max(0, this.rollCd) / (BALANCE.player.rollCd * this.cdMult()),
    );

    // 挑战房倒计时
    if (this.challengeTimer > 0 && this.currentNode && !this.currentNode.cleared) {
      this.challengeTimer -= dt;
      if (this.challengeTimer <= 0) {
        // 超时:敌人散去,无奖励
        for (const e of this.enemies) this.releaseMesh(e.kind, e.mesh);
        this.enemies = [];
        this.pendingSpawns = [];
        this.currentNode.cleared = true;
        this.room!.setAllDoors(true);
        this.overlay.banner(t('challenge.fail'), undefined, 0x9a8a68);
        this.overlay.hideBossHp();
      }
    }

    // 房间清除判定:场上无敌人且无待生成才算
    if (this.currentNode && !this.currentNode.cleared) {
      // 待生成队列:预警圈结束后敌人才现身
      for (let i = this.pendingSpawns.length - 1; i >= 0; i--) {
        const s = this.pendingSpawns[i];
        s.t -= dt;
        if (s.t <= 0) {
          this.spawnEnemy(s.kind, s.x, s.z, BALANCE.hpScale(this.floorIndex), s.affix);
          this.pendingSpawns.splice(i, 1);
          synth.doorOpen();
        }
      }
      if (this.enemies.length === 0 && this.pendingSpawns.length === 0) {
        if (this.wavesDone >= this.wavesTotal) {
          this.onRoomCleared();
        } else {
          // 波次间歇:给玩家 0.9s 喘息
          this.waveBreather -= dt;
          if (this.waveBreather <= 0) {
            this.scheduleWave(null);
            this.waveBreather = 0.9;
          }
        }
      } else {
        this.waveBreather = 0.9;
      }
    }

    this.overlay.setHUD(
      this.player.hp,
      this.stats.maxHp,
      this.floorIndex,
      this.currentNode ? this.hudRoomLabel(this.currentNode) : '',
      this.cogs,
    );
  }

  /** HUD 房间标签:战斗中显示波次进度 */
  private hudRoomLabel(node: RoomNode): string {
    if (!node.cleared && node.kind === 'challenge' && this.challengeTimer > 0) {
      return t('challenge.countdown', { n: Math.ceil(this.challengeTimer) });
    }
    if (!node.cleared && (node.kind === 'normal' || node.kind === 'challenge') && this.wavesTotal > 1) {
      return t('hud.wave', { a: Math.min(this.wavesDone, this.wavesTotal), b: this.wavesTotal });
    }
    return roomLabel(node);
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    const axis = this.input.moveAxis();

    // Q 切换武器
    if (this.input.pressed('KeyQ') && !this.qHeld) {
      this.qHeld = true;
      const idx = WEAPON_ORDER.indexOf(this.weapon);
      this.weapon = WEAPON_ORDER[(idx + 1) % WEAPON_ORDER.length];
      this.overlay.setWeapon(this.weapon);
      synth.pickup();
    }
    if (!this.input.pressed('KeyQ')) this.qHeld = false;

    // 冲刺(空格):纯机动,快而短,冷却短,但【没有无敌帧】
    if (this.dashCd > 0) this.dashCd -= dt;
    if (
      this.dashCd <= 0 &&
      this.input.pressed('Space') &&
      (axis.x !== 0 || axis.y !== 0)
    ) {
      this.dashT = 0.14;
      this.dashCd = BALANCE.player.dashCd * this.cdMult();
      this.dashX = axis.x;
      this.dashZ = axis.y;
      synth.dash();
      const tmp = { x: 0, y: 0 };
      this.worldToScreen(p.x, p.z, tmp);
      this.overlay.sparkBurst(tmp.x, tmp.y, 0x9fb4c0, 8);
    }

    // 翻滚(Shift):较慢较长,全身翻转,全程无敌,冷却更长——纯防御技
    if (this.rollCd > 0) this.rollCd -= dt;
    if (
      this.rollCd <= 0 &&
      (this.input.pressed('ShiftLeft') || this.input.pressed('ShiftRight')) &&
      (axis.x !== 0 || axis.y !== 0)
    ) {
      this.rollT = 0.42;
      this.rollCd = BALANCE.player.rollCd * this.cdMult();
      this.rollX = axis.x;
      this.rollZ = axis.y;
      p.invuln = Math.max(p.invuln, 0.45);
      synth.roll();
    }

    const body = p.mesh!.userData.body as THREE.Group;
    if (this.rollT > 0) {
      // 翻滚:2.1 倍速位移 + 绕行进方向前翻一整圈
      this.rollT -= dt;
      p.x += this.rollX * this.stats.speed * 2.1 * dt;
      p.z += this.rollZ * this.stats.speed * 2.1 * dt;
      const prog = 1 - Math.max(0, this.rollT) / 0.42;
      body.rotation.y = Math.atan2(this.rollX, this.rollZ);
      body.rotation.x = -prog * Math.PI * 2;
      if (this.rollT <= 0) body.rotation.x = 0;
      if (Math.random() < 0.5) {
        const tmp = { x: 0, y: 0 };
        this.worldToScreen(p.x, p.z, tmp);
        this.overlay.sparkBurst(tmp.x, tmp.y, 0x8a9aa6, 1);
      }
    } else if (this.dashT > 0) {
      this.dashT -= dt;
      p.x += this.dashX * this.stats.speed * 4.0 * dt;
      p.z += this.dashZ * this.stats.speed * 4.0 * dt;
      // 冲刺蒸汽残影
      if (Math.random() < 0.6) {
        const tmp = { x: 0, y: 0 };
        this.worldToScreen(p.x, p.z, tmp);
        this.overlay.sparkBurst(tmp.x, tmp.y, 0x6a7a86, 1);
      }
    } else {
      // 速度平滑趋近(急停急起有质量感,但不拖泥带水)
      if (p.slowT > 0) p.slowT -= dt;
      const slowMult = p.slowT > 0 ? 0.55 : 1;
      const k = Math.min(1, dt * 16);
      p.vx += (axis.x * this.stats.speed * slowMult - p.vx) * k;
      p.vz += (axis.y * this.stats.speed * slowMult - p.vz) * k;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
    }
    p.x = this.collideWorld(p.x, p.z, 0.5).x;
    p.z = this.collideWorld(p.x, p.z, 0.5).z;

    // 瞄准(每帧即时,无平滑无延迟)
    this.updateAimFacing(dt);

    // 开火
    p.fireCd -= dt;
    if (this.input.mouseDown && p.fireCd <= 0) {
      p.fireCd = 1 / (this.stats.fireRate * BALANCE.weapons[this.weapon].rate);
      this.firePlayerBullets();
      synth.shoot();
      p.muzzleT = 0.05;
    }
    // 枪口闪光只亮一瞬
    const muzzle = body.userData.muzzle as THREE.Mesh | undefined;
    if (muzzle) {
      p.muzzleT -= dt;
      muzzle.visible = p.muzzleT > 0;
    }

    if (p.invuln > 0) {
      p.invuln -= dt;
      p.mesh!.visible = Math.floor(p.invuln * 12) % 2 === 0;
    } else {
      p.mesh!.visible = true;
    }

    // 网格动画:走路摆腿(步幅相位跟随实际位移,而非挂钟时间——
    // 帧率波动时动画和移动严格同步,不会一卡一卡地"抖腿")
    const moving = Math.abs(axis.x) + Math.abs(axis.y) > 0;
    const t = performance.now() / 1000;
    const legL = p.mesh!.userData.legL as THREE.Mesh;
    const legR = p.mesh!.userData.legR as THREE.Mesh;
    if (moving) this.stridePhase += this.stats.speed * dt * 1.5;
    const strideAmp = moving ? 0.18 : 0;
    legL.position.z = Math.sin(this.stridePhase) * strideAmp;
    legR.position.z = -Math.sin(this.stridePhase) * strideAmp;
    const gear = body.userData.gear as THREE.Mesh;
    if (gear) gear.rotation.z += dt * 2.2;
    // 压力表指针随移动摆动
    const needle = body.userData.needle as THREE.Mesh | undefined;
    if (needle) needle.rotation.z = Math.sin(t * 3.2) * (moving ? 0.9 : 0.3);
    p.mesh!.position.set(p.x, 0, p.z);
  }

  private groundVec = new THREE.Vector3();

  /** 每帧即时瞄准:准星在哪,炮口立刻转向哪(顿帧期间也保持) */
  private updateAimFacing(dt: number): void {
    const p = this.player;
    if (!p.mesh) return;
    const ground = this.groundVec;
    this.stage.screenToGround(this.input.mouseX, this.input.mouseY, ground);
    const dx = ground.x - p.x;
    const dz = ground.z - p.z;
    const len = Math.hypot(dx, dz);
    // 炮管永远精确指向准心;仅在准星与玩家完全重合时保持上次方向(避免除零)
    if (len > 1e-4) {
      p.aimX = dx / len;
      p.aimZ = dz / len;
    }
    if (this.rollT <= 0) {
      const body = p.mesh.userData.body as THREE.Group;
      // 角速度上限:瞄准仍然跟手,但跨过准星时不会一帧翻转 180°(观感抖动的主因)
      const targetRot = Math.atan2(p.aimX, p.aimZ);
      let diff = targetRot - body.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const maxTurn = 25 * dt; // 25 rad/s,小角度即时,大翻转 ~7 帧完成
      body.rotation.y += THREE.MathUtils.clamp(diff, -maxTurn, maxTurn);
    }
  }

  private firePlayerBullets(): void {
    const p = this.player;
    const w = BALANCE.weapons[this.weapon];
    const total = w.bullets + this.stats.multiShot;
    // 散射武器按 spread 总角均分,单发武器多弹时给固定小步距
    const spreadStep = w.bullets > 1 ? w.spread / Math.max(1, w.bullets - 1) : 0.12;
    for (let i = 0; i < total; i++) {
      const offset = (i - (total - 1) / 2) * spreadStep + (w.bullets > 1 ? (Math.random() - 0.5) * 0.06 : 0);
      const cos = Math.cos(offset);
      const sin = Math.sin(offset);
      const dx = p.aimX * cos - p.aimZ * sin;
      const dz = p.aimX * sin + p.aimZ * cos;
      const b = this.playerBullets.findFree();
      if (!b) return;
      const crit = Math.random() < 0.1;
      b.active = true;
      b.x = p.x + dx * 0.8;
      b.z = p.z + dz * 0.8;
      b.vx = dx * this.stats.bulletSpeed * w.speed;
      b.vz = dz * this.stats.bulletSpeed * w.speed;
      b.dmg = this.stats.damage * w.dmg * (crit ? 2 : 1);
      b.life = CONFIG.bulletLife * w.life;
      b.pierce = this.stats.pierce + w.pierce;
      b.bounce = this.stats.bounce;
      b.scale = this.stats.bulletScale * w.scale * (crit ? 1.6 : 1);
      b.crit = crit;
    }
    // 枪口火花 + 准星回弹
    this.overlay.crosshairFireKick();
    const tmp = { x: 0, y: 0 };
    this.worldToScreen(p.x + p.aimX, p.z + p.aimZ, tmp);
    this.overlay.sparkBurst(tmp.x, tmp.y, 0xffd980, 3);
  }

  private updateEnemies(dt: number, time: number): void {
    const p = this.player;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      // 出生入场:从预警圈中弹出,期间不行动
      if (e.spawnT > 0) {
        e.spawnT -= dt;
        const prog = 1 - Math.max(0, e.spawnT) / (this.isBoss(e.kind) ? 0.5 : 0.22);
        e.mesh.scale.setScalar(0.3 + 0.7 * prog);
        e.mesh.position.set(e.x, 0, e.z);
        continue;
      }
      // 受击挤压脉冲(squash & stretch 手感)
      if (e.hitPop > 0) {
        e.hitPop = Math.max(0, e.hitPop - dt * 6);
        e.mesh.scale.set(1 + 0.22 * e.hitPop, 1 - 0.15 * e.hitPop, 1 + 0.22 * e.hitPop);
      } else if (e.mesh.scale.x !== 1) {
        e.mesh.scale.set(1, 1, 1);
      }
      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const nx = dx / dist;
      const nz = dz / dist;

      switch (e.kind) {
        case 'chaser':
        case 'mini': {
          e.x += nx * e.speed * dt;
          e.z += nz * e.speed * dt;
          e.mesh.position.y = Math.abs(Math.sin(time * 10 + i)) * 0.15;
          e.mesh.rotation.y = Math.atan2(nx, nz);
          const gear = e.mesh.userData.gear as THREE.Mesh | undefined;
          if (gear) gear.rotation.z += dt * 1.6;
          // 发条钥匙持续旋转
          const keyW = e.mesh.userData.keyWings as THREE.Group | undefined;
          if (keyW) keyW.rotation.z += dt * 4;
          break;
        }
        case 'shooter': {
          // 保持 7~11 距离环绕
          const want = dist < 7 ? -1 : dist > 11 ? 1 : 0;
          e.x += nx * e.speed * want * dt + -nz * e.speed * 0.5 * dt;
          e.z += nz * e.speed * want * dt + nx * e.speed * 0.5 * dt;
          const turret = e.mesh.userData.turret as THREE.Group;
          if (turret) turret.rotation.y = Math.atan2(nx, nz);
          e.fireCd -= dt;
          if (e.fireCd <= 0 && dist < 14) {
            e.fireCd = 2 + Math.random() * 0.8;
            this.fireEnemyBullet(e.x, e.z, nx * 10, nz * 10, e.dmg);
            synth.shoot();
          }
          break;
        }
        case 'bomber': {
          if (e.fuse < 0) {
            e.x += nx * e.speed * dt;
            e.z += nz * e.speed * dt;
            if (dist < 2.4) e.fuse = 0.7;
          } else {
            e.fuse -= dt;
            const core = e.mesh.userData.core as THREE.Mesh;
            if (core) {
              const m = core.material as THREE.MeshToonMaterial;
              m.emissiveIntensity = 2.5 + Math.sin(time * 40) * 2.5;
              core.scale.setScalar(1 + Math.sin(time * 40) * 0.15);
            }
            if (e.fuse <= 0) {
              this.explode(e.x, e.z, 3, e.dmg);
              this.killEnemy(i, false);
              continue;
            }
          }
          break;
        }
        case 'dasher': {
          // 弹簧跳蚤:逼近 → 下蹲蓄力(抖动)→ 直线扑击 → 硬直
          const body = e.mesh.userData.body as THREE.Mesh | undefined;
          if (e.phase === 0) {
            e.x += nx * e.speed * dt;
            e.z += nz * e.speed * dt;
            e.mesh.rotation.y = Math.atan2(nx, nz);
            if (dist < 7) {
              e.phase = 1;
              e.stateT = 0;
            }
          } else if (e.phase === 1) {
            // 蓄力:压扁 + 抖动 0.5s
            e.stateT += dt;
            if (body) body.scale.set(1.2, 0.6, 1.2);
            e.mesh.position.x += (Math.random() - 0.5) * 0.06;
            if (e.stateT > 0.5) {
              e.phase = 2;
              e.stateT = 0;
              e.vx = nx * 16;
              e.vz = nz * 16;
              if (body) body.scale.set(0.9, 1.3, 0.9);
            }
          } else if (e.phase === 2) {
            e.stateT += dt;
            e.x += e.vx * dt;
            e.z += e.vz * dt;
            if (e.stateT > 0.32) {
              e.phase = 3;
              e.stateT = 0;
              if (body) body.scale.set(1, 1, 1);
            }
          } else {
            // 硬直恢复
            e.stateT += dt;
            if (e.stateT > 0.8) e.phase = 0;
          }
          break;
        }
        case 'splitter': {
          // 分裂球:缓慢逼近,接缝随血量变亮
          e.x += nx * e.speed * dt;
          e.z += nz * e.speed * dt;
          e.mesh.rotation.y += dt * 0.6;
          break;
        }
        case 'warden': {
          // 盾卫:缓慢推进,转身速度受限(正面护盾几乎无敌,逼迫绕后)
          e.x += nx * e.speed * dt;
          e.z += nz * e.speed * dt;
          const targetRot = Math.atan2(nx, nz);
          let diff = targetRot - e.mesh.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const turn = 1.1 * dt; // 每秒最多转 ~63°
          e.mesh.rotation.y += THREE.MathUtils.clamp(diff, -turn, turn);
          break;
        }
        case 'mortar': {
          // 迫击手:保持距离,定期抛射爆破弹
          const want = dist < 8 ? -1 : dist > 12 ? 1 : 0;
          e.x += nx * e.speed * want * dt + -nz * e.speed * 0.4 * dt;
          e.z += nz * e.speed * want * dt + nx * e.speed * 0.4 * dt;
          e.mesh.rotation.y = Math.atan2(nx, nz);
          e.fireCd -= dt;
          if (e.fireCd <= 0 && dist < 15) {
            e.fireCd = BALANCE.mortar.fireCd;
            this.fireMortarShell(e.x, e.z, p.x, p.z);
          }
          break;
        }
        case 'sniper': {
          // 钟表狙击手:远距离驻留,1.2s 激光蓄力后发射高速弹
          const want = dist < 9 ? -1 : dist > 13 ? 1 : 0;
          e.x += nx * e.speed * want * dt;
          e.z += nz * e.speed * want * dt;
          e.mesh.rotation.y = Math.atan2(nx, nz);
          // 怀表指针转动
          const hand = e.mesh.userData.hand as THREE.Mesh | undefined;
          if (hand) hand.rotation.z -= dt * 2;
          const laser = e.mesh.userData.laser as THREE.Mesh | undefined;
          e.fireCd -= dt;
          if (e.fireCd <= 0 && dist < 16) {
            e.phase = e.phase === 0 ? 1 : e.phase;
            if (e.phase === 1) {
              // 蓄力:激光线指向玩家
              e.stateT += dt;
              if (laser) {
                laser.visible = true;
                laser.position.set(0.2, 0.6, 0.6 + dist / 2);
                laser.scale.z = dist;
                laser.scale.x = laser.scale.y = 1 + Math.sin(time * 30) * 0.3;
              }
              if (e.stateT >= 1.2) {
                e.stateT = 0;
                e.phase = 0;
                e.fireCd = 3;
                if (laser) laser.visible = false;
                this.fireEnemyBullet(e.x, e.z, nx * 24, nz * 24, e.dmg);
                synth.shoot();
              }
            }
          } else if (laser && laser.visible) {
            laser.visible = false;
            e.phase = 0;
            e.stateT = 0;
          }
          break;
        }
        case 'tinker': {
          // 修补无人机:远离玩家,给受伤最重的队友回血
          const want = dist < 6 ? 1 : dist > 9 ? -1 : 0;
          e.x -= nx * e.speed * want * dt;
          e.z -= nz * e.speed * want * dt;
          e.mesh.position.y = 0.15 + Math.sin(time * 2.5 + i) * 0.1;
          const rotor = e.mesh.userData.rotor as THREE.Mesh | undefined;
          if (rotor) rotor.rotation.y += dt * 20;
          e.fireCd -= dt;
          if (e.fireCd <= 0) {
            e.fireCd = 1;
            // 找 6m 内受伤最重的队友
            let target: Enemy | null = null;
            let worst = 1;
            for (const other of this.enemies) {
              if (other === e || other.kind === 'tinker') continue;
              const d = Math.hypot(other.x - e.x, other.z - e.z);
              const ratio = other.hp / other.maxHp;
              if (d < 6 && ratio < worst) {
                worst = ratio;
                target = other;
              }
            }
            if (target) {
              target.hp = Math.min(target.maxHp, target.hp + 10);
              const tmp = { x: 0, y: 0 };
              this.worldToScreen(target.x, target.z, tmp);
              this.overlay.sparkBurst(tmp.x, tmp.y, 0x7ec86a, 4);
            }
          }
          break;
        }
        case 'boss': {
          this.updateBoss(e, dt, dist, nx, nz, time);
          break;
        }
        case 'ringmaster': {
          this.updateRingmaster(e, dt, dist, nx, nz, time);
          break;
        }
        case 'colossus': {
          this.updateColossus(e, dt, dist, nx, nz, time);
          break;
        }
      }

      // 受击击退(快速衰减)
      e.x += e.kbx * dt;
      e.z += e.kbz * dt;
      e.kbx *= Math.pow(0.0001, dt);
      e.kbz *= Math.pow(0.0001, dt);

      // 世界碰撞
      const c = this.collideWorld(e.x, e.z, e.r);
      e.x = c.x;
      e.z = c.z;

      // 接触伤害
      if (dist < e.r + 0.5 && p.invuln <= 0) {
        this.hurtPlayer(e.kind === 'boss' ? e.dmg : Math.min(e.dmg, 15));
      }

      e.mesh.position.x = e.x;
      e.mesh.position.z = e.z;
    }
  }

  /** 钟表巨像:指针转动 + 钟摆横扫弹幕 + 时间凝滞领域 */
  private updateColossus(e: Enemy, dt: number, dist: number, nx: number, nz: number, time: number): void {
    // 指针转动(二阶段狂转)
    const spd = e.enraged ? 12 : 3;
    const hh = e.mesh.userData.hourHand as THREE.Mesh | undefined;
    const mh = e.mesh.userData.minHand as THREE.Mesh | undefined;
    if (hh) hh.rotation.z -= dt * spd * 0.12;
    if (mh) mh.rotation.z -= dt * spd;
    // 钟摆摆动
    const pend = e.mesh.userData.pendulum as THREE.Mesh | undefined;
    if (pend) pend.rotation.z = Math.sin(time * 2.2) * 0.4;

    e.stateT += dt;
    if (!e.enraged && e.hp < e.maxHp * 0.5) {
      e.enraged = true;
      e.speed *= 1.4;
      synth.explosion();
      this.stage.shake(1.2);
      this.overlay.flash(0xff5522, 0.35);
      const tmp = { x: 0, y: 0 };
      this.worldToScreen(e.x, e.z, tmp);
      this.overlay.ring(tmp.x, tmp.y, 0xff5522, 200);
    }
    const cdScale = e.enraged ? 0.65 : 1;

    if (e.phase === 0) {
      e.x += nx * e.speed * dt;
      e.z += nz * e.speed * dt;
      if (e.stateT > 2.4 * cdScale) {
        e.stateT = 0;
        e.phase = this.rng.int(1, 3);
      }
    } else if (e.phase === 1) {
      // 钟摆横扫:以玩家方向为中心,扇形弹幕从一侧扫到另一侧
      const base = Math.atan2(nx, nz);
      const sweepDur = 1.0;
      const prog = Math.min(1, e.stateT / sweepDur);
      const sweepRange = e.enraged ? 1.6 : 1.1;
      const a = base - sweepRange + prog * sweepRange * 2;
      if (Math.floor(e.stateT * 14) !== Math.floor((e.stateT - dt) * 14)) {
        this.fireEnemyBullet(e.x, e.z, Math.sin(a) * 9, Math.cos(a) * 9, 13);
      }
      if (prog >= 1) {
        e.phase = 0;
        e.stateT = -0.9 * cdScale;
      }
    } else if (e.phase === 2) {
      // 时间凝滞:全屏预警后玩家减速 2.5s
      this.player.slowT = 2.5;
      this.overlay.flash(0x4a7a9a, 0.25);
      this.overlay.floatText(this.player.x, this.player.z - 1.5, t('boss3.slow'), 0x9fc8d8);
      synth.doorOpen();
      e.phase = 0;
      e.stateT = -1.4 * cdScale;
    } else {
      // 环射
      const n = e.enraged ? 16 : 12;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + time * 0.5;
        this.fireEnemyBullet(e.x, e.z, Math.sin(a) * 7.5, Math.cos(a) * 7.5, 12);
      }
      synth.shoot();
      e.phase = 0;
      e.stateT = -1.1 * cdScale;
    }

    if (this.currentNode) {
      this.overlay.setBossHp(t('boss3.name'), e.hp / e.maxHp);
    }
  }

  /** 人偶剧团长:召唤木偶 + 双臂旋转弹幕 + 环射,二阶段加速 */
  private updateRingmaster(e: Enemy, dt: number, dist: number, nx: number, nz: number, time: number): void {
    // 悬浮呼吸
    e.mesh.position.y = 0.3 + Math.sin(time * 1.5) * 0.15;
    e.stateT += dt;
    // 二阶段
    if (!e.enraged && e.hp < e.maxHp * 0.5) {
      e.enraged = true;
      e.speed *= 1.4;
      synth.explosion();
      this.stage.shake(1.2);
      this.overlay.flash(0xff5522, 0.35);
      const tmp = { x: 0, y: 0 };
      this.worldToScreen(e.x, e.z, tmp);
      this.overlay.ring(tmp.x, tmp.y, 0xff5522, 200);
    }
    const cdScale = e.enraged ? 0.6 : 1;

    if (e.phase === 0) {
      e.x += nx * e.speed * dt;
      e.z += nz * e.speed * dt;
      if (e.stateT > 2.2 * cdScale) {
        e.stateT = 0;
        e.phase = this.rng.int(1, 3);
      }
    } else if (e.phase === 1) {
      // 召唤两只发条木偶
      this.spawnEnemy('mini', e.x - 1.5, e.z, BALANCE.hpScale(this.floorIndex));
      this.spawnEnemy('mini', e.x + 1.5, e.z, BALANCE.hpScale(this.floorIndex));
      e.phase = 0;
      e.stateT = -1.0 * cdScale;
    } else if (e.phase === 2) {
      // 双臂旋转弹幕(1.6s 持续喷射)
      const arms = e.enraged ? 3 : 2;
      for (let arm = 0; arm < arms; arm++) {
        const a = time * 3 + (arm / arms) * Math.PI * 2;
        if (Math.floor(e.stateT * 8) !== Math.floor((e.stateT - dt) * 8)) {
          this.fireEnemyBullet(e.x, e.z, Math.sin(a) * 8, Math.cos(a) * 8, 11);
        }
      }
      if (e.stateT > 1.6) {
        e.phase = 0;
        e.stateT = -0.8;
      }
    } else {
      // 环射
      const n = e.enraged ? 16 : 12;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + time;
        this.fireEnemyBullet(e.x, e.z, Math.sin(a) * 7.5, Math.cos(a) * 7.5, 12);
      }
      synth.shoot();
      e.phase = 0;
      e.stateT = -1.1 * cdScale;
    }

    if (this.currentNode) {
      this.overlay.setBossHp(t('boss2.name'), e.hp / e.maxHp);
    }
  }

  private updateBoss(e: Enemy, dt: number, dist: number, nx: number, nz: number, time: number): void {
    const gear = e.mesh.userData.gear as THREE.Mesh;
    if (gear) gear.rotation.z += dt * (e.enraged ? 2.2 : 0.8);
    for (const key of ['gearL', 'gearR'] as const) {
      const sg = e.mesh.userData[key] as THREE.Mesh | undefined;
      if (sg) sg.rotation.z += dt * (key === 'gearL' ? -1.4 : 1.4) * (e.enraged ? 2 : 1);
    }
    e.stateT += dt;

    // 二阶段:血量低于 50% 触发狂暴(清晰前兆:爆闪+震屏+吼声)
    if (!e.enraged && e.hp < e.maxHp * 0.5) {
      e.enraged = true;
      e.speed *= 1.5;
      synth.explosion();
      this.stage.shake(1.2);
      this.overlay.shake(16);
      this.overlay.flash(0xff5522, 0.35);
      const tmp = { x: 0, y: 0 };
      this.worldToScreen(e.x, e.z, tmp);
      this.overlay.ring(tmp.x, tmp.y, 0xff5522, 200);
      // 炉膛超频发光
      e.mesh.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && (m.material as THREE.MeshToonMaterial).emissiveIntensity !== undefined) {
          const mat = m.material as THREE.MeshToonMaterial;
          if (mat.emissive && mat.emissive.getHex() !== 0) mat.emissiveIntensity *= 2.2;
        }
      });
    }

    // 狂暴后攻击节奏加快
    const cdScale = e.enraged ? 0.6 : 1;

    if (e.phase === 0) {
      e.x += nx * e.speed * dt;
      e.z += nz * e.speed * dt;
      if (e.stateT > 2.5 * cdScale) {
        e.stateT = 0;
        // 狂暴后招式池加入螺旋弹幕和召唤
        e.phase = e.enraged ? this.rng.int(1, 5) : this.rng.int(1, 3);
      }
    } else if (e.phase === 1) {
      // 环形弹幕(狂暴时 18 发)
      const n = e.enraged ? 18 : 14;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + time;
        this.fireEnemyBullet(e.x, e.z, Math.sin(a) * 8, Math.cos(a) * 8, 12);
      }
      synth.shoot();
      e.phase = 0;
      e.stateT = -1.2 * cdScale;
    } else if (e.phase === 2) {
      // 三连瞄准弹(狂暴时五连)
      const spread = e.enraged ? [-2, -1, 0, 1, 2] : [-1, 0, 1];
      for (const k of spread) {
        const a = Math.atan2(nx, nz) + k * 0.18;
        this.fireEnemyBullet(e.x, e.z, Math.sin(a) * 11, Math.cos(a) * 11, 14);
      }
      synth.shoot();
      e.phase = 0;
      e.stateT = -0.8 * cdScale;
    } else if (e.phase === 4) {
      // 螺旋弹幕(二阶段专属):两条旋臂,随时间扭转
      for (let arm = 0; arm < 2; arm++) {
        for (let k = 0; k < 10; k++) {
          const a = time * 2 + arm * Math.PI + (k / 10) * Math.PI * 0.9;
          this.fireEnemyBullet(e.x, e.z, Math.sin(a) * 7.5, Math.cos(a) * 7.5, 12);
        }
      }
      synth.shoot();
      e.phase = 0;
      e.stateT = -1.0;
    } else if (e.phase === 5) {
      // 召唤两只小蜘蛛(二阶段专属)
      this.spawnEnemy('mini', e.x - 1.5, e.z, 1);
      this.spawnEnemy('mini', e.x + 1.5, e.z, 1);
      e.phase = 0;
      e.stateT = -1.5;
    } else {
      // 冲锋:先 0.6s 蓄力抖动,再冲撞
      if (e.stateT < 0.6) {
        e.mesh.position.x += (Math.random() - 0.5) * 0.08;
      } else if (e.stateT < 1.4) {
        if (e.vx === 0 && e.vz === 0) {
          e.vx = nx * 14;
          e.vz = nz * 14;
          this.stage.shake(0.4);
        }
        e.x += e.vx * dt;
        e.z += e.vz * dt;
      } else {
        e.vx = 0;
        e.vz = 0;
        e.phase = 0;
        e.stateT = 0;
      }
    }

    if (this.currentNode) {
      this.overlay.setBossHp(t('boss.name'), e.hp / e.maxHp);
    }
  }

  private updateBullets(dt: number, pool: Bullet[], friendly: boolean): void {
    const hw = CONFIG.roomW / 2 - 0.4;
    const hd = CONFIG.roomD / 2 - 0.4;
    for (const b of pool) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.life -= dt;

      // 墙面弹射(玩家子弹)
      if (friendly && b.bounce >= 0) {
        let bounced = false;
        if (Math.abs(b.x) > hw && b.bounce > 0) {
          b.x = Math.sign(b.x) * hw;
          b.vx = -b.vx;
          bounced = true;
        }
        if (Math.abs(b.z) > hd && b.bounce > 0) {
          b.z = Math.sign(b.z) * hd;
          b.vz = -b.vz;
          bounced = true;
        }
        if (bounced) {
          b.bounce--;
          const tmp = { x: 0, y: 0 };
          this.worldToScreen(b.x, b.z, tmp);
          this.overlay.sparkBurst(tmp.x, tmp.y, 0xffd980, 4);
          synth.hit();
          // 协同:弹跳爆弹——弹射点也爆炸
          if (this.stats.boomBounce > 0) {
            this.splash(b.x, b.z, 1.3, this.stats.damage * 0.4);
            this.overlay.ring(tmp.x, tmp.y, 0xffb347, 50);
          }
        }
      }

      let dead = b.life <= 0 || Math.abs(b.x) > hw || Math.abs(b.z) > hd;
      // 撞障碍
      if (!dead && this.room) {
        for (const o of this.room.obstacles) {
          if (Math.hypot(b.x - o.x, b.z - o.z) < o.r + b.r) {
            dead = true;
            break;
          }
        }
      }

      if (!dead && friendly) {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
          const e = this.enemies[i];
          if (Math.hypot(b.x - e.x, b.z - e.z) < e.r + b.r) {
            // 盾卫正面护盾:挡住来自正面 ~65° 弧的子弹
            if (e.kind === 'warden') {
              const fx = Math.sin(e.mesh.rotation.y);
              const fz = Math.cos(e.mesh.rotation.y);
              const bv = Math.hypot(b.vx, b.vz) || 1;
              const dot = (b.vx / bv) * fx + (b.vz / bv) * fz;
              if (dot < -0.42) {
                const tmp = { x: 0, y: 0 };
                this.worldToScreen(b.x, b.z, tmp);
                this.overlay.sparkBurst(tmp.x, tmp.y, 0xe8c877, 6);
                synth.hit();
                dead = true;
                break;
              }
            }
            this.damageEnemy(i, b.dmg, b.crit, b.vx, b.vz);
            if (b.pierce > 0) {
              b.pierce--;
            } else {
              dead = true;
            }
            break;
          }
        }
      } else if (!dead && !friendly) {
        const p = this.player;
        if (p.invuln <= 0 && Math.hypot(b.x - p.x, b.z - p.z) < 0.5 + b.r) {
          this.hurtPlayer(b.dmg);
          dead = true;
        }
      }

      if (dead) {
        const tmp = { x: 0, y: 0 };
        this.worldToScreen(b.x, b.z, tmp);
        this.overlay.sparkBurst(tmp.x, tmp.y, friendly ? 0xffd980 : 0xff5544, 4);
        b.active = false;
      }
    }
  }

  private isBoss(kind: EnemyKind): boolean {
    return kind === 'boss' || kind === 'ringmaster' || kind === 'colossus';
  }

  private bossKindForFloor(): EnemyKind {
    const m = this.floorIndex % 3;
    return m === 1 ? 'boss' : m === 2 ? 'ringmaster' : 'colossus';
  }

  private bossName(kind: EnemyKind): string {
    return kind === 'boss' ? t('boss.name') : kind === 'ringmaster' ? t('boss2.name') : t('boss3.name');
  }

  private cdMult(): number {
    return 1 - 0.15 * (loadMeta().upgrades['boiler'] ?? 0);
  }

  private fireEnemyBullet(x: number, z: number, vx: number, vz: number, dmg: number): void {
    const b = this.enemyBullets.findFree();
    if (!b) return;
    b.active = true;
    b.x = x;
    b.z = z;
    b.vx = vx;
    b.vz = vz;
    b.dmg = dmg;
    b.life = 3.5;
  }

  /** 范围波及伤害(爆裂弹头/弹跳爆弹共用) */
  private splash(x: number, z: number, radius: number, dmg: number, exclude = -1): void {
    for (let i2 = this.enemies.length - 1; i2 >= 0; i2--) {
      if (i2 === exclude) continue;
      const o = this.enemies[i2];
      if (Math.hypot(o.x - x, o.z - z) < radius + o.r) {
        o.hp -= dmg;
        this.overlay.damageNumber(o.x, o.z, dmg, false);
        if (o.hp <= 0) this.killEnemy(i2, true);
      }
    }
    const tmp = { x: 0, y: 0 };
    this.worldToScreen(x, z, tmp);
    this.overlay.ring(tmp.x, tmp.y, 0xffb347, radius * 40);
  }

  private damageEnemy(idx: number, dmg: number, crit: boolean, dirX = 0, dirZ = 0): void {
    const e = this.enemies[idx];
    e.hp -= dmg * e.dmgTaken;
    // 击退:沿弹道方向推一小段(Boss 免疫)
    if (e.kind !== 'boss') {
      const v = Math.hypot(dirX, dirZ) || 1;
      e.kbx += (dirX / v) * 7;
      e.kbz += (dirZ / v) * 7;
    }
    synth.hit();
    e.hitPop = 1; // 受击挤压
    // 爆裂弹头:命中点范围波及
    if (this.stats.boom > 0) {
      this.splash(e.x, e.z, 1.1 + this.stats.boom * 0.5, this.stats.damage * 0.3 * this.stats.boom, idx);
    }
    this.overlay.damageNumber(e.x, e.z, dmg, crit);
    const tmp = { x: 0, y: 0 };
    this.worldToScreen(e.x, e.z, tmp);
    this.overlay.sparkBurst(tmp.x, tmp.y, 0xffaa55, 5);
    if (e.hp <= 0) this.killEnemy(idx, true, crit);
  }

  private killEnemy(idx: number, byPlayer: boolean, crit = false): void {
    const e = this.enemies[idx];
    const tmp = { x: 0, y: 0 };
    this.worldToScreen(e.x, e.z, tmp);
    this.overlay.sparkBurst(tmp.x, tmp.y, e.kind === 'bomber' ? 0xff7733 : 0xffcc88, 18);
    // 击杀冲击波环 + 顿帧,爆发力核心
    this.overlay.ring(tmp.x, tmp.y, e.kind === 'boss' ? 0xffb347 : 0xffd980, e.kind === 'boss' ? 160 : 80);
    // 死亡爆散:交给 dying 队列做缩小旋转消散
    this.dying.push({ mesh: e.mesh, kind: e.kind, t: 0 });
    this.enemies.splice(idx, 1);

    // 分裂球/分裂词缀死亡:裂成小蜘蛛
    if (e.kind === 'splitter' || (e.affix === 'splitting' && e.kind !== 'mini' && !this.isBoss(e.kind))) {
      this.spawnEnemy('mini', e.x - 0.7, e.z, 1);
      if (e.kind === 'splitter') this.spawnEnemy('mini', e.x + 0.7, e.z, 1);
    }

    if (byPlayer) {
      this.kills++;
      if (this.isBoss(e.kind)) this.bossKills++;
      // 图鉴收录
      this.codex.kills[e.kind] = (this.codex.kills[e.kind] ?? 0) + 1;
      saveCodex(this.codex);
      // 连击:3 秒窗口内连续击杀
      this.comboCount++;
      this.comboTimer = BALANCE.combo.window;
      if (this.stats.lifeSteal > 0) this.heal(this.stats.lifeSteal);
      synth.explosion();
      this.stage.shake(crit ? 0.45 : 0.25);
      this.overlay.shake(crit ? 9 : 5);
      // 掉落:15% 血包,30% 齿轮币;Boss 必掉一把齿轮币
      if (e.kind === 'boss') {
        for (let k = 0; k < BALANCE.drops.bossCogs; k++) {
          this.spawnDrop(e.x + this.rng.range(-1.5, 1.5), e.z + this.rng.range(-1.5, 1.5), 'cog');
        }
      } else if (this.rng.chance(BALANCE.drops.heartChance * (this.currentNode?.elite ? 2 : 1))) {
        this.spawnDrop(e.x, e.z);
      } else if (this.rng.chance((BALANCE.drops.cogChance + 0.08 * this.stats.scavenger) * (this.currentNode?.elite ? 2 : 1))) {
        this.spawnDrop(e.x, e.z, 'cog');
      }
    }
  }

  private explode(x: number, z: number, radius: number, dmg: number): void {
    synth.explosion();
    this.stage.shake(0.6);
    this.overlay.shake(10);
    const tmp = { x: 0, y: 0 };
    this.worldToScreen(x, z, tmp);
    this.overlay.sparkBurst(tmp.x, tmp.y, 0xff7733, 24);
    this.overlay.ring(tmp.x, tmp.y, 0xff7733, 130);
    // 伤玩家
    const p = this.player;
    if (Math.hypot(p.x - x, p.z - z) < radius && p.invuln <= 0) this.hurtPlayer(dmg);
    // 伤其他敌人(队友伤害,自爆卡车特色)
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (Math.hypot(e.x - x, e.z - z) < radius && e.fuse < 0) {
        e.hp -= 40;
        this.overlay.damageNumber(e.x, e.z, 40, false);
        if (e.hp <= 0) this.killEnemy(i, true);
      }
    }
  }

  private hurtPlayer(dmg: number): void {
    const p = this.player;
    // 蒸汽护盾:完全抵挡一次伤害,进入 12s 充能
    if (this.stats.shield > 0 && p.shieldUp) {
      p.shieldUp = false;
      p.shieldCd = BALANCE.shield.recharge;
      p.invuln = Math.max(p.invuln, 0.8);
      synth.dash();
      this.stage.shake(0.3);
      this.overlay.flash(0x9fb4c0, 0.25);
      const tmp = { x: 0, y: 0 };
      this.worldToScreen(p.x, p.z, tmp);
      this.overlay.ring(tmp.x, tmp.y, 0x9fb4c0, 60);
      return;
    }
    p.hp -= dmg;
    // 备用机壳:每局限一次的复活
    if (p.hp <= 0 && !this.reviveUsed && (loadMeta().upgrades['sparehull'] ?? 0) > 0) {
      this.reviveUsed = true;
      p.hp = Math.floor(this.stats.maxHp * 0.5);
      p.invuln = 2;
      synth.doorOpen();
      this.overlay.flash(0xe8c877, 0.5);
      this.stage.shake(1);
      const tmp = { x: 0, y: 0 };
      this.worldToScreen(p.x, p.z, tmp);
      this.overlay.ring(tmp.x, tmp.y, 0xe8c877, 150);
      return;
    }
    p.invuln = 0.7;
    synth.playerHurt();
    this.stage.shake(0.5);
    this.overlay.shake(12);
    this.overlay.flash(0xaa2222, 0.22);
    if (p.hp <= 0) {
      p.hp = 0;
      this.state = 'dead';
      this.overlay.setCrosshairVisible(false);
      this.input.exitLock();
      this.overlay.flash(0x000000, 0.7);
      this.onGameOver();
    }
  }

  private heal(n: number): void {
    this.player.hp = Math.min(this.stats.maxHp, this.player.hp + n);
  }

  // ---------- 掉落 / 出口 ----------

  /** 出生点是否落在障碍物内(锅炉/活塞/板条箱) */
  private insideObstacle(x: number, z: number): boolean {
    if (!this.room) return false;
    for (const o of this.room.obstacles) {
      if (Math.hypot(x - o.x, z - o.z) < o.r + 0.8) return true;
    }
    return false;
  }

  /** 迫击炮弹:抛射到落点后爆炸 */
  private fireMortarShell(sx: number, sz: number, tx: number, tz: number): void {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshToonMaterial({ color: 0xff5544, emissive: 0xff5544, emissiveIntensity: 2.2 }),
    );
    this.stage.scene.add(mesh);
    this.mortarShells.push({ sx, sz, tx, tz, x: sx, z: sz, t: 0, mesh });
    // 落点预警圈(持续到落地)
    const tmp = { x: 0, y: 0 };
    this.worldToScreen(tx, tz, tmp);
    this.overlay.ring(tmp.x, tmp.y, 0xff5544, 55, BALANCE.mortar.shellDur);
    synth.shoot();
  }

  private updateShells(dt: number): void {
    for (let i = this.mortarShells.length - 1; i >= 0; i--) {
      const s = this.mortarShells[i];
      s.t += dt;
      const prog = Math.min(1, s.t / BALANCE.mortar.shellDur);
      s.x = s.sx + (s.tx - s.sx) * prog;
      s.z = s.sz + (s.tz - s.sz) * prog;
      s.mesh.position.set(s.x, 0.5 + Math.sin(prog * Math.PI) * BALANCE.mortar.arcHeight, s.z);
      if (prog >= 1) {
        this.explode(s.x, s.z, BALANCE.mortar.radius, BALANCE.enemies.mortar.dmg);
        this.stage.scene.remove(s.mesh);
        this.mortarShells.splice(i, 1);
      }
    }
  }

  /** 齿轮宠物:环绕玩家,接触伤敌 + 挡敌弹 */
  private updatePets(dt: number, time: number): void {
    while (this.pets.length < this.stats.pet) {
      const g = new THREE.Group();
      const gear = makeGear(0.34, 8, 0.14, 3);
      gear.rotation.x = Math.PI / 2;
      g.add(gear);
      this.stage.scene.add(g);
      this.pets.push({ mesh: g, angle: this.pets.length * Math.PI });
    }
    while (this.pets.length > this.stats.pet) {
      const pet = this.pets.pop()!;
      this.stage.scene.remove(pet.mesh);
    }
    if (this.pets.length === 0) return;

    this.petTick -= dt;
    const doTick = this.petTick <= 0;
    if (doTick) this.petTick = BALANCE.pet.tickInterval;
    // 协同:武装齿轮——宠物自动射击最近的敌人
    this.petShootCd -= dt;
    if (this.stats.petShoot > 0 && this.petShootCd <= 0) {
      this.petShootCd = 1.2;
      let target: Enemy | null = null;
      let best = 11;
      for (const e of this.enemies) {
        const d = Math.hypot(e.x - this.player.x, e.z - this.player.z);
        if (d < best) {
          best = d;
          target = e;
        }
      }
      if (target) {
        const pet = this.pets[0];
        const px = pet.mesh.position.x;
        const pz = pet.mesh.position.z;
        const dx = target.x - px;
        const dz = target.z - pz;
        const dl = Math.hypot(dx, dz) || 1;
        const b = this.playerBullets.findFree();
        if (b) {
          b.active = true;
          b.x = px;
          b.z = pz;
          b.vx = (dx / dl) * 20;
          b.vz = (dz / dl) * 20;
          b.dmg = this.stats.damage * 0.5;
          b.life = 0.9;
          b.pierce = 0;
          b.bounce = 0;
          b.scale = 0.8;
          b.crit = false;
        }
        synth.hit();
      }
    }

    this.pets.forEach((pet, i) => {
      pet.angle += dt * BALANCE.pet.orbitSpeed;
      const a = pet.angle + (i * Math.PI * 2) / this.pets.length;
      const px = this.player.x + Math.cos(a) * BALANCE.pet.orbitRadius;
      const pz = this.player.z + Math.sin(a) * BALANCE.pet.orbitRadius;
      pet.mesh.position.set(px, 0.8 + Math.sin(time * 3 + i) * 0.1, pz);
      pet.mesh.rotation.y += dt * 4;

      // 接触伤害(按 tick)
      if (doTick) {
        for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
          const e = this.enemies[ei];
          if (Math.hypot(e.x - px, e.z - pz) < e.r + 0.5) {
            this.damageEnemy(ei, BALANCE.pet.dmgBase + this.stats.damage * BALANCE.pet.dmgRatio, false, e.x - px, e.z - pz);
          }
        }
      }
      // 挡下敌弹
      for (const b of this.enemyBullets.items) {
        if (b.active && Math.hypot(b.x - px, b.z - pz) < BALANCE.pet.blockRadius) {
          b.active = false;
          const tmp = { x: 0, y: 0 };
          this.worldToScreen(px, pz, tmp);
          this.overlay.sparkBurst(tmp.x, tmp.y, 0xe8c877, 5);
          synth.hit();
        }
      }
    });
  }

  /** 宝箱/商店交互物 */
  private updateInteractives(dt: number, time: number): void {
    for (const it of this.interactives) {
      if (it.used) continue;
      it.mesh.rotation.y += dt * 0.8;
      it.mesh.position.y = 0.15 + Math.sin(time * 2.5 + it.x) * 0.06;
      if (Math.hypot(this.player.x - it.x, this.player.z - it.z) < it.r) {
        if (it.cost > 0 && this.cogs < it.cost) {
          this.cantAffordHint(it);
          continue;
        }
        it.used = true;
        this.cogs -= it.cost;
        this.stage.scene.remove(it.mesh);
        synth.pickup();
        const tmp = { x: 0, y: 0 };
        this.worldToScreen(it.x, it.z, tmp);
        this.overlay.ring(tmp.x, tmp.y, 0xe8c877, 70);
        it.effect();
      }
    }
  }

  private affordWarned = new Set<Interactive>();
  private cantAffordHint(it: Interactive): void {
    if (this.affordWarned.has(it)) return;
    this.affordWarned.add(it);
    this.overlay.floatText(it.x, it.z, t('shop.noCogs'), 0xd85a4a);
  }

  private spawnDrop(x: number, z: number, kind: 'heart' | 'cog' = 'heart'): void {
    let mesh: THREE.Mesh;
    if (kind === 'cog') {
      // 加大 + 强发光,一眼可见
      mesh = makeGear(0.38, 8, 0.14, 1.5);
      mesh.rotation.x = Math.PI / 2;
      mesh.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.material = new THREE.MeshToonMaterial({
            color: 0xe8c877,
            emissive: 0xe8c877,
            emissiveIntensity: 1.5,
          });
        }
      });
    } else {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 8, 8),
        new THREE.MeshToonMaterial({ color: 0x7ec86a, emissive: 0x4a9a3a, emissiveIntensity: 2 }),
      );
    }
    mesh.position.set(x, 0.5, z);
    this.stage.scene.add(mesh);
    this.drops.push({ mesh, x, z, t: 0, kind });
  }

  private updateDrops(dt: number, time: number): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      d.mesh.position.y = 0.5 + Math.sin(time * 3 + i) * 0.15;
      // 磁吸:进入半径后加速飞向玩家
      const distP = Math.hypot(d.x - this.player.x, d.z - this.player.z);
      if (distP < BALANCE.drops.magnetRadius * (1 + 0.5 * this.stats.scavenger)) {
        const pull = BALANCE.drops.magnetSpeed * (1.2 - distP / (BALANCE.drops.magnetRadius * (1 + 0.5 * this.stats.scavenger)));
        d.x += ((this.player.x - d.x) / (distP || 1)) * pull * dt;
        d.z += ((this.player.z - d.z) / (distP || 1)) * pull * dt;
        d.mesh.position.x = d.x;
        d.mesh.position.z = d.z;
      }
      if (distP < 0.9) {
        if (d.kind === 'cog') {
          this.cogs++;
          const tmp2 = { x: 0, y: 0 };
          this.worldToScreen(d.x, d.z, tmp2);
          this.overlay.sparkBurst(tmp2.x, tmp2.y, 0xe8c877, 8);
        } else {
          this.heal(BALANCE.drops.heartHeal);
          const tmp = { x: 0, y: 0 };
          this.worldToScreen(d.x, d.z, tmp);
          this.overlay.sparkBurst(tmp.x, tmp.y, 0x7ec86a, 10);
        }
        synth.pickup();
        this.stage.scene.remove(d.mesh);
        this.drops.splice(i, 1);
      }
    }
    // 出口传送门
    if (this.exitPortal) {
      this.exitPortal.rotation.y += dt * 1.5;
      if (Math.hypot(this.player.x, this.player.z) < 1.2) {
        this.floorIndex++;
        this.overlay.flash(0xe8c877, 0.5);
        synth.doorOpen();
        this.newFloor();
      }
    }
  }

  // ---------- 房间清除 / 门 ----------

  private onRoomCleared(): void {
    const node = this.currentNode!;
    node.cleared = true;
    this.overlay.hideBossHp();

    if (node.kind === 'boss') {
      this.overlay.banner(t('boss.defeated'), undefined, 0xe8c877);
      music.setIntensity(0);
      // 生成通往下一层的出口传送门
      const portal = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.9, 0.12, 8, 24),
        new THREE.MeshToonMaterial({ color: PALETTE.brassLight, emissive: PALETTE.brassLight, emissiveIntensity: 1.6 }),
      );
      ring.rotation.x = Math.PI / 2;
      portal.add(ring);
      const light = new THREE.PointLight(0xe8c877, 12, 8);
      light.position.y = 1;
      portal.add(light);
      this.stage.scene.add(portal);
      this.exitPortal = portal;
      synth.doorOpen();
      this.room!.setAllDoors(true);
      return;
    }

    // 挑战房限时内清空:额外奖励
    if (node.kind === 'challenge' && this.challengeTimer > 0) {
      this.cogs += BALANCE.challenge.cogs;
      this.overlay.banner(t('challenge.success'), undefined, 0xe8c877);
    }
    // 普通房间:三选一升级(Pixi 原生界面)
    this.offerUpgrade();
  }

  /** 弹出三选一升级(清房奖励/宝箱共用),支持 1/2/3 键快选 */
  private offerUpgrade(): void {
    this.state = 'upgrading';
    this.overlay.setCrosshairVisible(false);
    this.input.exitLock(); // 释放鼠标以便点击卡片
    const options = drawUpgrades(3, (arr) => this.rng.pick(arr), this.upgradeCounts);
    const keyHandler = (e: KeyboardEvent) => {
      const idx = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (idx >= 0 && options[idx]) {
        pick(options[idx]);
      }
    };
    const pick = (u: Upgrade): void => {
      window.removeEventListener('keydown', keyHandler);
      u.apply(this.stats, (n) => this.heal(n));
      this.upgradeCounts.set(u.id, (this.upgradeCounts.get(u.id) ?? 0) + 1);
      if (!this.codex.upgrades.includes(u.id)) {
        this.codex.upgrades.push(u.id);
        saveCodex(this.codex);
      }
      synth.pickup();
      this.room!.setAllDoors(true);
      synth.doorOpen();
      this.state = 'playing';
      this.overlay.setCrosshairVisible(true);
      this.input.requestLock();
    };
    window.addEventListener('keydown', keyHandler);
    this.overlay.showUpgrade(options, pick, this.upgradeCounts);
  }

  private checkDoors(): void {
    if (!this.room || !this.currentNode || !this.currentNode.cleared || !this.floor) return;
    const p = this.player;
    const hw = CONFIG.roomW / 2;
    const hd = CONFIG.roomD / 2;
    const margin = 0.9;
    let side: DoorSide | null = null;
    if (Math.abs(p.x) < 2 && p.z < -hd + margin) side = 'n';
    else if (Math.abs(p.x) < 2 && p.z > hd - margin) side = 's';
    else if (p.x > hw - margin && Math.abs(p.z) < 2) side = 'e';
    else if (p.x < -hw + margin && Math.abs(p.z) < 2) side = 'w';
    if (!side) return;
    const target = this.currentNode.links[side];
    if (target === undefined) return;
    const opposite: Record<DoorSide, DoorSide> = { n: 's', s: 'n', e: 'w', w: 'e' };
    this.overlay.flash(0x000000, 0.35);
    this.loadRoom(target, opposite[side]);
  }

  // ---------- 工具 ----------

  private collideWorld(x: number, z: number, r: number): { x: number; z: number } {
    const hw = CONFIG.roomW / 2 - r - 0.35;
    const hd = CONFIG.roomD / 2 - r - 0.35;
    x = THREE.MathUtils.clamp(x, -hw, hw);
    z = THREE.MathUtils.clamp(z, -hd, hd);
    if (this.room) {
      for (const o of this.room.obstacles) {
        const dx = x - o.x;
        const dz = z - o.z;
        const d = Math.hypot(dx, dz);
        const min = o.r + r;
        if (d < min && d > 0.001) {
          x = o.x + (dx / d) * min;
          z = o.z + (dz / d) * min;
        }
      }
    }
    return { x, z };
  }

  /** 升级形态变化:分裂阀加枪管 / 蒸汽推进加烟囱 / 护盾显示能量泡 */
  private refreshPlayerAttachments(): void {
    const body = this.player.mesh?.userData.body as THREE.Group | undefined;
    if (!body) return;
    // 枪管组:1 + multiShot 根
    const barrels = body.userData.barrels as THREE.Mesh[];
    const offsets = body.userData.barrelOffsets as number[][];
    const n = Math.min(4, 1 + this.stats.multiShot);
    const off = offsets[n - 1];
    barrels.forEach((b, i) => {
      b.visible = i < n;
      if (i < n) b.position.x = 0.28 + (off[i] ?? 0);
    });
    // 烟囱段数:蒸汽推进每级 +1
    const speedLv = Math.min(2, this.upgradeCounts.get('speed') ?? 0);
    const stacks = body.userData.stacks as THREE.Group[];
    stacks.forEach((s, i) => (s.visible = i <= speedLv));
    (body.userData.stackCap as THREE.Mesh).position.y = 1.5 + speedLv * 0.26;
    // 护盾能量泡(充能完毕时显示,缓慢呼吸)
    const bubble = body.userData.bubble as THREE.Mesh;
    bubble.visible = this.stats.shield > 0 && this.player.shieldUp;
    if (bubble.visible) {
      bubble.scale.setScalar(1 + Math.sin(performance.now() / 300) * 0.03);
    }
  }

  /** 蒸汽喷射机关:3.2s 周期 — 0.7s 预警 → 0.8s 喷发伤害 */
  private updateSteamJets(dt: number, time: number): void {
    for (const j of this.steamJets) {
      j.vent.update(dt, time);
      j.timer += dt;
      const cycle = j.timer % 3.2;
      const ventMesh = j.vent;
      if (cycle < 0.7) {
        if (j.phase !== 1) {
          j.phase = 1;
          ventMesh.visible = false;
          const tmp = { x: 0, y: 0 };
          this.worldToScreen(j.x, j.z, tmp);
          this.overlay.ring(tmp.x, tmp.y, 0x9fb4c0, 45, 0.7);
        }
      } else if (cycle < 1.5) {
        if (j.phase !== 2) {
          j.phase = 2;
          ventMesh.visible = true;
          synth.dash();
        }
        if (this.player.invuln <= 0 && Math.hypot(this.player.x - j.x, this.player.z - j.z) < 1.2) {
          this.hurtPlayer(8);
        }
      } else {
        j.phase = 0;
        ventMesh.visible = false;
      }
    }
  }

  private updateCameraTarget(): void {
    const p = this.player;
    const aspect = window.innerWidth / window.innerHeight;
    const halfW = (CONFIG.viewHeight / 2) * aspect;
    const halfH = CONFIG.viewHeight / 2;
    const cx = THREE.MathUtils.clamp(p.x, -Math.max(0, CONFIG.roomW / 2 - halfW + 1), Math.max(0, CONFIG.roomW / 2 - halfW + 1));
    const cz = THREE.MathUtils.clamp(p.z, -Math.max(0, CONFIG.roomD / 2 - halfH + 1), Math.max(0, CONFIG.roomD / 2 - halfH + 1));
    this.stage.setTarget(cx, 0, cz);
  }

  private worldToScreen(x: number, z: number, out: { x: number; y: number }): void {
    this.stage.worldToScreen(new THREE.Vector3(x, 1, z), out);
  }

  private clearBullets(): void {
    this.playerBullets.clear();
    this.enemyBullets.clear();
  }

  togglePause(): boolean {
    if (this.state === 'playing') {
      this.state = 'paused';
      return true;
    }
    if ((this.state as GameState) === 'paused') {
      this.state = 'playing';
    }
    return false;
  }
}

function roomLabel(node: RoomNode): string {
  if (node.kind === 'start') return t('room.start');
  if (node.kind === 'boss') return t('room.boss');
  if (node.kind === 'treasure') return t('room.treasure');
  if (node.kind === 'shop') return t('room.shop');
  if (node.kind === 'challenge') return t('room.challenge');
  return node.cleared ? t('room.cleared') : t('room.combat');
}
