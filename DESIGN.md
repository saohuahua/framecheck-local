---
name: Framecheck Local
description: 本地 PSD 设计交付包的桌面三栏看稿工作台
colors:
  surface-root: "#FFFFFF"
  surface-subtle: "#F1F1F1"
  surface-hover: "#E0E0E0"
  surface-raised: "#FFFFFF"
  canvas-workspace: "#E9E9E9"
  border-subtle: "#C9C9C9"
  border-strong: "#747474"
  text-primary: "#111111"
  text-secondary: "#3F3F3F"
  text-muted: "#666666"
  accent: "#171717"
  accent-hover: "#000000"
  accent-subtle: "#E7E7E7"
  on-accent: "#FFFFFF"
  selected: "#111111"
  selected-subtle: "#E5E5E5"
  layer-selection: "#D92D20"
  focus: "#171717"
  exact: "#3F3F3F"
  warning: "#77510E"
  error: "#A21D1D"
  measure: "#111111"
  target: "#606060"
  bounds: "#909090"
  hover: "#606060"
  asset-outline: "#4A4A4A"
  grid-dot: "#BDBDBD"
  code-background: "#F1F1F1"
  code-property: "#0451A5"
  code-number: "#098658"
  code-string: "#A31515"
  code-keyword: "#0000FF"
  code-punctuation: "#333333"
  demo-ink: "#111111"
  demo-ink-strong: "#151513"
  demo-muted: "#6F6F69"
  demo-divider: "#D9D9D5"
typography:
  ui:
    fontFamily: 'Inter, "Noto Sans SC", "Segoe UI", sans-serif'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  title:
    fontFamily: 'Inter, "Noto Sans SC", "Segoe UI", sans-serif'
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.43
    letterSpacing: "0"
  label:
    fontFamily: 'Inter, "Noto Sans SC", "Segoe UI", sans-serif'
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: "0"
  mono:
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  caption:
    fontFamily: 'Inter, "Noto Sans SC", "Segoe UI", sans-serif'
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "0"
  micro:
    fontFamily: 'Inter, "Noto Sans SC", "Segoe UI", sans-serif'
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0"
  empty-title:
    fontFamily: 'Inter, "Noto Sans SC", "Segoe UI", sans-serif'
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0"
rounded:
  panel: "8px"
  compact: "4px"
  control: "6px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
components:
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.compact}"
    size: "28px"
  icon-button-hover:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.compact}"
    size: "28px"
  command-button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    height: "28px"
    padding: "0 {spacing.3}"
  tab-selected:
    backgroundColor: "{colors.surface-root}"
    textColor: "{colors.accent}"
    rounded: "{rounded.compact}"
    height: "32px"
  field:
    backgroundColor: "{colors.surface-root}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
    height: "28px"
    padding: "0 {spacing.2}"
---

# Design System: Framecheck Local

## Overview

**Creative North Star: "精密审稿台"**

Framecheck Local 是桌面端的 Operate 型工具，不是展示品牌的营销页面。设计稿本身是视觉中心，界面只为查找、定位、测量和核对提供稳定的工作面。空间通过纯白工作面、明确灰阶画布、清晰边界和紧凑行节奏被精确切分，局部圆角用于组织检查面板和控制组，而不是把页面变成卡片墙。

视觉方向由用户与产品文档共同冻结：月维截图只决定顶栏、左栏、中画布、右栏和底栏的功能排布；`D:\project\psd-platform\project` 只提供黑白灰极简、细边框和高信息密度的视觉参考。本设计不复制其中的 React、Tailwind、业务结构或“浏览器直接解析 PSD”假设。

V0 已以该 Token、三栏尺寸和共享组件契约完成演示工作台，并通过桌面浏览器验收。后续功能只能扩展这些已验证的视觉与交互规则，不能以导入或缓存界面为由改变三栏结构、状态语义或本地优先边界。

**Key Characteristics:**

