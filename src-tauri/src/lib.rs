mod artifacts;
mod jobs;
mod runner;
mod vue_export;

use std::{path::Path, process::Command};

use jobs::{
    emit_event, execute_job, validate_start_request, CommandError, GeneratedBundleResponse, JobManager,
    StartJobResponse,
};
use runner::{RunnerConfig, StartJobRequest};
use tauri::{AppHandle, State};
use vue_export::{
    vue_export_check_existing, vue_export_read_text_file, vue_export_write_files,
};

#[tauri::command]
async fn start_job(
    app: AppHandle,
    state: State<'_, JobManager>,
    request: StartJobRequest,
) -> Result<StartJobResponse, CommandError> {
    let validated = validate_start_request(request).map_err(CommandError::from)?;
    let job_id = state.create_job(validated.clone()).await.map_err(CommandError::from)?;
    match RunnerConfig::from_app(&app) {
        Ok(runner) => {
            let manager = state.inner().clone();
            tauri::async_runtime::spawn(async move {
                execute_job(manager, app, runner, validated).await;
            });
        }
        Err(_) => {
            if let Some(event) = state
                .fail(&job_id, "runner-not-found", "runner 配置或文件不可用", "native")
                .await
            {
                emit_event(&app, &event);
            }
        }
    }
    Ok(StartJobResponse { job_id })
}

#[tauri::command]
async fn cancel_job(
    state: State<'_, JobManager>,
    job_id: String,
) -> Result<(), CommandError> {
    state.cancel(&job_id).await.map_err(CommandError::from)
}

#[tauri::command]
async fn get_job(
    state: State<'_, JobManager>,
    job_id: String,
) -> Result<jobs::DesktopJob, CommandError> {
    state.get_job(&job_id).await.map_err(CommandError::from)
}

#[tauri::command]
async fn list_recent(
    state: State<'_, JobManager>,
) -> Result<Vec<jobs::DesktopJob>, CommandError> {
    Ok(state.list_recent().await)
}

#[tauri::command]
async fn read_generated_bundle(
    state: State<'_, JobManager>,
    job_id: String,
) -> Result<GeneratedBundleResponse, CommandError> {
    state
        .read_generated_bundle(&job_id)
        .await
        .map_err(CommandError::from)
}

#[tauri::command]
async fn open_output_directory(
    state: State<'_, JobManager>,
    job_id: String,
) -> Result<(), CommandError> {
    let output_dir = state
        .output_directory(&job_id)
        .await
        .map_err(CommandError::from)?;
    open_in_file_manager(&output_dir).map_err(|_| CommandError {
        code: "output-open-failed".to_string(),
        message: "无法打开输出目录".to_string(),
    })
}

#[cfg(target_os = "windows")]
fn open_in_file_manager(path: &Path) -> std::io::Result<()> {
    Command::new("explorer.exe").arg(path).spawn().map(|_| ())
}

#[cfg(target_os = "macos")]
fn open_in_file_manager(path: &Path) -> std::io::Result<()> {
    Command::new("open").arg(path).spawn().map(|_| ())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_in_file_manager(path: &Path) -> std::io::Result<()> {
    Command::new("xdg-open").arg(path).spawn().map(|_| ())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(JobManager::default())
        .invoke_handler(tauri::generate_handler![
            start_job,
            cancel_job,
            get_job,
            list_recent,
            read_generated_bundle,
            open_output_directory,
            vue_export_read_text_file,
            vue_export_check_existing,
            vue_export_write_files
        ])
        .run(tauri::generate_context!())
        .expect("Framecheck desktop application failed")
}
