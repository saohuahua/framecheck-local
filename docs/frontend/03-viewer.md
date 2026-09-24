# 03 看稿工作台：画布、命中、测量与状态

本篇覆盖 `features/viewer` 与 `features/workspace` 两个模块：三栏布局、画布渲染与坐标系统、命中测试、测量系统、快捷键、状态管理分层、左栏两个列表与右栏检查面板。

## 三栏布局

[ViewerShell.vue](../../src/features/viewer/ViewerShell.vue) 用 CSS Grid 固定拓扑：

```
┌────────────────────── WorkspaceToolbar（顶栏）─────────────────────┐
├────────────┬──5px──┬──────────────────────┬──5px──┬───────────────┤
│ 左栏 264px │ 拖拽条 │   CanvasStage 画布    │ 拖拽条 │ 右栏 344px    │
│ 文件/开发/图层│      │  reference + overlay │       │ InspectorPanel│
├────────────┴───────┴──────────────────────┴───────┴───────────────┤
│ statusbar：状态 · 缩放 · 边界模式 · 缓存占用 · 诊断计数              │
└────────────────────────────────────────────────────────────────────┘
```

- 列宽由 CSS 变量 `--fc-left-width / --fc-right-width` 控制，[AppPanelResize](../../src/shared/ui/AppPanelResize.vue) 拖拽改写，范围左 220–320 / 右 300–420
- 侧栏内容必须滚动或截断，不允许撑开画布（`min-width: 0; min-height: 0`）
- 视口宽度 < 1280px 时侧栏与拖拽条整体隐藏（[ViewerShell.vue:404](../../src/features/viewer/ViewerShell.vue)）
- 偏好（缩放、Tab、选中图层）由 `viewer.preferences()` 产出，防抖 180ms 写回 IndexedDB（[ViewerShell.vue:153](../../src/features/viewer/ViewerShell.vue)），打开 bundle 时经 `restorePreferences` 恢复

## 画布渲染模型

[CanvasStage.vue](../../src/features/viewer/CanvasStage.vue) 的模板结构（[CanvasStage.vue:571](../../src/features/viewer/CanvasStage.vue)）：

```html
<div class="canvas-stage__transform" :style="transformStyle">
  <img class="canvas-stage__reference" :src="session?.referenceUrl" ... />
  <svg ref="overlay" :viewBox="`0 0 ${canvas.width} ${canvas.height}`" ...>
    <!-- 全部边界 / 资产标定 / hover / 测量 / 选中框（pointer-events: none） -->
    <rect class="canvas-stage__hit" />  <!-- 命中层（pointer-events: all） -->
  </svg>
</div>
```

```ts
// CanvasStage.vue:132
const transformStyle = computed(() => ({
  transform: `translate(${viewer.translateX}px, ${viewer.translateY}px) scale(${viewer.scale})`,
  width: `${canvas.value.width}px`,
  height: `${canvas.value.height}px`,
}))
```

要点：

- reference 图与 SVG overlay 是同一 transform 容器的子元素，共享一个 CSS transform；overlay 的 viewBox 使用设计稿原始坐标系，因此 overlay 内所有几何直接写设计坐标
- 缩放/平移只修改一个 `translate() scale()`，容器声明 `will-change: transform` 走合成层
- 命中层是铺满画布的一个透明 rect（`pointer-events: all`），其余 overlay 元素 `pointer-events: none`，命中判断不依赖 DOM 事件目标

## 坐标系统

### 屏幕坐标 → 设计坐标

```ts
// CanvasStage.vue:318
function canvasPointAtPointer(event: PointerEvent | MouseEvent) {
  const element = overlay.value
  const matrix = element?.getScreenCTM()
  if (!element || !matrix) {
    return undefined
  }
  const point = element.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  return point.matrixTransform(matrix.inverse())
}
```

`getScreenCTM()` 返回 SVG 用户坐标系到屏幕的当前矩阵（含 CSS transform 的缩放与平移），求逆后把任意屏幕点映射回设计坐标。缩放/平移状态变化时矩阵自动更新，无需手动维护换算系数。

### 围绕指针缩放

```ts
// CanvasStage.vue:236
function zoomAround(nextScale: number, localX: number, localY: number) {
  const logicalX = (localX - viewer.translateX) / viewer.scale
  const logicalY = (localY - viewer.translateY) / viewer.scale
  const clampedScale = Math.min(2.4, Math.max(0.25, nextScale))
  viewer.setTransform(clampedScale, localX - logicalX * clampedScale, localY - logicalY * clampedScale)
}
```

先把指针位置反推为设计坐标，再按新 scale 重算 translate，使指针下的设计点在缩放前后指向同一屏幕位置。滚轮（`deltaY` 方向 ×0.9/×1.1）、工具栏加减号都走这一个函数。

### 其他视口操作