- 固定三栏工作面，画布始终占据视觉与操作中心，右侧 Inspector 使用 8px 结构圆角
- 纯白、浅灰、中灰和石墨黑承担全部常规界面层级，黑色主命令与选中状态保持明确可见
- 画布选择使用黑色实线，资源集合使用深灰虚线，悬浮使用中灰边界，测量通过黑色虚线和标签区分
- 组件密度服务于反复扫描、快捷键和鼠标精确操作，不模拟通用表单后台
- 本地隐私边界要可见且如实，绝不以云端或协作元素填充顶栏

## Colors

采用高对比黑白灰策略：纯白是工作面，石墨黑负责可执行命令与当前选择，浅灰和中灰建立扫描层级。常规文字与其背景的对比度不得低于 4.5:1；只有 CSS 代码块使用 VS Code 风格的语法色，不参与应用 chrome。

### Primary

- **石墨操作色** (`accent`、`accent-hover`、`focus`): 主命令、当前 Tab、勾选和键盘焦点
- **操作浅灰** (`accent-subtle`): 选中行、筛选器和轻量状态背景
- **界面选中墨色** (`selected`): Tab、列表和主命令的结构性选中状态
- **定位浅灰** (`selected-subtle`): 与画布对象同步的列表选中背景，不用于错误状态
- **画布选中红** (`layer-selection`): 当前图层的 2px 红色虚线边界，以及从选中图层到悬浮图层的红色实线边距标注；选框尺寸标签使用深色底和白字保证对比度

### Secondary

- **测量墨色** (`measure`): 开发元素列表中的辅助读数，不用于画布边距标注
- **悬浮中灰** (`target`、`hover`): 悬浮目标的 1px 边界，与墨色当前选择形成清晰层级
- **资源深灰** (`asset-outline`): 切图集合模式下全部资源的低权重虚线边界

### Tertiary

- **精确绿** (`exact`): `ready`、`exact` 或已验证结果
- **风险琥珀** (`warning`): `partial`、best-effort 和需要人工确认的限制
- **失败红** (`error`): `failed`、不可用资源和阻止性校验错误

### Neutral

- **纸面白** (`surface-root`): 顶栏、侧栏、Inspector 与菜单的基础工作面
- **静灰面** (`surface-subtle`、`surface-hover`): 工具分组、悬浮反馈与不抢画布的次级区域
- **画布灰** (`canvas-workspace`): 中央参考图外的点阵工作区，必须低对比度
- **边界灰** (`border-subtle`、`border-strong`): 1px 分区线、输入边界和拖拽分隔线
- **墨色文本** (`text-primary`、`text-secondary`、`text-muted`): 按信息优先级区分标题、正文、辅助值和禁用说明
- **演示设计事实色** (`demo-ink`、`demo-ink-strong`、`demo-muted`、`demo-divider`): 仅用于内置 demo reference 的图层事实，不作为应用 chrome 的主题色

### Named Rules

**The Monochrome Ownership Rule.** 黑色属于主要命令、界面选中与测量，深灰属于资源集合，浅灰属于 hover 和结构层级。红色只属于当前画布图层的虚线边界；除风险和失败诊断外，常规界面不引入主题色。

**The Code Surface Rule.** CSS 投影使用浅灰代码面、石墨属性和值以及中灰标点。短代码参考通过固定行高、等宽数字和层级而非高饱和语法色保证扫描效率，不传递应用状态。

## Typography

**Display Font:** 不设展示字体。该工具没有 Hero 或营销级标题。

**Body Font:** `ui` Token 定义的本机优先界面字体栈。实施时不得因获取字体而产生运行时网络请求。

**Label/Mono Font:** `label` 用于紧凑控制文本，`mono` 专用于坐标、尺寸、CSS 投影、文件大小、比例和其他需要对齐扫描的事实值。

**Character:** 字体应当像精确的桌面工具而非品牌海报。标题只建立局部层级，数值依靠等宽字体与 `tabular-nums` 对齐，所有正常 UI 文本保持正常字距。

### Hierarchy

- **Panel title** (`title`): 侧栏区块、Inspector 分组和对话框标题
- **UI body** (`ui`): 图层树、资源列表、菜单项、状态说明和交互正文
- **Label** (`label`): 字段标签、Tab 元信息、辅助说明与工具提示
- **Fact value** (`mono`): 几何、缩放、尺寸、CSS 投影、路径片段和诊断编号
- **Caption / micro** (`caption`、`micro`): 高密度工具提示、状态计数、资源元信息和画布模式控件

