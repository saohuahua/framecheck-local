# 01 总览：技术栈、分层与组合根

## 产品边界

Framecheck Local 的能力范围由 [PRODUCT.md](../../PRODUCT.md) 冻结：

- 输入是 `.psd-bundle.zip`，不解析原始 PSD/PSB（浏览器直解 PSD 是独立实验线，见文末）
- 纯本地运行，不接后端、账号、云端项目、分享、评论、协作
- 原始 PSD 不缓存，只缓存 bundle 工件
- 未标记导出的图层不生成资源，只如实提示
- 不修改 bundle 内的任何 JSON；CSS 投影等派生视图不写回数据源

这些边界直接决定了架构形态：数据是不可变契约、界面是只读投影、所有原生能力显式端口化。

## 数据契约总览

bundle 内 5 个必需工件（[types.ts](../../src/features/bundle/types.ts) `requiredArtifactPaths`）：

| 工件 | 内容 | 前端消费方 |
| --- | --- | --- |
| `bundle.json` | 交付包清单：schemaVersion、源 PSD 名称与 SHA-256、stats、工件路径 | 导入校验、缓存命中键 |
| `design.json` | 设计事实：扁平节点数组（parentId 关联，含几何、文本、标记与导出意图）、画布尺寸、rootIds | 图层树、画布、检查面板、Vue 导出 |
| `reference.png` | 整稿渲染图 | 画布底图 |
| `assets.json` | 资产清单：`assets`（切图资产条目）、`placements`（摆放记录：一条资产在画布上的定位 frame 与 lineageId）、`lineage`（烘焙血缘：多图层合成一张切图时的输入节点）、`stats` | 切图 Tab、画布标定、Vue 导出 |
| `diagnostics.json` | design 与 assets 两类诊断条目 | 诊断 Tab、状态推导 |

`assets/` 目录存放切图文件，路径由 `assets.json` 声明。

assets.json 的内容由 PSD 图层名的标记约定决定（repo [README](../../README.md)）：`-h-/-m-/-e-` 紧贴可见像素导出、`-s-` 固定尺寸导出、`-slice-` 固定尺寸的切图边界辅助层、`-x-` 从事实与导出中排除。psd2code 按标记产出 placements，未标记图层不导出资源。

## 技术栈与选型

| 层 | 选型 | 选型依据 |
| --- | --- | --- |
| UI 框架 | Vue 3.5 Composition API + `<script setup>` | 团队生态；`shallowRef` 可控制大数据 session 的响应化成本 |
| 语言 | TypeScript ~6.0，`vue-tsc` 严格校验 | 端口与契约全部用类型表达 |
| 构建 | Vite 8 | 原生 ESM Worker（`new Worker(new URL(...), { type: 'module' })`） |
| 状态 | Pinia 4，setup store 写法 | 全项目仅 2 个 store（viewer、bundle），按需使用 |
| 路由 | vue-router 5，hash 模式 | 静态打包与桌面 webview 均无需服务端配合 |
| 数据校验 | zod 4 | bundle JSON 是外部进程产出，必须在边界做运行时校验 |
| 压缩包 | @zip.js/zip.js | strict 校验、CRC32、AbortSignal、流式写入 OPFS |
| 本地存储 | OPFS（原生 API）+ Dexie 4（IndexedDB） | 字节工件与索引分离，见 [02](./02-data-pipeline.md) |
| 无样式原语 | reka-ui 2（仅经 `src/shared/ui` 封装使用） | 可访问性复用现成实现，视觉与领域行为自建 |
| 桌面壳 | Tauri 2 + Rust/tokio | 前端团队可维护的 IPC 层；文件写入安全由 Rust 强制 |
| 测试 | vitest 5 + @vue/test-utils + jsdom + Playwright | 分层见 [06](./06-design-system.md) |

`ag-psd` 仅作为 devDependency，用于 psd-poc 实验线（[psd-parser.worker.ts](../../src/features/psd-poc/psd-parser.worker.ts)），不进入主链路。

**未引入的依赖**（[DESIGN.md](../../DESIGN.md) 负面清单）：带样式组件库（Element Plus 等）、Tailwind/UnoCSS、第二套 headless 原语、通用画布编辑器、缩放库。三栏布局、画布 transform、测量交互全部项目自建，原因是它们承载领域语义（设计坐标、PSD 层叠序、标注规则），通用库不覆盖。

## 分层架构

依赖规则：

1. pages 只做组装，不写领域逻辑
2. feature 之间只通过显式 import 的函数与类型交互，不允许反向依赖
3. 运行时环境判断（`isTauriRuntime()`）只在组合根调用，feature 层不感知 Tauri
4. bundle JSON 的结构细节只被 `features/bundle/schema.ts` 认识，其余模块消费 zod 校验后的推断类型

```
main.ts
  └─ App.vue
      └─ router ─┬─ WorkspacePage ── ViewerShell（看稿工作台）
                 │     ├─ 组合根注入 vueExport 端口
                 │     └─ ConversionPage 跳转入口
                 └─ ConversionPage ── ConversionWorkspace
                       ├─ 组合根注入 jobModule / pathChooser / outputDirectoryOpener
                       └─ 转换成功 → bundleStore.importGenerated → 跳回看稿
```

## 目录导览

