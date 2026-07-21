// PixiJS 叠加层:屏幕准星 / 打击数字 / 火花 / 冲击波 / 屏幕反馈 / HUD
import { Application, Container, Graphics, Text, TextStyle, Texture, ParticleContainer, Particle } from 'pixi.js';
import { UpgradeScreen } from './upgradeScreen.ts';
import type { Upgrade } from '../game/upgrades.ts';
import { t } from '../core/i18n.ts';

interface DamageNumber {
  text: Text;
  worldX: number;
  worldZ: number;
  life: number;
  maxLife: number;
  vy: number;
  baseScale: number;
  crit: boolean;
}

interface Spark {
  p: Particle;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

/** 代码生成火花纹理(粒子共享,一次上传 GPU) */
function makeSparkTexture(): Texture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

interface Ring {
  gfx: Graphics;
  x: number;
  y: number;
  r: number;
  vr: number;
  life: number;
  maxLife: number;
  color: number;
}

interface Banner {
  text: Text;
  t: number;
}

/** 世界→屏幕坐标转换由外部注入(来自 ThreeStage) */
export type WorldToScreen = (x: number, z: number, out: { x: number; y: number }) => void;

/** easeOutBack:伤害数字的爆发回弹曲线 */
function easeOutBack(t: number): number {
  const c = 2.2;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

export class Overlay {
  app = new Application();
  private upgradeScreen!: UpgradeScreen;
  private fxLayer = new Container();
  private hudLayer = new Container();
  private damageNumbers: DamageNumber[] = [];
  private sparks: Spark[] = [];
  private sparkContainer!: ParticleContainer;
  private sparkTex = makeSparkTexture();
  private rings: Ring[] = [];
  private banners: Banner[] = [];
  private flashGfx = new Graphics();
  private flashAlpha = 0;
  private flashColor = 0xffffff;
  private shakeAmp = 0;
  private wts: WorldToScreen | null = null;

  // 准星
  private crosshair = new Container();
  private crosshairGfx = new Graphics();
  private crosshairVisible = false;
  private crosshairKick = 0; // 开火回弹
  private crosshairSpin = 0;

  // HUD 元素
  private statusPanel = new Container(); // 左下状态面板(血条/层数/技能冷却)
  private hpBar = new Graphics();
  private hpText!: Text;
  private floorText!: Text;
  private cogText!: Text;
  private bossBar = new Graphics();
  private bossText!: Text;
  private minimap = new Graphics();
  private comboText!: Text;
  private comboPop = 0;
  private cdBar = new Graphics();
  private vignette = new Graphics();
  private lowHpPulse = 0;
  private enemyHpGfx = new Graphics(); // 敌人头顶血条(世界坐标桥接)

  private numStyle = new TextStyle({
    fontFamily: 'Georgia, serif',
    fontSize: 24,
    fontWeight: 'bold',
    fill: 0xffe6a0,
    stroke: { color: 0x2a1a08, width: 4 },
  });
  private critStyle = new TextStyle({
    fontFamily: 'Georgia, serif',
    fontSize: 36,
    fontWeight: 'bold',
    fill: 0xffb347,
    stroke: { color: 0x571a05, width: 5 },
  });
  private hudStyle = new TextStyle({
    fontFamily: 'Georgia, serif',
    fontSize: 15,
    fontWeight: 'bold',
    fill: 0xd8c9a3,
    letterSpacing: 1,
  });

  async init(canvas: HTMLCanvasElement): Promise<void> {
    await this.app.init({
      canvas,
      resizeTo: window,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio, 1.5),
    });
    this.app.stage.addChild(this.fxLayer);
    this.app.stage.addChild(this.hudLayer);
    this.app.stage.addChild(this.flashGfx);
    // 火花粒子容器:单次 draw call 渲染全部火花(ParticleContainer 十万级性能)
    this.sparkContainer = new ParticleContainer({
      dynamicProperties: { position: true, vertex: true, rotation: false, uvs: false, color: true },
    });
    this.fxLayer.addChild(this.sparkContainer);

    this.hpText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'Georgia, serif', fontSize: 19, fontWeight: 'bold', fill: 0xe8c877, letterSpacing: 1 }),
    });
    this.hpText.anchor.set(0.5, 1);
    this.hpText.position.set(126, 108);
    this.floorText = new Text({ text: '', style: this.hudStyle });
    this.floorText.position.set(24, 154);
    this.cogText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 'bold', fill: 0xe8c877, letterSpacing: 1 }),
    });
    this.cogText.position.set(24, 176);
    this.bossText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 'bold', fill: 0xffb0a0, letterSpacing: 3 }),
    });
    this.comboText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 34,
        fontWeight: 'bold',
        fill: 0xffd980,
        stroke: { color: 0x3a2a10, width: 5 },
        letterSpacing: 2,
      }),
    });
    this.comboText.anchor.set(1, 0);
    this.statusPanel.addChild(this.hpBar, this.hpText, this.floorText, this.cogText, this.cdBar);
    this.hudLayer.addChild(
      this.statusPanel,
      this.bossBar,
      this.bossText,
      this.minimap,
      this.comboText,
      this.vignette,
    );
    this.fxLayer.addChild(this.enemyHpGfx);

    this.buildCrosshair();
    this.crosshair.addChild(this.crosshairGfx);
    this.crosshair.visible = false;
    this.app.stage.addChild(this.crosshair);

    this.upgradeScreen = new UpgradeScreen(this.app);
  }

  /** 升级三选一(Pixi 原生界面) */
  showUpgrade(options: Upgrade[], onPick: (u: Upgrade) => void, counts?: ReadonlyMap<string, number>): void {
    this.upgradeScreen.show(options, onPick, counts);
  }

  /** 齿轮十字准星:外环刻线 + 中心点 */
  private buildCrosshair(): void {
    const g = this.crosshairGfx;
    const brass = 0xe8c877;
    // 外环
    g.circle(0, 0, 16).stroke({ color: brass, width: 2.5, alpha: 0.95 });
    g.circle(0, 0, 11).stroke({ color: brass, width: 1, alpha: 0.5 });
    // 四向刻线
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const x1 = Math.cos(a) * 20;
      const y1 = Math.sin(a) * 20;
      const x2 = Math.cos(a) * 28;
      const y2 = Math.sin(a) * 28;
      g.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: brass, width: 2.5, alpha: 0.95 });
    }
    // 中心火红点
    g.circle(0, 0, 3).fill(0xff7733);
  }

  setWorldToScreen(fn: WorldToScreen): void {
    this.wts = fn;
  }

  /** 预热:把所有显示对象类型画一遍,触发 Pixi 着色器首次编译 */
  warmup(): void {
    const g = new Graphics();
    g.circle(0, 0, 10).fill(0xffffff);
    g.roundRect(0, 0, 10, 10, 2).fill(0xffffff).stroke({ color: 0xffffff, width: 1 });
    const t = new Text({ text: '预热 warmup', style: this.hudStyle });
    this.fxLayer.addChild(g, t);
    this.app.render();
    this.fxLayer.removeChild(g, t);
    g.destroy();
    t.destroy();
  }

  // ---------- 准星(屏幕空间,与虚拟光标 1:1) ----------

  setCrosshairVisible(v: boolean): void {
    this.crosshairVisible = v;
  }

  crosshairFireKick(): void {
    this.crosshairKick = 1;
  }

  // ---------- 世界内特效 ----------

  damageNumber(worldX: number, worldZ: number, amount: number, crit = false): void {
    const text = new Text({
      text: String(Math.round(amount)),
      style: crit ? this.critStyle : this.numStyle,
    });
    text.anchor.set(0.5);
    text.scale.set(0.2);
    this.fxLayer.addChild(text);
    this.damageNumbers.push({
      text,
      worldX: worldX + (Math.random() - 0.5) * 0.6,
      worldZ,
      life: crit ? 1.1 : 0.85,
      maxLife: crit ? 1.1 : 0.85,
      vy: -110,
      baseScale: crit ? 1.35 : 1,
      crit,
    });
  }

  /** Boss/楼层横幅:大号居中文字(可带副标题),2 秒淡入淡出 */
  banner(str: string, sub?: string, tint = 0xffb0a0): void {
    const text = new Text({
      text: str,
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 46,
        fontWeight: 'bold',
        fill: tint,
        letterSpacing: 6,
        stroke: { color: 0x1a0a08, width: 6 },
        dropShadow: { color: 0xff3300, blur: 16, distance: 0 },
      }),
    });
    text.anchor.set(0.5);
    text.position.set(this.app.screen.width / 2, this.app.screen.height * 0.3);
    this.fxLayer.addChild(text);
    this.banners.push({ text, t: 0 });
    if (sub) {
      const subText = new Text({
        text: sub,
        style: new TextStyle({
          fontFamily: 'Georgia, serif',
          fontSize: 19,
          fontStyle: 'italic',
          fill: 0xd8c9a3,
          letterSpacing: 2,
          stroke: { color: 0x0a0e12, width: 4 },
        }),
      });
      subText.anchor.set(0.5);
      subText.position.set(this.app.screen.width / 2, this.app.screen.height * 0.3 + 52);
      this.fxLayer.addChild(subText);
      this.banners.push({ text: subText, t: 0 });
    }
  }

  /** 漂浮文字(价格标签/提示),不消失直到 clearFx */
  floatText(worldX: number, worldZ: number, str: string, color = 0xd8c9a3): void {
    const text = new Text({
      text: str,
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 17,
        fontWeight: 'bold',
        fill: color,
        stroke: { color: 0x141a21, width: 3 },
      }),
    });
    text.anchor.set(0.5);
    this.fxLayer.addChild(text);
    this.damageNumbers.push({
      text,
      worldX,
      worldZ,
      life: 9999,
      maxLife: 9999,
      vy: 0,
      baseScale: 1,
      crit: false,
    });
  }

  /** 屏幕坐标火花迸溅(ParticleContainer 粒子,一次 draw call) */
  sparkBurst(sx: number, sy: number, color: number, count = 10): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 260;
      const p = new Particle({
        texture: this.sparkTex,
        x: sx,
        y: sy,
        tint: color,
        scaleX: 0.5 + Math.random() * 0.8,
        scaleY: 0.5 + Math.random() * 0.8,
      });
      this.sparkContainer.addParticle(p);
      this.sparks.push({
        p,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.35 + Math.random() * 0.3,
        maxLife: 0.65,
      });
    }
  }

  /** 冲击波环:击杀/爆炸的爆发力来源;life 可调(迫击预警圈用) */
  ring(sx: number, sy: number, color: number, maxR = 90, life = 0.35): void {
    const gfx = new Graphics();
    gfx.blendMode = 'add';
    this.fxLayer.addChild(gfx);
    this.rings.push({ gfx, x: sx, y: sy, r: 6, vr: maxR * (1.6 / life), life, maxLife: life, color });
  }

  /** 敌人头顶血条(只画受伤的) */
  setEnemyHp(list: readonly { x: number; z: number; ratio: number }[]): void {
    const g = this.enemyHpGfx;
    g.clear();
    if (!this.wts) return;
    const tmp = { x: 0, y: 0 };
    for (const e of list) {
      this.wts(e.x, e.z, tmp);
      const w = 34;
      const h = 5;
      g.roundRect(tmp.x - w / 2 - 1, tmp.y - 51, w + 2, h + 2, 2).fill({ color: 0x10151b, alpha: 0.85 });
      g
        .roundRect(tmp.x - w / 2, tmp.y - 50, w * Math.max(0, e.ratio), h, 1)
        .fill(e.ratio > 0.35 ? 0x8fd07a : 0xe0604d);
    }
  }

  // ---------- 屏幕反馈 ----------

  shake(amount: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  flash(color: number, alpha: number): void {
    this.flashColor = color;
    this.flashAlpha = Math.max(this.flashAlpha, alpha);
  }

  // ---------- HUD ----------

  setHUD(hp: number, maxHp: number, floorIdx: number, roomLabel: string, cogs = 0): void {
    const g = this.hpBar;
    g.clear();
    const cx = 126;
    const cy = 118;
    const r = 76;
    // 背板(铆钉铁牌)
    g.roundRect(16, 14, 252, 136, 8).fill({ color: 0x10151b, alpha: 0.85 });
    g.roundRect(16, 14, 252, 136, 8).stroke({ color: 0xb08d57, width: 2 });
    for (const [rx, ry] of [
      [24, 22],
      [260, 22],
      [24, 142],
      [260, 142],
    ]) {
      g.circle(rx, ry, 2.5).fill(0xe8c877);
    }
    // 压力表盘:半圆轨道 + 量程弧
    g.arc(cx, cy, r, Math.PI, Math.PI * 2).stroke({ color: 0x2a3440, width: 13, cap: 'butt' });
    const ratio = Math.max(0, hp / maxHp);
    if (ratio > 0) {
      g.arc(cx, cy, r, Math.PI, Math.PI + ratio * Math.PI).stroke({
        color: ratio > 0.35 ? 0x8fd07a : 0xe0604d,
        width: 13,
        cap: 'butt',
      });
    }
    // 刻度
    for (let i = 0; i <= 4; i++) {
      const a = Math.PI + (i / 4) * Math.PI;
      g.moveTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12))
        .lineTo(cx + Math.cos(a) * (r + 5), cy + Math.sin(a) * (r + 5))
        .stroke({ color: 0xb08d57, width: 2 });
    }
    // 指针
    const na = Math.PI + ratio * Math.PI;
    g.moveTo(cx, cy)
      .lineTo(cx + Math.cos(na) * (r - 18), cy + Math.sin(na) * (r - 18))
      .stroke({ color: 0xe8c877, width: 4 });
    g.circle(cx, cy, 7).fill(0xe8c877);
    g.circle(cx, cy, 3).fill(0x10151b);

    this.hpText.text = `${Math.ceil(hp)} / ${maxHp}`;
    this.floorText.text = `${t('hud.floor', { n: floorIdx })} · ${roomLabel}`;
    this.cogText.text = `⚙ ${cogs}`;
  }

  setBossHp(name: string, ratio: number): void {
    const w = Math.min(560, this.app.screen.width * 0.55);
    const x = (this.app.screen.width - w) / 2;
    const y = this.app.screen.height - 46;
    this.bossBar.clear();
    this.bossBar.roundRect(x - 6, y - 6, w + 12, 24, 5).fill({ color: 0x10151b, alpha: 0.85 });
    this.bossBar.roundRect(x - 6, y - 6, w + 12, 24, 5).stroke({ color: 0xd85a4a, width: 2 });
    for (const [cx, cy] of [
      [x - 2, y - 2],
      [x + w + 2, y - 2],
      [x - 2, y + 14],
      [x + w + 2, y + 14],
    ]) {
      this.bossBar.circle(cx, cy, 2).fill(0xffb0a0);
    }
    if (ratio > 0) {
      this.bossBar.roundRect(x, y, w * Math.max(0, ratio), 12, 2).fill(0xd85a4a);
    }
    this.bossText.text = `⚙ ${name} ⚙`;
    this.bossText.anchor.set(0.5, 1);
    this.bossText.position.set(this.app.screen.width / 2, y - 10);
  }

  hideBossHp(): void {
    this.bossBar.clear();
    this.bossText.text = '';
  }

  // ---------- 小地图 / 连击 / 冷却 / 低血警告 ----------

  /** 小地图:楼层房间图(含房间连线),右上角 */
  setMinimap(
    rooms: { id: number; gx: number; gy: number; kind: string; cleared: boolean; links: Partial<Record<string, number>> }[],
    currentId: number,
  ): void {
    const g = this.minimap;
    g.clear();
    const cell = 21;
    const pad = 12;
    const xs = rooms.map((r) => r.gx);
    const ys = rooms.map((r) => r.gy);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const mapW = (Math.max(...xs) - minX + 1) * cell + pad * 2;
    const mapH = (Math.max(...ys) - minY + 1) * cell + pad * 2;
    const ox = this.app.screen.width - mapW - 16;
    const oy = 14;
    const centerOf = (r: { gx: number; gy: number }) => ({
      cx: ox + pad + (r.gx - minX) * cell + cell / 2,
      cy: oy + pad + (r.gy - minY) * cell + cell / 2,
    });
    // 面板底
    g.roundRect(ox, oy, mapW, mapH, 5).fill({ color: 0x10151b, alpha: 0.85 });
    g.roundRect(ox, oy, mapW, mapH, 5).stroke({ color: 0xb08d57, width: 2 });
    // 房间连线(只画 id 小的那一侧,避免重复)
    for (const r of rooms) {
      const a = centerOf(r);
      for (const other of Object.values(r.links)) {
        if (other === undefined || other < r.id) continue;
        const b = centerOf(rooms[other]);
        g.moveTo(a.cx, a.cy).lineTo(b.cx, b.cy).stroke({ color: 0x7a6540, width: 3 });
      }
    }
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      const cx = ox + pad + (r.gx - minX) * cell;
      const cy = oy + pad + (r.gy - minY) * cell;
      const isCur = i === currentId;
      const color = isCur ? 0xffd980 : r.kind === 'boss' ? 0xd85a4a : r.cleared ? 0x6a7a86 : 0x8a6d42;
      g.roundRect(cx + 2, cy + 2, cell - 4, cell - 4, 3).fill({ color, alpha: isCur ? 1 : 0.75 });
      if (r.kind === 'boss') {
        g.circle(cx + cell / 2, cy + cell / 2, 3).fill(0x10151b);
      }
      if (isCur) {
        g.roundRect(cx + 2, cy + 2, cell - 4, cell - 4, 3).stroke({ color: 0xfff2cc, width: 1.5 });
      }
    }
  }

  /** 连击数(>=2 显示,带弹跳) */
  setCombo(n: number): void {
    if (n >= 2) {
      const label = `${n} ${t('hud.combo')}`;
      const changed = this.comboText.text !== label;
      this.comboText.text = label;
      this.comboText.position.set(this.app.screen.width - 20, 96 + (this.minimap.height || 0));
      if (changed) this.comboPop = 1;
    } else {
      this.comboText.text = '';
    }
  }

  /** 技能冷却条:冲刺(空格)/ 翻滚(Shift) */
  setCooldowns(dash: number, roll: number): void {
    const g = this.cdBar;
    g.clear();
    const w = 86;
    const h = 7;
    const x = 22;
    const y = 198;
    const draw = (yy: number, ratio: number, color: number, ready: boolean) => {
      g.roundRect(x, yy, w, h, 2).fill({ color: 0x10151b, alpha: 0.8 });
      g.roundRect(x, yy, w, h, 2).stroke({ color: 0x7a6540, width: 1 });
      if (ratio > 0) {
        g.roundRect(x + 1, yy + 1, (w - 2) * Math.min(1, ratio), h - 2, 1).fill(color);
      }
      if (ready) {
        g.roundRect(x, yy, w, h, 2).stroke({ color: 0xe8c877, width: 1.5, alpha: 0.9 });
      }
    };
    // ratio: 1 = 就绪
    draw(y, dash, 0x9fb4c0, dash >= 1);
    draw(y + h + 4, roll, 0xe8c877, roll >= 1);
  }

  /** 低血量红色脉动边框 */
  private drawVignette(dt: number, hpRatio: number): void {
    const g = this.vignette;
    g.clear();
    if (hpRatio > 0.32 || hpRatio <= 0) return;
    this.lowHpPulse += dt * 5;
    const a = 0.1 + (Math.sin(this.lowHpPulse) * 0.5 + 0.5) * 0.16 * (1 - hpRatio / 0.32);
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const t = 26;
    g.rect(0, 0, w, t).fill({ color: 0xaa2222, alpha: a });
    g.rect(0, h - t, w, t).fill({ color: 0xaa2222, alpha: a });
    g.rect(0, 0, t, h).fill({ color: 0xaa2222, alpha: a });
    g.rect(w - t, 0, t, h).fill({ color: 0xaa2222, alpha: a });
  }

  clearFx(): void {
    for (const d of this.damageNumbers) d.text.destroy();
    for (const s of this.sparks) {
      this.sparkContainer.removeParticle(s.p);

    }
    for (const r of this.rings) r.gfx.destroy();
    for (const b of this.banners) b.text.destroy();
    this.damageNumbers.length = 0;
    this.sparks.length = 0;
    this.rings.length = 0;
    this.banners.length = 0;
    this.enemyHpGfx.clear();
  }

  // ---------- 帧更新 ----------

  update(dt: number, mouseX = 0, mouseY = 0, mouseDown = false, hpRatio = 1): void {
    const tmp = { x: 0, y: 0 };

    // 自适应布局:状态面板锚定左下角
    this.statusPanel.position.set(10, this.app.screen.height - 230);

    // 升级界面动画
    this.upgradeScreen.update(dt);

    // 连击文字弹跳
    if (this.comboPop > 0) {
      this.comboPop = Math.max(0, this.comboPop - dt * 4);
      const s = 1 + easeOutBack(1 - this.comboPop) * 0.6 * this.comboPop;
      this.comboText.scale.set(s);
    }
    this.drawVignette(dt, hpRatio);

    // 准星:直接钉在光标位置,零投影零延迟
    this.crosshair.visible = this.crosshairVisible;
    if (this.crosshairVisible) {
      this.crosshairSpin += dt * (mouseDown ? 6 : 1.5);
      this.crosshairKick = Math.max(0, this.crosshairKick - dt * 6);
      const s = 1 - this.crosshairKick * 0.25;
      this.crosshair.position.set(mouseX, mouseY);
      this.crosshair.rotation = this.crosshairSpin;
      this.crosshair.scale.set(s);
    }

    // 打击数字:回弹爆发 → 上浮 → 淡出
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const d = this.damageNumbers[i];
      d.life -= dt;
      if (d.life <= 0 || !this.wts) {
        d.text.destroy();
        this.damageNumbers.splice(i, 1);
        continue;
      }
      const age = d.maxLife - d.life;
      this.wts(d.worldX, d.worldZ, tmp);
      // 常驻漂浮标签(价格等):固定位置不动画
      if (d.maxLife > 100) {
        d.text.position.set(tmp.x, tmp.y - 20);
        d.text.scale.set(1);
        d.text.alpha = 1;
        continue;
      }
      d.vy += 90 * dt;
      d.text.position.set(tmp.x, tmp.y + d.vy * age);
      // 前 0.14s 用 easeOutBack 弹出,暴击带抖动
      const pop = age < 0.14 ? easeOutBack(age / 0.14) : 1;
      const jitter = d.crit && age < 0.2 ? (Math.random() - 0.5) * 0.12 : 0;
      d.text.scale.set(d.baseScale * pop);
      d.text.rotation = jitter;
      d.text.alpha = Math.min(1, d.life / 0.3);
    }

    // 火花
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.sparkContainer.removeParticle(s.p);
  
        this.sparks.splice(i, 1);
        continue;
      }
      s.p.x += s.vx * dt;
      s.p.y += s.vy * dt;
      s.vy += 340 * dt;
      s.p.alpha = s.life / s.maxLife;
    }

    // 冲击波环
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        r.gfx.destroy();
        this.rings.splice(i, 1);
        continue;
      }
      r.r += r.vr * dt;
      r.vr *= Math.pow(0.02, dt); // 快速外扩后减速
      const t = r.life / r.maxLife;
      r.gfx.clear();
      r.gfx.circle(r.x, r.y, r.r).stroke({ color: r.color, width: 3 * t + 1, alpha: t * 0.9 });
    }

    // Boss 横幅:淡入 0.3s → 停留 → 淡出 0.5s,共 2s
    for (let i = this.banners.length - 1; i >= 0; i--) {
      const b = this.banners[i];
      b.t += dt;
      const inT = Math.min(1, b.t / 0.3);
      const outT = b.t > 1.5 ? Math.max(0, 1 - (b.t - 1.5) / 0.5) : 1;
      b.text.alpha = inT * outT;
      b.text.scale.set(0.8 + inT * 0.2);
      if (b.t > 2) {
        b.text.destroy();
        this.banners.splice(i, 1);
      }
    }

    // 震屏
    if (this.shakeAmp > 0.1) {
      this.fxLayer.position.set(
        (Math.random() - 0.5) * this.shakeAmp,
        (Math.random() - 0.5) * this.shakeAmp,
      );
      this.shakeAmp *= Math.pow(0.001, dt);
    } else {
      this.fxLayer.position.set(0, 0);
    }

    // 闪屏
    if (this.flashAlpha > 0.005) {
      this.flashGfx.clear();
      this.flashGfx
        .rect(0, 0, this.app.screen.width, this.app.screen.height)
        .fill({ color: this.flashColor, alpha: this.flashAlpha });
      this.flashAlpha *= Math.pow(0.01, dt);
    } else if (this.flashAlpha > 0) {
      this.flashGfx.clear();
      this.flashAlpha = 0;
    }
  }
}