### Named Rules

**The Scan Before Spectacle Rule.** 任何局部标题都不能大到破坏密集扫描节奏；信息价值提升不等于字体尺寸升级。

## Layout

工作台固定为以下拓扑，布局是产品能力的一部分，不能被通用页面容器、浮卡或自动宽度内容破坏。

```text
48px 顶栏
左侧栏 | 中央画布和浮动工具 | 右侧 Inspector
      28px 画布状态栏
```

- 顶栏固定为 48px，高度不随文件名或状态标签变化
- 左栏默认 288px，可在 240px 到 340px 之间调整和收起
- 右栏默认 368px，可在 320px 到 440px 之间调整和收起
- 中央画布占用所有剩余宽度，任何侧栏内容必须截断、滚动或换行，不能撑开画布
- 底栏固定为 28px，只汇总画布尺寸、缩放、边界模式、本地缓存与诊断计数
- 工具图标按钮为 28px 方形；Tab 高度为 32px；图层树行、菜单项和紧凑属性行采用固定行高，避免虚拟列表滚动跳动
- 间距只使用前置 `spacing` 比例。面板内首选 8px 与 12px，区块之间首选 16px，避免随意扩大为空洞卡片

当视口宽度低于 1280px 时，不缩小文字或压缩画布来维持三栏。左右栏默认收起为 Drawer，顶栏和底栏保持可用。移动端不是一期交付目标，不应通过不完整的卡片堆叠伪装为已支持。

### Workbench Interaction Contract

| 领域 | 规范 |
| --- | --- |
| 顶栏 | 产品标识返回本地文件列表，导入是带文本的主命令，导出只在存在当前 bundle 时可用，搜索聚焦左栏图层搜索框 |
| 左栏 | 文件、开发元素、全部图层通过同一 `AppTabs` 切换；开发元素默认按切图、文案、结构组织，原始 PSD 树只作为高级视图；超长列表必须在栏内滚动，不能撑开工作台 |
| 画布 | `reference.png` 与 SVG overlay 共享唯一 transform，禁止分别缩放或用 HTML 重建 PSD 作为底图 |
| 选择 | overlay 默认只命中切图 placement 与文案，文案区域优先选文案，切图其余区域选完整 placement，同点重复点击在两者间穿透；完整图层树仍可主动选择任意原始节点；选择同步到右栏，画布使用红色 2px 虚线定位 |
| 平移和缩放 | 空格拖拽或中键拖拽平移，滚轮围绕指针缩放，适配与 1:1 都写回同一个 CanvasTransform |
| 测量 | 当前选择固定为 A，悬浮另一个可见图层即成为 B 并立即显示从相对边界开始的水平或垂直红色实线边距；悬浮画布空白处时改为显示 A 到画布背景四边的边距；`M` 保留为持续测量模式而非唯一入口 |
| 边界 | 默认不显示全部边界，`B` 显式切换；logical 与 paint 切换应即时影响选框、测量和底栏说明 |
| 右栏 | 标注按对象类型展示几何、文案或切图详情和 CSS；切图 Tab 展示全部资源并自动在画布标出 placement；属性和诊断保留原始事实入口 |
| 文件与缓存 | 导入、导出、删除、清空缓存都要使用带目标名称和后果的确认或进度状态，永远不暗示网络上传 |

### Canvas Overlay Priority

同一图层出现多种状态时，`CanvasStage` 以以下顺序绘制，不能由通用 UI 组件自行竞争样式：

1. 全部边界为最低层的低透明灰线
2. 切图集合为资源深灰 1px 虚线边框
3. hover 目标为中灰 1px 边框，不改变选择
4. 选中为红色 2px 虚线边框，选框下方显示深色底白字的实际宽高，优先于 hover 和资源集合轮廓
5. 测量线和距离标签为最高可见层的红色实线，线段只能水平或垂直且端点必须落在对象边界或同色正交延长线上
6. 诊断以列表和 Inspector 中的语义标记提示，不用大面积颜色覆盖参考图

