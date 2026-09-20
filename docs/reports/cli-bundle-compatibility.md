# CLI Bundle Compatibility Report

生成时间：2026-09-16T12:18:34.970Z

## 输入契约

psd_to_code.py pack <PSD_PATH> -o <OUTPUT_DIR> --scales 1

所有样本均验证为 schemaVersion: "1.0.0" 与 kind: "psd-design-bundle"。真实 PSD 与生成 ZIP 位于本机忽略目录 artifacts/v3-real-fixtures/，不包含在仓库中。

## Fixture Results

| Fixture | 覆盖类别 | PSD 大小 | ZIP 大小 | 文档尺寸 | 节点 | 资源 / placement | CLI diagnostics |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: |
| normal-modal | 普通页面 | 45.3 MB | 2.3 MB | 750 x 2781 | 222 | 10 / 18 | 0 |
| long-mobile-page | 超长移动端页面 | 249.3 MB | 6.9 MB | 750 x 4273 | 706 | 31 / 43 | 4 |
| marked-assets | 含 -h- 标记资源页面 | 322.3 MB | 3.4 MB | 750 x 3100 | 191 | 19 / 19 | 0 |
| complex-app-intro | 含字体、效果、智能对象或诊断页面 | 12.8 MB | 510 KB | 1177 x 4203 | 99 | 0 / 0 | 0 |

## 对比结论

- Web 校验 bundle.json schema 与 kind，并保留 archive 内原始内容不修改
- Web 文档尺寸与 reference.png PNG 尺寸逐样本一致
- Web 图层树逐节点保留 CLI 的节点 ID 与名称
- Web 资源数量、逻辑尺寸、像素尺寸与全部 placement 图层逐条比对
- CLI diagnostics 被保留并映射为可读状态，未投影的 CLI 字段额外显示 unsupported_* diagnostics
- 真实 marker 样本验证到 -h- 资源；本机扫描的候选 PSD 未发现 -s- 或 -slice- 图层，因此这两类没有真实端到端样本

## 已知边界

- 本报告不意味着浏览器可直接解析 PSD，Web 仅消费 CLI 已生成的 bundle
- CSS 投影仅覆盖基础几何和文本样式，完整效果、遮罩、路径、复杂变换、剪贴关系与文本 runs 见 [无法表达字段](./unsupported-cli-fields.md)