# 05 桌面桥接与转换工作台

本篇覆盖 `desktop-bridge`（桌面能力端口与 Tauri IPC 适配）与 `features/conversion`（本机转换任务台），Rust 侧只到命令接口与部署形态层面。

## 桌面能力契约

[types.ts](../../src/desktop-bridge/types.ts) 是桌面能力在 TS 层的完整词汇表，所有跨进程数据结构都在这里定义：

| 端口/类型 | 职责 |
| --- | --- |
| `DesktopJobModule` | 转换任务：`start / cancel / get / listRecent` |
| `DesktopJobEventSource` | 任务事件订阅：`subscribe(listener)` 返回退订函数 |
| `GeneratedBundleReader` | 读取转换产物 zip 为 `File` |
| `ConversionPathChooser` | 系统 PSD 文件 / 输出目录选择框 |
| `DesktopOutputDirectoryOpener` | 用系统文件管理器打开输出目录 |
| `DesktopVueExportProjectWriter` / `DesktopVueExportTargetChooser` | Vue 导出写入目标项目（见 [04](./04-codegen.md)） |
| `DesktopJobEvent` / `DesktopJob` / `StartJobRequest` | 任务事件、任务快照、启动请求的判别联合结构 |
| `DesktopBridgeUnavailableError` | 非桌面环境调用原生能力时抛出 |

端口实现与运行环境的对应关系由组合根决定（[desktop-composition.ts](../../src/app/desktop-composition.ts)）：桌面环境用 `Tauri*` 适配类，浏览器环境用 `BrowserMockAdapter` 或不注入。

## IPC 适配层

[tauri-desktop-bridge.ts](../../src/desktop-bridge/tauri-desktop-bridge.ts) 的调用模式：

```ts
// tauri-desktop-bridge.ts:236
async function invokeNative<T>(command: string, arguments_: Record<string, unknown> = {}): Promise<T> {
  requireTauriRuntime()   // 非桌面环境抛 DesktopBridgeUnavailableError
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, arguments_)
}
```

`@tauri-apps/api` 采用动态 import，Vite 将其拆为独立 chunk，浏览器端运行时不会加载该模块。

### 运行时数据校验

Rust 返回值在适配层逐字段校验后才进入 TS 类型系统。文件内定义了一组守卫（`record / string / integer / boolean / array`），组合成 `parseDesktopJobEvent`、`parseDesktopJob`、`parseRequest` 等解析函数：

```ts
function parseDesktopJobEvent(value: unknown): DesktopJobEvent {
  const raw = record(value, 'event')
  switch (string(raw.type, 'event.type')) {
    case 'stage':
      return { type: 'stage', key: string(raw.key, 'event.key'), ..., current: integer(raw.current, 'event.current'), ... }
    case 'log': {
      const stream = string(raw.stream, 'event.stream')
      if (stream !== 'stdout' && stream !== 'stderr') throw new Error('event.stream 不受支持')
      return { type: 'log', stream, message: string(raw.message, 'event.message') }
    }
    ...
  }
}
```

原因：IPC 是系统边界，Rust 侧协议变更（新增字段、类型改动）若直接 `as` 断言会在运行时产生脏数据；校验失败时抛出的错误信息携带字段路径，定位直接。

### Tauri 命令清单

Rust 侧注册的 9 个命令（[lib.rs:113](../../src-tauri/src/lib.rs)）与前端调用方：

| 命令 | 前端调用方 | 签名 |
| --- | --- | --- |
| `start_job` | `TauriDesktopJobAdapter.start` | `(request: StartJobRequest) → { jobId }` |
| `cancel_job` | `.cancel` | `(jobId) → void` |
| `get_job` | `.get` | `(jobId) → DesktopJob` |
| `list_recent` | `.listRecent` | `() → DesktopJob[]` |
| `read_generated_bundle` | `TauriGeneratedBundleReader.read` | `(jobId) → { name, bytes: number[] }` |
| `open_output_directory` | `TauriOutputDirectoryOpener` | `(jobId) → void` |
| `vue_export_read_text_file` | `TauriVueExportProjectWriter` | `(projectRoot, path) → string \| null` |
| `vue_export_check_existing` | 同上 | `(projectRoot, paths) → string[]` |
| `vue_export_write_files` | 同上 | `(projectRoot, files) → void` |

