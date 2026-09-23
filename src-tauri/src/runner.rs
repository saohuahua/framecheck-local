#[cfg(debug_assertions)]
use std::env;
use std::{
    path::{Path, PathBuf},
    process::Stdio,
};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
#[cfg(not(debug_assertions))]
use tauri::Manager;
use thiserror::Error;
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, BufReader},
    process::{Child, Command},
    sync::mpsc,
};

pub const MAX_LOG_CHARACTERS: usize = 4096;
const MAX_PROCESS_LINE_BYTES: usize = 64 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartJobRequest {
    pub protocol_version: String,
    pub task_id: String,
    pub source_path: String,
    pub output_dir: String,
    pub deliverables: Vec<String>,
    pub bundle_compressed: bool,
    pub scales: Vec<u32>,
    pub token_top: u32,
    pub css_style: String,
    pub css_pretty_enabled: bool,
    pub smart_merge_enabled: bool,
    pub image_layer_flatten_enabled: bool,
    /// 嵌套挖洞：true 时已标记后代从父级合成图挖出（交互元素独立成图）
    pub nested_suppression_enabled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RunnerStartJobRequest<'a> {
    protocol_version: &'a str,
    task_id: &'a str,
    source_path: &'a str,
    output_dir: &'a str,
    deliverables: &'a [String],
    scales: &'a [u32],
    token_top: u32,
    css_style: &'a str,
    css_pretty_enabled: bool,
    smart_merge_enabled: bool,
    image_layer_flatten_enabled: bool,
    nested_suppression_enabled: bool,
}

