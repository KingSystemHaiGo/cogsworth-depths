// 程序化蒸汽粒子:自定义 ShaderMaterial,纹理也是代码画出来的
import * as THREE from 'three';
import { RNG } from '../../core/rng.ts';
import { PALETTE } from '../../core/config.ts';

/** 代码生成径向渐变圆形贴图(不读任何图片文件) */
function makeSteamTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

const steamTex = makeSteamTexture();

const VERT = /* glsl */ `
  attribute float aLife;
  varying float vLife;
  void main() {
    vLife = aLife;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // 随生命周期变大(蒸汽扩散)
    gl_PointSize = (9.0 + aLife * 26.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uTex;
  uniform vec3 uColor;
  varying float vLife;
  void main() {
    vec4 tex = texture2D(uTex, gl_PointCoord);
    // 出生后淡入,死亡前淡出
    float fade = smoothstep(0.0, 0.15, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife));
    gl_FragColor = vec4(uColor, tex.a * fade * 0.28);
  }
`;

interface Particle {
  life: number; // 0..1
  speed: number;
  wobbleSeed: number;
  x: number;
  y: number;
  z: number;
}

/** 一个蒸汽喷口。update() 每帧推进粒子。 */
export class SteamVent extends THREE.Points {
  private particles: Particle[] = [];
  private lifeAttr: THREE.BufferAttribute;
  private posAttr: THREE.BufferAttribute;
  private riseH: number;

  constructor(rng: RNG, count = 24, riseH = 3.5) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const life = new Float32Array(count);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: steamTex },
        uColor: { value: new THREE.Color(PALETTE.steam) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    super(geo, mat);
    this.riseH = riseH;
    this.posAttr = new THREE.BufferAttribute(pos, 3);
    this.lifeAttr = new THREE.BufferAttribute(life, 1);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aLife', this.lifeAttr);

    for (let i = 0; i < count; i++) {
      this.particles.push({
        life: rng.next(), // 错开初始相位
        speed: rng.range(0.35, 0.7),
        wobbleSeed: rng.range(0, Math.PI * 2),
        x: 0,
        y: 0,
        z: 0,
      });
    }
    this.frustumCulled = false;
  }

  update(dt: number, time: number): void {
    const pos = this.posAttr.array as Float32Array;
    const life = this.lifeAttr.array as Float32Array;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.life += dt * p.speed;
      if (p.life >= 1) {
        p.life = 0;
        p.wobbleSeed = Math.random() * Math.PI * 2;
      }
      const t = p.life;
      pos[i * 3] = Math.sin(time * 2 + p.wobbleSeed) * 0.25 * t;
      pos[i * 3 + 1] = t * this.riseH;
      pos[i * 3 + 2] = Math.cos(time * 1.7 + p.wobbleSeed * 1.3) * 0.25 * t;
      life[i] = t;
    }
    this.posAttr.needsUpdate = true;
    this.lifeAttr.needsUpdate = true;
  }
}