事件回流走 Tauri event：`listen<unknown>('desktop-job-event', cb)`（[tauri-desktop-bridge.ts:261](../../src/desktop-bridge/tauri-desktop-bridge.ts)），payload 同样经过 `parseDesktopJobEvent` 校验。

`read_generated_bundle` 的字节以 JSON number 数组传输，前端逐字节校验（0–255）后构造 `new File([new Uint8Array(bytes)], name)`（[tauri-desktop-bridge.ts:300](../../src/desktop-bridge/tauri-desktop-bridge.ts)）。

### 字段命名约定

前后端结构体字段统一 camelCase。Rust 侧结构体必须声明 `#[serde(rename_all = "camelCase")]`，否则 serde 静默忽略前端传来的驼峰键、字段变 None。`vue_export.rs` 内嵌测试锁定该约定。

## 转换工作台

### 表单与请求

[ConversionWorkspace.vue](../../src/features/conversion/ConversionWorkspace.vue) 的 `buildRequest`（[ConversionWorkspace.vue:176](../../src/features/conversion/ConversionWorkspace.vue)）做客户端校验并组装 `StartJobRequest`：

| 字段 | 来源 | 校验 |
| --- | --- | --- |
| `sourcePath` / `outputDir` | 输入框或系统选择框 | 非空；sourcePath 以 `.psd/.psb` 结尾 |
| `deliverables` | 预设单选 | `delivery`（看稿交付）或 `['delivery','html']`（完整交付） |
| `bundleCompressed` | 单选 | 压缩包 / 未压缩文件夹 |
| `scales` | 1x/2x 复选 | 至少选一个，升序 |
| `tokenTop` | 数字输入 | 正整数（传给转换器的参数，非用量额度） |
| `cssStyle` / `cssPrettyEnabled` | 下拉/复选 | compact·expanded / 开关 |
| `smartMergeEnabled` / `imageLayerFlattenEnabled` / `nestedSuppressionEnabled` | 复选 | 转换器处理选项 |

`taskId` 由前端生成（`crypto.randomUUID()`）。

### 任务状态机与事件

`DesktopJobEvent` 判别联合（[types.ts:34](../../src/desktop-bridge/types.ts)）：

| type | 携带 | UI 表现 |
| --- | --- | --- |
| `started` | taskId、total、sourceName | 任务进入 running |
| `stage` | key、label、current、total | 阶段名 + 进度条 |
| `log` | stream（stdout/stderr）、message | 日志列表（经脱敏与截断） |
| `warning` | code、message | 红色日志行 |
| `artifact` | artifactId、kind、label | 产物登记 |
| `completed` | taskId、outputDir、artifacts | 成功态 + 后续动作 |
| `failed` | taskId、code、message、stage | 失败态 + code 展示 |
| `cancelled` | taskId | 取消态 |

### 轮询状态刷新

转换 UI 通过轮询刷新任务状态（[ConversionWorkspace.vue:228](../../src/features/conversion/ConversionWorkspace.vue)）：

- 任务处于 queued/running 时每 700ms 调 `jobModule.get(jobId)` 拉取快照并渲染阶段、日志与状态
- `pollInFlight` 标志防止上一轮请求未返回时重入；任务进入终态后停止轮询
- `jobModule` prop 变化时（如运行环境切换）重置全部任务状态

`DesktopJobEventSource` 端口与 Rust 侧的 Tauri event 广播（`desktop-job-event`）已就位（[tauri-desktop-bridge.ts:261](../../src/desktop-bridge/tauri-desktop-bridge.ts) 提供 `subscribe`），当前转换 UI 消费的是轮询快照这条通道。

### 日志脱敏

日志与警告消息经 `redactPath`（[ConversionWorkspace.vue:139](../../src/features/conversion/ConversionWorkspace.vue)）：

