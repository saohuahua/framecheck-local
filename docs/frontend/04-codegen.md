# 04 Vue 静态代码导出

本篇覆盖 `features/codegen`：从当前 bundle 的设计事实生成 h5-template 风格的 Vue 静态页，预览确认后写入目标项目。

## 功能链路

```
看稿工具栏「Vue」按钮（桌面端且已打开本地 Bundle 时可用）
  ▼
VueExportDialog
  ├─ 加载设计事实：VueExportBundleAccess.loadFacts() → bundleRepository.open()
  ├─ 读取目标项目路由源码：writer.readTextFile(projectRoot, 'src/router/index.ts')
  ├─ generateVuePage(request) ← 纯函数，产出文件内容与预览模型
  ├─ 平台内预览：VueExportPreviewCanvas（与 SFC 同源渲染，透明度可调叠加 reference）
  ├─ 选择项目根：chooser.chooseProjectRoot()（系统目录选择框）
  ├─ 冲突检查：writer.filterExisting() → 已存在文件清单展示，用户确认
  └─ 写入：writer.writeFiles()（Rust 侧强制防覆盖）
```

对话框按步骤展示进度（[VueExportDialog.vue:198](../../src/features/codegen/VueExportDialog.vue)、[:296](../../src/features/codegen/VueExportDialog.vue)）：

- 生成阶段 4 步：加载设计事实 → 读取目标项目路由 → 生成页面代码 → 检查写入冲突
- 写入阶段 3 步：复检目标文件 → 读取切图字节 → 写入项目文件

写入前的冲突复检覆盖「预览到写入之间目标项目发生变化」的情况；路由追加块也在写入时基于最新源码重新构建（[VueExportDialog.vue:317](../../src/features/codegen/VueExportDialog.vue)）。

## 生成器：纯函数

[vue-page-generator.ts](../../src/features/codegen/vue-page-generator.ts) 的 `generateVuePage` 输入输出：

```
输入 VueExportRequest
  ├─ design: DesignSnapshot        ← bundle 校验产物，不二次解析
  ├─ assets: AssetManifest
  ├─ routerSource?: string         ← 目标项目现有路由源码
  └─ options: { pageName }
输出 VueExportResult
  ├─ view: { path, content }       ← src/views/<pageName>/index.vue 的完整 SFC 文本
  ├─ router: appended | skipped    ← 路由补丁（追加块文本）或放弃原因
  ├─ preview: VueExportPreviewModel
  └─ report: 统计 + 未还原清单 + warnings
```

生成器只产出内存中的字符串与路径映射，不接触文件系统。预览、写入、单元测试共用这一个函数；`pageName` 经 `toKebabClassName` 归一，同时决定页面目录、路由 path/name、组件名三处命名。

## 还原规则

下文 placement 指 assets.json 中一条资产在画布上的摆放记录（定位 frame + lineageId，见 [01](./01-overview.md)）。

`collectNode`（[vue-page-generator.ts:100](../../src/features/codegen/vue-page-generator.ts)）按 `order` 升序（自下而上 = DOM 顺序）递归处理图层树：

| 图层形态 | 产出 |
| --- | --- |
| 有 placement 记录（标记导出的图层） | `<img>` 绝对定位到 placement.frame；后代已烘焙进切图，不再展开 |
| 命名命中可点击正则的切图 | `<button>` 包 `<img>`，script 生成 TODO 占位处理函数 |
| 未标记的文本层（内容非空） | `<p>` 真实文字，样式来自 `text.style` |
| 未标记的可见图层 | 不进页面；登记进「未还原清单」，写入 SFC 头部注释供人工对账 |
| 整组无任何产出 | 子级清单条目回退，只登记组本身 |
| 零尺寸结构层（调整层等） | 静默跳过 |

规则要点：

- placement.frame 是 tight 裁剪后的定位矩形，缺失时回退 `logicalBounds` 再回退节点 bounds
- 同一资产被多个图层引用时共用一个文件（文件名按资产去重），类名按图层去重
- 生成前检查（`collectPreflightWarnings`）：设计宽 ≠750 或横屏/方形时输出 warnings，展示在对话框中
- placement 引用了不存在的资产/图层时记 warning 并按未标记图层兜底处理

## 目标项目约定（profile）

[profile.ts](../../src/features/codegen/profile.ts) 把 h5-template 模板的约定收敛为一个常量对象：

