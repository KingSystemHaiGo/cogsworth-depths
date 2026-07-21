// 游戏主逻辑:实体、战斗、房间流转、肉鸽循环
import * as THREE from 'three';
import { RNG } from '../core/rng.ts';
import { Input } from '../core/input.ts';
import { CONFIG, PALETTE } from '../core/config.ts';
import { ThreeStage } from '../three/scene.ts';
import { Room, DoorSide } from '../three/room.ts';
import { makePlayerMesh, makeEnemyMesh, EnemyKind } from '../three/actors.ts';
import { makeGear } from '../three/factory/gears.ts';
import { generateFloor, Floor, RoomNode } from './rooms.ts';
import { BALANCE } from './balance.ts';
import { t, lt } from '../core/i18n.ts';
import { PlayerStats, Upgrade, drawUpgrades } from './upgrades.ts';
import { Overlay } from '../pixi/overlay.ts';
import { synth } from '../audio/synth.ts';

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
}

interface Bullet {
  mesh: THREE.Mesh;
  active: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  dmg: number;
  life: number;
  pierce: number;
  bounce: number; // 剩余弹射次数
  r: number;
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
  timeSec = 0;

  private rng = new RNG('init');
  private floor: Floor | null = null;
  private currentNode: RoomNode | null = null;
  private room: Room | null = null;

  private player = {
    mesh: null as THREE.Group | null,
    x: 0,
    z: 0,
    hp: CONFIG.playerHp,
    fireCd: 0,
    invuln: 0,
    muzzleT: 0,
    shieldUp: false,
    shieldCd: 0,
    aimX: 1,
    aimZ: 0,
  };
  stats: PlayerStats = this.baseStats();

