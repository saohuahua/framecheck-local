# 浏览器 PSD Worker POC 报告

生成时间：2026-09-16T12:22:20.817Z

## 范围

- 候选解析器：ag-psd 31.0.2
- Parser 仅在 module Worker 中运行，主线程不保存 PSD File、ArrayBuffer、Blob 或图像像素
- Worker 先读 26 字节文件头，再进行跳过所有位图的结构预检，结构过限时不读取合成预览
- 本 POC 不写 OPFS 或 IndexedDB，staging 始终为 not-created，取消直接终止 Worker 释放内存
- CLI psd-design-bundle 仍是唯一产品主链，本报告不创建或开放 PSD 直导入口

## 环境

| 浏览器 | 设备内存 | crossOriginIsolated | User Agent |
| --- | ---: | --- | --- |
| 153.0.8010.37 | 32 GiB | false | Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.0.0 Safari/537.36 |

## 预检限额

| 项目 | 限额 |
| --- | ---: |
| 文件大小 | 256 MB |
| 画布面积 | 24,000,000 像素 |
| 图层数量 | 1,500 |
| 预估内存 | 512 MB |
| 单任务时长 | 45 秒 |

预估内存为 `文件字节 x 2 + 画布像素 x 12`。当前 Headless Chrome Worker 不暴露 `performance.memory`，因此真实 Worker 峰值显示为未测，不能解释为零内存或通过内存验证。主线程列是 CDP `JSHeapUsedSize`，只覆盖页面目标。

## Worker 实测

| 样本 | 轮次 | 结果 | PSD 大小 | 画布 | 图层 | 合成预览 | 解析耗时 | 预估内存 | Worker 峰值 | 主线程采样峰值 |
| --- | ---: | --- | ---: | --- | ---: | --- | ---: | ---: | ---: | ---: |
| marked-modal-45mb | 1 | completed | 45.3 MB | 750 x 2781 | 251 | 750 x 2781 | 115 ms | 114.4 MB | 未测 | 2.9 MB |
| resource-management-100mb | 1 | completed | 94.5 MB | 1624 x 1128 | 215 | 1624 x 1128 | 111 ms | 209.9 MB | 未测 | 2.9 MB |
| homepage-200mb | 1 | completed | 186.4 MB | 1624 x 1128 | 420 | 1624 x 1128 | 188 ms | 393.8 MB | 未测 | 2.9 MB |
| homepage-200mb | 2 | completed | 186.4 MB | 1624 x 1128 | 420 | 1624 x 1128 | 186 ms | 393.8 MB | 未测 | 2.9 MB |
| homepage-200mb | 3 | completed | 186.4 MB | 1624 x 1128 | 420 | 1624 x 1128 | 217 ms | 393.8 MB | 未测 | 2.9 MB |

## CLI Bundle 对比

### marked-modal-45mb

- CLI bundle：schemaVersion=1.0.0，kind=psd-design-bundle，reference.png=750 x 2781
- 画布：Worker 与 CLI 一致，预览尺寸 与 reference.png 一致
- 图层树：Worker 251 层，CLI 222 节点，名称仅 CLI 有 18 个，仅 Worker 有 47 个
- 名称差异样本：仅 CLI 有 底框 拷贝 2、底框 拷贝 2、标题、标题、标题、标题、按钮、按钮、按钮、按钮、底框 拷贝、标题  拷贝；仅 Worker 有 -h-底框 拷贝 2、-h-底框 拷贝 2、矩形 1372、矩形 1372、矩形 1372、矩形 1372、矩形 1372、矩形 1372 拷贝、矩形 1372 拷贝、矩形 1372 拷贝、矩形 1372 拷贝、矩形 1372 拷贝
- 标记资源：Worker 候选 -h- 18；CLI 标记 -h-；CLI 实际资产 10 个，placement 18 个，Worker 不产生资产
- CLI 资源尺寸：assets/frame-33d9779d.png 逻辑 731 x 458 像素 731 x 458 placement 3；assets/title-6f732322.png 逻辑 581 x 132 像素 581 x 132 placement 2；assets/btn-82d223bd.png 逻辑 336 x 86 像素 336 x 86 placement 2；assets/title-c35721ae.png 逻辑 581 x 132 像素 581 x 132 placement 1；assets/btn-fb8d6f94.png 逻辑 336 x 86 像素 336 x 86 placement 2；assets/shijian-095d25b4.png 逻辑 157 x 35 像素 157 x 35 placement 2；assets/didian-a09354c4.png 逻辑 157 x 35 像素 157 x 35 placement 2；assets/frame-9a093588.png 逻辑 731 x 458 像素 731 x 458 placement 1；assets/title-c2d0e245.png 逻辑 581 x 132 像素 581 x 132 placement 2；assets/frame-33596c27.png 逻辑 731 x 458 像素 731 x 458 placement 1
- diagnostics：CLI 无；Worker 检测到文本 33 层、效果 51 层、智能对象 2 层，均未投影到 Viewer
- 预览：Worker 已解码 750 x 2781 合成像素 8.0 MB，按约束不将像素传给主线程，因此未做像素级比较

