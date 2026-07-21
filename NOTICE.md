# 素材与许可说明

本项目运行时零素材,全部模型由代码程序化生成。开发管线中使用了以下来源的参考图:

## game-icons.net (CC-BY 3.0)

以下图标作为"轮廓旋成"管线的参考输入,生成的几何体(灯笼/高帽的 Lathe 轮廓)受其启发:

- `lorc/lantern` → `src/three/factory/steamLantern.ts`
- `lorc/top-hat` → `src/three/factory/topHat.ts`

许可:https://creativecommons.org/licenses/by/3.0/ ,素材来源:https://game-icons.net

游戏本体不包含这些图标的原始文件,仅包含算法从其轮廓推导出的坐标数据。
