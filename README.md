# Cogsworth Depths · 蒸汽深渊

[English README](./README.en.md)

一个**零素材、全程序化生成**的蒸汽朋克 2.5D 轻量肉鸽(roguelite)浏览器游戏 demo。
项目中没有任何一张图片、一个音频文件——模型、纹理、特效、音乐、音效全部由代码实时生成。

## 在线试玩

构建产物是单个 HTML 文件(`docs/index.html`),双击即可离线游玩;也可通过 GitHub Pages 在线打开。

## 操作

| 按键 | 动作 |
| --- | --- |
| WASD / 方向键 | 移动 |
| 鼠标 | 瞄准(指针锁定) |
| 左键 | 射击 |
| 空格 | 冲刺 |
| Shift | 翻滚(无敌帧) |
| Esc | 暂停 |
| F1 | 调参面板(风格滤镜/手感/音量) |

## 玩法

清除每个房间的机械守卫 → 三选一改装(可多级堆叠)→ 支线宝箱房/齿轮商店 → Boss(二阶段狂暴)→ 下一层。楼层布局由种子生成,标题界面可输入种子复现关卡。

设置页可切换语言(中文/EN)、调节音乐与音效音量,设置会保存在本地。

## 技术栈(程序化优先)

- **Three.js**:3D 场景 2.5D 俯视角;齿轮/管线/锅炉全部程序化建模(`ExtrudeGeometry` / `LatheGeometry` / `TubeGeometry`)
- **PixiJS v8**:HUD / 打击数字 / 粒子特效 / 升级界面 / 屏幕准星,通过世界坐标桥接贴合 3D 世界
- **自研漫画渲染管线**:MeshToon 色阶 + 背面剪影描边 + Fresnel 轮廓光 + Sobel 墨线 + Bayer 网点 + 像素化 + 分离色调
- **Web Audio API**:音效全合成(射击/爆炸/金属铿锵/蒸汽)+ tracker 式前瞻调度背景音乐引擎
- **数值模型**:`src/game/balance.ts` 集中配置,多项式难度曲线

## 本地开发

```bash
npm install
npm run dev      # 开发服务器(热更新)
npm run build    # 构建单文件产物 docs/index.html
```
