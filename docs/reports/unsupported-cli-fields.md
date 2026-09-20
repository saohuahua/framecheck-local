# 无法表达的 CLI 字段

生成时间：2026-09-16T12:18:34.970Z

这些字段由 psd2code pack 正确保留在 design.json，但当前 V3 Vue Inspector 不创建推测值。发现后会显示 info 级 unsupported_* diagnostics，并可定位到首个受影响图层。

| 诊断类型 | 当前处理 |
| --- | --- |
| `unsupported_effects` | 38 个图层包含图层效果，当前 V3 仅保留原始事实并在诊断中提示，属性面板不补假数据 |
| `unsupported_masks` | 75 个图层包含遮罩，当前 V3 仅保留原始事实并在诊断中提示，属性面板不补假数据 |
| `unsupported_geometry` | 61 个图层包含路径几何，当前 V3 仅保留原始事实并在诊断中提示，属性面板不补假数据 |
| `unsupported_clipping` | 69 个图层包含剪贴关系，当前 V3 仅保留原始事实并在诊断中提示，属性面板不补假数据 |
| `unsupported_transform` | 24 个图层包含复杂变换，当前 V3 仅保留原始事实并在诊断中提示，属性面板不补假数据 |
| `unsupported_text-runs` | 4 个图层包含文本样式 runs，当前 V3 仅保留原始事实并在诊断中提示，属性面板不补假数据 |
| `unsupported_fills` | 7 个图层包含复杂填充，当前 V3 仅保留原始事实并在诊断中提示，属性面板不补假数据 |

## 已表达字段

- bundle schema、来源元数据、reference PNG、文档尺寸、节点 ID、名称、层级、logical/paint bounds
- 基础文本内容与可用字体样式字段
- 标记资源、全部 placement 图层、逻辑尺寸、实际像素、倍率和文件下载
- CLI diagnostics 的 code、name、path、marker，以及导入时发现的 schema 与安全错误

## 不做的推测

不根据效果、遮罩、路径或变换猜测 CSS、图像合成结果或可编辑样式。原始 JSON 会保存于 OPFS，后续 Viewer 能力应从原始字段增加明确投影，而不是覆盖 bundle 真值。