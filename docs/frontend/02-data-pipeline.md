# 02 数据管线：契约校验、导入与本地存储

本篇覆盖 bundle 从压缩包到看稿会话的完整数据流，涉及四个模块：`features/bundle`（契约层）、`features/importer`（Worker 管线）、`features/storage`（OPFS + IndexedDB）、`features/bundle/bundle-adapter`（视图投影）。

## 全流程

```
File（.psd-bundle.zip）
 │ prepare（Worker 内）
 │   ├─ ZIP 严格模式打开，条目元数据校验（路径/限额/白名单）
 │   ├─ 4 份 JSON 提取 + zod 校验 + 跨文件一致性校验
 │   └─ assets.json 引用的每个资源路径必须存在于 zip
 │ ▼ PortableBundleSummary
 │ 缓存命中（sourceSha256 + schemaVersion）──命中→ 自愈检查后直接打开
 │ ▼
 │ ensureAvailable(storageBytes × 2)          ← 配额预检
 │ ▼ extract（Worker 内）：逐条目流式写入 OPFS staging/<jobId>/
 │ ▼ commitStaging：staging → bundles/<localBundleId>/，删 staging
 │ ▼ IndexedDB put(record)；put 失败则回滚删除 OPFS
 ▼ LocalBundleRecord
     │ bundleRepository.open()：重读 4 份 JSON 再校验 + reference File
     ▼ toLocalViewerPayload()：投影为看稿会话数据
```

解压目标是 OPFS 的 `staging/<jobId>/` 中转目录：校验与解压全部完成、提交后才转入正式存储 `bundles/<localBundleId>/`。

实现分布在 [bundle-repository.ts:298](../../src/features/bundle/bundle-repository.ts)（编排）、[bundle-import.worker.ts](../../src/features/importer/bundle-import.worker.ts)（校验与解压）、[opfs-bundle-store.ts](../../src/features/storage/opfs-bundle-store.ts)（字节存储）。

## 契约校验（zod）

[schema.ts](../../src/features/bundle/schema.ts) 对 4 份 JSON 各定义一个 zod schema，策略分两档：

- 结构核心字段用 `strict()`：多出的字段即校验失败（如 `bundle.json`）
- 上游保留字段用 `passthrough()`：`design.json` 节点的 `effects/masks/fills/geometry` 等字段按产品约定「保留原始事实、不解读、不补假数据」，schema 允许其存在但不建模

跨文件一致性校验（[schema.ts:198](../../src/features/bundle/schema.ts)）：

```ts
if (design.data.source.sha256 !== bundle.data.source.sha256
  || assets.data.source.sha256 !== bundle.data.source.sha256) {
  throw new BundleError('invalid-reference', '设计事实与资源清单的来源哈希不一致')
}
if (design.data.reference !== bundle.data.artifacts.reference) { ... }
if (diagnostics.data.schemaVersion !== bundle.data.schemaVersion) { ... }
```

三份 JSON 必须来自同一个 PSD（SHA-256 对齐），schema 版本必须一致。校验通过后返回 `ValidatedPortableBundle`，后续模块消费的是已验证类型。

bundle 的 ready / partial 状态由数据推导（[archive-validation.ts:121](../../src/features/bundle/archive-validation.ts)）：`exported < marked`（有标记图层未成功导出）或存在 error 级诊断时为 `partial`，UI 全程区分显示。

## ZIP 安全校验

[archive-validation.ts](../../src/features/bundle/archive-validation.ts) 在解压前校验条目元数据：

| 限制 | 值 | 常量 |
| --- | --- | --- |
| 压缩包大小 | ≤ 512 MB | `maxArchiveBytes` |
| 单条目解压大小 | ≤ 256 MB | `maxEntryBytes` |
| 解压总量 | ≤ 512 MB | `maxUncompressedBytes` |
| 条目数 | ≤ 10,000 | `maxEntries` |

路径规则（`assertSafeArchivePath`，[archive-validation.ts:26](../../src/features/bundle/archive-validation.ts)）：拒绝空路径、反斜杠、`\0`、以 `/` 开头、盘符（`/^[A-Za-z]:/`）、`.`/`..` 段。条目白名单：5 个必需工件 + `assets/` 前缀 + 唯一允许的目录 `assets`；symlink 与加密条目直接拒绝。`validateAssetReferences` 进一步要求 assets.json 声明的每个资源路径都以 `assets/` 开头且真实存在于压缩包。