```
src/
├── main.ts / App.vue              # 入口：createApp + pinia + router + 三份全局样式
├── app/
│   ├── router.ts                  # hash 路由，2 个页面
│   ├── pinia.ts
│   └── desktop-composition.ts     # 组合根：环境识别 + 端口注入（见下节）
├── desktop-bridge/
│   ├── types.ts                   # 桌面能力契约：全部 IPC 词汇
│   ├── tauri-desktop-bridge.ts    # Tauri IPC 适配 + 运行时逐字段校验
│   └── browser-mock-bridge.ts     # 浏览器 Mock（re-export）
├── features/
│   ├── bundle/                    # 契约层：schema / archive-validation / repository / adapter
│   ├── importer/                  # Worker 解压管线：engine（主线程）+ worker + protocol
│   ├── storage/                   # opfs-bundle-store / indexeddb-index / storage-manager
│   ├── viewer/                    # 三栏看稿：CanvasStage / ViewerShell / InspectorPanel / ...
│   ├── workspace/                 # bundle-store（Pinia）+ bundle-session（会话数据）
│   ├── codegen/                   # Vue 导出：生成器纯函数 + profile + 端口 + 对话框
│   ├── conversion/                # 转换工作台：表单 + 任务事件渲染
│   └── psd-poc/                   # 浏览器直解 PSD 实验线（独立于主链路）
├── pages/                         # 页面壳，只传端口
└── shared/ui/                     # App* 组件：reka-ui 之上的薄封装

src-tauri/src/
├── lib.rs                         # 9 个 Tauri command 注册
├── jobs.rs                        # JobManager：转换任务生命周期 + 事件广播
├── runner.rs                      # psd2code runner 子进程 + JSON-lines 协议
├── vue_export.rs                  # 目标项目写入命令（路径校验、防覆盖）
└── artifacts.rs
```

## 组合根机制

[desktop-composition.ts](../../src/app/desktop-composition.ts) 在首次调用 `getDesktopComposition()` 时构建组合对象并缓存：

```ts
// desktop-composition.ts:38-47
const isDesktop = isTauriRuntime()
const browserMock = new BrowserMockAdapter()
const jobModule = isDesktop ? new TauriDesktopJobAdapter() : browserMock
const generatedBundleReader = isDesktop ? new TauriGeneratedBundleReader() : browserMock
const pathChooser = isDesktop ? new TauriConversionPathChooser() : undefined
const outputDirectoryOpener = isDesktop ? new TauriOutputDirectoryOpener() : undefined
// 写入目标项目是桌面端独有能力（浏览器端按钮置灰，与转换页同模式）
const vueExport = isDesktop
  ? { writer: new TauriVueExportProjectWriter(), chooser: new TauriVueExportTargetChooser() }
  : undefined
```

- `isTauriRuntime()` 检查 `window.__TAURI_INTERNALS__`（[tauri-desktop-bridge.ts:226](../../src/desktop-bridge/tauri-desktop-bridge.ts)）
- 「端口」指浏览器不具备的原生能力在 TS 层定义的接口（转换任务、文件/目录选择、读取生成 bundle、写入目标项目等）；桌面端由 Tauri IPC 适配类实现，浏览器端注入 Mock 或不注入（对应控件禁用），全部契约见 [05](./05-desktop-bridge.md)
- 浏览器端 `pathChooser` / `vueExport` 为 `undefined`，消费方据此禁用对应控件并给出原因文案（如 [WorkspaceToolbar.vue:38](../../src/features/viewer/WorkspaceToolbar.vue) 的 `vueExportTooltip`）
- `setGeneratedBundleReader()` 把桌面 bundle 读取器注入 bundle 仓储，转换产物接回看稿复用同一条导入管线

## 三条主数据流

**导入**：File → Worker 校验解压 → OPFS staging → 提交 → IndexedDB 索引 → adapter 投影 → 看稿会话。详述见 [02](./02-data-pipeline.md)。

**转换**（桌面端）：表单组装 `StartJobRequest` → Tauri invoke → Rust JobManager 派生 runner 子进程 → 解析 runner 事件并广播 Tauri event → 转换页轮询任务快照渲染阶段与日志 → 产物 zip 经 `read_generated_bundle` 走导入管线 → 自动跳回看稿。详述见 [05](./05-desktop-bridge.md)。

**Vue 导出**（桌面端）：当前 bundle 设计事实 → 纯函数生成器产出 SFC + 路由补丁 + 预览模型 → 平台内预览确认 → 端口写入目标项目（Rust 侧强制防覆盖）。详述见 [04](./04-codegen.md)。

## psd-poc 实验线

[features/psd-poc](../../src/features/psd-poc/psd-poc-controller.ts) 是「浏览器直接解析 PSD」的独立技术验证线，不依赖 bundle 契约：

- 预检（[psd-preflight.ts](../../src/features/psd-poc/psd-preflight.ts)）：仅接受 `.psd`；读取文件头 26 字节校验签名/版本/色彩模式/位深；限额为文件 ≤256MB、画布 ≤2400 万像素、估算内存 ≤512MB、图层数 ≤1500、任务 ≤45 秒
- 解析在 [psd-parser.worker.ts](../../src/features/psd-parser.worker.ts) 内用 ag-psd 完成，主线程控制器（`PsdPocController`）管理超时、取消与报告
- 与主链路完全隔离：不写 OPFS、不产生 bundle、不进入看稿

## 验证命令

```powershell
npm run typecheck     # vue-tsc --noEmit
npm run test          # vitest run
npm run test:e2e      # playwright
npm run test:fixtures # 本机重跑 CLI pack 出真实 fixture 做回归
npm run build         # vue-tsc -b && vite build
npm run tauri:check   # cargo check
```
