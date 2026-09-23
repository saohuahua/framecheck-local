use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use thiserror::Error;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::{
    artifacts::{ArtifactRegistry, PublicArtifact},
    runner::{
        parse_stdout_line, sanitize_log, spawn_runner, LogStream, ParsedStdoutLine, ProcessOutput,
        RunnerArtifact, RunnerConfig, RunnerEvent, StartJobRequest,
    },
};

pub const DESKTOP_JOB_EVENT: &str = "desktop-job-event";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
    Cancelled,
}

impl JobStatus {
    fn is_terminal(self) -> bool {
        matches!(self, Self::Succeeded | Self::Failed | Self::Cancelled)
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopFailure {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "lowercase", rename_all_fields = "camelCase")]
pub enum DesktopJobEvent {
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
        stream: String,
        message: String,
    },
    Warning {
        code: String,
        message: String,
    },
    Artifact {
        artifact_id: String,
        kind: String,
        label: String,
    },
    Completed {
        task_id: String,
        output_dir: String,
        artifacts: Vec<PublicArtifact>,
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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopJob {
    pub job_id: String,
    pub status: JobStatus,
    pub request: StartJobRequest,
    pub created_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_name: Option<String>,
    pub events: Vec<DesktopJobEvent>,
    pub artifacts: Vec<PublicArtifact>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure: Option<DesktopFailure>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartJobResponse {
    pub job_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedBundleResponse {
    pub name: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Error)]
pub enum DesktopError {
    #[error("任务请求无效")]
    InvalidRequest,
    #[error("任务不存在")]
    JobNotFound,
    #[error("任务状态不允许此操作")]
    InvalidJobState,
    #[error("runner 事件无效")]
    InvalidRunnerEvent,
    #[error("当前任务没有可读取的 Bundle")]
    BundleUnavailable,
    #[error("未压缩 Bundle 无法生成")]
    BundleUnpackFailed,
    #[error("输出目录不可用")]
    OutputUnavailable,
    #[error("任务 staging 无法创建")]
    StagingFailed,
}

impl DesktopError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidRequest => "invalid-request",
            Self::JobNotFound => "job-not-found",
            Self::InvalidJobState => "invalid-job-state",
            Self::InvalidRunnerEvent => "invalid-runner-event",
            Self::BundleUnavailable => "bundle-unavailable",
            Self::BundleUnpackFailed => "bundle-unpack-failed",
            Self::OutputUnavailable => "output-unavailable",
            Self::StagingFailed => "staging-failed",
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

impl From<DesktopError> for CommandError {
    fn from(error: DesktopError) -> Self {
        Self {
            code: error.code().to_string(),
            message: error.to_string(),
        }
    }
}

#[derive(Clone)]
pub struct ValidatedRequest {
    pub request: StartJobRequest,
    source_path: PathBuf,
    output_dir: PathBuf,
}

struct ManagedJob {
    snapshot: DesktopJob,
    source_path: PathBuf,
    output_dir: PathBuf,
    artifacts: ArtifactRegistry,
    received_started: bool,
    cancellation: CancellationToken,
}

#[derive(Clone, Default)]
pub struct JobManager {
    jobs: Arc<Mutex<HashMap<String, ManagedJob>>>,
}

pub fn validate_start_request(request: StartJobRequest) -> Result<ValidatedRequest, DesktopError> {
    if request.protocol_version != "1" || Uuid::parse_str(&request.task_id).is_err() {
        return Err(DesktopError::InvalidRequest);
    }
    let source_path = canonical_file(&request.source_path)?;
    let extension = source_path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase);
    if !matches!(extension.as_deref(), Some("psd") | Some("psb")) {
        return Err(DesktopError::InvalidRequest);
    }
    let output_dir = canonical_directory(&request.output_dir)?;
    if request.deliverables.is_empty() || request.deliverables.len() > 2 {
        return Err(DesktopError::InvalidRequest);
    }
    let mut deliverables = HashSet::new();
    for deliverable in &request.deliverables {
        if !matches!(deliverable.as_str(), "delivery" | "html") || !deliverables.insert(deliverable) {
            return Err(DesktopError::InvalidRequest);
        }
    }
    if request.scales.is_empty()
        || request.scales.len() > 4
        || request.scales.iter().any(|scale| !(1..=4).contains(scale))
    {
        return Err(DesktopError::InvalidRequest);
    }
    let mut scales = HashSet::new();
    if request.scales.iter().any(|scale| !scales.insert(scale)) {
        return Err(DesktopError::InvalidRequest);
    }
    if !(1..=100).contains(&request.token_top) || !safe_css_style(&request.css_style) {
        return Err(DesktopError::InvalidRequest);
    }
    let mut normalized = request;
    normalized.source_path = source_path.to_string_lossy().into_owned();
    normalized.output_dir = output_dir.to_string_lossy().into_owned();
    Ok(ValidatedRequest {
        request: normalized,
        source_path,
        output_dir,
    })
}

impl JobManager {
    pub async fn create_job(&self, validated: ValidatedRequest) -> Result<String, DesktopError> {
        let job_id = validated.request.task_id.clone();
        let mut jobs = self.jobs.lock().await;
        if jobs.contains_key(&job_id) {
            return Err(DesktopError::InvalidRequest);
        }
        let snapshot = DesktopJob {
            job_id: job_id.clone(),
            status: JobStatus::Queued,
            request: validated.request,
            created_at: now_millis(),
            started_at: None,
            finished_at: None,
            source_name: None,
            events: Vec::new(),
            artifacts: Vec::new(),
            failure: None,
        };
        jobs.insert(
            job_id.clone(),
            ManagedJob {
                snapshot,
                source_path: validated.source_path,
                output_dir: validated.output_dir,
                artifacts: ArtifactRegistry::default(),
                received_started: false,
                cancellation: CancellationToken::new(),
            },
        );
        Ok(job_id)
    }

    pub async fn get_job(&self, job_id: &str) -> Result<DesktopJob, DesktopError> {
        let jobs = self.jobs.lock().await;
        jobs.get(job_id)
            .map(|job| job.snapshot.clone())
            .ok_or(DesktopError::JobNotFound)
    }

    pub async fn list_recent(&self) -> Vec<DesktopJob> {
        let jobs = self.jobs.lock().await;
        let mut result = jobs
            .values()
            .map(|job| job.snapshot.clone())
            .collect::<Vec<_>>();
        result.sort_by(|left, right| right.created_at.cmp(&left.created_at));
        result
    }

    pub async fn cancel(&self, job_id: &str) -> Result<(), DesktopError> {
        let jobs = self.jobs.lock().await;
        let job = jobs.get(job_id).ok_or(DesktopError::JobNotFound)?;
        if job.snapshot.status.is_terminal() {
            return Err(DesktopError::InvalidJobState);
        }
        job.cancellation.cancel();
        Ok(())
    }

    pub async fn mark_running(&self, job_id: &str) -> Result<(), DesktopError> {
        let mut jobs = self.jobs.lock().await;
        let job = jobs.get_mut(job_id).ok_or(DesktopError::JobNotFound)?;
        if job.snapshot.status != JobStatus::Queued {
            return Err(DesktopError::InvalidJobState);
        }
        job.snapshot.status = JobStatus::Running;
        job.snapshot.started_at = Some(now_millis());
        Ok(())
    }

    pub async fn cancellation(&self, job_id: &str) -> Result<CancellationToken, DesktopError> {
        let jobs = self.jobs.lock().await;
        jobs.get(job_id)
            .map(|job| job.cancellation.clone())
            .ok_or(DesktopError::JobNotFound)
    }

    pub async fn append_log(&self, job_id: &str, stream: &str, message: String) -> Option<DesktopJobEvent> {
        let mut jobs = self.jobs.lock().await;
        let job = jobs.get_mut(job_id)?;
        if job.snapshot.status.is_terminal() {
            return None;
        }
        let event = DesktopJobEvent::Log {
            stream: stream.to_string(),
            message: sanitize_log(&message),
        };
        job.snapshot.events.push(event.clone());
        Some(event)
    }

    pub async fn apply_runner_event(
        &self,
        job_id: &str,
        runner_event: RunnerEvent,
    ) -> Result<Option<DesktopJobEvent>, DesktopError> {
        let mut jobs = self.jobs.lock().await;
        let job = jobs.get_mut(job_id).ok_or(DesktopError::JobNotFound)?;
        if job.snapshot.status.is_terminal() {
            return Ok(None);
        }
        if job.cancellation.is_cancelled() {
            return Ok(None);
        }
        if job.snapshot.status != JobStatus::Running {
            return Err(DesktopError::InvalidRunnerEvent);
        }
        let event = match runner_event {
            RunnerEvent::Started {
                task_id,
                total,
                source_name,
            } => {
                if job.received_started
                    || task_id != job.snapshot.job_id
                    || total == 0
                    || source_name != source_name_for(&job.source_path)
                {
                    return Err(DesktopError::InvalidRunnerEvent);
                }
                job.received_started = true;
                job.snapshot.source_name = Some(source_name.clone());
                DesktopJobEvent::Started {
                    task_id,
                    total,
                    source_name,
                }
            }
            RunnerEvent::Stage {
                key,
                label,
                current,
                total,
            } => {
                if !job.received_started
                    || !safe_event_field(&key)
                    || !safe_event_field(&label)
                    || total == 0
                    || current > total
                {
                    return Err(DesktopError::InvalidRunnerEvent);
                }
                DesktopJobEvent::Stage {
                    key,
                    label,
                    current,
                    total,
                }
            }
            RunnerEvent::Log { stream, message } => {
                let stream = match stream {
                    LogStream::Stdout => "stdout",
                    LogStream::Stderr => "stderr",
                };
                DesktopJobEvent::Log {
                    stream: stream.to_string(),
                    message: sanitize_log(&message),
                }
            }
            RunnerEvent::Warning { code, message } => {
                if !safe_event_field(&code) || message.is_empty() {
                    return Err(DesktopError::InvalidRunnerEvent);
                }
                DesktopJobEvent::Warning {
                    code,
                    message: sanitize_log(&message),
                }
            }
            RunnerEvent::Artifact {
                artifact_id,
                kind,
                path,
                label,
            } => {
                if !job.received_started {
                    return Err(DesktopError::InvalidRunnerEvent);
                }
                let mut registry = job.artifacts.clone();
                let public = registry
                    .register(
                        RunnerArtifact {
                            artifact_id,
                            kind,
                            path,
                            label,
                        },
                        &job.output_dir,
                    )
                    .map_err(|_| DesktopError::InvalidRunnerEvent)?;
                job.artifacts = registry;
                job.snapshot.artifacts = job.artifacts.public_artifacts();
                DesktopJobEvent::Artifact {
                    artifact_id: public.artifact_id,
                    kind: public.kind,
                    label: public.label,
                }
            }
            RunnerEvent::Completed {
                task_id,
                output_dir,
                artifacts,
            } => {
                if !job.received_started
                    || task_id != job.snapshot.job_id
                    || !same_output_dir(&output_dir, &job.output_dir)
                {
                    return Err(DesktopError::InvalidRunnerEvent);
                }
                let mut registry = job.artifacts.clone();
                for artifact in artifacts {
                    registry
                        .register(artifact, &job.output_dir)
                        .map_err(|_| DesktopError::InvalidRunnerEvent)?;
                }
                let includes_bundle = job
                    .snapshot
                    .request
                    .deliverables
                    .iter()
                    .any(|deliverable| deliverable == "delivery");
                if includes_bundle && registry.generated_bundle().is_err() {
                    return Err(DesktopError::InvalidRunnerEvent);
                }
                if includes_bundle && !job.snapshot.request.bundle_compressed {
                    registry
                        .unpack_generated_bundle()
                        .map_err(|_| DesktopError::BundleUnpackFailed)?;
                }
                job.artifacts = registry;
                job.snapshot.artifacts = job.artifacts.public_artifacts();
                job.snapshot.status = JobStatus::Succeeded;
                job.snapshot.finished_at = Some(now_millis());
                DesktopJobEvent::Completed {
                    task_id,
                    output_dir: job.snapshot.request.output_dir.clone(),
                    artifacts: job.snapshot.artifacts.clone(),
                }
            }
            RunnerEvent::Failed {
                task_id,
                code,
                message,
                stage,
            } => {
                if task_id != job.snapshot.job_id
                    || !safe_event_field(&code)
                    || !safe_event_field(&stage)
                    || message.is_empty()
                {
                    return Err(DesktopError::InvalidRunnerEvent);
                }
                let message = sanitize_log(&message);
                job.snapshot.status = JobStatus::Failed;
                job.snapshot.finished_at = Some(now_millis());
                job.snapshot.failure = Some(DesktopFailure {
                    code: code.clone(),
                    message: message.clone(),
                    stage: Some(stage.clone()),
                });
                DesktopJobEvent::Failed {
                    task_id,
                    code,
                    message,
                    stage,
                }
            }
            RunnerEvent::Cancelled { task_id } => {
                if task_id != job.snapshot.job_id {
                    return Err(DesktopError::InvalidRunnerEvent);
                }
                job.snapshot.status = JobStatus::Cancelled;
                job.snapshot.finished_at = Some(now_millis());
                DesktopJobEvent::Cancelled { task_id }
            }
        };
        job.snapshot.events.push(event.clone());
        Ok(Some(event))
    }

    pub async fn fail(
        &self,
        job_id: &str,
        code: &str,
        message: &str,
        stage: &str,
    ) -> Option<DesktopJobEvent> {
        let mut jobs = self.jobs.lock().await;
        let job = jobs.get_mut(job_id)?;
        if matches!(job.snapshot.status, JobStatus::Failed | JobStatus::Cancelled) {
            return None;
        }
        let event = DesktopJobEvent::Failed {
            task_id: job.snapshot.job_id.clone(),
            code: code.to_string(),
            message: message.to_string(),
            stage: stage.to_string(),
        };
        job.snapshot.status = JobStatus::Failed;
        job.snapshot.finished_at = Some(now_millis());
        job.snapshot.failure = Some(DesktopFailure {
            code: code.to_string(),
            message: message.to_string(),
            stage: Some(stage.to_string()),
        });
        job.snapshot.events.push(event.clone());
        Some(event)
    }

    pub async fn mark_cancelled(&self, job_id: &str) -> Option<DesktopJobEvent> {
        let mut jobs = self.jobs.lock().await;
        let job = jobs.get_mut(job_id)?;
        if job.snapshot.status.is_terminal() {
            return None;
        }
        let event = DesktopJobEvent::Cancelled {
            task_id: job.snapshot.job_id.clone(),
        };
        job.snapshot.status = JobStatus::Cancelled;
        job.snapshot.finished_at = Some(now_millis());
        job.snapshot.events.push(event.clone());
        Some(event)
    }

    pub async fn is_succeeded(&self, job_id: &str) -> bool {
        let jobs = self.jobs.lock().await;
        matches!(jobs.get(job_id), Some(job) if job.snapshot.status == JobStatus::Succeeded)
    }

    pub async fn read_generated_bundle(
        &self,
        job_id: &str,
    ) -> Result<GeneratedBundleResponse, DesktopError> {
        let bundle = {
            let jobs = self.jobs.lock().await;
            let job = jobs.get(job_id).ok_or(DesktopError::JobNotFound)?;
            if job.snapshot.status != JobStatus::Succeeded {
                return Err(DesktopError::BundleUnavailable);
            }
            job.artifacts
                .generated_bundle()
                .map_err(|_| DesktopError::BundleUnavailable)?
        };
        let (name, bytes) = bundle.read().map_err(|_| DesktopError::BundleUnavailable)?;
        Ok(GeneratedBundleResponse { name, bytes })
    }

    pub async fn output_directory(&self, job_id: &str) -> Result<PathBuf, DesktopError> {
        let output_dir = {
            let jobs = self.jobs.lock().await;
            let job = jobs.get(job_id).ok_or(DesktopError::JobNotFound)?;
            if job.snapshot.status != JobStatus::Succeeded {
                return Err(DesktopError::OutputUnavailable);
            }
            job.output_dir.clone()
        };
        let output_dir = fs::canonicalize(output_dir).map_err(|_| DesktopError::OutputUnavailable)?;
        if output_dir.is_dir() {
            Ok(output_dir)
        } else {
            Err(DesktopError::OutputUnavailable)
        }
    }
}

pub async fn execute_job(
    manager: JobManager,
    app: AppHandle,
    runner: RunnerConfig,
    validated: ValidatedRequest,
) {
    let job_id = validated.request.task_id.clone();
    if manager.mark_running(&job_id).await.is_err() {
        return;
    }
    let staging = match prepare_request_file(&validated) {
        Ok(staging) => staging,
        Err(_) => {
            emit_failure(&manager, &app, &job_id, "staging-failed", "任务 staging 无法创建", "native").await;
            return;
        }
    };
    let request_file = staging.join("request.json");
    let cancellation = match manager.cancellation(&job_id).await {
        Ok(cancellation) => cancellation,
        Err(_) => {
            cleanup_staging(&staging);
            return;
        }
    };
    let spawned = match spawn_runner(&runner, &request_file) {
        Ok(spawned) => spawned,
        Err(_) => {
            cleanup_staging(&staging);
            emit_failure(&manager, &app, &job_id, "runner-start-failed", "runner 无法启动", "native").await;
            return;
        }
    };
    let mut child = spawned.child;
    let process_cancellation = cancellation.clone();
    let mut process_exit = tokio::spawn(async move {
        tokio::select! {
            result = child.wait() => result.map(|status| status.success()).unwrap_or(false),
            _ = process_cancellation.cancelled() => {
                let _ = child.start_kill();
                child.wait().await.map(|status| status.success()).unwrap_or(false)
            }
        }
    });
    let mut output = spawned.output;
    let mut output_open = true;
    let mut exited_successfully = None;
    let mut processing_error = None;

    while output_open || exited_successfully.is_none() {
        tokio::select! {
            line = output.recv(), if output_open => {
                match line {
                    Some(ProcessOutput::Stdout(line)) => {
                        match parse_stdout_line(&line) {
                            ParsedStdoutLine::Event(event) => {
                                let terminal_event = matches!(&event, RunnerEvent::Failed { .. } | RunnerEvent::Cancelled { .. });
                                match manager.apply_runner_event(&job_id, event).await {
                                    Ok(Some(event)) => emit_event(&app, &event),
                                    Ok(None) => {}
                                    Err(error) => {
                                        if processing_error.is_none() {
                                            processing_error = Some(error);
                                        }
                                        cancellation.cancel();
                                    }
                                }
                                if terminal_event {
                                    cancellation.cancel();
                                }
                            }
                            ParsedStdoutLine::Log(message) => {
                                if let Some(event) = manager.append_log(&job_id, "stdout", message).await {
                                    emit_event(&app, &event);
                                }
                            }
                            ParsedStdoutLine::InvalidEvent => {
                                if processing_error.is_none() {
                                    processing_error = Some(DesktopError::InvalidRunnerEvent);
                                }
                                cancellation.cancel();
                            }
                            ParsedStdoutLine::Ignore => {}
                        }
                    }
                    Some(ProcessOutput::Stderr(line)) => {
                        if let Some(event) = manager.append_log(&job_id, "stderr", line).await {
                            emit_event(&app, &event);
                        }
                    }
                    None => output_open = false,
                }
            }
            result = &mut process_exit, if exited_successfully.is_none() => {
                exited_successfully = Some(result.unwrap_or(false));
            }
        }
    }

    cleanup_staging(&staging);
    if let Some(error) = processing_error {
        let stage = if matches!(error, DesktopError::BundleUnpackFailed) {
            "bundle"
        } else {
            "protocol"
        };
        let code = error.code();
        let message = error.to_string();
        emit_failure(&manager, &app, &job_id, code, &message, stage).await;
        return;
    }
    if cancellation.is_cancelled() {
        if let Some(event) = manager.mark_cancelled(&job_id).await {
            emit_event(&app, &event);
        }
        return;
    }
    if !exited_successfully.unwrap_or(false) {
        emit_failure(&manager, &app, &job_id, "runner-exited", "runner 异常退出", "runner").await;
        return;
    }
    if !manager.is_succeeded(&job_id).await {
        emit_failure(
            &manager,
            &app,
            &job_id,
            "runner-exited-without-completion",
            "runner 未报告任务完成",
            "protocol",
        )
        .await;
    }
}

fn prepare_request_file(validated: &ValidatedRequest) -> Result<PathBuf, DesktopError> {
    let root = validated.output_dir.join(".framecheck-staging");
    fs::create_dir_all(&root).map_err(|_| DesktopError::StagingFailed)?;
    let staging = root.join(&validated.request.task_id);
    if staging.exists() {
        return Err(DesktopError::StagingFailed);
    }
    fs::create_dir(&staging).map_err(|_| DesktopError::StagingFailed)?;
    let request_file = staging.join("request.json");
    let content = serde_json::to_vec_pretty(&crate::runner::RunnerStartJobRequest::from(&validated.request))
        .map_err(|_| DesktopError::StagingFailed)?;
    if fs::write(&request_file, content).is_err() {
        cleanup_staging(&staging);
        return Err(DesktopError::StagingFailed);
    }
    Ok(staging)
}

fn cleanup_staging(staging: &Path) {
    let _ = fs::remove_dir_all(staging);
}

async fn emit_failure(
    manager: &JobManager,
    app: &AppHandle,
    job_id: &str,
    code: &str,
    message: &str,
    stage: &str,
) {
    if let Some(event) = manager.fail(job_id, code, message, stage).await {
        emit_event(app, &event);
    }
}

pub fn emit_event(app: &AppHandle, event: &DesktopJobEvent) {
    let _ = app.emit(DESKTOP_JOB_EVENT, event);
}

fn canonical_file(value: &str) -> Result<PathBuf, DesktopError> {
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err(DesktopError::InvalidRequest);
    }
    let path = fs::canonicalize(path).map_err(|_| DesktopError::InvalidRequest)?;
    if path.is_file() {
        Ok(path)
    } else {
        Err(DesktopError::InvalidRequest)
    }
}

fn canonical_directory(value: &str) -> Result<PathBuf, DesktopError> {
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err(DesktopError::InvalidRequest);
    }
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|_| DesktopError::InvalidRequest)?;
    }
    let path = fs::canonicalize(path).map_err(|_| DesktopError::InvalidRequest)?;
    if path.is_dir() {
        Ok(path)
    } else {
        Err(DesktopError::InvalidRequest)
    }
}

