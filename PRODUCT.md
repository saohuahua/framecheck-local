# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vue 3、TypeScript、Composition API 与 Vite。项目是纯本地静态 Web 工具，不使用 React。

## Users

- 前端开发在实现界面时优先查看切图、文案、背景、关键容器及其尺寸和样式，必要时再进入完整 PSD 图层树
- 测试在对照设计基准时识别复杂效果、字体与解析风险
- 产品在确认视觉布局与静态文案时读取设计事实

这些用户不应被迫安装 Photoshop、登录账号或进入设计编辑流程。

## Product Purpose

Framecheck Local 让用户在不安装 Photoshop 的情况下，本地打开 PSD 设计交付包，以开发事实而非原始 PSD 层级为默认入口，读取几何、文本、样式、切图和诊断。成功标准是用户能快速定位切图或文案、读取自身属性、悬浮测量距离、下载资源、理解诊断，并在刷新后从本地缓存重新打开。

## Positioning

这是一个以 `.psd-bundle.zip` 为真实输入的本地只读开发检查器。`psd2code CLI` 或未来解析器负责从 PSD 生成不可变 bundle，Web 端只导入、缓存和查看该契约。它不是协作设计平台、PSD 编辑器或浏览器内 PSD 解析器。

## Operating Context

- 桌面 Chrome 或 Edge 中运行的本地静态 Web 工具，最低工作宽度为 1280px
- 首个真实工作流是 `psd2code CLI -> .psd-bundle.zip -> 浏览器本地导入 -> OPFS 和 IndexedDB 缓存 -> 看稿`
- 用户在左侧文件和图层、中间参考画布、右侧检查面板之间高频切换，并使用鼠标悬浮、选择、测量、快捷键、滚动、菜单和拖拽
- 浏览器直接导入 PSD 仅是后续 POC，不能阻塞 bundle 看稿闭环

## Capabilities and Constraints

一期已确认目标包括本地 bundle 导入与导出、缓存列表与清理、可滚动的开发元素列表、次级完整图层树、画布预览、缩放和平移、选中与悬浮测量、切图总览、资源下载和复制、详细属性与诊断查看。

产品纯本地运行，不接后端，不发送运行时业务数据，不提供账号、团队、云端项目、分享、评论、版本、协作、PSD 编辑、写回 PSD、AI 聊天、代码编辑器或设计稿状态机。原始 PSD 不缓存到应用存储。未标记图层不自动导出资源。

数据真值由 `reference.png`、`design.json`、`assets.json`、`diagnostics.json` 和 `bundle.json` 组成的不可变 bundle 提供。CSS 投影是前端推导，不改变 bundle 真值。

## Brand Commitments

产品名称为 Framecheck Local。界面必须诚实表达“本地处理”和“仅此设备可见”的边界，不能伪造云端、协作或已解析 PSD 的能力。

常规工作台使用高对比黑白灰层级，主命令与界面选中态使用石墨黑，浅灰只承担分区与 hover。画布当前选中图层及其与悬浮目标之间的边距标注使用红色，CSS 投影是唯一使用 VS Code 风格多色语法的区域，用于提高属性、数值、字符串和关键字的扫描效率，不作为产品主题色。

月维截图只作为三栏工作台的功能排布参考。`D:\project\psd-platform\project` 只作为黑白灰极简视觉、交互密度和演示数据参考，不迁移 React 代码，也不将其视为生产基座。

## Evidence on Hand

- 产品、工作台、架构、交付、验收与依赖决策文档位于 `D:\proje2\psd2code\doc\09-framecheck-local-vue\`
- 当前工作台已实现 Vue 三栏看稿、Reka UI 薄封装和高对比黑白灰 Token；画布在文案区域优先选择文案，在切图其余区域选择完整 placement，并支持同点重复点击穿透，完整 PSD 图层树保留任意原始节点的高级入口
- 选中对象会投影位置、尺寸、内容、样式和 CSS；切图优先使用 `assets.json` placement frame，并提供预览、下载、复制路径和切图 Tab 的批量高亮
- 画布支持文案区域与切图 placement 的优先选择、缩放、平移、持续悬浮测量；悬浮空白处时以画布背景四边作为位置兜底，并在选框下方显示深色尺寸标签；任意原始图层可从图层树主动选择
- V1/V2 已实现 `.psd-bundle.zip` Worker 校验、Zip Slip 防护、OPFS staging、IndexedDB 索引、缓存命中、导出、删除确认、刷新恢复和本地空间不足状态；浏览器不解析 PSD
- V3 已使用本机四份真实 PSD 通过 `psd_to_code.py pack` 生成 bundle，并比对 schema、文档尺寸、reference、节点、资源、placement 和 diagnostics；真实二进制仅存在于被忽略的本地 artifacts 目录
- V4 已完成浏览器 PSD Worker POC 报告，但因解析等价性和 Worker 内存遥测证据不足，仍不开放 PSD 直导入口
- 当前没有云端服务、用户访谈记录或可用于虚构产品能力的外部证据

## Product Principles

1. 本地优先，所有能力和文案都如实反映数据只留在当前设备
2. 开发事实优先，默认突出切图、文案、背景和关键容器，原始图层树只作高级入口
3. 看稿效率优先，选择、悬浮测量、画布定位、检查与诊断服务于开发检查而非编辑流程
4. 核心闭环优先，CLI bundle 路线先于浏览器 PSD 解析 POC
5. 领域能力自建，通用可访问性交互仅通过项目封装的无样式原语提供

## Accessibility & Inclusion

桌面键盘用户必须能到达主要命令、图层树、工具、Tab、菜单和对话框，且焦点状态可见。图标按钮必须有可访问名称和 tooltip。尚未确认独立的 WCAG 等级目标，移动端不在一期范围。