快捷键固定为：`V` 选择、`M` 测量、`B` 全部边界、`Shift+R` 标尺、`G` 网格、`Shift+1` 适配、`1` 1:1、`+` 和 `-` 缩放。任何输入框、菜单、Popover、Dialog 或可编辑字段获得焦点时，画布快捷键与滚轮行为必须让位。

### Named Rules

**The Three-Column Rule.** 三栏和底栏是固定功能区域，不可被卡片、居中容器、营销空白或侧栏内容重新解释。

## Elevation & Depth

默认是平面工作台。主结构通过底色差、1px 边界和分隔线区分；右侧 Inspector 可使用 8px 圆角、1px 边界和低幅柔和阴影从画布中分离。Menu、Popover、Tooltip 和 Dialog 使用更高一级结构阴影，不使用玻璃或装饰性发光。

| 层级 | Token 语义 | 使用范围 |
| --- | --- | --- |
| base | 0 | 顶栏、侧栏、画布工作区和 Inspector |
| canvas-overlay | 10 | 标尺、网格、图层边界、测量线和工具浮层 |
| floating | 20 | 菜单、Popover、Tooltip 与快捷键面板 |
| modal | 30 | 确认删除、导入错误与阻断性状态 |

浮层阴影只可使用柔和黑色透明阴影，作用是让其离开画布而非制造品牌氛围。Dialog 可以有更明确的遮罩，但遮罩不得使当前文件或错误上下文不可辨认。

### Named Rules

**The Structural Depth Rule.** 常驻阴影只允许用于 Inspector 与画布的结构分离；区块内部继续依靠底色和分隔线，禁止卡片套卡片。

## Shapes

三栏骨架、顶栏、底栏和画布容器保持直线分区；Inspector 外壳和主要内容组使用 `panel` 的 8px 圆角，输入、菜单和按钮使用 `control` 的 6px 圆角，状态标记使用 `compact`。没有胶囊筛选器、大圆角页面容器或嵌套卡片。

- 所有结构边界为 1px，拖拽分隔线可在 hover 和拖拽中使用 `border-strong`
- 图标按钮保持固定 28px 命中区域，图标在视觉上居中且不因为 label、tooltip 或状态变化改变布局
- 文件缩略图、资源预览和参考图使用稳定的长宽比；它们是内容证据，不是装饰面板
- Inspector、对话框和主要浮层最大圆角为 8px；紧凑控制最大圆角为 6px

## Components

组件层固定为：Framecheck Design System -> 项目自建工作台与领域组件 -> `src/shared/ui` 的薄封装 -> Reka UI 无样式原语。页面与领域组件不得直接散用 Reka 原语。禁止引入 Element Plus、Naive UI、PrimeVue、Ant Design Vue、shadcn-vue 基础模板或第二套 headless primitive。

### Shared State Contract

每一个共享组件都必须支持并测试以下状态。状态变化不得改变控件外框尺寸或挤压相邻布局。

| 状态 | 视觉与行为契约 |
| --- | --- |
| default | 使用中性文字、边界和背景，满足常态可读性 |
| hover | 使用低对比度表面变化或边界强化，不位移、不放大、不制造阴影卡片 |
| active 或 selected | 应用 chrome 和画布同步列表使用石墨黑与结构性指示；不能只靠颜色 |
| focus-visible | 使用统一石墨焦点环，键盘可达且不被画布 overlay、浮层或分隔线遮挡 |
| disabled | 降低对比度并禁止 pointer 与键盘操作，不伪装为可执行命令 |
| pending | 保留目标名称、阶段进度和取消或等待语义，不能只显示不确定 spinner |
| empty | 解释当前为何为空并提供下一步可执行入口，不留无意义白板 |
| error | 保留失败原因、相关文件或目标、重试路径和可回退操作 |

### Shared Primitive Contracts

