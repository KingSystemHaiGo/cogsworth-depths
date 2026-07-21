// Web Audio 程序化音效合成器 — 零音频文件
import { CONFIG } from '../core/config.ts';

/** 失真曲线:k 越大越"脏" */
function makeDriveCurve(k: number): Float32Array {
  const n = 512;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  /** 必须在用户手势后调用 */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = CONFIG.masterVolume;
    // 失真激励器:给所有音效加攻击性和"脏"感
    const drive = this.ctx.createWaveShaper();
    drive.curve = makeDriveCurve(14);
    drive.oversample = '2x';
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    comp.attack.value = 0.002;
    this.master.connect(drive);
    drive.connect(comp);
    comp.connect(this.ctx.destination);
    // 预生成 1 秒白噪声
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setVolume(v: number): void {
    if (this.master && this.ctx) this.master.gain.setValueAtTime(v, this.ctx.currentTime);
  }

  /** 给背景音乐引擎用 */
  get audioContext(): AudioContext | null {
    return this.ctx;
  }

  get inputBus(): AudioNode | null {
    return this.master;
  }

  private noise(dur: number): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuf!;
    src.loop = true;
    src.loopEnd = dur;
    return src;
  }

  private osc(type: OscillatorType, freq: number): OscillatorNode {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    return o;
  }

  private env(node: AudioNode, t0: number, peak: number, dur: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    node.connect(g);
    g.connect(this.master!);
    return g;
  }

  /** 蒸汽枪射击:攻击瞬态"咔" + 噪声 + 下滑方波 */
  shoot(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // 攻击瞬态(打击感的关键:0.02s 高频咔哒)
    const click = this.noise(0.02);
    const cf = this.ctx.createBiquadFilter();
    cf.type = 'highpass';
    cf.frequency.value = 4000;
    click.connect(cf);
    this.env(cf, t, 0.35, 0.025);
    click.start(t);
    click.stop(t + 0.03);

    const n = this.noise(0.08);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2200;
    f.Q.value = 1.2;
    n.connect(f);
    this.env(f, t, 0.28, 0.08);
    n.start(t);
    n.stop(t + 0.09);

    const o = this.osc('square', 880);
    o.frequency.exponentialRampToValueAtTime(220, t + 0.09);
    this.env(o, t, 0.14, 0.1);
    o.start(t);
    o.stop(t + 0.11);
  }

  /** 敌人中弹:金属铿锵(非谐波泛音对) */
  hit(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [fr, vol] of [
      [1318, 0.16],
      [1975, 0.1],
      [745, 0.12],
    ] as const) {
      const o = this.osc('square', fr);
      o.frequency.exponentialRampToValueAtTime(fr * 0.7, t + 0.06);
      this.env(o, t, vol, 0.07);
      o.start(t);
      o.stop(t + 0.08);
    }
    // 噪声 tick
    const n = this.noise(0.03);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 3200;
    n.connect(f);
    this.env(f, t, 0.14, 0.035);
    n.start(t);
    n.stop(t + 0.04);
  }

  /** 爆炸:低通白噪声 + 超低频轰头 */
  explosion(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = this.noise(0.7);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 0.6);
    n.connect(f);
    this.env(f, t, 0.7, 0.7);
    n.start(t);
    n.stop(t + 0.72);

    // 超低频轰头(体感打击感)
    const sub = this.osc('sine', 65);
    sub.frequency.exponentialRampToValueAtTime(28, t + 0.5);
    this.env(sub, t, 0.85, 0.6);
    sub.start(t);
    sub.stop(t + 0.62);

    const o = this.osc('sine', 110);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.5);
    this.env(o, t, 0.5, 0.55);
    o.start(t);
    o.stop(t + 0.56);
  }

  /** 冲刺:下扫蒸汽嘶鸣 */
  dash(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = this.noise(0.25);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.22);
    f.Q.value = 1.5;
    n.connect(f);
    this.env(f, t, 0.3, 0.24);
    n.start(t);
    n.stop(t + 0.26);
  }

  /** 翻滚:低沉金属滚动声(和冲刺的清亮嘶鸣拉开) */
  roll(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // 低频滚动隆隆
    const n = this.noise(0.35);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(180, t + 0.3);
    n.connect(f);
    this.env(f, t, 0.35, 0.34);
    n.start(t);
    n.stop(t + 0.36);
    // 落地金属闷响
    const o = this.osc('triangle', 140);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.15);
    this.env(o, t + 0.22, 0.3, 0.14);
    o.start(t + 0.22);
    o.stop(t + 0.38);
  }

  /** 拾取:上行琶音 */
  pickup(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523, 659, 784].forEach((fr, i) => {
      const o = this.osc('sine', fr);
      this.env(o, t + i * 0.06, 0.16, 0.18);
      o.start(t + i * 0.06);
      o.stop(t + i * 0.06 + 0.2);
    });
  }

  /** 开门:金属摩擦 + 蒸汽释放 */
  doorOpen(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.osc('sawtooth', 70);
    o.frequency.linearRampToValueAtTime(160, t + 0.35);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    o.connect(f);
    this.env(f, t, 0.2, 0.4);
    o.start(t);
    o.stop(t + 0.42);

    const n = this.noise(0.5);
    const hf = this.ctx.createBiquadFilter();
    hf.type = 'highpass';
    hf.frequency.value = 3000;
    n.connect(hf);
    this.env(hf, t + 0.15, 0.14, 0.4);
    n.start(t + 0.15);
    n.stop(t + 0.65);
  }

  /** 玩家受伤 */
  playerHurt(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.osc('sawtooth', 200);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.18);
    this.env(o, t, 0.3, 0.2);
    o.start(t);
    o.stop(t + 0.22);
  }

  /** 环境声分层:蒸汽底噪 + 低频锅炉轰鸣 + 随机远处金属声 */
  startAmbient(): void {
    if (!this.ctx) return;
    // 层 1:蒸汽底噪(已有)
    const n = this.noise(1);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 400;
    f.Q.value = 0.5;
    n.connect(f);
    const g = this.ctx.createGain();
    g.gain.value = 0.02;
    const lfo = this.osc('sine', 0.13);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    f.connect(g);
    g.connect(this.master!);
    n.start();
    lfo.start();

    // 层 2:低频锅炉轰鸣(持续的压迫感)
    const rumble = this.osc('sine', 42);
    const rumbleGain = this.ctx.createGain();
    rumbleGain.gain.value = 0.035;
    const rumbleLfo = this.osc('sine', 0.07);
    const rumbleLfoGain = this.ctx.createGain();
    rumbleLfoGain.gain.value = 0.015;
    rumbleLfo.connect(rumbleLfoGain);
    rumbleLfoGain.connect(rumbleGain.gain);
    rumble.connect(rumbleGain);
    rumbleGain.connect(this.master!);
    rumble.start();
    rumbleLfo.start();

    // 层 3:随机远处金属声(每 6~14 秒一声轻 klank)
    const clank = (): void => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const fr = [523, 659, 440, 784][Math.floor(Math.random() * 4)];
      const o = this.osc('triangle', fr);
      const og = this.ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.03 + Math.random() * 0.02, t + 0.01);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      o.connect(og);
      og.connect(this.master!);
      o.start(t);
      o.stop(t + 1.3);
      setTimeout(clank, 6000 + Math.random() * 8000);
    };
    setTimeout(clank, 4000);
  }
}

export const synth = new Synth();
