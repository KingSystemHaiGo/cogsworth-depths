# Cogsworth Depths 项目记忆存档

> 存档日期:2026-07-22。本文档汇总本项目的关键知识,供后续开发参考复用。
> 仓库:https://github.com/KingSystemHaiGo/cogsworth-depths(公开)
> 在线版:https://kingsystemhaigo.github.io/cogsworth-depths/

## 项目概况

零素材、全程序化生成的维多利亚瘟疫医生题材 2.5D 轻量肉鸽浏览器游戏。
Three.js(主渲染,3D 场景 2.5D 俯视)+ PixiJS(HUD/特效叠加层)+ TypeScript + Vite。
构建产物为单文件 HTML(docs/index.html),GitHub Pages 托管。

## 游戏系统清单

- 肉鸽循环:种子化楼层 → 波次战斗(预警圈 ≥0.55s)→ 三选一升级(多级堆叠)
  → 宝箱房/齿轮商店/挑战房(限时)→ Boss(50% 血二阶段)→ 传送门下一层
- 敌人 10 种 + Boss 3 个(锅炉魔像/人偶剧团长/钟表巨像,按层轮换)
- 升级 15 种(含协同词条:弹跳爆弹/武装齿轮),武器 3 种(Q 切换)
- 局外成长:齿轮残片 + 改装间永久升级(localStorage),每日挑战种子,图鉴
- 波次调度、精英词缀、每层主题玩法(毒潭/传送带/蒸汽机关)
- 中英双语、设置页(语言/音乐/音效音量)、触屏双摇杆、手柄、PWA

## 渲染管线(漫画风 NPR)

渲染链:RenderPass → 赛璐璐化 → Bloom → 调色
1. MeshToonMaterial 三阶色阶 + flatShading
2. 背面外扩剪影描边(addOutlines)
3. Fresnel 轮廓光(onBeforeCompile 注入)
4. Sobel 墨线 + Bayer 有序抖动(铜版网点)+ 像素化(对齐物理像素)
5. 分离色调:阴影冷青 / 高光暖黄铜

## 性能工程(重要经验)

- **子步进模拟**:逻辑切 ≤1/90s 子步,低帧率下子弹不穿透,手感与帧率解耦
- **DRS 动态分辨率**:FPS EMA <42 降档(只降分辨率不动效果)
- 子弹 InstancedMesh(384→2 draw calls)、火花 ParticleContainer、墙体几何合并
- 敌人网格对象池、shader 预热(开局编译前移)、热路径零分配
- 正交相机瞄准陷阱:射线方向必须用相机朝向,不能 unproject点-相机原点(边缘落点塌缩)
- Pointer Lock:unadjustedMovement 原始输入 + document 级 mousemove + 虚拟准星

## 图片转 3D 算法管线(tools/)

纯算法(非 AI)参考图 → Three.js 工厂代码:

- `tools/lib/image.ts`:flood-fill 去背景、Moore 轮廓追踪(Jacob 准则)、
  Douglas-Peucker 简化、k-means 主导色/部件分解、形态学膨胀桥接分段图标
- `img2lathe.mts`:轴对称物件轮廓旋成(对称轴最小方差估计,64 点采样)
- `img2prop.mts`:自适应分流 — 镜像对称度 + 逐行连通率 + **轴覆盖率**
  (旋转体必须包轴)三指标判定旋成/挤出
- `img2parts.mts`:彩色图按颜色 k-means 拆件,共享坐标系分别挤出
- 参考源:game-icons.net(CC-BY 3.0,NOTICE.md 有声明)

## 测试体系

- `npm run test:smoke`:15 分区真实输入冒烟(移动/射击/技能/升级/走门/Boss/死亡/双语/性能)
- `npm run test:play`:连续 3 层 3 Boss 通关回归
- 经验:测试要按引用追踪敌人(数组重排陷阱)、轮询代替固定等待、
  传送换层后必须终止旧遍历队列

## 音频

- Web Audio 全合成:振荡器+噪声缓冲+滤波包络,总线失真+压缩
- tracker 式前瞻调度音乐引擎(40ms tick 提前 0.15s),每层移调变速,Boss 战加强度层
- 环境声三层:蒸汽底噪/42Hz 锅炉轰鸣/随机远处金属声

## 关键调试教训

- 顿帧(hitstop)冻结瞄准 = 炮口"旋转等待"的假象;已删除顿帧
- 瞄准"突然转身":正交相机射线方向错误;近距离死区也是坏方案,应永远精确指向
- 触摸 handler 在菜单界面 preventDefault 会吞掉按钮点击:只在游戏中接管
- vite 单文件插件不支持多入口:showcase 需独立配置文件分开构建
