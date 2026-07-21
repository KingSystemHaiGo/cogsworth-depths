// 全局调参配置 — lil-gui 直接绑定这些字段
export const CONFIG = {
  // 相机
  viewHeight: 20, // 正交相机视野高度(世界单位)
  camPitchDeg: 52, // 俯角,越大越接近正俯视
  camDist: 30,

  // 房间
  roomW: 34,
  roomD: 24,
  wallH: 3.2,

  // 玩家
  playerSpeed: 8.5,
  playerHp: 100,
  fireRate: 3.2, // 发/秒
  bulletDamage: 12,
  bulletSpeed: 22,
  bulletLife: 1.4,

  // 视觉
  bloom: true,
  bloomStrength: 0.55,
  fogDensity: 0.006,
  // 风格化滤镜
  posterize: 14, // 亮度色阶级数,<=1 关闭
  pixelSize: 1.0, // 像素化块大小,<0.5 关闭
  styleOutline: true, // Sobel 描边
  vignette: 0.35,
  grain: 0.02,
  warmGrade: 0.25, // 暖黄做旧强度
  splitTone: 0.5, // 分离色调:阴影冷青/高光暖黄强度

  // 音频
  masterVolume: 0.5,
  musicVolume: 0.35,

  // 瞄准
  aimSensitivity: 1.2, // 锁定模式下的准星灵敏度
};

// 蒸汽朋克调色板
export const PALETTE = {
  brass: 0xb08d57,
  brassLight: 0xe8c877,
  copper: 0xb87333,
  iron: 0x3a4149,
  ironDark: 0x23282e,
  floor: 0x1a1f26,
  wall: 0x2b323b,
  ember: 0xff7733,
  steam: 0x9fb4c0,
  bg: 0x0a0e12,
  playerBullet: 0xffd980,
  enemyBullet: 0xff5544,
  hpGreen: 0x7ec86a,
};
