// 共享卡通材质:三阶色阶 + 哑光,3D 几何渲出 2D 插画质感
import * as THREE from 'three';

/** 三阶明暗色阶图(硬边卡通分层) */
function makeGradientMap(): THREE.DataTexture {
  const data = new Uint8Array([70, 150, 230, 255]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export const toonGradient = makeGradientMap();

/** 给卡通材质注入 Fresnel 轮廓光:边缘一圈暖光,角色从背景里"跳"出来 */
function addRimLight(mat: THREE.MeshToonMaterial, color = 0xffe0b0, strength = 0.32, power = 3.2): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: new THREE.Color(color) };
    shader.uniforms.uRimStrength = { value: strength };
    shader.uniforms.uRimPower = { value: power };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform vec3 uRimColor;
        uniform float uRimStrength;
        uniform float uRimPower;
        void main() {`,
      )
      .replace(
        '#include <output_fragment>',
        `float rimF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), uRimPower);
        outgoingLight += uRimColor * rimF * uRimStrength;
        #include <output_fragment>`,
      );
  };
  // 材质缓存 key 需要区分,否则 three 会复用未打补丁的编译结果
  mat.customProgramCacheKey = () => `toon-rim-${color}-${strength}`;
}

/** 哑光卡通材质:无金属反射,光照呈硬边色块,带轮廓光 */
export function toonMat(color: number): THREE.MeshToonMaterial {
  const mat = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient });
  addRimLight(mat);
  return mat;
}

/** 自发光材质(吃 Bloom):灯芯/炉膛/眼睛 */
export function glowMat(color: number, intensity = 2.2): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    gradientMap: toonGradient,
  });
}

/** 剪影描边材质(背面外扩法,漫画感的关键) */
const outlineMaterial = new THREE.MeshBasicMaterial({ color: 0x120d08, side: THREE.BackSide });

/** 给一组网格加剪影描边:每个 mesh 内嵌一个放大的反面黑色壳 */
export function addOutlines(root: THREE.Object3D, scale = 1.08): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.userData.noOutline) meshes.push(o as THREE.Mesh);
  });
  for (const m of meshes) {
    const hull = new THREE.Mesh(m.geometry, outlineMaterial);
    hull.scale.setScalar(scale);
    m.add(hull);
  }
}

/** 代码生成的径向渐变阴影贴图(blob shadow / 假 AO) */
function makeBlobTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.9)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const blobTex = makeBlobTexture();

/** 假阴影贴片:让角色/物体"贴地",廉价但效果巨大。
 *  polygonOffset 防止与地板共面 z-fighting 闪烁 */
export function makeBlobShadow(radius: number, opacity = 0.4): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: blobTex,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  m.renderOrder = 1;
  m.userData.noOutline = true;
  return m;
}