### resource-management-100mb

- CLI bundle：schemaVersion=1.0.0，kind=psd-design-bundle，reference.png=1624 x 1128
- 画布：Worker 与 CLI 一致，预览尺寸 与 reference.png 一致
- 图层树：Worker 215 层，CLI 246 节点，名称仅 CLI 有 39 个，仅 Worker 有 8 个
- 名称差异样本：仅 CLI 有 暗纹、线框、形状 5、形状 5、形状 2、形状 1、矩形 1 拷贝 4、形状 1 拷贝 4、形状 1 拷贝 4、内框、组 7、内框 拷贝；仅 Worker 有 up!、level、图层 97 拷贝、图层97、图层 586 拷贝、图层 631、横纹 拷贝、图案 拷贝
- 标记资源：Worker 候选 无；CLI 标记 无；CLI 实际资产 0 个，placement 0 个，Worker 不产生资产
- CLI 资源尺寸：无
- diagnostics：CLI 无；Worker 检测到文本 18 层、效果 35 层、智能对象 30 层，均未投影到 Viewer
- 预览：Worker 已解码 1624 x 1128 合成像素 7.0 MB，按约束不将像素传给主线程，因此未做像素级比较

### homepage-200mb

- CLI bundle：schemaVersion=1.0.0，kind=psd-design-bundle，reference.png=1624 x 1128
- 画布：Worker 与 CLI 一致，预览尺寸 与 reference.png 一致
- 图层树：Worker 420 层，CLI 803 节点，名称仅 CLI 有 398 个，仅 Worker 有 15 个
- 名称差异样本：仅 CLI 有 暗纹、鸟居、线框、形状 5、形状 5、图层 24、形状 2、形状 1、图层 585、图层 585、图层 585、图层 65；仅 Worker 有 图层97、图层 586 拷贝、图层 586、四服·神炎国、三服·海之国、二服·云之国、形状 11、形状 12 拷贝、组 2、形状 8、形状 7 拷贝 2、形状 9
- 标记资源：Worker 候选 无；CLI 标记 无；CLI 实际资产 0 个，placement 0 个，Worker 不产生资产
- CLI 资源尺寸：无
- diagnostics：CLI 无；Worker 检测到文本 18 层、效果 139 层、智能对象 46 层，均未投影到 Viewer
- 预览：Worker 已解码 1624 x 1128 合成像素 7.0 MB，按约束不将像素传给主线程，因此未做像素级比较

## 取消与资源释放

- 约 200 MB 样本在 Worker 任务运行中被取消，控制器立即终止 Worker，结果为 cancelled，且 staging 为 not-created

## 失败类型

- memory-telemetry-unavailable：当前浏览器环境无法记录 Worker 真实峰值内存

## 不支持边界

- 不支持 PSB、16-bit、非 RGB 色彩模式、超过预检限额的文件，也不承诺 1 GB PSD 支持
- POC 仅解码合成预览并保留图层结构摘要，不传递任何图像像素到主线程，因此未做 reference.png 像素级视觉差异
- 解析器图层名中的 -h-、-s-、-slice- 只作为候选标记，不会生成 CLI bundle 的资源、placement、导出切图或诊断
- 文本、效果、智能对象仅统计存在情况，未建立到现有 Viewer 的等价投影

## 开放建议

结论：不设计或开放浏览器 PSD 直导入口。约 200 MB 代表样本虽连续完成结构与预览解析，但当前环境不能记录 Worker 真实峰值内存，且图层树、标记资源与 CLI bundle 不等价，尚不满足实验入口的安全与功能证据。CLI bundle 主链保持不变。
