// Three.js 渲染骨架:正交微倾相机 + 灯光雾 + Bloom 后处理
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CONFIG, PALETTE } from '../core/config.ts';

/** 赛璐璐化:线性→sRGB 转换 + Sobel 描边 + 亮度色调分离(在 Bloom 之前执行) */
const CelShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uPosterize: { value: 8.0 },
    uOutline: { value: 1.0 },
    uPixel: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uPosterize;
    uniform float uOutline;
    uniform float uPixel;
    varying vec2 vUv;

    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    vec3 toSRGB(vec3 c) { return pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)); }
    // Bayer 4x4 有序抖动矩阵(铜版蚀刻质感的网点)
    float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
    float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

    void main() {
      vec2 px = 1.0 / uResolution;
      // 像素化:把采样坐标吸附到块中心,描边也用块级偏移
      vec2 uv = vUv;
      vec2 step_ = px;
      if (uPixel > 0.5) {
        vec2 blocks = uResolution / uPixel;
        uv = (floor(uv * blocks) + 0.5) / blocks;
        step_ = px * uPixel;
      }
      // 先转到 sRGB 显示空间再做风格化,避免线性空间暗部被色阶量化吞掉
      vec3 col = toSRGB(texture2D(tDiffuse, uv).rgb);

      // Sobel 边缘描边(黄铜墨线)
      if (uOutline > 0.5) {
        float tl = luma(toSRGB(texture2D(tDiffuse, uv + step_ * vec2(-1.0,  1.0)).rgb));
        float tc = luma(toSRGB(texture2D(tDiffuse, uv + step_ * vec2( 0.0,  1.0)).rgb));
        float tr = luma(toSRGB(texture2D(tDiffuse, uv + step_ * vec2( 1.0,  1.0)).rgb));
        float ml = luma(toSRGB(texture2D(tDiffuse, uv + step_ * vec2(-1.0,  0.0)).rgb));
        float mr = luma(toSRGB(texture2D(tDiffuse, uv + step_ * vec2( 1.0,  0.0)).rgb));
        float bl = luma(toSRGB(texture2D(tDiffuse, uv + step_ * vec2(-1.0, -1.0)).rgb));
        float bc = luma(toSRGB(texture2D(tDiffuse, uv + step_ * vec2( 0.0, -1.0)).rgb));
        float br = luma(toSRGB(texture2D(tDiffuse, uv + step_ * vec2( 1.0, -1.0)).rgb));
        float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
        float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
        float edge = smoothstep(0.06, 0.22, sqrt(gx * gx + gy * gy));
        col = mix(col, vec3(0.10, 0.07, 0.04), edge * 0.8);
      }

      // 色调分离(版画色阶):只量化亮度、保留色相;
      // 有序抖动把硬色带打散成铜版画网点
      if (uPosterize > 1.5) {
        float l = luma(col);
        float dith = bayer4(gl_FragCoord.xy) - 0.5;
        float lq = floor(l * uPosterize + 0.5 + dith) / uPosterize;
        col *= l > 0.0005 ? lq / l : 0.0;
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/** 最终调色:暖黄做旧 + 暗角 + 噪点(在 Bloom 之后,输出即显示) */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.03 },
    uWarm: { value: 0.35 },
    uSplit: { value: 0.5 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uWarm;
    uniform float uSplit;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float l = luma(col);

      // 分离色调(动画式调色):阴影浸入冷青,高光推向暖黄铜
      vec3 shadowTint = vec3(0.06, 0.13, 0.17);
      vec3 highTint = vec3(1.08, 0.98, 0.84);
      col += shadowTint * (1.0 - smoothstep(0.0, 0.5, l)) * uSplit;
      col *= mix(vec3(1.0), highTint, smoothstep(0.35, 0.9, l) * uSplit);

      // 暖黄做旧 + 饱和度补偿(蒸汽朋克的浓郁铜色)
      col = mix(col, col * vec3(1.10, 0.97, 0.80), uWarm);
      float lum = luma(col);
      col = clamp(mix(vec3(lum), col, 1.25), 0.0, 1.0);

      // 暗角
      float d = distance(vUv, vec2(0.5));
      col *= 1.0 - uVignette * smoothstep(0.32, 0.78, d);

      // 胶片噪点
      col += (hash(vUv * uResolution + fract(uTime) * 913.0) - 0.5) * uGrain;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class ThreeStage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private celPass: ShaderPass;
  private gradePass: ShaderPass;
  private dbSize = new THREE.Vector2();

  // 画质分级(动态分辨率缩放 DRS):核显自动降档保帧率
  private qTier: 0 | 1 | 2 = 0;

  /** 0=高(1.5x) 1=中(1.0x) 2=低(0.75x)
   *  画质优先:降档只降渲染分辨率,泛光/描边等风格化效果全部保留 */
  setQualityTier(tier: 0 | 1 | 2): void {
    if (tier === this.qTier) return;
    this.qTier = tier;
    const pr = [1.5, 1.0, 0.75][tier];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, pr));
    this.resize();
  }

  get qualityTier(): number {
    return this.qTier;
  }
  private camTarget = new THREE.Vector3();
  private shakeAmp = 0;
  private shakeOffset = new THREE.Vector3();
  // 复用临时向量,避免每帧分配触发 GC 抖动
  private ndcTmp = new THREE.Vector3();
  private dirTmp = new THREE.Vector3();
  private projTmp = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    // 像素比上限 1.5:全屏后处理链的成本随分辨率平方增长,1.5 是画质/性能的平衡点
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.bg);
    this.scene.fog = new THREE.FogExp2(PALETTE.bg, CONFIG.fogDensity);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.updateCameraFrustum();

    // 灯光:冷环境光 + 暖色主光(煤气灯氛围)
    const ambient = new THREE.HemisphereLight(0x50607a, 0x33291c, 3.4);
    this.scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffd9a0, 2.8);
    key.position.set(6, 14, 4);
    this.scene.add(key);

    // 后处理链:渲染 → 赛璐璐化(描边+色阶) → Bloom 泛光 → 最终调色
    // 赛璐璐化在 Bloom 之前,灯光光晕保持平滑不被色阶切断;
    // CelPass 内部完成 sRGB 转换,因此不再需要 OutputPass
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.celPass = new ShaderPass(CelShader);
    this.renderer.getDrawingBufferSize(this.dbSize);
    this.celPass.uniforms.uResolution.value.copy(this.dbSize);
    this.composer.addPass(this.celPass);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      CONFIG.bloomStrength,
      0.6,
      0.6, // sRGB 空间下阈值放宽,让煤气灯光晕铺开
    );
    this.composer.addPass(this.bloomPass);
    this.gradePass = new ShaderPass(GradeShader);
    this.gradePass.uniforms.uResolution.value.copy(this.dbSize);
    this.composer.addPass(this.gradePass);
  }

  /** Boss 二阶段:场景转入危险模式(雾与背景变暗红) */
  setDanger(on: boolean): void {
    const bg = on ? 0x1c0806 : PALETTE.bg;
    (this.scene.background as THREE.Color).set(bg);
    (this.scene.fog as THREE.FogExp2).color.set(bg);
  }

  updateCameraFrustum(): void {
    const aspect = window.innerWidth / window.innerHeight;
    const h = CONFIG.viewHeight / 2;
    this.camera.left = -h * aspect;
    this.camera.right = h * aspect;
    this.camera.top = h;
    this.camera.bottom = -h;
    this.camera.updateProjectionMatrix();
  }

  /** 相机跟随目标(玩家),保持固定俯角 */
  private positionCamera(): void {
    const pitch = THREE.MathUtils.degToRad(CONFIG.camPitchDeg);
    const d = CONFIG.camDist;
    const offset = new THREE.Vector3(0, Math.sin(pitch) * d, Math.cos(pitch) * d);
    this.camera.position
      .copy(this.camTarget)
      .add(offset)
      .add(this.shakeOffset);
    this.camera.lookAt(
      this.camTarget.x + this.shakeOffset.x,
      this.camTarget.y,
      this.camTarget.z + this.shakeOffset.z,
    );
  }

  setTarget(x: number, y: number, z: number): void {
    this.camTarget.set(x, y, z);
  }

  shake(amount: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  update(dt: number): void {
    if (this.shakeAmp > 0.001) {
      this.shakeOffset.set(
        (Math.random() - 0.5) * this.shakeAmp,
        (Math.random() - 0.5) * this.shakeAmp * 0.4,
        (Math.random() - 0.5) * this.shakeAmp,
      );
      this.shakeAmp *= Math.pow(0.001, dt); // 快速衰减
    } else {
      this.shakeOffset.set(0, 0, 0);
    }
    this.positionCamera();
  }

  render(time = 0): void {
    // 即使关掉 Bloom 也走 composer,保证风格滤镜始终生效
    this.bloomPass.enabled = CONFIG.bloom;
    this.bloomPass.strength = CONFIG.bloomStrength;
    this.celPass.uniforms.uPosterize.value = CONFIG.posterize;
    this.celPass.uniforms.uOutline.value = CONFIG.styleOutline ? 1 : 0;
    this.celPass.uniforms.uPixel.value = CONFIG.pixelSize;
    this.gradePass.uniforms.uTime.value = time;
    this.gradePass.uniforms.uVignette.value = CONFIG.vignette;
    this.gradePass.uniforms.uGrain.value = CONFIG.grain;
    this.gradePass.uniforms.uWarm.value = CONFIG.warmGrade;
    this.gradePass.uniforms.uSplit.value = CONFIG.splitTone;
    this.composer.render();
  }

  resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.getDrawingBufferSize(this.dbSize);
    this.celPass.uniforms.uResolution.value.copy(this.dbSize);
    this.gradePass.uniforms.uResolution.value.copy(this.dbSize);
    this.updateCameraFrustum();
  }

  /** 世界坐标 → 屏幕像素坐标(供 Pixi 叠加层使用) */
  worldToScreen(v: THREE.Vector3, out: { x: number; y: number }): void {
    const p = this.projTmp.copy(v).project(this.camera);
    out.x = (p.x * 0.5 + 0.5) * window.innerWidth;
    out.y = (-p.y * 0.5 + 0.5) * window.innerHeight;
  }

  /** 屏幕像素坐标 → 地面(y=0)上的世界坐标(供瞄准使用) */
  screenToGround(sx: number, sy: number, out: THREE.Vector3): void {
    const ndc = this.ndcTmp.set(
      (sx / window.innerWidth) * 2 - 1,
      -(sy / window.innerHeight) * 2 + 1,
      0,
    );
    // unproject 得到该像素射线的起点(正交相机下每条射线起点不同)
    const origin = ndc.unproject(this.camera);
    // 正交相机所有射线互相平行,方向就是相机朝向。
    // 不能用 origin - camera.position 当方向——那只是中心像素的特例,
    // 边缘像素会得到倾斜的错误方向,导致落点向中心塌缩
    const dir = this.camera.getWorldDirection(this.dirTmp);
    const t = -origin.y / dir.y;
    out.copy(origin).addScaledVector(dir, t);
  }
}
