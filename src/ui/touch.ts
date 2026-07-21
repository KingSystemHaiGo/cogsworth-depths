// 触屏虚拟双摇杆:左侧移动,右侧瞄准+射击
// 仅在触屏设备上激活,覆盖在画面最上层
import type { Input } from '../core/input.ts';

export class TouchControls {
  private moveId = -1;
  private aimId = -1;
  private moveOrigin = { x: 0, y: 0 };
  private moveVec = { x: 0, y: 0 };
  private leftStick!: HTMLElement;
  private leftKnob!: HTMLElement;

  /**
   * @param shouldHandle 只在游戏中接管触摸(菜单界面让按钮正常接收点击)
   */
  constructor(private input: Input, private shouldHandle: () => boolean) {
    if (!('ontouchstart' in window)) return;
    this.leftStick = document.createElement('div');
    this.leftStick.id = 'touch-stick-left';
    this.leftKnob = document.createElement('div');
    this.leftKnob.className = 'touch-knob';
    this.leftStick.appendChild(this.leftKnob);
    document.body.appendChild(this.leftStick);

    window.addEventListener('touchstart', (e) => this.onStart(e), { passive: false });
    window.addEventListener('touchmove', (e) => this.onMove(e), { passive: false });
    window.addEventListener('touchend', (e) => this.onEnd(e));
    window.addEventListener('touchcancel', (e) => this.onEnd(e));
  }

  get active(): boolean {
    return 'ontouchstart' in window;
  }

  /** 移动轴(触屏优先,否则键盘) */
  touchAxis(): { x: number; y: number } | null {
    return this.moveId >= 0 ? { ...this.moveVec } : null;
  }

  private onStart(e: TouchEvent): void {
    if (!this.shouldHandle()) return; // 菜单界面不接管,按钮正常响应
    for (const t of Array.from(e.changedTouches)) {
      if (t.clientX < window.innerWidth / 2 && this.moveId < 0) {
        // 左半屏:移动摇杆
        this.moveId = t.identifier;
        this.moveOrigin = { x: t.clientX, y: t.clientY };
        this.leftStick.style.left = `${t.clientX - 55}px`;
        this.leftStick.style.top = `${t.clientY - 55}px`;
        this.leftStick.style.opacity = '1';
        e.preventDefault();
      } else if (t.clientX >= window.innerWidth / 2 && this.aimId < 0) {
        // 右半屏:瞄准 + 开火
        this.aimId = t.identifier;
        this.input.mouseX = t.clientX;
        this.input.mouseY = t.clientY;
        this.input.mouseDown = true;
        e.preventDefault();
      }
    }
  }

  private onMove(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.moveId) {
        const dx = t.clientX - this.moveOrigin.x;
        const dy = t.clientY - this.moveOrigin.y;
        const len = Math.hypot(dx, dy);
        const max = 55;
        const cl = len > max ? max / len : 1;
        this.moveVec = { x: (dx * cl) / max, y: (dy * cl) / max };
        this.leftKnob.style.transform = `translate(${dx * cl}px, ${dy * cl}px)`;
        e.preventDefault();
      } else if (t.identifier === this.aimId) {
        this.input.mouseX = t.clientX;
        this.input.mouseY = t.clientY;
        e.preventDefault();
      }
    }
  }

  private onEnd(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.moveId) {
        this.moveId = -1;
        this.moveVec = { x: 0, y: 0 };
        this.leftStick.style.opacity = '0.35';
        this.leftKnob.style.transform = 'translate(0,0)';
      } else if (t.identifier === this.aimId) {
        this.aimId = -1;
        this.input.mouseDown = false;
      }
    }
  }
}