```ts
value.replace(/[A-Za-z]:[\\/][^\s'"`]+/g, '[路径已隐藏]')
```

Windows 盘符路径在界面上不展示原文，每条日志截断到 500 字符，日志列表只保留最近 120 条。

### 产物接回看稿

任务 `succeeded` 且登记了 `kind === 'bundle'` 的产物时，组件 emit `generatedBundle`，[ConversionPage.vue:17](../../src/pages/ConversionPage.vue) 的 `openGeneratedBundle` 调用 `bundleStore.importGenerated(jobId)`：

1. `BundleRepository.createGeneratedImportTask` 经 `GeneratedBundleReader` 读取产物 zip 为 File
2. 复用标准导入管线（校验 → staging → 提交 → 索引）
3. 导入状态（opening/opened/failed + 错误码）回传到转换页展示，失败可重试
4. 成功后 `router.push('/')` 跳回看稿

## Rust 侧结构（接口层）

| 文件 | 职责 |
| --- | --- |
| [lib.rs](../../src-tauri/src/lib.rs) | 命令注册、JobManager 状态注入、跨平台打开文件管理器 |
| [jobs.rs](../../src-tauri/src/jobs.rs) | `JobManager`：内存任务表（Mutex HashMap）、请求校验（`validate_start_request`）、状态迁移、事件构造与广播、产物读取 |
| [runner.rs](../../src-tauri/src/runner.rs) | runner 子进程管理：参数序列化、进程拉取、stdout/stderr 逐行解析 |
| [vue_export.rs](../../src-tauri/src/vue_export.rs) | Vue 导出写入命令（接口见 [04](./04-codegen.md)） |

任务执行流程（`execute_job`，[jobs.rs:608](../../src-tauri/src/jobs.rs)）：

1. `prepare_request_file` 把请求序列化写入 staging 目录的 `request.json`（参数走文件而非命令行参数）
2. `spawn_runner` 启动子进程：`<runner> --request request.json`，`kill_on_drop(true)` 保证句柄释放时进程终止
3. stdout 逐行解析（[runner.rs:149](../../src-tauri/src/runner.rs)）：`{` 开头的行按 `RunnerEvent` 反序列化（`deny_unknown_fields`），解析失败计为 InvalidEvent；其余行经 `sanitize_log`（控制字符替换、4096 字符上限）作为 log 事件
4. 事件经 `emit_event` 以 Tauri event 推送到前端
5. 取消：CancellationToken 触发 + `child.start_kill()`

## runner 部署形态

[runner.rs:199](../../src-tauri/src/runner.rs) 的 `RunnerConfig::from_app` 区分两种构建：

| 构建 | runner 来源 |
| --- | --- |
| debug（`tauri dev`） | 环境变量 `FRAMECHECK_DEV_RUNNER` 指向的可执行文件（必须绝对路径） |
| release（`tauri build`） | 应用资源目录 `psd2code-runtime/psd2code-runner.exe` |

runner 找不到时任务进入 `failed`（code `runner-not-found`），前端照常收到失败事件。

## BrowserMockAdapter

[browser-mock-bridge.ts](../../src/desktop-bridge/browser-mock-bridge.ts) 在浏览器环境实现 `DesktopJobModule + DesktopJobEventSource + GeneratedBundleReader`：

- 内存 `Map<jobId, DesktopJob>` 任务表，`emit` 驱动与桌面端相同的事件状态机（started→running、completed→succeeded、failed、cancelled），事件与状态迁移规则和 Rust 侧对齐
- `subscribe` 返回真实的监听器集合；浏览器页面上「开始转换」按钮因 `canStart = isDesktop` 被禁用（[ConversionPage.vue:61](../../src/pages/ConversionPage.vue)），该实现服务于组件测试与演示场景
- 非压缩 bundle、未完成任务等边界与桌面端同样报错

桌面端契约的语义因此有一套可离线验证的参照实现；单元测试 [desktop-bridge.spec.ts](../../tests/unit/desktop-bridge.spec.ts) 覆盖 BrowserMock 的事件状态机、Bundle 读取边界，以及浏览器环境不触发 `invoke` 的防泄漏断言。
