# Framecheck Local

Framecheck Local 是纯本地 Vue 看稿工具。它消费 `psd_to_code.py pack` 生成的 `.psd-bundle.zip`，在浏览器本机查看 reference、图层事实、标记资源和 diagnostics。

不会上传 PSD、bundle、JSON 或资源到业务服务。它不是 Photoshop 替代品，也不直接在浏览器解析 PSD。

## 开发

```powershell
npm install
npm run dev
```

打开 `http://127.0.0.1:5173/#/`。

## 从 PSD 生成 Bundle

在安装了 `psd2code` 的本机运行：

```powershell
& "D:\proje2\psd2code\.venv\Scripts\python.exe" `
  "D:\proje2\psd2code\psd_to_code.py" pack `
  "<PSD_PATH>" -o "<OUTPUT_DIR>" --scales 1
```

例如：

```powershell
& "D:\proje2\psd2code\.venv\Scripts\python.exe" `
  "D:\proje2\psd2code\psd_to_code.py" pack `
  "D:\project\校招宣讲\校招报名页.psd" `
  -o "D:\project\bundle-output" --scales 1
```

CLI 输出 `<PSD 文件名>.psd-bundle.zip`。Framecheck Local 要求 archive 满足：

```text
bundle.json
design.json
reference.png
assets.json
diagnostics.json
assets/*
```

其中 `bundle.json` 必须是：

```json
{
  "schemaVersion": "1.0.0",
  "kind": "psd-design-bundle"
}
```

## 导入与查看

1. 点击顶部“导入”或空状态中的“导入 Bundle”
2. 选择 `.psd-bundle.zip`
3. 等待 Worker 校验、解压到 staging、写入 OPFS 并建立 IndexedDB 索引
4. 从左侧“文件”打开本地 bundle，在画布、图层和右侧检查面板中查看设计事实

同一 `source.sha256 + schemaVersion` 再次导入会命中已有本地缓存，不会重复写入工件。

## 图层标记规则

`psd2code` 根据 Photoshop 原图层名识别导出意图：

| 标记 | 含义 |
| --- | --- |
| `-h-`、`-m-`、`-e-` | 紧贴图层可见像素导出资源 |
| `-s-` | 固定尺寸资源导出 |
| `-slice-` | `-s-` 图层的可见切图边界辅助层 |
| `-x-` | 从设计事实与资源导出中排除 |

标记资源由 `assets.json` 声明。Framecheck Local 只显示并下载其中声明的资源，不会从未标记图层猜测切图。

## 本地缓存与清理

- reference、JSON 和资源写入当前浏览器 origin 的 OPFS 私有空间
- bundle 摘要、导入时间、占用、状态与 UI 偏好写入 IndexedDB 数据库 `framecheck-local`
- 原始 PSD 不会被缓存
- 浏览器可以拒绝持久化请求，空间紧张时仍可能回收缓存
- 在左侧“文件”中打开文件操作菜单，选择“删除本地缓存”并二次确认，可同时删除 OPFS 工件和 IndexedDB 索引

缓存没有可依赖的操作系统固定路径，应通过工具内文件列表管理。

## 已知边界

- 不支持浏览器直接打开或解析 PSD/PSB
- 不接后端、账号、云端项目、分享、评论或协作
- 不修改 zip 内的 `bundle.json`
- 当前 Inspector 不推测或重建复杂效果、遮罩、路径几何、复杂变换、剪贴关系和文本 runs；它们会显示为 `unsupported_*` diagnostics
- V3 不保证所有真实 PSD 都有 `-s-` 或 `-slice-` 标记；marker 是否存在由源 PSD 决定

## 验证命令

```powershell
npm run typecheck
npm run test
npm run test:e2e
npm run test:fixtures
npm run build
```

`test:fixtures` 会在本机重新运行 CLI pack，生成忽略的真实 fixture archive，执行 CLI/Web 对比和真实浏览器回归，然后刷新 `docs/reports/` 中的对接报告。