## Worker 管线

### 协议

[import-protocol.ts](../../src/features/importer/import-protocol.ts) 用判别联合定义消息：

| 方向 | type | 语义 |
| --- | --- | --- |
| 主线程 → Worker | `prepare` | 携带 File，执行校验阶段 |
| 主线程 → Worker | `extract` | 携带 stagingPrefix，执行解压阶段 |
| 主线程 → Worker | `cancel` | 中止指定 jobId |
| Worker → 主线程 | `progress` | stage（checking/validating/extracting）+ 计数 |
| Worker → 主线程 | `validated` | 携带 summary |
| Worker → 主线程 | `extracted` / `cancelled` / `failed` | 终态 |

`prepare` 与 `extract` 拆成两段而非一次完成，因为两者之间要执行缓存命中查询，这个决策留在主线程。

### 主线程引擎

[bundle-import-engine.ts](../../src/features/importer/bundle-import-engine.ts) 的每个实例持有一个专用 Worker（导入任务结束由 `terminate()` 回收），用 `Map<jobId, handler>` 关联请求与响应。`prepare()` 返回的 Promise 在收到 `validated` 时 resolve，收到 `cancelled` 时以 `BundleError('cancelled')` reject。

### 取消语义

- Worker 内每个 job 持有 `AbortController`，cancel 消息触发 `controller.abort()`
- zip.js 的 `getData()` 接收 `signal`，正在解压的条目随即中断（抛 `AbortError`，归一为 `cancelled` 错误码）
- 已排队未开始的 job 通过 `cancelledJobs` 集合在入口短路

### 解压与写入

`extractArchive`（[bundle-import.worker.ts:155](../../src/features/importer/bundle-import.worker.ts)）逐条目流式写入 OPFS：

```ts
const writable = await opfsBundleStore.createWritable(stagingPrefix, path)
try {
  await asFileEntry(entry).getData(writable, { checkCrc32: true, signal: controller.signal })
} catch (error) {
  await writable.abort()
  throw error
}
```

zip.js 配置 `useWebWorkers: false`（[bundle-import.worker.ts:13](../../src/features/importer/bundle-import.worker.ts)），解压已运行在导入 Worker 内；`strictness: 'strict'` + `checkCrc32` 保证解压完整性；字节流直接从 Blob 流入 OPFS writable，不整包载入内存。任一条目失败时整体删除 staging 目录。

## OPFS 存储

[opfs-bundle-store.ts](../../src/features/storage/opfs-bundle-store.ts) 封装 `navigator.storage.getDirectory()` 的目录操作。

