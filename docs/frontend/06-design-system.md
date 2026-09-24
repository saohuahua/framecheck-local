# 06 设计系统、UI 原语与测试策略

本篇覆盖 `shared/styles`（Token）、`shared/ui`（App* 组件层）、领域组件的边界规则，以及全项目测试策略。视觉与交互规范的事实来源是 [DESIGN.md](../../DESIGN.md)。

## 分层结构

```
Framecheck Design System（DESIGN.md 冻结的 Token 与规则）
  → 领域组件（ViewerShell / CanvasStage / LayerTree / InspectorPanel / ...，项目自建）
    → App* 薄封装（10 个，src/shared/ui）
      → reka-ui 无样式原语
```

规则：

- 页面与领域组件不直接 import reka-ui 原语，统一经 App* 封装
- 不引入第二套 headless 原语或带样式组件库
- 领域组件（`ViewerShell / CanvasStage / LayerTree / MeasureOverlay / InspectorPanel / BundleImportFlow / WorkspaceToolbar`）必须项目自建：选择、虚拟化、测量、坐标变换、资源与诊断语义不交给通用组件库

## Token 体系

[DESIGN.md](../../DESIGN.md) 前置定义四组 Token，实现层落在 `shared/styles/tokens.css` 的 CSS 变量（`--fc-*` 前缀）：

| 组 | 内容 | 示例 |
| --- | --- | --- |
| colors | 纯白工作面 + 石墨黑命令色 + 灰阶层级；`layer-selection` 红只属于画布选中与测量 | `--fc-accent: #171717`、`--fc-layer-selected: #D92D20` |
| typography | 7 个字阶（ui/title/label/mono/caption/micro/empty-title），本机字体栈，无运行时网络请求 | `--fc-mono-font` 用于全部数值对齐场景 |
| spacing | 4/8/12/16/20/24 px 六档 | 面板内 8/12，区块间 16 |
| rounded | panel 8px / compact 4px / control 6px | Inspector 用 panel，输入用 control |

命名规则（DESIGN.md Named Rules）：

- **Monochrome Ownership Rule**：黑色属于主命令、界面选中与测量；深灰属于资源集合；浅灰属于 hover 与结构层级；红色只属于画布当前选中与测量；除诊断语义色（exact/warning/error）外不引入主题色
- **Code Surface Rule**：CSS 投影代码块是唯一使用 VS Code 风格语法色的区域（code-property/number/string/keyword 四色），不参与应用 chrome
- 数值列统一 `fc-mono` + `font-variant-numeric: tabular-nums`

## App* 组件层

`shared/ui` 下 9 个组件文件，职责与必须支持的状态：

| 组件 | 职责 | 实现要点 |
| --- | --- | --- |
| [AppTabs.vue](../../src/shared/ui/AppTabs.vue) | 左栏三 Tab、右栏四 Tab | reka `TabsRoot/TabsList/TabsTrigger`；选中态由文本加粗 + 底部 2px 指示条 + 颜色三重表达；`data-state` 由 reka 管理 |
| [AppDialog.vue](../../src/shared/ui/AppDialog.vue) | 确认/信息对话框 | reka `DialogRoot/Portal/Overlay/Content`；title/description 必填；Escape 关闭；destructive 变体；actions 插槽带默认确认/取消按钮组 |
| AppCommandButton | 主命令按钮（导入/导出/开始转换） | variant：primary（石墨黑）/ ghost（默认，中性）/ danger；pending 时保持宽度与文案 |
| AppIconButton | 28px 仅图标工具 | 可访问名称与 tooltip 必须同时存在；hover/focus/disabled 不改变尺寸 |
| AppTextField | 搜索与筛选输入 | 28px 高；clear/error/disabled/focus-visible 固定槽位；`defineExpose({ focus })` 供外部聚焦 |
| AppMenu | 文件菜单、资产复制菜单 | 键盘导航、Escape、焦点恢复由 reka 处理；样式与定位由封装控制。DESIGN.md 契约中的 AppContextMenu（图层右键菜单）当前代码库未包含 |
| AppTooltip | 工具提示 | 延迟显示；不作为唯一可访问名称 |
| AppScrollArea | 图层树/列表滚动 | 滚动视口受父面板限高，不改变行高 |
| AppPanelResize | 侧栏拖拽调宽 | 强制 min/max；键盘可调；side 区分左右 |

### 八状态契约

每个共享组件在测试中验证以下状态（DESIGN.md Shared State Contract）：