fn same_output_dir(value: &str, output_dir: &Path) -> bool {
    let path = PathBuf::from(value);
    path.is_absolute() && fs::canonicalize(path).is_ok_and(|path| path.as_path() == output_dir)
}

fn source_name_for(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_string()
}

fn safe_css_style(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 32
        && value
            .chars()
            .all(|character| character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-')
}

fn safe_event_field(value: &str) -> bool {
    !value.is_empty() && value.len() <= 128 && !value.chars().any(char::is_control)
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use std::{fs, io::Write};

    use uuid::Uuid;
    use zip::{write::SimpleFileOptions, ZipWriter};

    use super::{
        validate_start_request, DesktopError, JobManager, JobStatus, RunnerArtifact, RunnerEvent,
        StartJobRequest,
    };

    fn fixture() -> (std::path::PathBuf, std::path::PathBuf, std::path::PathBuf) {
        let root = std::env::temp_dir().join(format!("framecheck-jobs-{}", Uuid::new_v4()));
        let output = root.join("output");
        fs::create_dir_all(&output).expect("output directory");
        let source = root.join("home.psd");
        fs::write(&source, "psd").expect("source file");
        (root, source, output)
    }

    fn request(source: &std::path::Path, output: &std::path::Path) -> StartJobRequest {
        StartJobRequest {
            protocol_version: "1".to_string(),
            task_id: Uuid::new_v4().to_string(),
            source_path: source.to_string_lossy().into_owned(),
            output_dir: output.to_string_lossy().into_owned(),
            deliverables: vec!["delivery".to_string()],
            bundle_compressed: true,
            scales: vec![1, 2],
            token_top: 30,
            css_style: "compact".to_string(),
            css_pretty_enabled: true,
            smart_merge_enabled: true,
            image_layer_flatten_enabled: false,
            nested_suppression_enabled: true,
        }
    }

    fn write_bundle_archive(path: &std::path::Path) {
        let file = fs::File::create(path).expect("bundle archive");
        let mut archive = ZipWriter::new(file);
        archive
            .start_file("bundle.json", SimpleFileOptions::default())
            .expect("bundle entry");
        archive
            .write_all(br#"{"kind":"psd-design-bundle"}"#)
            .expect("bundle content");
        archive.finish().expect("bundle finish");
    }

    #[test]
    fn rejects_unknown_deliverable() {
        let (root, source, output) = fixture();
        let mut request = request(&source, &output);
        request.deliverables = vec!["shell".to_string()];
        assert!(matches!(validate_start_request(request), Err(DesktopError::InvalidRequest)));
        fs::remove_dir_all(root).expect("cleanup root");
    }

    #[test]
    fn creates_missing_output_directory() {
        let root = std::env::temp_dir().join(format!("framecheck-jobs-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("root directory");
        let source = root.join("home.psd");
        fs::write(&source, "psd").expect("source file");
        let output = root.join("new-output");

        let validated = validate_start_request(request(&source, &output)).expect("valid request");

        assert!(validated.output_dir.is_dir());
        fs::remove_dir_all(root).expect("cleanup root");
    }

    #[tokio::test]
    async fn illegal_stage_event_does_not_change_job_state() {
        let (root, source, output) = fixture();
        let validated = validate_start_request(request(&source, &output)).expect("valid request");
        let job_id = validated.request.task_id.clone();
        let manager = JobManager::default();
        manager.create_job(validated).await.expect("job");
        manager.mark_running(&job_id).await.expect("running job");

        assert!(matches!(
            manager
                .apply_runner_event(
                    &job_id,
                    RunnerEvent::Stage {
                        key: "delivery".to_string(),
                        label: "delivery".to_string(),
                        current: 1,
                        total: 1,
                    },
                )
                .await,
            Err(DesktopError::InvalidRunnerEvent)
        ));
        assert_eq!(manager.get_job(&job_id).await.expect("job state").status, JobStatus::Running);
        fs::remove_dir_all(root).expect("cleanup root");
    }

    #[tokio::test]
    async fn generated_bundle_requires_existing_completed_job() {
        let manager = JobManager::default();
        assert!(matches!(
            manager.read_generated_bundle("missing").await,
            Err(DesktopError::JobNotFound)
        ));
    }

    #[tokio::test]
    async fn fake_runner_registers_bundle_for_its_current_job() {
        let (root, source, output) = fixture();
        let validated = validate_start_request(request(&source, &output)).expect("valid request");
        let job_id = validated.request.task_id.clone();
        let output_dir = validated.request.output_dir.clone();
        let manager = JobManager::default();
        manager.create_job(validated).await.expect("job");
        manager.mark_running(&job_id).await.expect("running job");
        manager
            .apply_runner_event(
                &job_id,
                RunnerEvent::Started {
                    task_id: job_id.clone(),
                    total: 2,
                    source_name: "home.psd".to_string(),
                },
            )
            .await
            .expect("started event");
        let bundle = output.join("home.psd-bundle.zip");
        fs::write(&bundle, "bundle").expect("bundle file");
        manager
            .apply_runner_event(
                &job_id,
                RunnerEvent::Artifact {
                    artifact_id: "bundle".to_string(),
                    kind: "bundle".to_string(),
                    path: bundle.to_string_lossy().into_owned(),
                    label: "home.psd-bundle.zip".to_string(),
                },
            )
            .await
            .expect("artifact event");
        manager
            .apply_runner_event(
                &job_id,
                RunnerEvent::Completed {
                    task_id: job_id.clone(),
                    output_dir,
                    artifacts: Vec::<RunnerArtifact>::new(),
                },
            )
            .await
            .expect("completed event");

        let generated = manager.read_generated_bundle(&job_id).await.expect("generated bundle");

        assert_eq!(generated.name, "home.psd-bundle.zip");
        assert_eq!(generated.bytes, b"bundle".to_vec());
        assert_eq!(manager.get_job(&job_id).await.expect("job state").status, JobStatus::Succeeded);
        manager
            .fail(&job_id, "runner-exited", "runner exited after completion", "runner")
            .await
            .expect("runner failure");
        assert_eq!(manager.get_job(&job_id).await.expect("failed state").status, JobStatus::Failed);
        fs::remove_dir_all(root).expect("cleanup root");
    }

    #[tokio::test]
    async fn uncompressed_job_registers_bundle_directory() {
        let (root, source, output) = fixture();
        let mut request = request(&source, &output);
        request.bundle_compressed = false;
        let validated = validate_start_request(request).expect("valid request");
        let job_id = validated.request.task_id.clone();
        let output_dir = validated.request.output_dir.clone();
        let manager = JobManager::default();
        manager.create_job(validated).await.expect("job");
        manager.mark_running(&job_id).await.expect("running job");
        manager
            .apply_runner_event(
                &job_id,
                RunnerEvent::Started {
                    task_id: job_id.clone(),
                    total: 2,
                    source_name: "home.psd".to_string(),
                },
            )
            .await
            .expect("started event");
        let bundle = output.join("home.psd-bundle.zip");
        write_bundle_archive(&bundle);
        manager
            .apply_runner_event(
                &job_id,
                RunnerEvent::Artifact {
                    artifact_id: "bundle".to_string(),
                    kind: "bundle".to_string(),
                    path: bundle.to_string_lossy().into_owned(),
                    label: "home.psd-bundle.zip".to_string(),
                },
            )
            .await
            .expect("artifact event");
        manager
            .apply_runner_event(
                &job_id,
                RunnerEvent::Completed {
                    task_id: job_id.clone(),
                    output_dir,
                    artifacts: Vec::<RunnerArtifact>::new(),
                },
            )
            .await
            .expect("completed event");

        let job = manager.get_job(&job_id).await.expect("completed job");

        assert_eq!(job.artifacts[0].kind, "bundle-directory");
        assert!(output.join("home.psd-bundle").is_dir());
        assert!(bundle.exists());
        assert!(matches!(
            manager.read_generated_bundle(&job_id).await,
            Err(DesktopError::BundleUnavailable)
        ));
        fs::remove_dir_all(root).expect("cleanup root");
    }
}