路径入口 `pathSegments`（[opfs-bundle-store.ts:1](../../src/features/storage/opfs-bundle-store.ts)）是存储侧的路径白名单：拒绝空段、`\0`、`\`、绝对路径、盘符、`.`/`..` 段，与 ZIP 侧校验形成两层防线。

关键方法 `commitStaging`（[opfs-bundle-store.ts:103](../../src/features/storage/opfs-bundle-store.ts)）实现两阶段提交语义：

```ts
async commitStaging(stagingPrefix: string, storagePrefix: string): Promise<void> {
  const staging = await directoryAt(root, pathSegments(stagingPrefix), false)
  await this.deletePrefix(storagePrefix)          // 先清目标
  try {
    const destination = await directoryAt(root, pathSegments(storagePrefix), true)
    await copyDirectory(staging, destination)     // 递归复制
    await this.deletePrefix(stagingPrefix)        // 提交后删 staging
  } catch (error) {
    await this.deletePrefix(storagePrefix)        // 失败回滚：目标与 staging 全删
    await this.deletePrefix(stagingPrefix)
    throw error
  }
}
```

OPFS 句柄没有跨目录移动 API，所以用复制实现；代价是一次数据拷贝，换来「staging 完整才覆盖目标」的原子语义。

## IndexedDB 索引

[indexeddb-index.ts](../../src/features/storage/indexeddb-index.ts) 用 Dexie 管理 `LocalBundleRecord`：

```
bundles: 'localBundleId, [sourceSha256+portableSchemaVersion], importedAt, lastOpenedAt, status'
```

| 用途 | 索引 |
| --- | --- |
| 缓存命中查询 | 复合索引 `[sourceSha256+portableSchemaVersion]` |
| 文件列表排序 | `lastOpenedAt`（`orderBy().reverse()`） |
| 单条读取/删除/更新 | 主键 `localBundleId` |

记录中持久化 UI 偏好（`preferences`：lastScale、leftTab、rightTab、lastSelectedLayerId），写入侧见 [03](./03-viewer.md) 的防抖保存。

### 缓存命中与自愈

导入编排里，摘要生成后先查缓存（[bundle-repository.ts:321](../../src/features/bundle/bundle-repository.ts)）；命中后必须通过可用性检查（[bundle-repository.ts:410](../../src/features/bundle/bundle-repository.ts)）：

```ts
private async isCacheUsable(record: LocalBundleRecord): Promise<boolean> {
  try {
    await this.dependencies.storage.readFile(record.storagePrefix, 'bundle.json')
    return true
  } catch {
    await this.dependencies.storage.deletePrefix(record.storagePrefix)
    await this.dependencies.index.delete(record.localBundleId)
    return false
  }
}
```

浏览器可能回收 OPFS 数据但保留 IndexedDB 索引；命中后试读 `bundle.json`，读不到即删除脏索引、继续正常导入。

## 配额管理

[storage-manager.ts](../../src/features/storage/storage-manager.ts)：

- `requestPersistence()`：应用启动时请求持久化存储，降低浏览器回收概率
- `ensureAvailable(requiredBytes)`：导入前用 `navigator.storage.estimate()` 检查 `quota - usage`，不足时抛 `storage-full`，要求余量 ≥ 解压总量 × 2（覆盖 staging + 正式存储并存的窗口期）

## 视图投影（bundle-adapter）

[bundle-adapter.ts](../../src/features/bundle/bundle-adapter.ts) 把 `ValidatedPortableBundle` 转换为看稿会话数据（`LocalViewerPayload`），是契约层与 UI 之间唯一的投影层：

**图层树重建**（`layerValues`，[bundle-adapter.ts:179](../../src/features/bundle/bundle-adapter.ts)）：`design.nodes` 是扁平数组，按 `parentId` 两遍扫描重建为 `DesignLayer` 树，再按 `order` 升序递归排序（PSD 的 order 自下而上，即 DOM 层叠语义）。每个节点同时关联其资产 ID 与诊断 ID。

**资产组装**（`assetValues`，[bundle-adapter.ts:125](../../src/features/bundle/bundle-adapter.ts)）：placement 的画布定位（bounds）取值链为 `frame`（tight 裁剪定位）→ 节点 `logicalBounds` → 资产 `logicalSize` 原点兜底；`logicalBounds` 字段独立取 `placement.logicalBounds ?? 节点 logicalBounds`。lineage 记录烘焙血缘（该切图由哪些输入节点合成），供开发元素列表与未还原提示使用。

**诊断归一**（`diagnosticSeverity`，[bundle-adapter.ts:26](../../src/features/bundle/bundle-adapter.ts)）：severity 取值顺序为显式字段 → code 映射（`export_failed` → error，`hidden_marked/missing_font/effect_downgrade` → warning）→ info 兜底；message 优先用上游提供的原文，缺失时按 code 模板生成中文描述。

**未支持事实提示**（[bundle-adapter.ts:87](../../src/features/bundle/bundle-adapter.ts)）：扫描每个节点的 `effects/masks/fills/geometry/transform/clipping/text-runs` 字段，非空的聚合计数，生成 `unsupported_*` 类型的 info 级诊断——界面对不重建的复杂效果给出如实提示，而不是静默忽略。

## 对象 URL 生命周期

会话模块 [bundle-session.ts](../../src/features/workspace/bundle-session.ts) 用模块级变量跟踪当前 reference 的 object URL：

```ts
let activeObjectUrl: string | undefined

function releaseReferenceUrl() {
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl)
    activeObjectUrl = undefined
  }
}
```

切换 demo/本地 bundle 或关闭会话时统一 revoke，避免资源泄漏。会话数据本身用 `shallowRef` 存储并按次整体替换，图层树（可达千级节点）不做深响应化。
