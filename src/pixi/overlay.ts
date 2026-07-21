// PixiJS 叠加层:屏幕准星 / 打击数字 / 火花 / 冲击波 / 屏幕反馈 / HUD
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
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
  gfx: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
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
  private rings: Ring[] = [];
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
    });
    this.app.stage.addChild(this.fxLayer);
    this.app.stage.addChild(this.hudLayer);
    this.app.stage.addChild(this.flashGfx);

    this.hpText = new Text({ text: '', style: this.hudStyle });
    this.hpText.position.set(26, 52);
    this.floorText = new Text({ text: '', style: this.hudStyle });
    this.floorText.position.set(26, 74);
    this.cogText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 'bold', fill: 0xe8c877, letterSpacing: 1 }),
    });
    this.cogText.position.set(26, 96);
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

  /** 屏幕坐标火花迸溅 */
  sparkBurst(sx: number, sy: number, color: number, count = 10): void {
    for (let i = 0; i < count; i++) {
      const gfx = new Graphics();
      const r = 2 + Math.random() * 3;
      gfx.circle(0, 0, r).fill(color);
      gfx.blendMode = 'add';
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 260;
      this.fxLayer.addChild(gfx);
      this.sparks.push({
        gfx,
        x: sx,
        y: sy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.35 + Math.random() * 0.3,
        maxLife: 0.65,
      });
    }
  }

  /** 冲击波环:击杀/爆炸的爆发力来源 */
  ring(sx: number, sy: number, color: number, maxR = 90): void {
    const gfx = new Graphics();
    gfx.blendMode = 'add';
    this.fxLayer.addChild(gfx);
    this.rings.push({ gfx, x: sx, y: sy, r: 6, vr: maxR * 4.5, life: 0.35, maxLife: 0.35, color });
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
    const w = 230;
    const h = 16;
    this.hpBar.clear();
    // 黄铜框面板
    this.hpBar.roundRect(16, 14, w + 12, h + 12, 5).fill({ color: 0x10151b, alpha: 0.85 });
    this.hpBar.roundRect(16, 14, w + 12, h + 12, 5).stroke({ color: 0xb08d57, width: 2 });
    // 框角铆钉
    for (const [cx, cy] of [
      [20, 18],
      [16 + w + 8, 18],
      [20, 14 + h + 8],
      [16 + w + 8, 14 + h + 8],
    ]) {
      this.hpBar.circle(cx, cy, 2).fill(0xe8c877);
    }
    const ratio = Math.max(0, hp / maxHp);
    if (ratio > 0) {
      this.hpBar
        .roundRect(23, 21, (w - 2) * ratio, h - 2, 2)
        .fill(ratio > 0.35 ? 0x8fd07a : 0xe0604d);
      // 刻度线
      for (let i = 1; i < 4; i++) {
        const x = 23 + ((w - 2) / 4) * i;
        this.hpBar.moveTo(x, 21).lineTo(x, 21 + h - 2).stroke({ color: 0x10151b, width: 1.5 });
      }
    }
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
    const y = 118;
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
    for (const s of this.sparks) s.gfx.destroy();
    for (const r of this.rings) r.gfx.destroy();
    this.damageNumbers.length = 0;
    this.sparks.length = 0;
    this.rings.length = 0;
    this.enemyHpGfx.clear();
  }

  // ---------- 帧更新 ----------

  update(dt: number, mouseX = 0, mouseY = 0, mouseDown = false, hpRatio = 1): void {
    const tmp = { x: 0, y: 0 };

    // 自适应布局:状态面板锚定左下角
    this.statusPanel.position.set(10, this.app.screen.height - 152);

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
        s.gfx.destroy();
        this.sparks.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 340 * dt;
      s.gfx.position.set(s.x, s.y);
      s.gfx.alpha = s.life / s.maxLife;
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
