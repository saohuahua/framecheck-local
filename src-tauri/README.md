# Framecheck Native Runner

开发期仅从 `FRAMECHECK_DEV_RUNNER` 读取 runner 绝对路径。

发布期仅从资源目录读取 `psd2code-runtime/psd2code-runner.exe`。

原生层以固定参数启动 runner：

```text
psd2code-runner.exe --request <job-staging>/request.json
```

`request.json` 由 Rust 根据已校验的结构化任务写入。Vue 不传可执行文件、命令行参数或工件路径。
