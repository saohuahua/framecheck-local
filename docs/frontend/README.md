# Framecheck Local 前端技术实现文档

本目录是 framecheck-local 前端的架构与实现文档，面向熟悉 Vue 生态的前端开发者，直接陈述本项目的架构决策与实现方式。规范性内容（设计 Token、产品边界）以 [DESIGN.md](../../DESIGN.md) 与 [PRODUCT.md](../../PRODUCT.md) 为准。

## 项目定位

Framecheck Local 是一个纯本地的 PSD 设计交付包看稿工作台。它不在浏览器解析 PSD、不上传数据；输入是 psd2code CLI（外部 Python 进程）产出的 `.psd-bundle.zip` 交付包（下文简称 bundle）。前端负责交付包的导入、缓存与查看，并在此之上提供两个桌面端能力：本机转换任务台与 Vue 静态代码导出。

数据链路：

```
Photoshop PSD
    │  psd2code CLI（本机外部进程）
    ▼
.psd-bundle.zip
    │  bundle.json / design.json / reference.png / assets.json / diagnostics.json / assets/*
    ▼
┌──────────────────────── framecheck-local ────────────────────────┐
│  导入管线：ZIP 校验 → 解压 → OPFS 工件 + IndexedDB 索引            │
│  看稿工作台：三栏画布 / 图层树 / 开发元素 / 测量 / 诊断             │
│  Vue 导出（桌面端）：生成 h5-template 静态页并写入目标项目          │
│  转换工作台（桌面端）：驱动本机 CLI 任务，产物接回看稿              │
└───────────────────────────────────────────────────────────────────┘
```

## 总体架构

前端分为一个组合根、六个领域 feature 与一个共享层，依赖方向单向向下：

```
                 pages（WorkspacePage / ConversionPage）
                      │ 组装
                 app/desktop-composition.ts   ← 运行时环境识别与端口注入
                      │
     ┌────────────────┼──────────────────────────┐
     ▼                ▼                          ▼
features/viewer  features/codegen          features/conversion
features/workspace    │ 端口接口                 │ 端口接口
     │                ▼                          ▼
     │          desktop-bridge ◄───────────────┘
     │         （Tauri IPC 适配 / 浏览器 Mock / 运行时校验）
     ▼
features/bundle ──► features/importer ──► features/storage
（契约层）           （Worker 管线）        （OPFS + IndexedDB）

shared/ui（App* 组件）    shared/styles（Token CSS）
```

运行环境分两种，能力差异集中在组合根处理：

| 环境 | 能力 | 降级方式 |
| --- | --- | --- |
| 浏览器（`npm run dev`） | 导入 bundle、看稿、导出 bundle、资源下载 | 转换与 Vue 导出入口禁用 |
| Tauri 桌面 | 以上全部 + 本机转换 + Vue 导出写入目标项目 | — |

## 文档导航

| 文档 | 范围 |
| --- | --- |
| [01-overview.md](./01-overview.md) | 产品边界、数据契约总览、技术栈与选型、分层架构、目录导览、组合根机制 |
| [02-data-pipeline.md](./02-data-pipeline.md) | Bundle 契约校验、导入管线（Worker + 两阶段提交）、OPFS 与 IndexedDB 存储、视图投影 |
| [03-viewer.md](./03-viewer.md) | 三栏看稿：画布渲染与坐标系统、命中测试、测量、快捷键、状态管理、左右栏面板 |
| [04-codegen.md](./04-codegen.md) | Vue 静态代码导出：生成器、命名与路由追加、预览模型、目标项目写入 |
| [05-desktop-bridge.md](./05-desktop-bridge.md) | 桌面桥接：端口契约、IPC 数据校验、转换任务数据流、浏览器 Mock |
| [06-design-system.md](./06-design-system.md) | 设计 Token、App* 组件层、领域组件边界、测试策略 |