```ts
export const h5TemplateProfile = {
  id: 'h5-template',
  imageTargetDirectory: 'public/static/images',
  imageUrlPrefix: '/static/images',
  viewDirectory: 'src/views',
  routerFilePath: 'src/router/index.ts',
  designViewportWidth: 750,
  clickableNamePattern: /(?:entrance|btn|button|按钮|mute|info|close|share|download|link|arrow)/i,
  fontFallbackStack: '"PingFang SC", "Microsoft YaHei", sans-serif',
} as const
```

- 画布固定 750 设计宽，元素绝对定位写 px；适配交给目标项目的 postcss-mobile-forever（viewportWidth: 750）在构建期完成，生成器不做响应式
- 页面标签不添加 aria / alt 属性（模板 AGENTS.md 约定，SFC 头部注释中重复声明）
- PSD 字体（如 FZY4K--GBK1）通常不随页面分发：font-family 保留设计稿原名后接降级栈

## SFC 渲染

`renderVueSfc` 按四段拼接（[vue-page-generator.ts:330](../../src/features/codegen/vue-page-generator.ts)）：

| 段 | 内容 |
| --- | --- |
| 头部注释 | 来源设计稿与画布尺寸、还原统计（img/文字/button 数）、未还原清单逐条列出（path + bounds）、模板约定 |
| template | `<main class="<pageName>">` 内平铺元素；每个元素前有 `<!-- 图层路径 -->` 注释 |
| script | `defineOptions({ name: "<pageName>-view" })`；可点击图层生成 TODO 处理函数 |
| style | scoped less；页面根规则（`width: <canvasWidth>px; height: max(<canvasHeight>, 100vh); margin: 0 auto; overflow: hidden`）+ 每元素一条绝对定位规则 |

实现细节：

- **`</script>` 拆分写**（[vue-page-generator.ts:426](../../src/features/codegen/vue-page-generator.ts)）：生成器自身是 TS 源码，输出字符串里的结束标签写成 `'</' + 'script>'`，避免本文件被 SFC/HTML 解析器截断
- **文本转义**（`escapeHtml`）：`&`、`<`、`>` 三字符，防止设计稿文案注入模板
- **数值格式化**（`formatNumber`）：四舍五入到两位小数去尾零，清理 PSD 浮点噪声；px 值统一 `formatPx` 保留单位
- **文本样式归一**（`textStyleOf`，[vue-page-generator.ts:304](../../src/features/codegen/vue-page-generator.ts)）：SFC 与预览共用同一函数；行高优先 PSD 行距（leading），缺失时用文本框高度（单行文本恰好贴合）

button 占位的样式与 shoot-h5 的按钮写法一致：去默认样式（padding/border/background）+ img 铺满。

## 命名系统

[naming.ts](../../src/features/codegen/naming.ts)：

| 函数 | 输入 → 输出 | 规则 |
| --- | --- | --- |
| `slugifyLayerName` | `Entrance BiliBili` → `Entrance-BiliBili` | 不安全字符压成连字符，保留大小写与 CJK |
| `toKebabClassName` | `BG1_Bg` → `bg1-bg` | `_` 视为分隔符，ASCII 转小写 |
| `toPascalComponentName` | `shooting-home` → `ShootingHome` | 按连字符/下划线/空格分段取首字母大写 |

`NameDeduplicator` 处理 PSD 同名图层：首次出现用原名，之后追加 `-2`、`-3`。文件名与类名各用一个独立实例。

## 路由追加

[router-patch.ts](../../src/features/codegen/router-patch.ts) 的 `buildRouterAppend` 生成「末尾追加」式路由注册块：

```ts
// ---- framecheck 追加：<pageName> 静态页路由（如需整理可移入上方 routes） ----
import <PascalName> from "@/views/<pageName>/index.vue";

router.addRoute({
  path: "/<pageName>",
  name: "<pageName>",
  component: <PascalName>
});
```

采用追加而非改写的原因：

1. import 声明有提升机制，写在文件末尾合法
2. `router.addRoute` 运行时注册，不需要读-改-写整个文件
3. 写入方基于最新源码重新构建追加块，预览后目标文件被修改不会导致错位（TOCTOU 免疫）

放弃追加（返回 `skipped`）的条件与文案：

