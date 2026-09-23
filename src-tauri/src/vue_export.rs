//! Vue 静态页导出的目标项目写入命令。
//!
//! 安全约定（与前端 `VueExportProjectWriter` 端口一致）：
//! - 新建文件（text/base64）绝不覆盖已有内容，写入前整体校验冲突，失败则一个文件都不落盘；
//! - 追加写入（appendText）只在文件末尾追加、不改动既有内容（路由补丁场景）；
//! - 所有目标路径必须是项目内相对路径，拒绝绝对路径、盘符与 `..`（防目录穿越）。

use std::io;
use std::path::{Path, PathBuf};

use base64::Engine as _;
use crate::jobs::CommandError;
use serde::Deserialize;

fn invalid_path(message: String) -> CommandError {
    CommandError {
        code: "invalid-path".to_string(),
        message,
    }
}

/// 校验目标项目内的相对路径并拼接项目根。
///
/// 拒绝：空项目根、空路径、含盘符（`C:`）、以分隔符开头（根路径会替换掉项目根）、
/// 含 `..` 或空段（`a//b`、尾部斜杠）的路径。
fn resolve_project_path(project_root: &str, path: &str) -> Result<PathBuf, CommandError> {
    if project_root.trim().is_empty() {
        return Err(invalid_path("项目根目录不能为空".to_string()));
    }
    if path.trim().is_empty() || path.contains(':') || Path::new(path).is_absolute() {
        return Err(invalid_path(format!("不安全的目标路径：{path}")));
    }
    for segment in path.split(['/', '\\']) {
        if segment.is_empty() || segment == ".." {
            return Err(invalid_path(format!("不安全的目标路径：{path}")));
        }
    }
    Ok(PathBuf::from(project_root).join(path))
}

