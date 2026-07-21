// 生成一张测试用参考图(白底锅炉侧视剪影)
import sharp from 'sharp';

const w = 400;
const h = 500;
// SVG 画一个锅炉侧影:罐体 + 烟囱
const svg = `
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${w}" height="${h}" fill="white"/>
  <g fill="#8a5a2a">
    <rect x="185" y="60" width="30" height="90"/>
    <path d="M 120 450 L 120 300 Q 120 250 160 220 L 240 220 Q 280 250 280 300 L 280 450 Z"/>
    <ellipse cx="200" cy="220" rx="80" ry="20"/>
    <ellipse cx="200" cy="450" rx="80" ry="15"/>
  </g>
</svg>`;
await sharp(Buffer.from(svg)).png().toFile('tools/refs/boiler-ref.png');
console.log('已生成 tools/refs/boiler-ref.png');