| 操作 | 实现 |
| --- | --- |
| 适配画布（Shift+1） | `fitToViewport`：按视口尺寸（留 64px 边距）取最小缩放，居中放置 |
| 1:1（数字 1） | `setOriginalScale`：scale=1，水平居中 |
| 定位图层（revealLayer） | 保持当前 scale（clamp 0.4–1.2），把图层中心移到视口中心 |
| 平移 | 空格按住 + 左键拖拽，或中键拖拽；`setPointerCapture` 保证拖出视口仍可跟踪 |

## 命中测试与选择

### 候选收集

[hit-test.ts](../../src/features/viewer/hit-test.ts) 的 `findCanvasSelectionCandidates` 在设计坐标上做矩形包含判断，产出候选序列：

- 文本候选：可见且含真实文本的 text 层，命中其 bounds
- 资产候选：placement 的 bounds 命中，且其 nodeId 对应图层可见
- 排序：按图层 `order`（PSD 自下而上）降序，同序按数组下标；**文本候选整体排在资产候选之前**

### 点击穿透

画布点击（[CanvasStage.vue:426](../../src/features/viewer/CanvasStage.vue)）在候选间循环：

```ts
const cycleDistance = 4 / viewer.scale   // 容差随缩放换算
const sameCycle = previousCycle
  && previousCycle.candidateIds.join('|') === candidateIds.join('|')
  && Math.hypot(selection.x - previousCycle.x, selection.y - previousCycle.y) <= cycleDistance
const index = sameCycle && previousCycle ? (previousCycle.index + 1) % selection.candidates.length : 0
viewer.inspectCanvasTarget(selection.candidates[index])
```

同一点附近重复点击时在候选列表内前进；候选集变化或位移超出容差则重置为第一个。`viewer.resetCanvasSelectionCycle()`（版本号计数）在编程式选择时清空循环状态。

### 选择状态

`CanvasSelectionTarget`（[types.ts:91](../../src/features/viewer/types.ts)）区分 `text` 与 `asset` 两类目标，携带 layerId / assetId / placementId / bounds。选中目标同步三处：画布红色 2px 虚线框 + 尺寸标签、右栏属性 Tab（`inspectCanvasTarget` 会切到 properties）、左栏列表高亮。悬浮目标是中灰 1px 边框，不改变选择。

## 测量系统

三种测量入口（[measure.ts](../../src/features/viewer/measure.ts) 纯函数 + CanvasStage 交互）：

| 工具 | 触发 | 行为 |
| --- | --- | --- |
| 随动测量（select 工具自带） | 有选中对象时悬浮另一可见对象 | A=选中，B=悬浮，立即显示相对边距 |
| 测量工具 M | 依次点选两个对象 | 第一击定 A，第二击定 B；悬浮时实时预览 B |
| 卷尺工具 Shift+M | 拖拽画线 | 拖拽超过 3px/scale 后锁定主导轴（水平/垂直取分量大者），端点约束在正交方向 |

### 边距计算

`measureBounds(a, b)` 按两个矩形的相对位置分三种情况：

1. **包含**：内层中心线为基准，输出四条内边距段（左/右/上/下）
2. **相离**：输出水平、垂直两条间距段；基准线取两矩形重叠区间中点（有投影重叠时）或对齐边
3. **重叠**：间距为 0，不输出段

每条段携带 `extensions`（延长线）：当段基准线与目标边不重合时，输出一条把测量线延伸到目标边的辅助线。段标签位置固定在段中点法向偏移 18px 处。

卷尺用 `measurePoints` 输出距离与标签；标签尺寸按 `1/scale` 反向缩放，保证缩放时标注视觉尺寸恒定（[CanvasStage.vue:114](../../src/features/viewer/CanvasStage.vue) 的 `rulerOverlayScale`）。

悬浮画布空白处时，A 到画布四边的边距以 `canvasBounds` 作为 B 参与 `measureBounds`。

### 边界模式

`boundsMode`（logical / paint）切换后，选中框、hover 框、测量的取值函数统一从 `currentBounds(layer)` 取值：paint 模式且存在 `paintBounds` 时用 paint（含效果的实际渲染边界），否则用 logical。底栏按钮与状态栏同步显示当前模式。

### overlay 绘制优先级

[DESIGN.md](../../DESIGN.md) 冻结的绘制顺序，模板中的元素按此排列：

1. 全部边界（`showBounds` 开启时，低透明灰线）
2. 资产集合标定（选中资产的全部 placements，深灰虚线）
3. hover 目标（中灰 1px）
4. 选中目标（红色 2px 虚线 + 深底白字尺寸标签）
5. 测量线与标签（红色实线，最高可见层）
6. 诊断只出现在列表与 Inspector，不画在画布上

## 快捷键

快捷键监听在 `window` 上（[CanvasStage.vue:459](../../src/features/viewer/CanvasStage.vue)），入口处先做抢占防护：

