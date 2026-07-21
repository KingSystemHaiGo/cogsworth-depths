// 程序化背景音乐:前瞻调度器 + 方波 bass/琶音 + 合成鼓组,蒸汽朋克工业 loop
import { CONFIG } from '../core/config.ts';

let BPM = 112;
/** 每层主题:移调(半音)与速度系数,氛围各不相同 */
const FLOOR_THEMES = [
  { transpose: 0, bpmScale: 1 }, // 下水道:原版阴郁
  { transpose: 2, bpmScale: 1.15 }, // 工厂:更快更机械
  { transpose: 5, bpmScale: 0.85 }, // 剧场:更慢更戏剧
  { transpose: -2, bpmScale: 1.1 }, // 锅炉之心:更低更沉
];
const STEPS_PER_BAR = 16;
const BARS = 8;
const LOOP_STEPS = STEPS_PER_BAR * BARS;
const STEP_DUR = (): number => 60 / BPM / 4; // 16 分音符(随主题变速)

// D 自然小调
const midi = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const D2 = 38, F2 = 41, G2 = 43, A2 = 45, C3 = 48, Bb2 = 46;
const D4 = 62, F4 = 65, G4 = 67, A4 = 69, C5 = 72, D5 = 74;

// bass:每步一个音符,0 = 休止(8 小节循环,前半推进后半下沉)
const BASS: number[] = [
  D2, 0, D2, 0, F2, 0, D2, 0, G2, 0, G2, 0, A2, 0, A2, 0,
  D2, 0, D2, 0, F2, 0, D2, 0, Bb2, 0, Bb2, 0, C3, 0, C3, 0,
  D2, 0, D2, 0, F2, 0, D2, 0, G2, 0, G2, 0, A2, 0, A2, 0,
  D2, 0, D2, 0, F2, 0, G2, 0, A2, 0, Bb2, 0, A2, 0, G2, 0,
  D2, 0, D2, 0, F2, 0, D2, 0, G2, 0, G2, 0, A2, 0, A2, 0,
  D2, 0, D2, 0, F2, 0, D2, 0, Bb2, 0, Bb2, 0, C3, 0, C3, 0,
  D2, 0, F2, 0, G2, 0, A2, 0, D2, 0, F2, 0, G2, 0, A2, 0,
  Bb2, 0, A2, 0, G2, 0, F2, 0, D2, 0, D2, 0, A2, 0, A2, 0,
];

// 琶音:16 分音符,0 = 休止(后 4 小节进入,推动爬升)
const ARP: number[] = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  D4, F4, A4, D5, A4, F4, D4, F4, G4, A4, C5, G4, A4, C5, D5, A4,
  D4, F4, A4, D5, A4, F4, G4, A4, Bb2 + 24, A4, G4, F4, G4, A4, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  D4, F4, A4, D5, A4, F4, D4, F4, G4, A4, C5, G4, A4, C5, D5, A4,
  D5, C5, A4, G4, F4, G4, A4, F4, D4, F4, G4, A4, 0, 0, 0, 0,
];

class Music {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private timer: number | null = null;
  private step = 0;
  private nextT = 0;
  /** 0=探索 1=Boss 战(加锯齿低音层 + 踩镲加倍) */
  intensity = 0;
  private transpose = 0;

  setIntensity(level: number): void {
    this.intensity = level;
  }

  /** 楼层主题变奏:移调 + 变速 */
  setFloorTheme(floor: number): void {
    const theme = FLOOR_THEMES[Math.min(floor - 1, FLOOR_THEMES.length - 1)];
    this.transpose = theme.transpose;
    BPM = 112 * theme.bpmScale;
  }

  init(ctx: AudioContext, destination: AudioNode): void {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = CONFIG.musicVolume;
    this.out.connect(destination);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v: number): void {
    if (this.out && this.ctx) this.out.gain.setValueAtTime(v, this.ctx.currentTime);
  }

  start(): void {
    if (!this.ctx || this.timer !== null) return;
    this.step = 0;
    this.nextT = this.ctx.currentTime + 0.06;
    // 前瞻调度:每 40ms 把未来 0.15s 的音符排入
    this.timer = window.setInterval(() => this.schedule(), 40);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    if (!this.ctx) return;
    while (this.nextT < this.ctx.currentTime + 0.15) {
      this.playStep(this.step % LOOP_STEPS, this.nextT);
      this.step++;
      this.nextT += STEP_DUR();
    }
  }

  private playStep(s: number, t: number): void {
    const bar16 = s % STEPS_PER_BAR;

    // 底鼓:四分音符(Boss 战补八分)
    if (bar16 % 4 === 0) this.kick(t);
    if (this.intensity >= 1 && bar16 % 4 === 2) this.kick(t);
    // 军鼓:2、4 拍
    if (bar16 === 4 || bar16 === 12) this.snare(t);
    // 踩镲:八分音符,反拍加重;Boss 战十六分
    if (bar16 % 2 === 0) this.hat(t, bar16 % 4 === 2 ? 0.09 : 0.05);
    if (this.intensity >= 1 && bar16 % 2 === 1) this.hat(t, 0.04);

    const b = BASS[s];
    if (b) this.pluck(t, midi(b + this.transpose), 'square', 0.22, STEP_DUR() * 1.8, 300);
    // Boss 战锯齿低音层
    if (this.intensity >= 1 && b) this.pluck(t, midi(b - 12 + this.transpose), 'sawtooth', 0.12, STEP_DUR() * 1.8, 500);
    const a = ARP[s];
    if (a) this.pluck(t, midi(a + this.transpose), 'square', 0.09, STEP_DUR() * 1.2, 2200);
  }

  private kick(t: number): void {
    const o = this.ctx!.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g);
    g.connect(this.out!);
    o.start(t);
    o.stop(t + 0.18);
  }

  private snare(t: number): void {
    const n = this.ctx!.createBufferSource();
    n.buffer = this.noiseBuf!;
    const f = this.ctx!.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 0.9;
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    n.connect(f);
    f.connect(g);
    g.connect(this.out!);
    n.start(t);
    n.stop(t + 0.15);
  }

  private hat(t: number, vol: number): void {
    const n = this.ctx!.createBufferSource();
    n.buffer = this.noiseBuf!;
    const f = this.ctx!.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    n.connect(f);
    f.connect(g);
    g.connect(this.out!);
    n.start(t);
    n.stop(t + 0.05);
  }

  /** 带低通的短音拨奏(bass / 琶音共用) */
  private pluck(t: number, freq: number, type: OscillatorType, vol: number, dur: number, cutoff: number): void {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = this.ctx!.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(cutoff * 0.4, t + dur);
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(this.out!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}

export const music = new Music();
