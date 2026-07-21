// 合成双色测试图:黄铜罐体 + 黑烟囱(验证部件分解)
import sharp from 'sharp';

const svg = `
<svg width="400" height="500" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="500" fill="white"/>
  <rect x="185" y="60" width="30" height="100" fill="#1c1611"/>
  <path d="M 120 450 L 120 300 Q 120 250 160 220 L 240 220 Q 280 250 280 300 L 280 450 Z" fill="#b87333"/>
  <ellipse cx="200" cy="220" rx="80" ry="20" fill="#b08d57"/>
</svg>`;
await sharp(Buffer.from(svg)).png().toFile('tools/refs/two-tone-boiler.png');
console.log('done');
