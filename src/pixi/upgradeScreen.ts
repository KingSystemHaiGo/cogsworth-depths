// Pixi 原生升级三选一界面:黄铜卡片 + 入场回弹 + 悬停发光,与 HUD 同一渲染层
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { Upgrade } from '../game/upgrades.ts';
import { lt, t } from '../core/i18n.ts';

interface Card {
  root: Container;
  bg: Graphics;
  upgrade: Upgrade;
  baseY: number;
  hoverT: number;
  enterT: number;
  delay: number;
}

const BRASS = 0xb08d57;
const BRASS_LIGHT = 0xe8c877;
const PANEL = 0x141a21;
const INK = 0x0a0e12;

function backOut(t: number): number {
  const c = 1.9;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

export class UpgradeScreen {
  private root = new Container();
  private dim = new Graphics();
  private cards: Card[] = [];
  private gears: Graphics[] = [];
  private onPick: ((u: Upgrade) => void) | null = null;
  private counts: ReadonlyMap<string, number> | null = null;
  active = false;
  private time = 0;

  constructor(private app: Application) {
    this.root.visible = false;
    app.stage.addChild(this.root);
  }

  show(options: Upgrade[], onPick: (u: Upgrade) => void, counts?: ReadonlyMap<string, number>): void {
    this.active = true;
    this.onPick = onPick;
    this.counts = counts ?? null;
    this.time = 0;
    this.cards = [];
    this.gears = [];
    this.root.removeChildren();
    this.root.visible = true;
    this.setCanvasInteractive(true);

    const W = this.app.screen.width;
    const H = this.app.screen.height;

    // 压暗背景(拦截点击)
    this.dim = new Graphics();
    this.dim.rect(0, 0, W, H).fill({ color: 0x05070a, alpha: 0.72 });
    this.dim.eventMode = 'static';
    this.root.addChild(this.dim);

    // 标题
    const title = new Text({
      text: t('upgrade.title'),
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 40,
        fontWeight: 'bold',
        fill: BRASS_LIGHT,
        letterSpacing: 10,
        dropShadow: { color: 0x000000, blur: 6, distance: 3 },
      }),
    });
    title.anchor.set(0.5);
    title.position.set(W / 2, H / 2 - 190);
    this.root.addChild(title);
    const sub = new Text({
      text: t('upgrade.subtitle'),
      style: new TextStyle({ fontFamily: 'Georgia, serif', fontSize: 15, fill: 0x9a8a68, letterSpacing: 4 }),
    });
    sub.anchor.set(0.5);
    sub.position.set(W / 2, H / 2 - 150);
    this.root.addChild(sub);

    // 标题两侧装饰齿轮(持续旋转)
    for (const side of [-1, 1]) {
      const gear = this.makeGear(18, 8);
      gear.position.set(W / 2 + side * 210, H / 2 - 178);
      this.root.addChild(gear);
      this.gears.push(gear);
    }

    // 三张卡片
    const cw = 210;
    const gap = 36;
    options.forEach((u, i) => {
      const card = this.makeCard(u, cw, 280);
      card.root.position.set(W / 2 + (i - 1) * (cw + gap) - cw / 2, H / 2 - 120);
      card.baseY = H / 2 - 120;
      card.delay = i * 0.09;
      this.root.addChild(card.root);
      this.cards.push(card);
    });
  }

  hide(): void {
    this.active = false;
    this.root.visible = false;
    this.setCanvasInteractive(false);
    this.onPick = null;
  }

  private setCanvasInteractive(v: boolean): void {
    this.app.canvas.style.pointerEvents = v ? 'auto' : 'none';
  }

  private makeGear(r: number, teeth: number): Graphics {
    const g = new Graphics();
    const inner = r * 0.8;
    for (let i = 0; i <= teeth * 4; i++) {
      const a = (i / (teeth * 4)) * Math.PI * 2;
      const rr = i % 4 === 1 || i % 4 === 2 ? r : inner;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath().fill({ color: BRASS, alpha: 0.7 });
    g.circle(0, 0, r * 0.3).fill(PANEL);
    return g;
  }

  private makeCard(u: Upgrade, w: number, h: number): Card {
    const root = new Container();
    const bg = new Graphics();
    root.addChild(bg);
    this.drawCard(bg, w, h, false);

    const icon = new Text({
      text: u.icon,
      style: new TextStyle({ fontFamily: 'Georgia, serif', fontSize: 40, fill: BRASS_LIGHT }),
    });
    icon.anchor.set(0.5);
    icon.position.set(w / 2, 58);
    const name = new Text({
      text: lt(u.name),
      style: new TextStyle({ fontFamily: 'Georgia, serif', fontSize: 19, fontWeight: 'bold', fill: BRASS_LIGHT, letterSpacing: 2 }),
    });
    name.anchor.set(0.5, 0);
    name.position.set(w / 2, 100);
    const desc = new Text({
      text: lt(u.desc),
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 13,
        fill: 0x9a8a68,
        wordWrap: true,
        wordWrapWidth: w - 36,
        align: 'center',
        lineHeight: 20,
      }),
    });
    desc.anchor.set(0.5, 0);
    desc.position.set(w / 2, 134);
    root.addChild(icon, name, desc);

    // 等级徽章:已拥有过的升级显示下一级
    const owned = this.counts?.get(u.id) ?? 0;
    if (owned > 0) {
      const badge = new Text({
        text: `Lv.${owned + 1}`,
        style: new TextStyle({ fontFamily: 'Georgia, serif', fontSize: 13, fontWeight: 'bold', fill: INK }),
      });
      badge.anchor.set(0.5);
      const badgeBg = new Graphics();
      badgeBg.circle(0, 0, 13).fill(BRASS_LIGHT);
      badgeBg.circle(0, 0, 13).stroke({ color: 0x7a6540, width: 1.5 });
      badgeBg.position.set(w - 28, 24);
      badge.position.set(w - 28, 24);
      root.addChild(badgeBg, badge);
    }

    const card: Card = { root, bg, upgrade: u, baseY: 0, hoverT: 0, enterT: 0, delay: 0 };
    root.eventMode = 'static';
    root.cursor = 'pointer';
    root.on('pointerover', () => (card.hoverT = 1));
    root.on('pointerout', () => (card.hoverT = 0));
    root.on('pointertap', () => {
      if (this.onPick) {
        const cb = this.onPick;
        this.hide();
        cb(u);
      }
    });
    (root as unknown as { __card: Card }).__card = card;
    return card;
  }

  private drawCard(bg: Graphics, w: number, h: number, hover: boolean): void {
    bg.clear();
    const border = hover ? BRASS_LIGHT : 0x7a6540;
    bg.roundRect(0, 0, w, h, 8).fill(PANEL);
    bg.roundRect(0, 0, w, h, 8).stroke({ color: border, width: hover ? 3 : 2 });
    // 内框线
    bg.roundRect(6, 6, w - 12, h - 12, 5).stroke({ color: border, width: 1, alpha: 0.4 });
    // 四角铆钉
    for (const [cx, cy] of [
      [12, 12],
      [w - 12, 12],
      [12, h - 12],
      [w - 12, h - 12],
    ]) {
      bg.circle(cx, cy, 3).fill(BRASS_LIGHT);
      bg.circle(cx, cy, 1.2).fill(INK);
    }
    if (hover) {
      bg.roundRect(0, 0, w, h, 8).stroke({ color: BRASS_LIGHT, width: 8, alpha: 0.12 });
    }
  }

  /** 每帧驱动入场/悬停动画 */
  update(dt: number): void {
    if (!this.active) return;
    this.time += dt;
    for (const gear of this.gears) gear.rotation += dt * 0.8;
    for (const card of this.cards) {
      // 入场:延迟 stagger + backout 缩放
      card.enterT = Math.min(1, card.enterT + dt * 2.4);
      const t = Math.max(0, Math.min(1, (this.time - card.delay) * 3));
      const enter = t >= 1 ? 1 : backOut(t);
      // 悬停:上浮 + 放大 + 重绘高亮边框
      const hoverTarget = card.hoverT;
      const cur = (card.root as unknown as { __h?: number }).__h ?? 0;
      const h2 = cur + (hoverTarget - cur) * Math.min(1, dt * 12);
      (card.root as unknown as { __h: number }).__h = h2;
      const s = enter * (1 + h2 * 0.06);
      card.root.scale.set(Math.max(0.001, s));
      card.root.position.y = card.baseY - h2 * 12;
      this.drawCard(card.bg, 210, 280, h2 > 0.5);
    }
  }
}