  private enemies: Enemy[] = [];
  private playerBullets: Bullet[] = [];
  private enemyBullets: Bullet[] = [];
  private drops: Drop[] = [];
  private pets: Pet[] = [];
  private petTick = 0;
  private interactives: Interactive[] = [];
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
    // 子弹池
    const pGeo = new THREE.SphereGeometry(0.14, 8, 6);
    const pMat = new THREE.MeshBasicMaterial({ color: PALETTE.playerBullet });
    const eGeo = new THREE.SphereGeometry(0.17, 8, 6);
    const eMat = new THREE.MeshBasicMaterial({ color: PALETTE.enemyBullet });
    for (let i = 0; i < 128; i++) {
      const m = new THREE.Mesh(pGeo, pMat);
      m.visible = false;
      stage.scene.add(m);
      this.playerBullets.push({ mesh: m, active: false, x: 0, z: 0, vx: 0, vz: 0, dmg: 0, life: 0, pierce: 0, bounce: 0, r: 0.18 });
    }
    for (let i = 0; i < 256; i++) {
      const m = new THREE.Mesh(eGeo, eMat);
      m.visible = false;
      stage.scene.add(m);
      this.enemyBullets.push({ mesh: m, active: false, x: 0, z: 0, vx: 0, vz: 0, dmg: 0, life: 0, pierce: 0, bounce: 0, r: 0.2 });
    }
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
    this.timeSec = 0;
    this.cogs = 0;
    this.stats = this.baseStats();
    this.upgradeCounts.clear();
    this.player.hp = this.stats.maxHp;
    this.player.shieldUp = false;
    this.player.shieldCd = 0;
    for (const pet of this.pets) this.stage.scene.remove(pet.mesh);
    this.pets = [];
    this.newFloor();
    this.state = 'playing';
    this.overlay.setCrosshairVisible(true);
  }

  private newFloor(): void {
    this.rng = new RNG(`${this.seed}#${this.floorIndex}`);
    const roomCount = BALANCE.roomCount(this.floorIndex);
    this.floor = generateFloor(this.rng, roomCount);
    this.loadRoom(this.floor.startId, null);
  }

  private loadRoom(nodeId: number, enterFrom: DoorSide | null): void {
    if (!this.floor) return;
    // 清理旧房间
    if (this.room) this.stage.scene.remove(this.room.group);
    for (const e of this.enemies) this.stage.scene.remove(e.mesh);
    this.enemies = [];
    for (const d of this.drops) this.stage.scene.remove(d.mesh);
    this.drops = [];
    for (const it of this.interactives) this.stage.scene.remove(it.mesh);
    this.interactives = [];
    this.affordWarned.clear();
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

    if (!node.cleared) this.spawnEnemies(node);
    if (node.kind === 'boss') this.overlay.setBossHp(t('boss.name'), 1);
    // 特殊房间:宝箱/商店,无敌人,门常开
    if (node.kind === 'treasure' || node.kind === 'shop') {
      node.cleared = true;
      this.room.setAllDoors(true);
      this.setupSpecialRoom(node.kind);
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

  private spawnEnemies(node: RoomNode): void {
    const hpScale = BALANCE.hpScale(this.floorIndex);
    if (node.kind === 'boss') {
      this.spawnEnemy('boss', 0, -4, hpScale);
      return;
    }
    const count = BALANCE.spawnCount(this.floorIndex, (a, b) => this.rng.int(a, b));
    for (let i = 0; i < count; i++) {
      const roll = this.rng.next();
      // 第 2 层起加入跳蚤和分裂球
      let kind: EnemyKind;
      if (this.floorIndex >= 2) {
        kind =
          roll < 0.38 ? 'chaser' : roll < 0.6 ? 'shooter' : roll < 0.72 ? 'bomber' : roll < 0.86 ? 'dasher' : 'splitter';
      } else {
        kind = roll < 0.55 ? 'chaser' : roll < 0.82 ? 'shooter' : 'bomber';
      }
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 10; tries++) {
        x = this.rng.range(-CONFIG.roomW / 2 + 3, CONFIG.roomW / 2 - 3);
        z = this.rng.range(-CONFIG.roomD / 2 + 3, CONFIG.roomD / 2 - 3);
        if (Math.hypot(x - this.player.x, z - this.player.z) > 6) break;
      }
      this.spawnEnemy(kind, x, z, hpScale);
    }
  }

  private spawnEnemy(kind: EnemyKind, x: number, z: number, hpScale: number): void {
    const def = BALANCE.enemies[kind];
    const mesh = makeEnemyMesh(kind);
    mesh.position.set(x, 0, z);
    this.stage.scene.add(mesh);
    this.enemies.push({
      kind,
      mesh,
      x,
      z,
      vx: 0,
      vz: 0,
      kbx: 0,
      kbz: 0,
      hp: kind === 'boss' ? BALANCE.bossHp(this.floorIndex) : def.hp * hpScale,
      maxHp: kind === 'boss' ? BALANCE.bossHp(this.floorIndex) : def.hp * hpScale,
      r: def.r,
      speed: def.speed,
      dmg: def.dmg,
      fireCd: 1 + Math.random() * 1.5,
      fuse: -1,
      stateT: 0,
      phase: 0,
      enraged: false,
    });
  }

  // ---------- 主更新 ----------

  update(dt: number, time: number): void {
    if (this.state !== 'playing') return;
    this.timeSec += dt;
    if (this.room) this.room.update(dt, time);

    this.updatePlayer(dt);
    this.updateEnemies(dt, time);
    this.updateBullets(dt, this.playerBullets, true);
    this.updateBullets(dt, this.enemyBullets, false);
    this.updateDrops(dt, time);
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
    // 敌人头顶血条(只显示受伤的,Boss 用底部大血条)
    this.enemyHpList.length = 0;
    for (const e of this.enemies) {
      if (e.hp < e.maxHp && e.kind !== 'boss') {
        this.enemyHpList.push({ x: e.x, z: e.z, ratio: e.hp / e.maxHp });
      }
    }
    this.overlay.setEnemyHp(this.enemyHpList);
    this.overlay.setCooldowns(
      1 - Math.max(0, this.dashCd) / 1.25,
      1 - Math.max(0, this.rollCd) / 0.9,
    );

    // 房间清除判定
    if (this.currentNode && !this.currentNode.cleared && this.enemies.length === 0) {
      this.onRoomCleared();
    }

    this.overlay.setHUD(
      this.player.hp,
      this.stats.maxHp,
      this.floorIndex,
      this.currentNode ? roomLabel(this.currentNode) : '',
      this.cogs,
    );
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    const axis = this.input.moveAxis();

    // 冲刺(空格):短爆发位移 + 无敌帧
    if (this.dashCd > 0) this.dashCd -= dt;
    if (
      this.dashCd <= 0 &&
      this.input.pressed('Space') &&
      (axis.x !== 0 || axis.y !== 0)
    ) {
      this.dashT = 0.16;
      this.dashCd = 1.25;
      this.dashX = axis.x;
      this.dashZ = axis.y;
      p.invuln = Math.max(p.invuln, 0.32);
      synth.dash();
      const tmp = { x: 0, y: 0 };
      this.worldToScreen(p.x, p.z, tmp);
      this.overlay.sparkBurst(tmp.x, tmp.y, 0x9fb4c0, 8);
    }

    // 翻滚(Shift):较长位移,全身翻转动画,全程无敌
    if (this.rollCd > 0) this.rollCd -= dt;
    if (
      this.rollCd <= 0 &&
      (this.input.pressed('ShiftLeft') || this.input.pressed('ShiftRight')) &&
      (axis.x !== 0 || axis.y !== 0)
    ) {
      this.rollT = 0.42;
      this.rollCd = 0.9;
      this.rollX = axis.x;
      this.rollZ = axis.y;
      p.invuln = Math.max(p.invuln, 0.45);
      synth.dash();
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
      p.x += this.dashX * this.stats.speed * 3.4 * dt;
      p.z += this.dashZ * this.stats.speed * 3.4 * dt;
      // 冲刺蒸汽残影
      if (Math.random() < 0.6) {
        const tmp = { x: 0, y: 0 };
        this.worldToScreen(p.x, p.z, tmp);
        this.overlay.sparkBurst(tmp.x, tmp.y, 0x6a7a86, 1);
      }
    } else {
      p.x += axis.x * this.stats.speed * dt;
      p.z += axis.y * this.stats.speed * dt;
    }
    p.x = this.collideWorld(p.x, p.z, 0.5).x;
    p.z = this.collideWorld(p.x, p.z, 0.5).z;

    // 瞄准(每帧即时,无平滑无延迟)
    this.updateAimFacing();

    // 开火
    p.fireCd -= dt;
    if (this.input.mouseDown && p.fireCd <= 0) {
      p.fireCd = 1 / this.stats.fireRate;
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

    // 网格动画:走路摆腿(炮口朝向由 updateAimFacing 每帧即时设置)
    const moving = Math.abs(axis.x) + Math.abs(axis.y) > 0;
    const t = performance.now() / 1000;
    const legL = p.mesh!.userData.legL as THREE.Mesh;
    const legR = p.mesh!.userData.legR as THREE.Mesh;
    legL.position.z = moving ? Math.sin(t * 12) * 0.18 : 0;
    legR.position.z = moving ? -Math.sin(t * 12) * 0.18 : 0;
    const gear = body.userData.gear as THREE.Mesh;
    if (gear) gear.rotation.z += dt * 2.2;
    // 压力表指针随移动摆动
    const needle = body.userData.needle as THREE.Mesh | undefined;
    if (needle) needle.rotation.z = Math.sin(t * 3.2) * (moving ? 0.9 : 0.3);
    p.mesh!.position.set(p.x, 0, p.z);
  }

  private groundVec = new THREE.Vector3();

  /** 每帧即时瞄准:准星在哪,炮口立刻转向哪(顿帧期间也保持) */
  private updateAimFacing(): void {
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
      body.rotation.y = Math.atan2(p.aimX, p.aimZ);
    }
  }

  private firePlayerBullets(): void {
    const p = this.player;
    const total = 1 + this.stats.multiShot;
    const spreadStep = 0.12;
    for (let i = 0; i < total; i++) {
      const offset = (i - (total - 1) / 2) * spreadStep;
      const cos = Math.cos(offset);
      const sin = Math.sin(offset);
      const dx = p.aimX * cos - p.aimZ * sin;
      const dz = p.aimX * sin + p.aimZ * cos;
      const b = this.playerBullets.find((bb) => !bb.active);
      if (!b) return;
      const crit = Math.random() < 0.1;
      b.active = true;
      b.x = p.x + dx * 0.8;
      b.z = p.z + dz * 0.8;
      b.vx = dx * this.stats.bulletSpeed;
      b.vz = dz * this.stats.bulletSpeed;
      b.dmg = this.stats.damage * (crit ? 2 : 1);
      b.life = CONFIG.bulletLife;
      b.pierce = this.stats.pierce;
      b.bounce = this.stats.bounce;
      b.mesh.visible = true;
      b.mesh.scale.setScalar(this.stats.bulletScale * (crit ? 1.6 : 1));
      b.mesh.userData.crit = crit;
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
        case 'boss': {
          this.updateBoss(e, dt, dist, nx, nz, time);
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
      b.mesh.position.set(b.x, 0.8, b.z);

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
            this.damageEnemy(i, b.dmg, b.mesh.userData.crit === true, b.vx, b.vz);
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
        b.mesh.visible = false;
      }
    }
  }

  private fireEnemyBullet(x: number, z: number, vx: number, vz: number, dmg: number): void {
    const b = this.enemyBullets.find((bb) => !bb.active);
    if (!b) return;
    b.active = true;
    b.x = x;
    b.z = z;
    b.vx = vx;
    b.vz = vz;
    b.dmg = dmg;
    b.life = 3.5;
    b.mesh.visible = true;
  }

  private damageEnemy(idx: number, dmg: number, crit: boolean, dirX = 0, dirZ = 0): void {
    const e = this.enemies[idx];
    e.hp -= dmg;
    // 击退:沿弹道方向推一小段(Boss 免疫)
    if (e.kind !== 'boss') {
      const v = Math.hypot(dirX, dirZ) || 1;
      e.kbx += (dirX / v) * 7;
      e.kbz += (dirZ / v) * 7;
    }
    synth.hit();
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
    this.stage.scene.remove(e.mesh);
    this.enemies.splice(idx, 1);

    // 分裂球死亡:裂成两只小蜘蛛
    if (e.kind === 'splitter') {
      this.spawnEnemy('mini', e.x - 0.7, e.z, 1);
      this.spawnEnemy('mini', e.x + 0.7, e.z, 1);
    }

    if (byPlayer) {
      this.kills++;
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
      } else if (this.rng.chance(BALANCE.drops.heartChance)) {
        this.spawnDrop(e.x, e.z);
      } else if (this.rng.chance(BALANCE.drops.cogChance)) {
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
      for (const b of this.enemyBullets) {
        if (b.active && Math.hypot(b.x - px, b.z - pz) < BALANCE.pet.blockRadius) {
          b.active = false;
          b.mesh.visible = false;
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
      if (distP < BALANCE.drops.magnetRadius) {
        const pull = BALANCE.drops.magnetSpeed * (1.2 - distP / BALANCE.drops.magnetRadius);
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

    // 普通房间:三选一升级(Pixi 原生界面)
    this.offerUpgrade();
  }

  /** 弹出三选一升级(清房奖励/宝箱共用) */
  private offerUpgrade(): void {
    this.state = 'upgrading';
    this.overlay.setCrosshairVisible(false);
    this.input.exitLock(); // 释放鼠标以便点击卡片
    const options = drawUpgrades(3, (arr) => this.rng.pick(arr), this.upgradeCounts);
    this.overlay.showUpgrade(options, (u: Upgrade) => {
      u.apply(this.stats, (n) => this.heal(n));
      this.upgradeCounts.set(u.id, (this.upgradeCounts.get(u.id) ?? 0) + 1);
      synth.pickup();
      this.room!.setAllDoors(true);
      synth.doorOpen();
      this.state = 'playing';
      this.overlay.setCrosshairVisible(true);
      this.input.requestLock();
    }, this.upgradeCounts);
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
    for (const b of [...this.playerBullets, ...this.enemyBullets]) {
      b.active = false;
      b.mesh.visible = false;
    }
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
  return node.cleared ? t('room.cleared') : t('room.combat');
}