| 条件 | reason |
| --- | --- |
| 路由文件不存在 | 请手工注册路由 |
| `path: "/xxx"` 字面量已存在 | 路由 path 已存在（含历史追加块） |
| `name: "xxx"` 字面量已存在 | 路由 name 已存在 |
| 组件 import 路径已出现 | 疑似重复导出 |
| 匹配不到 `const <var> = createRouter(` | 无法识别 router 实例 |

## 预览模型

`VueExportPreviewModel`（[types.ts:103](../../src/features/codegen/types.ts)）是页面渲染结果的结构化描述：画布尺寸 + 自下而上的元素序列。图片元素带 bundle 内切图源路径（预览方经 `VueExportBundleAccess.readAssetBytes` 读字节转 object URL），文本元素带与 SFC 相同规则归一后的样式。

[VueExportPreviewCanvas.vue](../../src/features/codegen/VueExportPreviewCanvas.vue) 按容器宽度等比缩放渲染该模型（`scale = min(1, 容器宽 / 画布宽)`），支持叠加 reference.png 对比并调节透明度——预览与 SFC 出自同一份元素序列，保证所见即所得。

## 目标项目写入

### 端口定义

[vue-export-port.ts](../../src/features/codegen/vue-export-port.ts) 定义两个接口：

```ts
interface VueExportProjectWriter {
  readTextFile(projectRoot: string, path: string): Promise<string | null>
  filterExisting(projectRoot: string, paths: string[]): Promise<string[]>
  writeFiles(projectRoot: string, files: VueExportWriteFile[]): Promise<void>
}
interface VueExportTargetChooser {
  chooseProjectRoot(): Promise<string | undefined>
}
```

`VueExportWriteFile` 的内容字段三选一：

| 字段 | 语义 |
| --- | --- |
| `text` | 新建文本文件（目标必须不存在） |
| `base64` | 新建二进制文件（切图字节经 base64 传输） |
| `appendText` | 追加到既有文件末尾（仅路由补丁使用；文件不存在按新建） |

安全约定：只新增文件、绝不覆盖；`writeFiles` 写入前整体校验，任一路径已存在则整体失败、一个文件都不落。

### 数据来源注入

[ViewerShell.vue:124](../../src/features/viewer/ViewerShell.vue) 构造 `VueExportBundleAccess` 注入对话框：`loadFacts` 从当前打开的 bundle 读取校验产物，`readAssetBytes` 按 sourcePath 从 OPFS 读切图字节。对话框不直接依赖存储层，测试注入内存假实现。

### Rust 写入命令（接口层）

三个 Tauri 命令（[vue_export.rs](../../src-tauri/src/vue_export.rs)，前端视角只关心契约）：

| 命令 | 签名 | 行为 |
| --- | --- | --- |
| `vue_export_read_text_file` | `(projectRoot, path) → string \| null` | 读目标项目内文本文件；不存在返回 null |
| `vue_export_check_existing` | `(projectRoot, paths) → string[]` | 返回其中已存在的路径 |
| `vue_export_write_files` | `(projectRoot, files[]) → void` | 先全量校验再写盘 |

Rust 侧强制的安全规则（[vue_export.rs:26](../../src-tauri/src/vue_export.rs) `resolve_project_path`）：

- 拒绝空项目根、空路径、含 `:`（盘符）、绝对路径、`..` 段、空段（`a//b`、尾部斜杠）
- 新建文件目标已存在 → `file-exists` 错误，整体失败
- 内容字段必须三选一，否则 `invalid-file`
- 自动创建所需目录；append 模式用 `OpenOptions::append`，不改动既有字节

IPC 结构体声明 `#[serde(rename_all = "camelCase")]`（[vue_export.rs:73](../../src-tauri/src/vue_export.rs)）：前端字段 `appendText` 对应 Rust `append_text`；缺该声明时 serde 静默忽略未知键、字段变 None（该模块内嵌回归测试锁定）。

## 测试要点

[vue-page-generator.spec.ts](../../tests/unit/codegen/vue-page-generator.spec.ts) 直接断言生成文本；[vue-export-dialog.spec.ts](../../tests/unit/codegen/vue-export-dialog.spec.ts) 用假端口跑完整对话框流程（jsdom 无 `URL.createObjectURL`，需 stub）；[integration/vue-export.spec.ts](../../tests/integration/vue-export.spec.ts) 做生成→写入往返。假 writer 必须忠实实现端口全部语义（含冲突失败），否则测不出真实问题。