#[tauri::command]
pub(crate) async fn vue_export_read_text_file(
    project_root: String,
    path: String,
) -> Result<Option<String>, CommandError> {
    let full = resolve_project_path(&project_root, &path)?;
    match tokio::fs::read_to_string(&full).await {
        Ok(content) => Ok(Some(content)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(CommandError {
            code: "read-failed".to_string(),
            message: format!("无法读取 {path}：{error}"),
        }),
    }
}

#[tauri::command]
pub(crate) async fn vue_export_check_existing(
    project_root: String,
    paths: Vec<String>,
) -> Result<Vec<String>, CommandError> {
    let mut existing = Vec::new();
    for path in paths {
        let full = resolve_project_path(&project_root, &path)?;
        if tokio::fs::metadata(&full).await.is_ok() {
            existing.push(path);
        }
    }
    Ok(existing)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VueExportWriteFile {
    path: String,
    text: Option<String>,
    base64: Option<String>,
    /// 追加到既有文件末尾（路由补丁）：不改动既有内容，文件不存在时按新建处理
    append_text: Option<String>,
}

/// 写入单元：内容字节 + 写入模式（新建或追加）
enum WritePayload {
    /// 新建文件（目标必须不存在）
    Create(Vec<u8>),
    /// 追加到末尾
    Append(String),
}

#[tauri::command]
pub(crate) async fn vue_export_write_files(
    project_root: String,
    files: Vec<VueExportWriteFile>,
) -> Result<(), CommandError> {
    // 先整体校验路径、解码内容并检查冲突，全部通过后再写盘，避免半写状态
    let mut resolved: Vec<(PathBuf, WritePayload)> = Vec::with_capacity(files.len());
    for file in &files {
        let full = resolve_project_path(&project_root, &file.path)?;
        // 内容字段三选一：text / base64 / appendText
        let provided = [
            file.text.is_some(),
            file.base64.is_some(),
            file.append_text.is_some(),
        ]
        .iter()
        .filter(|flag| **flag)
        .count();
        if provided != 1 {
            return Err(CommandError {
                code: "invalid-file".to_string(),
                message: format!("{} 的 text / base64 / appendText 必须且只能提供其一", file.path),
            });
        }

        let payload = if let Some(append) = &file.append_text {
            WritePayload::Append(append.clone())
        } else {
            // 新建文件：目标必须不存在
            if tokio::fs::metadata(&full).await.is_ok() {
                return Err(CommandError {
                    code: "file-exists".to_string(),
                    message: format!("目标已存在，拒绝覆盖：{}", file.path),
                });
            }
            match (&file.text, &file.base64) {
                (Some(text), None) => WritePayload::Create(text.clone().into_bytes()),
                (None, Some(base64)) => WritePayload::Create(
                    base64::engine::general_purpose::STANDARD
                        .decode(base64.as_bytes())
                        .map_err(|error| CommandError {
                            code: "invalid-file".to_string(),
                            message: format!("{} 的 base64 内容无效：{error}", file.path),
                        })?,
                ),
                _ => unreachable!("内容字段数量已在上面校验为 1"),
            }
        };
        resolved.push((full, payload));
    }

    for (full, payload) in resolved {
        if let Some(parent) = full.parent() {
            tokio::fs::create_dir_all(parent).await.map_err(|error| CommandError {
                code: "write-failed".to_string(),
                message: format!("无法创建目录 {}: {error}", parent.display()),
            })?;
        }
        match payload {
            WritePayload::Create(content) => {
                tokio::fs::write(&full, content).await.map_err(|error| CommandError {
                    code: "write-failed".to_string(),
                    message: format!("无法写入 {}: {error}", full.display()),
                })?;
            }
            WritePayload::Append(append) => {
                let mut handle = tokio::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&full)
                    .await
                    .map_err(|error| CommandError {
                        code: "write-failed".to_string(),
                        message: format!("无法打开待追加文件 {}: {error}", full.display()),
                    })?;
                use tokio::io::AsyncWriteExt;
                handle
                    .write_all(append.as_bytes())
                    .await
                    .map_err(|error| CommandError {
                        code: "write-failed".to_string(),
                        message: format!("无法追加 {}: {error}", full.display()),
                    })?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 拒绝不安全路径() {
        assert!(resolve_project_path("D:/proj", "").is_err());
        assert!(resolve_project_path("", "a/b").is_err());
        assert!(resolve_project_path("D:/proj", "   ").is_err());
        // 绝对路径与盘符
        assert!(resolve_project_path("D:/proj", "/abs/path").is_err());
        assert!(resolve_project_path("D:/proj", "\\abs\\path").is_err());
        assert!(resolve_project_path("D:/proj", "C:/abs").is_err());
        assert!(resolve_project_path("D:/proj", "C:abs").is_err());
        // 穿越与空段
        assert!(resolve_project_path("D:/proj", "a/../b").is_err());
        assert!(resolve_project_path("D:/proj", "a//b").is_err());
        assert!(resolve_project_path("D:/proj", "a/b/").is_err());
    }

    #[test]
    fn 接受安全的相对路径() {
        let view = resolve_project_path("D:/proj", "src/views/home/index.vue").unwrap();
        assert!(view.ends_with(Path::new("src/views/home/index.vue")));

        // 图片路径允许反斜杠与中日韩文件名（PSD 图层名直出）
        let image = resolve_project_path("D:\\proj", "public/static/images/组-7.png").unwrap();
        assert!(image.ends_with(Path::new("public/static/images/组-7.png")));
    }

    /// IPC 结构体按 camelCase 反序列化：前端字段 appendText ↔ Rust append_text。
    /// （此前缺 rename_all 时 appendText 收不到值，路由条目被判为缺少内容字段）
    #[test]
    fn 写入文件结构体接受前端_camel_键() {
        let json = r#"[
            {"path": "src/router/index.ts", "appendText": "// append"},
            {"path": "public/a.png", "base64": "AQID"},
            {"path": "src/views/a/index.vue", "text": "x"}
        ]"#;
        let files: Vec<VueExportWriteFile> = serde_json::from_str(json).unwrap();
        assert_eq!(files[0].append_text.as_deref(), Some("// append"));
        assert_eq!(files[1].base64.as_deref(), Some("AQID"));
        assert_eq!(files[2].text.as_deref(), Some("x"));
    }

    /// 命令层往返：读取、冲突检查、新建写入、追加写入与「绝不覆盖」约定
    #[tokio::test]
    async fn 命令读写往返一致且拒绝覆盖() {
        let root = std::env::temp_dir().join("framecheck-vue-export-cmd-test");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("src/router")).unwrap();
        std::fs::write(root.join("src/router/index.ts"), "export default 1;").unwrap();
        let root = root.to_string_lossy().to_string();

        // 文本读取：存在返回内容，不存在返回 None
        let router = vue_export_read_text_file(root.clone(), "src/router/index.ts".to_string())
            .await
            .unwrap();
        assert_eq!(router.as_deref(), Some("export default 1;"));
        let missing = vue_export_read_text_file(root.clone(), "src/missing.ts".to_string())
            .await
            .unwrap();
        assert!(missing.is_none());

        // 冲突检查只返回已存在的路径
        let existing = vue_export_check_existing(
            root.clone(),
            vec!["src/router/index.ts".to_string(), "src/missing.ts".to_string()],
        )
        .await
        .unwrap();
        assert_eq!(existing, vec!["src/router/index.ts".to_string()]);

        // base64 新建写入（含 CJK 文件名），自动创建目录
        let files = vec![VueExportWriteFile {
            path: "public/static/images/组-7.png".to_string(),
            text: None,
            base64: Some("AQID".to_string()),
            append_text: None,
        }];
        vue_export_write_files(root.clone(), files).await.unwrap();
        let written = std::fs::read(format!("{root}/public/static/images/组-7.png")).unwrap();
        assert_eq!(written, vec![1u8, 2, 3]);

        // 新建目标已存在：拒绝覆盖
        let again = vec![VueExportWriteFile {
            path: "public/static/images/组-7.png".to_string(),
            text: Some("overwrite".to_string()),
            base64: None,
            append_text: None,
        }];
        let rejected = vue_export_write_files(root.clone(), again).await.unwrap_err();
        assert_eq!(rejected.code, "file-exists");

        // 追加写入：既有内容原样保留，追加块接在末尾
        let append = vec![VueExportWriteFile {
            path: "src/router/index.ts".to_string(),
            text: None,
            base64: None,
            append_text: Some("\nrouter.addRoute({});\n".to_string()),
        }];
        vue_export_write_files(root.clone(), append).await.unwrap();
        let patched = std::fs::read_to_string(format!("{root}/src/router/index.ts")).unwrap();
        assert_eq!(patched, "export default 1;\nrouter.addRoute({});\n");

        // 追加到不存在的文件：按新建处理
        let append_new = vec![VueExportWriteFile {
            path: "src/router/extra.ts".to_string(),
            text: None,
            base64: None,
            append_text: Some("// extra".to_string()),
        }];
        vue_export_write_files(root.clone(), append_new).await.unwrap();
        assert_eq!(
            std::fs::read_to_string(format!("{root}/src/router/extra.ts")).unwrap(),
            "// extra"
        );

        // 内容字段必须三选一：text 与 appendText 同时给出
        let invalid = vec![VueExportWriteFile {
            path: "public/a.png".to_string(),
            text: Some("a".to_string()),
            base64: None,
            append_text: Some("b".to_string()),
        }];
        let invalid_error = vue_export_write_files(root.clone(), invalid).await.unwrap_err();
        assert_eq!(invalid_error.code, "invalid-file");

        // 内容字段缺失
        let empty = vec![VueExportWriteFile {
            path: "public/b.png".to_string(),
            text: None,
            base64: None,
            append_text: None,
        }];
        let empty_error = vue_export_write_files(root.clone(), empty).await.unwrap_err();
        assert_eq!(empty_error.code, "invalid-file");

        let _ = std::fs::remove_dir_all(&root);
    }
}
