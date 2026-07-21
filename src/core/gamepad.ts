// 手柄支持:左摇杆移动 / 右摇杆瞄准 / A·RT 射击 / X 冲刺 / B 翻滚 / Y 切武器 / Start 暂停
import type { Input } from '../core/input.ts';

const DEADZONE = 0.25;

export class GamepadControls {
  private prevButtons: boolean[] = [];
  private aimVec = { x: 1, y: 0 };
  onPause: (() => void) | null = null;
  onWeaponSwitch: (() => void) | null = null;

  constructor(private input: Input) {}

  private pad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (p && p.connected) return p;
    }
    return null;
  }

  get active(): boolean {
    return this.pad() !== null;
  }

  /** 每帧轮询;playing 时才接管 */
  update(playing: boolean, playerScreen: { x: number; y: number }): void {
    const pad = this.pad();
    if (!pad) return;

    if (playing) {
      // 左摇杆:移动
      const lx = this.dz(pad.axes[0] ?? 0);
      const ly = this.dz(pad.axes[1] ?? 0);
      this.input.moveAxisOverride = lx !== 0 || ly !== 0 ? () => ({ x: lx, y: ly }) : null;

      // 右摇杆:瞄准(以玩家屏幕位置为中心的虚拟准星)
      const rx = this.dz(pad.axes[2] ?? 0);
      const ry = this.dz(pad.axes[3] ?? 0);
      if (rx !== 0 || ry !== 0) {
        this.aimVec = { x: rx, y: ry };
        const len = Math.hypot(rx, ry) || 1;
        this.input.mouseX = playerScreen.x + (rx / len) * 180;
        this.input.mouseY = playerScreen.y + (ry / len) * 180;
      }

      // A(0)/RT(7):射击
      this.input.mouseDown = (pad.buttons[0]?.pressed ?? false) || (pad.buttons[7]?.value ?? 0) > 0.3;
      // X(2):冲刺 B(1):翻滚(写入按键集,游戏按原名读取)
      this.setKey('Space', pad.buttons[2]?.pressed ?? false);
      this.setKey('ShiftLeft', pad.buttons[1]?.pressed ?? false);
      // Y(3):切武器(边沿触发)
      const y = pad.buttons[3]?.pressed ?? false;
      if (y && !this.prevButtons[3]) this.onWeaponSwitch?.();
      // Start(9):暂停(边沿触发)
      const start = pad.buttons[9]?.pressed ?? false;
      if (start && !this.prevButtons[9]) this.onPause?.();

      this.prevButtons = pad.buttons.map((b) => b.pressed);
    } else {
      // 菜单:Start/A 也可暂停回退?保持简单,仅记录
      this.input.moveAxisOverride = null;
      this.prevButtons = pad.buttons.map((b) => b.pressed);
    }
  }

  private dz(v: number): number {
    return Math.abs(v) < DEADZONE ? 0 : v;
  }

  private setKey(code: string, down: boolean): void {
    if (down) this.input.keys.add(code);
    else this.input.keys.delete(code);
  }
}
