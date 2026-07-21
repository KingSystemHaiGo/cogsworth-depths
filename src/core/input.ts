// 键盘 + 鼠标输入状态,支持 Pointer Lock 虚拟准星
import { CONFIG } from './config.ts';

export class Input {
  keys = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  private target: HTMLElement;

  constructor(target: HTMLElement) {
    this.target = target;
    this.mouseX = window.innerWidth / 2;
    this.mouseY = window.innerHeight / 2;
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // 注意用 document 级 mousemove:Pointer Lock 下部分浏览器不向元素派发
    // pointermove,只有 document 上的 mousemove 能稳定收到 movementX/Y
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.target) {
        // 锁定状态:用相对位移驱动虚拟准星,钳制在窗口内。
        // 取合帧事件里的全部增量,高回报率鼠标不丢精度
        const sens = CONFIG.aimSensitivity;
        // getCoalescedEvents 仅在 PointerEvent 上存在,mousemove 下退回单事件
        const events =
          (e as unknown as { getCoalescedEvents?: () => MouseEvent[] }).getCoalescedEvents?.() ??
          [e];
        for (const ev of events) {
          this.mouseX = clamp(this.mouseX + ev.movementX * sens, 0, window.innerWidth - 1);
          this.mouseY = clamp(this.mouseY + ev.movementY * sens, 0, window.innerHeight - 1);
        }
      } else {
        this.mouseX = e.clientX;
        this.mouseY = e.clientY;
      }
    });
    target.addEventListener('pointerdown', (e) => {
      if (e.button === 0) this.mouseDown = true;
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.target;
  }

  requestLock(): void {
    if (this.locked) return;
    // unadjustedMovement:绕过 OS 鼠标加速/平滑,拿到原始输入,降低拖拽感
    // 不支持的浏览器会抛错或拒绝,回退到普通锁定
    const plain = (): void => {
      try {
        const p = this.target.requestPointerLock() as unknown as Promise<void> | undefined;
        p?.catch?.(() => {});
      } catch {
        /* 忽略 */
      }
    };
    try {
      const p = this.target.requestPointerLock({
        unadjustedMovement: true,
      } as never) as unknown as Promise<void> | undefined;
      p?.catch?.(() => plain());
    } catch {
      plain();
    }
  }

  exitLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  /** 触屏覆盖:返回非 null 时优先于键盘 */
  moveAxisOverride: (() => { x: number; y: number } | null) | null = null;

  /** 移动轴,范围 [-1,1] */
  moveAxis(): { x: number; y: number } {
    if (this.moveAxisOverride) {
      const t = this.moveAxisOverride();
      if (t) return t;
    }
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  pressed(code: string): boolean {
    return this.keys.has(code);
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