impl<'a> From<&'a StartJobRequest> for RunnerStartJobRequest<'a> {
    fn from(request: &'a StartJobRequest) -> Self {
        Self {
            protocol_version: &request.protocol_version,
            task_id: &request.task_id,
            source_path: &request.source_path,
            output_dir: &request.output_dir,
            deliverables: &request.deliverables,
            scales: &request.scales,
            token_top: request.token_top,
            css_style: &request.css_style,
            css_pretty_enabled: request.css_pretty_enabled,
            smart_merge_enabled: request.smart_merge_enabled,
            image_layer_flatten_enabled: request.image_layer_flatten_enabled,
            nested_suppression_enabled: request.nested_suppression_enabled,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogStream {
    Stdout,
    Stderr,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunnerArtifact {
    pub artifact_id: String,
    pub kind: String,
    pub path: String,
    pub label: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "lowercase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum RunnerEvent {
    Started {
        task_id: String,
        total: u32,
        source_name: String,
    },
    Stage {
        key: String,
        label: String,
        current: u32,
        total: u32,
    },
    Log {
        stream: LogStream,
        message: String,
    },
    Warning {
        code: String,
        message: String,
    },
    Artifact {
        artifact_id: String,
        kind: String,
        path: String,
        label: String,
    },
    Completed {
        task_id: String,
        output_dir: String,
        artifacts: Vec<RunnerArtifact>,
    },
    Failed {
        task_id: String,
        code: String,
        message: String,
        stage: String,
    },
    Cancelled {
        task_id: String,
    },
}

pub enum ParsedStdoutLine {
    Event(RunnerEvent),
    Log(String),
    InvalidEvent,
    Ignore,
}

pub fn parse_stdout_line(line: &str) -> ParsedStdoutLine {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return ParsedStdoutLine::Ignore;
    }
    if !trimmed.starts_with('{') {
        return ParsedStdoutLine::Log(sanitize_log(trimmed));
    }
    match serde_json::from_str::<RunnerEvent>(trimmed) {
        Ok(event) => ParsedStdoutLine::Event(event),
        Err(_) => ParsedStdoutLine::InvalidEvent,
    }
}

pub fn sanitize_log(message: &str) -> String {
    let mut output = String::with_capacity(message.len().min(MAX_LOG_CHARACTERS));
    for character in message.chars() {
        if output.chars().count() >= MAX_LOG_CHARACTERS {
            output.push_str("...");
            break;
        }
        if character.is_control() && character != '\t' {
            output.push(' ');
        } else {
            output.push(character);
        }
    }
    output
}

#[derive(Clone, Debug)]
pub struct RunnerConfig {
    executable: PathBuf,
}

#[derive(Debug, Error)]
pub enum RunnerConfigError {
    #[cfg(debug_assertions)]
    #[error("开发期 runner 配置缺失")]
    MissingDevelopmentConfig,
    #[cfg(debug_assertions)]
    #[error("runner 路径必须为绝对路径")]
    RelativePath,
    #[error("runner 文件不存在")]
    MissingExecutable,
    #[cfg(not(debug_assertions))]
    #[error("应用资源目录不可用")]
    ResourceDirectory,
}

impl RunnerConfig {
    pub fn from_app(_app: &AppHandle) -> Result<Self, RunnerConfigError> {
        #[cfg(debug_assertions)]
        {
            let value = env::var_os("FRAMECHECK_DEV_RUNNER")
                .ok_or(RunnerConfigError::MissingDevelopmentConfig)?;
            return Self::from_development_path(PathBuf::from(value));
        }

        #[cfg(not(debug_assertions))]
        {
            let resource_dir = _app
                .path()
                .resource_dir()
                .map_err(|_| RunnerConfigError::ResourceDirectory)?;
            let executable = resource_dir
                .join("psd2code-runtime")
                .join("psd2code-runner.exe");
            if !executable.is_file() {
                return Err(RunnerConfigError::MissingExecutable);
            }
            Ok(Self { executable })
        }
    }

    #[cfg(debug_assertions)]
    pub fn from_development_path(executable: PathBuf) -> Result<Self, RunnerConfigError> {
        if !executable.is_absolute() {
            return Err(RunnerConfigError::RelativePath);
        }
        if !executable.is_file() {
            return Err(RunnerConfigError::MissingExecutable);
        }
        Ok(Self { executable })
    }

    pub fn executable(&self) -> &Path {
        &self.executable
    }
}

pub enum ProcessOutput {
    Stdout(String),
    Stderr(String),
}

pub struct SpawnedRunner {
    pub child: Child,
    pub output: mpsc::UnboundedReceiver<ProcessOutput>,
}

#[derive(Debug, Error)]
pub enum RunnerLaunchError {
    #[error("runner 无法启动")]
    Spawn,
    #[error("runner 标准输出不可用")]
    MissingStdout,
    #[error("runner 标准错误不可用")]
    MissingStderr,
}

pub fn spawn_runner(
    runner: &RunnerConfig,
    request_file: &Path,
) -> Result<SpawnedRunner, RunnerLaunchError> {
    let mut child = Command::new(runner.executable())
        .arg("--request")
        .arg(request_file)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| RunnerLaunchError::Spawn)?;
    let stdout = child.stdout.take().ok_or(RunnerLaunchError::MissingStdout)?;
    let stderr = child.stderr.take().ok_or(RunnerLaunchError::MissingStderr)?;
    let (sender, receiver) = mpsc::unbounded_channel();
    tokio::spawn(forward_lines(stdout, ProcessStream::Stdout, sender.clone()));
    tokio::spawn(forward_lines(stderr, ProcessStream::Stderr, sender));
    Ok(SpawnedRunner {
        child,
        output: receiver,
    })
}

#[derive(Clone, Copy)]
enum ProcessStream {
    Stdout,
    Stderr,
}

async fn forward_lines<R>(
    reader: R,
    stream: ProcessStream,
    sender: mpsc::UnboundedSender<ProcessOutput>,
) where
    R: AsyncRead + Unpin,
{
    let mut reader = BufReader::new(reader);
    let mut buffer = Vec::new();
    loop {
        buffer.clear();
        let bytes_read = match reader.read_until(b'\n', &mut buffer).await {
            Ok(value) => value,
            Err(_) => {
                let _ = sender.send(ProcessOutput::Stderr("runner 输出流读取失败".to_string()));
                return;
            }
        };
        if bytes_read == 0 {
            return;
        }
        let limit = buffer.len().min(MAX_PROCESS_LINE_BYTES);
        let message = String::from_utf8_lossy(&buffer[..limit]);
        let message = sanitize_log(message.trim_end_matches(['\r', '\n']));
        let output = match stream {
            ProcessStream::Stdout => ProcessOutput::Stdout(message),
            ProcessStream::Stderr => ProcessOutput::Stderr(message),
        };
        if sender.send(output).is_err() {
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use tokio_util::sync::CancellationToken;

    use super::{
        parse_stdout_line, ParsedStdoutLine, RunnerConfig, RunnerConfigError, RunnerStartJobRequest,
        StartJobRequest,
    };

    #[test]
    fn runner_request_omits_desktop_bundle_option() {
        let request = StartJobRequest {
            protocol_version: "1".to_string(),
            task_id: "task".to_string(),
            source_path: "C:\\source.psd".to_string(),
            output_dir: "C:\\output".to_string(),
            deliverables: vec!["delivery".to_string()],
            bundle_compressed: false,
            scales: vec![1],
            token_top: 30,
            css_style: "compact".to_string(),
            css_pretty_enabled: true,
            smart_merge_enabled: true,
            image_layer_flatten_enabled: false,
            nested_suppression_enabled: true,
        };

        let payload = serde_json::to_value(RunnerStartJobRequest::from(&request)).expect("runner payload");

        assert!(payload.get("bundleCompressed").is_none());
        assert_eq!(payload.get("nestedSuppressionEnabled"), Some(&serde_json::Value::Bool(true)));
    }

    #[test]
    fn parses_structured_json_line() {
        let line = r#"{"type":"started","taskId":"job","total":2,"sourceName":"home.psd"}"#;
        assert!(matches!(parse_stdout_line(line), ParsedStdoutLine::Event(_)));
    }

    #[test]
    fn keeps_non_json_stdout_as_restricted_log() {
        assert!(matches!(
            parse_stdout_line("plain runner output"),
            ParsedStdoutLine::Log(_)
        ));
    }

    #[test]
    fn rejects_illegal_json_event() {
        assert!(matches!(
            parse_stdout_line(r#"{"type":"unknown"}"#),
            ParsedStdoutLine::InvalidEvent
        ));
    }

    #[test]
    fn rejects_missing_development_runner() {
        let missing = std::env::temp_dir().join("framecheck-runner-does-not-exist.exe");
        assert!(matches!(
            RunnerConfig::from_development_path(missing),
            Err(RunnerConfigError::MissingExecutable)
        ));
    }

    #[tokio::test]
    async fn fake_runner_stops_after_cancellation() {
        let cancellation = CancellationToken::new();
        let runner_cancellation = cancellation.clone();
        let fake_runner = tokio::spawn(async move {
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(60)) => "completed",
                _ = runner_cancellation.cancelled() => "cancelled",
            }
        });
        cancellation.cancel();
        assert_eq!(fake_runner.await.expect("fake runner task"), "cancelled");
    }
}