```ts
function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(target.closest('input, textarea, [contenteditable="true"], [role="menu"], [role="dialog"]'))
}
```

| 键 | 行为 |
| --- | --- |
| V | 选择工具 |
| M / Shift+M | 测量工具 / 卷尺工具 |
| B / G / Shift+R | 全部边界 / 网格 / 坐标刻度开关 |
| Shift+1 / 1 | 适配画布 / 1:1 |
| + / − | 以视口中心缩放 |
| Space（按住） | 平移模式（左键拖拽生效） |
| Escape | 卷尺：清除当前测量；其余：清除选中 |

## 状态管理分层

| 层 | 载体 | 内容 | 生命周期 |
| --- | --- | --- | --- |
| 会话数据（session，当前打开 bundle 的视图数据） | [bundle-session.ts](../../src/features/workspace/bundle-session.ts) 模块级 `shallowRef` | layers 树、assets、diagnostics、canvas、referenceUrl、record 摘要 | 跟随打开的 bundle |
| 交互状态 | [viewer-store.ts](../../src/features/viewer/viewer-store.ts)（Pinia） | 工具、选中/hover、测量端点、缩放平移、Tab、展开节点、显隐开关 | openXxx 时重置 |
| 用户偏好 | IndexedDB `preferences` 字段 | lastScale、leftTab、rightTab、lastSelectedLayerId | 跨会话 |

会话查询函数（`findSessionLayer / findSessionAsset / findSessionAssetForLayer`）在扁平化后的树上查找。`openLocal()` 打开本地 bundle 时把根层节点 id 全部置入 `expandedLayerIds`（顶层默认展开）；`openDemo()` 选中演示稿的 `hero-title` 图层作为初始状态。

工具切换（`setTool`）负责测量状态的进入/退出语义：切到 measure 时把当前选中对象作为测量起点 A；切回 select 清空全部测量状态。

## 左栏列表

### 开发元素列表（默认 Tab）

[development-elements.ts](../../src/features/viewer/development-elements.ts) 的 `getDevelopmentElements` 从设计事实推导面向开发的元素序列，分类优先级：

1. **切图（asset）**：每个 asset 的每个 placement 一条；无 placement 记录时回退到其关联图层 bounds
2. **文案（text）**：未被切图占用的 text 层（`representedLayerIds` 去重）
3. **背景（background）**：命名命中 `/background|\bbg\b|背景|底图|底板/`，或非组、无文本且覆盖画布 ≥72% × 50% 的图层

排序：`order` 升序，同序按名称 zh-CN localeCompare。列表组件（[DevelopmentElementList.vue](../../src/features/viewer/DevelopmentElementList.vue)）提供搜索与分类筛选，分「切图资源 / 文案 / 背景」三段渲染；点击行调用 `viewer.selectAsset` 或 `viewer.inspectLayer(id, true)` 并触发画布定位。

### 图层树

[LayerTree.vue](../../src/features/viewer/LayerTree.vue) 提供 PSD 原始层级的完整视图：

- 搜索：关键字匹配图层名与文本内容，父级命中时子树整体保留（`includesMatch` 递归）
- 类型筛选：全部/组/文本/图片/形状/智能对象
- 展开状态存于 `viewer.expandedLayerIds`；搜索时强制展开命中路径
- 行渲染为扁平 `rows` 数组（`{ layer, depth }`，[LayerTree.vue:31](../../src/features/viewer/LayerTree.vue)），缩进用 `--depth` CSS 变量

## 右栏检查面板

[InspectorPanel.vue](../../src/features/viewer/InspectorPanel.vue) 四个 Tab（由 `viewer.rightTab` 控制）：

| Tab | 内容 |
| --- | --- |
| annotation | 按对象类型展示：文案（字体/字号/行高/颜色/对齐）、切图（标记/格式/多倍率/摆放）、图层（几何与样式） |
| assets | 资产列表与多选、缩略图、单个下载 / 打包 zip 下载、复制路径 / Data URL / base64 |
| properties | 当前画布目标的属性事实 + CSS 投影（VS Code 风格语法色，支持复制） |
| diagnostics | 诊断列表（error/warning/info 分级） |

CSS 投影由前端从设计事实推导（颜色、圆角、字体、几何），是派生视图，不写回 bundle。资源读取统一经 `bundleStore`：`readAsset` 优先返回 `previewUrl` 对应的 Blob，否则从 OPFS 读取字节；`loadAssetPreview` 在此之上生成 object URL。

## 演示数据

[demo-bundle.ts](../../src/features/viewer/demo-bundle.ts) 提供一份内置静态 bundle 数据（静态导入的 reference 与资源图），用于无本地缓存时的空状态展示与 e2e 测试基线。demo 会话与本地会话在 `ViewerBundleSession.kind` 上区分，导出等写操作对 demo 会话禁用。
