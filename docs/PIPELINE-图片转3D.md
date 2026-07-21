# 参考图 → Three.js 程序化建模管线设计

> 目标:网上找到一张想要的蒸汽朋克建模参考图,通过算法自动(或半自动)还原成
> 本项目的程序化 Three.js 模型,并保持漫画渲染风格统一。
>
> 调研结论(2026 现状):
> - AI 单图生 3D 已成熟:开源首选 [TRELLIS 2](https://triposplat.com/blog/best-3d-ai-generators-2026)(Apache 2.0,单卡可跑,视觉保真度最高)、腾讯 Hunyuan3D-2(MIT)、TripoSR(速度快但质量一般)
> - 轮廓挤出路线有现成验证:[SpEx](https://github.com/surfer8137/SpEx) 证明了"轮廓提取 → earcut 三角化 → 挤出 → 贴图"管线完全可行
> - 本项目约束:运行时零素材、单文件构建、漫画渲染管线(色阶/描边/轮廓光/网点)

---

## 总体设计:三层管线,按参考图类型分流

```
参考图(网络图片)
   │
   ├─ A. 轴对称物件(锅炉/灯/阀门/表盘) → 管线 A:轮廓旋成(纯程序化)
   ├─ B. 扁平/侧视物件(齿轮/枪械/工具) → 管线 B:轮廓挤出(纯程序化)
   └─ C. 复杂立体造型(Boss/人偶/机械兽) → 管线 C:AI 生 3D 再加工
```

三条管线最终都汇到同一个**代码生成器**:输出 `src/three/factory/xxx.ts`
工厂函数(和现有 `makeBoiler`/`makeGear` 同构),材质走 `toonMat` +
`addOutlines` + 轮廓光,自动接入漫画渲染管线。

---

## 管线 A:轮廓旋成(Lathe)—— 轴对称物件首选

蒸汽朋克素材里一大半(锅炉、罐体、灯罩、阀门、烟囱)都是旋转体,
这条路完全程序化、确定性最强、和现有 `makeBoiler` 完全一致。

```
图片 → 背景去除 → 轮廓提取 → 对称轴检测 → 半轮廓采样 → Douglas-Peucker 简化
     → LatheGeometry 参数 → TS 工厂代码
```

### 步骤

1. **背景去除**(二选一):
   - 优先找白底/纯色底参考图 → 阈值 + flood fill 即可(OpenCV.js 或 sharp 手写 30 行)
   - 复杂背景 → U²-Net 显著性分割(`onnxruntime-node` 跑开源模型,本地免 API)
2. **轮廓提取**:alpha mask → Moore 邻域追踪外轮廓 → 点列
3. **对称轴检测**:轮廓质心 x 坐标 + 左右宽度方差最小化搜索 → 主轴
4. **半轮廓采样**:从顶到底按 y 均匀取 N=16~24 个点,记录 `(半径, 高度)`
   → 直接就是 `LatheGeometry(points)` 的 `Vector2` 数组
5. **Douglas-Peucker 简化**(ε=2~4px)控制点数,避免锯齿感
6. **调色板映射**:对轮廓内像素做 k-means(k=3~5),映射到项目 `PALETTE`
   最近色,生成材质分段(可选:按 y 分段上色)
7. **代码生成**:输出

```ts
export function makeBrassLamp(): THREE.Group {
  const profile = [
    new THREE.Vector2(0.01, 0), new THREE.Vector2(0.42, 0.05), ...
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 16), toonMat(0xb87333));
  ...
}
```

### 工具:`tools/img2lathe.mjs`

- 依赖:`sharp`(像素处理),零模型依赖;复杂背景再加 `onnxruntime-node` + u2net
- 输出直接打印 TS 代码到 stdout,重定向进 `src/three/factory/`
- 验证:自动开一个 three.js 页面截图,和原图并排输出 `compare.png`

---

## 管线 B:轮廓挤出(Extrude)—— 扁平/侧视物件

适合:齿轮变种、枪械、扳手、装饰牌、钥匙。

1. 同管线 A 的 1-2 步得到外轮廓(含内孔:Moore 追踪 + 奇偶规则判定孔洞)
2. 轮廓 → `THREE.Shape`(外轮廓)+ `shape.holes`(内孔)
3. `ExtrudeGeometry({ depth, bevel })` —— 就是现有 `makeGear` 的做法
4. 深度估计:按轮廓长宽比给默认(depth = 短轴 × 0.25),允许命令行覆盖
5. 调色板映射同上,生成代码同上

> SpEx 已验证这条路线的工程可行性,我们换成输出 TS 代码而不是运行时加载。

---

## 管线 C:AI 单图生 3D —— 复杂造型

适合:Boss、人偶、机械兽、复杂装饰物。

### 环境(一次性,独立 venv,不污染项目)

```bash
conda create -n trellis python=3.10
pip install torch --index-url https://download.pytorch.org/whl/cu121
git clone https://github.com/Microsoft/TRELLIS
pip install -r TRELLIS/requirements.txt
# RTX 2070 8G 可跑 TRELLIS-image-large(显存不足时用 --low-vram 模式或 Hunyuan3D-2 mini)
```

### 流程

```
参考图 → TRELLIS 本地推理 → GLB → trimesh 后处理 → 代码化 → 项目材质
```

1. **推理**:`python trellis_run.py --image ref.png --out model.glb`
2. **后处理**(trimesh 脚本):
   - 缩放归一(包围盒最长边 → 游戏内尺寸)
   - 减面到 3~8k 三角面(漫画风格不需要高模,还利于实例化)
   - 中心对齐底部(y=0 落地)
3. **接入**(二选一):
   - **运行时加载(推荐先验证效果)**:GLB 放 `public/models/`,
     `GLTFLoader` 加载后遍历替换材质为 `toonMat`(保留 UV 贴图也可),
     套 `addOutlines`。代价:破坏"单文件零素材",产物变成多文件
   - **烘焙成代码(保持零素材)**:用 `gltf-to-code` 脚本把顶点/索引/UV
     导出为 TS 数组(3-8k 面约 300-800KB 文本),嵌入工厂函数。
     牺牲一点可维护性换单文件
4. **风格统一**:全部走 `toonMat`(或保留生成贴图 + toon 混合)+
   `addOutlines` + 轮廓光 + 分离色调——后处理链会把 AI 素材和程序化素材
   拉到同一个色调里

### 验证闭环

```
原图 vs 渲染图 → 截图对比(人眼 + SSIM 参考)
   ↓ 不像
调参:减面率 / 调色板 k / 轮廓厚度 / 缩放
```

`tools/compare-render.mjs`:加载生成的模型,用游戏同款相机+渲染链截图,
和原图输出到一张对比图上。

---

## 工具目录规划

```
tools/
  img2lathe.mjs      管线 A:轮廓旋成 → TS 代码
  img2extrude.mjs    管线 B:轮廓挤出 → TS 代码
  trellis_run.py     管线 C:TRELLIS 推理包装
  glb_post.py        GLB 减面/归一/落地(trimesh)
  glb_to_code.mjs    GLB → TS 顶点数组(零素材模式)
  compare-render.mjs 渲染对比图生成
  refs/              参考图存放
  out/               生成物暂存
```

---

## 参考图选取规范(决定 80% 的效果)

- **管线 A/B**:白底或纯色底、正侧视图、无透视畸变、轮廓清晰
  (搜 "steampunk boiler side view white background")
- **管线 C**:主体完整、居中、背景简单、光线均匀;AI 对背影/遮挡会乱猜
- 版权:优先 CC0/Pixabay 素材,AI 生成物注意各模型许可(TRELLIS Apache 2.0 可商用)

## 验收标准

- 管线 A/B:生成代码直接 `npm run build` 通过,游戏内截图与原图轮廓相似度人眼可辨
- 管线 C:减面后 ≤8k 面,60fps 不降;风格化后与场景其他物件不违和(描边/色阶一致)

## 实施顺序建议

1. **先做管线 A**(1-2 天):零模型依赖,立刻能验证"图片→代码→游戏内"全链路
2. 管线 B 与 A 共享 90% 代码,顺带完成
3. 管线 C 最后做:环境重,但天花板最高,专门用于新 Boss/新怪物
