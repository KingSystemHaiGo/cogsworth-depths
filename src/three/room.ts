// 程序化房间构建:地板/墙壁/门/蒸汽朋克装饰,全部由代码生成
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../core/rng.ts';
import { CONFIG, PALETTE } from '../core/config.ts';
import { toonMat, glowMat, toonGradient, makeBlobShadow } from './materials.ts';
import { makeSteamLantern } from './factory/steamLantern.ts';
import { makeValveWheel } from './factory/valveWheel.ts';
import { makeWallGauge } from './factory/wallGauge.ts';
import { makeGear, spinGears } from './factory/gears.ts';
import { makePipeRun } from './factory/pipes.ts';
import { SteamVent } from './factory/steam.ts';

export type DoorSide = 'n' | 's' | 'e' | 'w';

export interface Obstacle {
  x: number;
  z: number;
  r: number;
}

/** 代码绘制铁板地面纹理:深色钢板 + 铆钉 + 接缝 */
function makeFloorTexture(): THREE.Texture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1a1f26';
  ctx.fillRect(0, 0, size, size);
  const plates = 4;
  const plate = size / plates;
  for (let i = 0; i < plates; i++) {
    for (let j = 0; j < plates; j++) {
      const x = i * plate;
      const y = j * plate;
      // 板面轻微色差
      const v = 26 + ((i * 7 + j * 13) % 3) * 4;
      ctx.fillStyle = `rgb(${v},${v + 4},${v + 9})`;
      ctx.fillRect(x + 2, y + 2, plate - 4, plate - 4);
      // 接缝高光
      ctx.strokeStyle = 'rgba(120,130,140,0.25)';
      ctx.strokeRect(x + 2.5, y + 2.5, plate - 5, plate - 5);
      // 四角铆钉
      ctx.fillStyle = 'rgba(160,150,130,0.5)';
      const m = 10;
      for (const [rx, ry] of [[m, m], [plate - m, m], [m, plate - m], [plate - m, plate - m]]) {
        ctx.beginPath();
        ctx.arc(x + rx, y + ry, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const floorTex = makeFloorTexture();

/** 代码绘制木地板纹理(人偶剧场层用):木板 + 色差 + 纹理线 */
function makeWoodTexture(): THREE.Texture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2a1c12';
  ctx.fillRect(0, 0, size, size);
  const rows = 6;
  const rh = size / rows;
  for (let i = 0; i < rows; i++) {
    const y = i * rh;
    const v = 42 + (i % 3) * 8;
    ctx.fillStyle = `rgb(${v},${Math.floor(v * 0.65)},${Math.floor(v * 0.4)})`;
    ctx.fillRect(0, y + 2, size, rh - 4);
    // 木纹线
    ctx.strokeStyle = 'rgba(20,12,6,0.5)';
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.moveTo(0, y + 6 + k * (rh / 6) + Math.sin(i * 7 + k) * 3);
      ctx.bezierCurveTo(size * 0.3, y + k * (rh / 5) + 4, size * 0.7, y + k * (rh / 5) + 8, size, y + 8 + k * (rh / 6));
      ctx.stroke();
    }
    // 板缝
    ctx.fillStyle = 'rgba(10,6,3,0.9)';
    ctx.fillRect(0, y, size, 2);
    // 错缝竖线
    ctx.fillRect(((i * 173) % size), y, 2, rh);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const woodTex = makeWoodTexture();

const ironMat = toonMat(PALETTE.iron);
const wallMat = toonMat(PALETTE.wall);
const brassMat = toonMat(PALETTE.brass);
const copperMat = toonMat(PALETTE.copper);
const emberMat = glowMat(PALETTE.ember, 2.2);

/** 房间主题:铁灰(默认)/ 铁锈 / 铜绿 — 地板墙面换色,氛围立刻不同 */
const ROOM_THEMES = [
  { floor: 0xffffff, wall: 0x2b323b }, // 铁灰
  { floor: 0xd8b09a, wall: 0x38251c }, // 铁锈
  { floor: 0xa8ccc2, wall: 0x1e302c }, // 铜绿
] as const;

export interface Door {
  side: DoorSide;
  group: THREE.Group;
  plate: THREE.Mesh;
  isOpen: boolean;
  anim: number; // 0 关 1 开
}

export class Room {
  group = new THREE.Group();
  gears: THREE.Mesh[] = [];
  vents: SteamVent[] = [];
  doors: Door[] = [];
  obstacles: Obstacle[] = [];
  private lamps: THREE.PointLight[] = [];
  private pistons: { head: THREE.Mesh; baseY: number; phase: number; speed: number }[] = [];
  /** 已占用区域登记:所有装饰物摆放前必须查这里,防止穿模打架 */
  private placed: { x: number; z: number; r: number }[] = [];

  /** 检查 (x,z,r) 能否摆放(不和已占用区/门口重叠),成功则登记 */
  private claim(x: number, z: number, r: number, doorSides: DoorSide[]): boolean {
    if (this.nearDoorApproach(x, z, doorSides)) return false;
    for (const p of this.placed) {
      if (Math.hypot(x - p.x, z - p.z) < r + p.r + 0.4) return false;
    }
    this.placed.push({ x, z, r });
    return true;
  }

  readonly w = CONFIG.roomW;
  readonly d = CONFIG.roomD;

  constructor(rng: RNG, doorSides: DoorSide[], themeIdx?: number) {
    const { w, d } = this;
    const wallH = CONFIG.wallH;
    const doorGap = 4;
    // 主题:指定楼层主题或随机
    const theme = themeIdx !== undefined ? ROOM_THEMES[themeIdx % ROOM_THEMES.length] : rng.pick(ROOM_THEMES);
    const themedWall = wallMat.clone();
    (themedWall.color as THREE.Color).set(theme.wall);

    // 地板
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshToonMaterial({ map: (themeIdx === 2 ? woodTex : floorTex).clone(), gradientMap: toonGradient }),
    );
    (floor.material as THREE.MeshToonMaterial).map!.repeat.set(w / 8, d / 8);
    (floor.material as THREE.MeshToonMaterial).color.set(theme.floor);
    floor.rotation.x = -Math.PI / 2;
    this.group.add(floor);

    // 四面墙(有门的一侧留缺口)。几何先收集,最后按材质合并,
    // 每面墙 2 个网格 → 全房间墙体只占 2 次 draw call
    const wallGeos: THREE.BufferGeometry[] = [];
    const trimGeos: THREE.BufferGeometry[] = [];
    const mkWall = (ww: number, x: number, z: number, rotY: number) => {
      const wg = new THREE.BoxGeometry(ww, wallH, 0.6);
      wg.rotateY(rotY);
      wg.translate(x, wallH / 2, z);
      wallGeos.push(wg);
      // 顶部黄铜包边
      const tg = new THREE.BoxGeometry(ww, 0.18, 0.7);
      tg.rotateY(rotY);
      tg.translate(x, wallH + 0.09, z);
      trimGeos.push(tg);
    };
    const seg = (total: number) => (total - doorGap) / 2;
    const off = (total: number) => doorGap / 2 + seg(total) / 2;

    for (const side of ['n', 's', 'e', 'w'] as DoorSide[]) {
      const hasDoor = doorSides.includes(side);
      const horiz = side === 'n' || side === 's';
      const total = horiz ? w : d;
      const zn = side === 'n' ? -d / 2 : side === 's' ? d / 2 : 0;
      const xe = side === 'e' ? w / 2 : side === 'w' ? -w / 2 : 0;
      const rotY = horiz ? 0 : Math.PI / 2;
      if (!hasDoor) {
        mkWall(total, xe, zn, rotY);
      } else {
        if (horiz) {
          mkWall(seg(total), -off(total), zn, 0);
          mkWall(seg(total), off(total), zn, 0);
        } else {
          mkWall(seg(total), xe, -off(total), rotY);
          mkWall(seg(total), xe, off(total), rotY);
        }
        this.doors.push(this.makeDoor(side, doorGap, wallH));
      }
    }
    // 合并墙体与包边(各一次 draw call)
    if (wallGeos.length > 0) this.group.add(new THREE.Mesh(mergeGeometries(wallGeos), themedWall));
    if (trimGeos.length > 0) this.group.add(new THREE.Mesh(mergeGeometries(trimGeos), brassMat));

    this.decorate(rng, doorSides);
    this.placeObstacles(rng, doorSides);
  }

  /** 滑门:黄铜板,开门时沉入地下 */
  private makeDoor(side: DoorSide, gap: number, wallH: number): Door {
    const group = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(gap + 0.4, wallH, 0.5), brassMat);
    plate.position.y = wallH / 2;
    group.add(plate);
    // 门中央的舷窗
    const porthole = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.12, 8, 20), copperMat);
    porthole.position.y = wallH * 0.6;
    group.add(porthole);

    const { w, d } = this;
    if (side === 'n') group.position.set(0, 0, -d / 2);
    if (side === 's') group.position.set(0, 0, d / 2);
    if (side === 'e') {
      group.position.set(w / 2, 0, 0);
      group.rotation.y = Math.PI / 2;
    }
    if (side === 'w') {
      group.position.set(-w / 2, 0, 0);
      group.rotation.y = Math.PI / 2;
    }
    this.group.add(group);
    return { side, group, plate, isOpen: false, anim: 0 };
  }

  /** 墙面装饰:齿轮组 + 管线 + 角落锅炉 + 煤气灯。所有装饰避开门的位置 */
  private decorate(rng: RNG, doorSides: DoorSide[]): void {
    const { w, d } = this;
    const wallH = CONFIG.wallH;

    // 齿轮组:只挂在没有门的墙上(优先北墙,其次南墙,再次东西墙)
    const gearWall =
      (['n', 's', 'e', 'w'] as DoorSide[]).find((s) => !doorSides.includes(s)) ?? null;
    if (gearWall) {
      const horiz = gearWall === 'n' || gearWall === 's';
      const total = horiz ? w : d;
      const sign = gearWall === 'n' || gearWall === 'w' ? -1 : 1;
      const gearCount = rng.int(2, 4);
      let gx = -total / 2 + rng.range(3, 6);
      let lastR = 0;
      for (let i = 0; i < gearCount; i++) {
        const r = rng.range(0.7, 1.8);
        const gear = makeGear(r, rng.int(8, 14), 0.3, (i % 2 === 0 ? 1 : -1) * rng.range(0.3, 0.8));
        gx += lastR + r + 0.1;
        lastR = r;
        if (gx > total / 2 - 2) break;
        const gy = rng.range(wallH * 0.5, wallH * 0.85);
        if (horiz) {
          gear.position.set(gx, gy, sign * (d / 2 - 0.45));
        } else {
          gear.position.set(sign * (w / 2 - 0.45), gy, gx);
          gear.rotation.y = Math.PI / 2;
        }
        this.group.add(gear);
        this.gears.push(gear);
      }
    }

    // 管线:只走没有门的东西墙
    for (const side of [-1, 1]) {
      const doorSide: DoorSide = side > 0 ? 'e' : 'w';
      if (doorSides.includes(doorSide)) continue;
      const pipe = makePipeRun(rng, d * rng.range(0.5, 0.85), wallH);
      pipe.position.set(side * (w / 2 - 0.5), 0, 0);
      pipe.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.group.add(pipe);
    }

    // 角落锅炉(1-2 个),顶部接蒸汽喷口
    const corners: [number, number][] = [
      [-w / 2 + 2.2, -d / 2 + 2.2],
      [w / 2 - 2.2, -d / 2 + 2.2],
      [-w / 2 + 2.2, d / 2 - 2.2],
      [w / 2 - 2.2, d / 2 - 2.2],
    ];
    const boilerCount = rng.int(1, 2);
    for (let i = 0; i < boilerCount; i++) {
      const [bx, bz] = corners.splice(rng.int(0, corners.length - 1), 1)[0];
      if (!this.claim(bx, bz, 1.6, doorSides)) continue;
      this.group.add(this.makeBoiler(rng, bx, bz));
      const shadow = makeBlobShadow(1.5, 0.45);
      shadow.position.set(bx, 0.02, bz);
      this.group.add(shadow);
      this.obstacles.push({ x: bx, z: bz, r: 1.1 });
    }

    // 煤气灯:两盏对角点光,灯罩用参考图生成的黄铜蒸汽灯笼
    for (const side of [-1, 1]) {
      const lamp = new THREE.PointLight(0xffb35c, 34, 24, 1.5);
      lamp.position.set(side * w * 0.28, wallH * 0.8, 0);
      this.claim(side * w * 0.28, 0, 0.7, doorSides);
      this.group.add(lamp);
      this.lamps.push(lamp);
      // 蒸汽灯笼(参考图→轮廓旋成管线生成),灯芯放发光球
      const lantern = makeSteamLantern();
      lantern.scale.setScalar(0.55);
      lantern.position.set(lamp.position.x, lamp.position.y - 0.55, lamp.position.z);
      this.group.add(lantern);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), emberMat);
      bulb.position.copy(lamp.position);
      bulb.position.y -= 0.15;
      this.group.add(bulb);
      // 灯杆
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, wallH * 0.8, 6), ironMat);
      pole.position.set(lamp.position.x, wallH * 0.4, lamp.position.z);
      this.group.add(pole);
    }

    // 地面格栅地漏(1-2 块,避开中心)
    const grateCount = rng.int(1, 2);
    for (let i = 0; i < grateCount; i++) {
      const gx = rng.range(-w / 2 + 5, w / 2 - 5);
      const gz = rng.range(-d / 2 + 5, d / 2 - 5);
      if (Math.hypot(gx, gz) < 3.5) continue;
      if (!this.claim(gx, gz, 1.6, doorSides)) continue;
      const grate = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.09, 1.4), ironMat);
      frame.position.y = 0.045;
      grate.add(frame);
      // 格栅条
      const slatGeo = new THREE.BoxGeometry(0.12, 0.11, 1.1);
      for (let s = 0; s < 6; s++) {
        const slat = new THREE.Mesh(slatGeo, brassMat);
        slat.position.set(-0.95 + s * 0.38, 0.055, 0);
        grate.add(slat);
      }
      // 格栅下的炉光(地下有火)
      const glow = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 1.2), emberMat);
      glow.position.y = 0.01;
      grate.add(glow);
      grate.position.set(gx, 0, gz);
      grate.rotation.y = rng.chance(0.5) ? Math.PI / 2 : 0;
      this.group.add(grate);
    }

    // 地面污渍/油痕贴花(打破铁板重复感)
    const stainCount = rng.int(2, 4);
    for (let i = 0; i < stainCount; i++) {
      const stain = makeBlobShadow(rng.range(1.2, 2.6), rng.range(0.08, 0.18));
      stain.position.set(rng.range(-w / 2 + 3, w / 2 - 3), 0.015, rng.range(-d / 2 + 3, d / 2 - 3));
      stain.scale.set(rng.range(1, 2.2), 1, rng.range(0.6, 1.4));
      stain.rotation.z = rng.range(0, Math.PI * 2);
      this.group.add(stain);
    }

    // 活塞柱(1-2 根,上下泵动,避开门口)
    const pistonCount = rng.int(1, 2);
    for (let i = 0; i < pistonCount; i++) {
      const px = rng.pick([-1, 1]) * rng.range(w * 0.28, w * 0.4);
      const pz = rng.pick([-1, 1]) * rng.range(d * 0.26, d * 0.36);
      if (!this.claim(px, pz, 1.1, doorSides)) continue;
      const piston = new THREE.Group();
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, wallH * 0.55, 10), ironMat);
      column.position.y = wallH * 0.28;
      piston.add(column);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 10), brassMat);
      head.position.y = wallH * 0.62;
      piston.add(head);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, wallH * 0.5, 8), copperMat);
      rod.position.y = wallH * 0.85;
      piston.add(rod);
      const capRing = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.06, 6, 14), copperMat);
      capRing.rotation.x = Math.PI / 2;
      capRing.position.y = wallH * 0.56;
      piston.add(capRing);
      piston.position.set(px, 0, pz);
      this.group.add(piston);
      this.pistons.push({ head, baseY: wallH * 0.62, phase: rng.range(0, Math.PI * 2), speed: rng.range(1.2, 2.2) });
      this.obstacles.push({ x: px, z: pz, r: 0.65 });
    }

    // 墙面压力仪表(参考图管线生成的速度表盘,贴在无门墙上)
    const gaugeWalls = (['n', 's'] as DoorSide[]).filter((s) => !doorSides.includes(s));
    if (gaugeWalls.length > 0) {
      const n = rng.int(1, 3);
      for (let i = 0; i < n; i++) {
        const side = rng.pick(gaugeWalls);
        const zPos = side === 'n' ? -d / 2 + 0.35 : d / 2 - 0.35;
        const g = makeWallGauge();
        // 表盘上加一根可动指针
        const needle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.02), ironMat);
        needle.geometry.translate(0, 0.09, 0);
        needle.rotation.z = rng.range(-1.2, 1.2);
        needle.position.z = 0.08;
        g.add(needle);
        g.position.set(rng.range(-w / 2 + 4, w / 2 - 4), rng.range(wallH * 0.45, wallH * 0.75), zPos);
        if (side === 's') g.rotation.y = Math.PI;
        this.group.add(g);
      }
    }

    // 墙脚地面管线(有门的墙也避开中央)
    const basePipeWalls = (['n', 's'] as DoorSide[]).filter((s) => !doorSides.includes(s));
    for (const side of basePipeWalls.slice(0, 1)) {
      const zPos = side === 'n' ? -d / 2 + 0.55 : d / 2 - 0.55;
      const len = w * rng.range(0.4, 0.7);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, len, 8), copperMat);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(rng.range(-w * 0.15, w * 0.15), 0.16, zPos);
      this.group.add(pipe);
      // 管卡
      for (let k = -1; k <= 1; k++) {
        const clamp = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.04, 6, 12), ironMat);
        clamp.position.set(pipe.position.x + (k * len) / 3, 0.16, zPos);
        this.group.add(clamp);
      }
    }
  }

  private makeBoiler(rng: RNG, x: number, z: number): THREE.Group {
    const g = new THREE.Group();
    // 罐体:LatheGeometry 旋转成型
    const profile: THREE.Vector2[] = [];
    const R = 0.9;
    profile.push(new THREE.Vector2(0.01, 0));
    profile.push(new THREE.Vector2(R, 0));
    profile.push(new THREE.Vector2(R * 1.02, 0.5));
    profile.push(new THREE.Vector2(R * 0.95, 1.4));
    profile.push(new THREE.Vector2(R * 0.7, 1.9));
    profile.push(new THREE.Vector2(R * 0.3, 2.1));
    profile.push(new THREE.Vector2(0.01, 2.15));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 16), copperMat);
    g.add(body);
    // 烟囱
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.1, 8), ironMat);
    chimney.position.set(0.3, 2.4, 0.2);
    g.add(chimney);
    // 炉膛发光窗
    const firebox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.1), emberMat);
    firebox.position.set(0, 0.55, R * 0.95);
    g.add(firebox);
    // 铆钉带
    const band = new THREE.Mesh(new THREE.TorusGeometry(R * 1.0, 0.06, 6, 20), brassMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = 1.0;
    g.add(band);
    // 侧面阀门轮(参考图旋成管线生成)
    const valve = makeValveWheel();
    valve.scale.setScalar(0.4);
    valve.position.set(R * 0.9, 1.35, 0);
    valve.rotation.z = Math.PI / 2;
    g.add(valve);
    g.userData.valve = valve;
    // 蒸汽喷口
    const vent = new SteamVent(rng, 20, 3);
    vent.position.set(0.3, 2.9, 0.2);
    g.add(vent);
    this.vents.push(vent);

    g.position.set(x, 0, z);
    g.rotation.y = rng.range(0, Math.PI * 2);
    return g;
  }

  /** 房间内部随机障碍:板条箱堆。避开门口通道和出生点 */
  private placeObstacles(rng: RNG, doorSides: DoorSide[]): void {
    const { w, d } = this;
    const count = rng.int(0, 3);
    for (let i = 0; i < count; i++) {
      const s = rng.range(0.7, 1.1);
      let x = 0;
      let z = 0;
      let ok = false;
      for (let tries = 0; tries < 8; tries++) {
        x = rng.range(-w / 2 + 4, w / 2 - 4);
        z = rng.range(-d / 2 + 4, d / 2 - 4);
        if (Math.hypot(x, z) < 4) continue; // 别堵出生点
        if (!this.claim(x, z, s * 1.6, doorSides)) continue; // 别和别的装饰打架
        ok = true;
        break;
      }
      if (!ok) continue;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(s * 2, s * 2, s * 2), ironMat);
      crate.position.set(x, s, z);
      crate.rotation.y = rng.range(0, Math.PI / 4);
      this.group.add(crate);
      const shadow = makeBlobShadow(s * 1.7, 0.4);
      shadow.position.set(x, 0.02, z);
      this.group.add(shadow);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(crate.geometry),
        new THREE.LineBasicMaterial({ color: PALETTE.brass, transparent: true, opacity: 0.5 }),
      );
      crate.add(edges);
      this.obstacles.push({ x, z, r: s * 1.2 });
    }
  }

  /** 点是否在某个门的进门通道上(门洞两侧 2.5、纵深 4 的矩形) */
  private nearDoorApproach(x: number, z: number, doorSides: DoorSide[]): boolean {
    const { w, d } = this;
    for (const side of doorSides) {
      if (side === 'n' && Math.abs(x) < 2.5 && z < -d / 2 + 4) return true;
      if (side === 's' && Math.abs(x) < 2.5 && z > d / 2 - 4) return true;
      if (side === 'e' && Math.abs(z) < 2.5 && x > w / 2 - 4) return true;
      if (side === 'w' && Math.abs(z) < 2.5 && x < -w / 2 + 4) return true;
    }
    return false;
  }

  setDoorOpen(side: DoorSide, open: boolean): void {
    const door = this.doors.find((dd) => dd.side === side);
    if (door) door.isOpen = open;
  }

  setAllDoors(open: boolean): void {
    for (const door of this.doors) door.isOpen = open;
  }

  update(dt: number, time: number): void {
    spinGears(this.gears, dt);
    for (const v of this.vents) v.update(dt, time);
    // 活塞泵动
    for (const p of this.pistons) {
      p.head.position.y = p.baseY + Math.sin(time * p.speed + p.phase) * 0.45;
    }
    for (const door of this.doors) {
      const target = door.isOpen ? 1 : 0;
      door.anim += (target - door.anim) * Math.min(1, dt * 4);
      door.plate.position.y = CONFIG.wallH / 2 - door.anim * (CONFIG.wallH + 0.6);
    }
    // 煤气灯闪烁
    for (const lamp of this.lamps) {
      lamp.intensity = 34 + Math.sin(time * 9 + lamp.position.x) * 3 + Math.sin(time * 23.7) * 1.6;
    }
  }
}