| 状态 | 契约 |
| --- | --- |
| default | 中性文字/边界/背景 |
| hover | 低对比表面变化，不位移、不放大 |
| active/selected | 石墨黑 + 结构性指示，不只靠颜色 |
| focus-visible | 统一石墨焦点环，不被遮挡 |
| disabled | 降对比，禁止 pointer 与键盘 |
| pending | 保留目标名与阶段进度，不只显示 spinner |
| empty | 解释原因并提供下一步入口 |
| error | 保留失败原因、相关目标与重试路径 |

状态变化不得改变控件外框尺寸。

### 薄封装示例

[AppTabs.vue](../../src/shared/ui/AppTabs.vue) 的 script 约 20 行：props 收敛为 `{ modelValue, items, label }`，reka 的 `update:modelValue` 转发为字符串化事件；样式完全由封装内的 scoped CSS 实现（选中下划线、count 徽标、disabled 态），reka 只提供 Tab 键盘导航与 ARIA。

[AppDialog.vue](../../src/shared/ui/AppDialog.vue) 强制 `title + description` 两个 props（对应 DESIGN.md 对话框「有明确标题、目标、后果」的要求）；Escape 关闭的实现方式是 reka `DialogContent` 发出 `escape-key-down` 事件、封装绑定 `close()`。

## 画布与领域的样式约定

- 层级 Token：`--fc-z-overlay`（画布浮层）< `--fc-z-modal`（对话框）；工具栏与底部浮动条固定在画布内（absolute），并 `pointerdown.stop` 阻止事件穿透到画布
- 标尺用 repeating-linear-gradient、网格用 radial-gradient 圆点背景实现，无额外 DOM 开销
- 布局断点：三栏骨架最小工作宽度 1280px，低于此值侧栏整体隐藏（[ViewerShell.vue:404](../../src/features/viewer/ViewerShell.vue)）；转换页 1120px 以下隐藏最近任务栏、760px 以下改纵向堆叠

## 测试策略

### 分层

| 层 | 位置 | 数量 | 覆盖 |
| --- | --- | --- | --- |
| 单元 | `tests/unit/` | 18 文件 | 纯函数（measure/hit-test/development-elements/diagnostics/naming/router-patch）、schema、store、组件（AppTabs/AppPanelResize/对话框流程/工具栏/转换页）、desktop-bridge（BrowserMock 状态机与防泄漏） |
| 集成 | `tests/integration/` | 3 文件 | bundle-repository 全流程（内存假存储）、真实 CLI 产物契约、vue-export 生成→写入往返 |
| e2e | `tests/e2e/` | 5 文件 | Playwright：导入→看稿→选择链路、真实 CLI bundle、滚动区、tooltip |
| POC | `tests/poc/` | 2 文件 | 浏览器 PSD 解析实验 |
| 脚本 | `tests/scripts/` | 5 文件 | 真实 fixture 打包与报告生成 |

Rust 侧测试内嵌于源文件（`#[cfg(test)]`），`cargo check --manifest-path src-tauri/Cargo.toml` 做类型检查；`vue_export.rs` 内含路径校验、防覆盖、追加写入的往返测试。

### 真实 fixture 回归

`npm run test:fixtures`（[run-real-fixtures.mjs](../../tests/scripts/run-real-fixtures.mjs)）在本机重新执行 psd2code CLI pack 生成真实 bundle，验证前端对真实产物的兼容（而非手造 mock），执行结果刷新 `docs/reports/` 下的对接报告。该管线防止前端 schema 假设与上游 CLI 实现漂移。

### 环境与注入约定

- vitest 环境为 jsdom；jsdom 没有 `URL.createObjectURL`，涉及对话框/资源预览的测试需 stub（[vue-export-dialog.spec.ts](../../tests/unit/codegen/vue-export-dialog.spec.ts)）
- 涉及端口的组件测试注入假实现；假实现必须完整实现端口契约（包括冲突失败等负路径）——假实现语义不完整时，测试无法暴露真实实现的问题
- Worker 依赖可注入：`PsdPocController` 支持构造参数 `createWorker`，`BundleRepository` 支持依赖项 `createImporter`，单测传入内存假实现
- `bundle-repository.spec.ts` 通过 `BundleRepositoryDependencies` 注入内存版 index/storage/storageManager，完整跑导入流程不触碰真实浏览器存储

### 验证命令

| 命令 | 内容 |
| --- | --- |
| `npm run typecheck` | vue-tsc 全量类型检查 |
| `npm run test` | vitest 单元 + 集成 |
| `npm run test:e2e` | Playwright e2e |
| `npm run test:fixtures` | 真实 CLI fixture 回归 |
| `npm run test:psd-poc` | PSD 解析 POC |
| `npm run tauri:check` | cargo check |
| `npm run build` | vue-tsc -b && vite build |
| `npm run analyze` | 构建产物体积分析（rollup-plugin-visualizer） |