| 组件 | 使用边界 | 必须状态与行为 |
| --- | --- | --- |
| `AppIconButton` | 28px 仅图标工具 | 可访问名称和 tooltip 必须同时存在；hover、focus-visible、disabled 不改变尺寸 |
| `AppCommandButton` | 导入、导出、下载等明确动作 | 允许图标加文本；主命令使用石墨黑，其余使用中性或 ghost；pending 时保持按钮宽度和目标文案 |
| `AppTabs` | 左栏文件或图层，右栏四个 Inspector Tab | selected 使用文本、结构性指示和可见面层三重表达；方向键与焦点行为由封装统一处理 |
| `AppTextField` | 搜索、筛选和可复制值的输入界面 | 28px 高，clear、error、disabled 与 focus-visible 有固定槽位，长文本不推动图标 |
| `AppMenu` 与 `AppContextMenu` | 文件更多菜单和图层右键菜单 | 键盘导航、Escape 关闭和焦点恢复由封装负责；菜单永远位于 floating 层 |
| `AppTooltip` | 陌生工具和仅图标命令 | 延迟短于一般提示但不遮挡主画布命中区；不作为唯一可访问名称 |
| `AppDialog` 与 `AppConfirmDialog` | 删除、失败、缓存不足和快捷键帮助 | 有明确标题、目标、后果、焦点陷阱、Escape 行为和关闭后焦点恢复 |
| `AppScrollArea` 与 `AppSeparator` | 图层树、开发元素、资源列表、长属性和区块分隔 | 滚动视口必须受父面板限高，支持鼠标滚轮与触控板，滚动不改变行高；分隔线使用中性边界色而非卡片间距 |
| `AppPanelResize` | 左右侧栏调整与收起 | 强制最小和最大宽度，支持键盘调整；若 Reka POC 不能满足，则由项目自建 |
| `AppStatus` | ready、partial、failed、demo、exact 与诊断等级 | 只显示有真实数据来源的状态，颜色之外还要有文字和图标或结构差异 |

### Domain Ownership

`ViewerShell`、`CanvasStage`、`LayerTree`、`MeasureOverlay`、`Inspector`、`BundleImportFlow` 和 `WorkspaceToolbar` 必须由项目自建。它们消费共享 Token 和原语封装，但其选择、虚拟化、测量、坐标变换、资源和诊断语义不能交给通用组件库。

### Named Rules

**The Thin Wrapper Rule.** Reka 只处理可访问性、焦点和基础交互；视觉 Token、组件 API、状态命名和所有领域行为只能由 Framecheck Design System 决定。

## Do's and Don'ts

### Do:

- **Do** 将所有颜色、间距、圆角、字体和尺寸引用到本文件定义的 Token，再在实现阶段建立唯一 CSS 变量来源
- **Do** 让参考设计稿在首屏保持完整、可检查且明显大于周边工具界面
- **Do** 用固定行高、等宽数值和 1px 分区线支持图层、属性、资源和诊断的快速扫描
- **Do** 在每一个无选择、无资源、无诊断、缓存不足、导入失败和演示状态中给出下一步或事实说明
- **Do** 在 1280px、1440px、1920px 的桌面宽度验证三栏不溢出，且在窄桌面默认抽屉化侧栏
- **Do** 在 Reka POC 中验证 Tab、右键菜单、Tooltip、Confirm Dialog、焦点恢复、1,000 图层虚拟树与侧栏调整

### Don't:

- **Don't** 复制、迁移或以任何形式复用 `D:\project\psd-platform\project` 的 React 代码、Tailwind 配置、页面结构或数据流
- **Don't** 引入完整带样式组件库、主题包、Tailwind、UnoCSS、通用画布编辑器、缩放库或第二套无样式原语
- **Don't** 使用渐变背景、玻璃拟态、单一紫色主题、光球、装饰插画、营销 Hero、浮动卡片套卡片或大圆角容器
- **Don't** 用分享、成员、版本、评论、云同步、登录或“上传”语言填充本地工作台
- **Don't** 将所有图层边界、尺寸或颜色默认铺在画布上，信息只在选择、测量或用户显式开启时出现
- **Don't** 让 tooltip、菜单、输入、Popover 或 Dialog 与画布快捷键、滚轮、空格拖拽和中键平移抢事件
- **Don't** 在没有真实 bundle 数据时伪造已解析 PSD、资源、缓存或诊断事实
