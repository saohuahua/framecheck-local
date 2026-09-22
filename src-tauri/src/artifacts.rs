use std::{
    collections::HashSet,
    fs::{self, File},
    io::{self, Read, Write},
    path::{Path, PathBuf},
};

use serde::Serialize;
use thiserror::Error;
use uuid::Uuid;
use zip::ZipArchive;

use crate::runner::RunnerArtifact;

const MAX_GENERATED_BUNDLE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_UNCOMPRESSED_BUNDLE_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicArtifact {
    pub artifact_id: String,
    pub kind: String,
    pub label: String,
}

#[derive(Clone, Debug)]
struct RegisteredArtifact {
    public: PublicArtifact,
    path: PathBuf,
    output_dir: PathBuf,
}

#[derive(Clone, Debug, Default)]
pub struct ArtifactRegistry {
    artifacts: Vec<RegisteredArtifact>,
}

#[derive(Clone, Debug)]
pub struct GeneratedBundle {
    path: PathBuf,
    output_dir: PathBuf,
    name: String,
}

#[derive(Debug, Error)]
pub enum ArtifactError {
    #[error("runner 工件字段无效")]
    InvalidArtifact,
    #[error("runner 工件不在当前任务输出目录中")]
    UnsafeArtifact,
    #[error("runner 工件文件不可用")]
    MissingArtifact,
    #[error("runner 重复登记了不同工件")]
    ConflictingArtifact,
    #[error("任务没有登记可读取的 Bundle")]
    MissingBundle,
    #[error("生成的 Bundle 超过读取上限")]
    BundleTooLarge,
    #[error("未压缩 Bundle 无法生成")]
    BundleUnpackFailed,
}

impl ArtifactRegistry {
    pub fn register(
        &mut self,
        artifact: RunnerArtifact,
        output_dir: &PathBuf,
    ) -> Result<PublicArtifact, ArtifactError> {
        if !safe_identifier(&artifact.artifact_id)
            || !safe_identifier(&artifact.kind)
            || !safe_label(&artifact.label)
        {
            return Err(ArtifactError::InvalidArtifact);
        }
        let reported_path = PathBuf::from(&artifact.path);
        if !reported_path.is_absolute() {
            return Err(ArtifactError::UnsafeArtifact);
        }
        let output_dir = fs::canonicalize(output_dir).map_err(|_| ArtifactError::UnsafeArtifact)?;
        let path = fs::canonicalize(reported_path).map_err(|_| ArtifactError::MissingArtifact)?;
        if !path.is_file() {
            return Err(ArtifactError::MissingArtifact);
        }
        if !path.starts_with(&output_dir) {
            return Err(ArtifactError::UnsafeArtifact);
        }
        let public = PublicArtifact {
            artifact_id: artifact.artifact_id,
            kind: artifact.kind,
            label: artifact.label,
        };
        if let Some(existing) = self
            .artifacts
            .iter()
            .find(|registered| registered.public.artifact_id == public.artifact_id)
        {
            if existing.public == public && existing.path == path {
                return Ok(existing.public.clone());
            }
            return Err(ArtifactError::ConflictingArtifact);
        }
        self.artifacts.push(RegisteredArtifact {
            public: public.clone(),
            path,
            output_dir,
        });
        Ok(public)
    }

    pub fn public_artifacts(&self) -> Vec<PublicArtifact> {
        self.artifacts
            .iter()
            .map(|artifact| artifact.public.clone())
            .collect()
    }

    pub fn generated_bundle(&self) -> Result<GeneratedBundle, ArtifactError> {
        let artifact = self.artifacts.iter().rev().find(|artifact| {
            artifact.public.kind == "bundle"
                && artifact
                    .path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.ends_with(".psd-bundle.zip"))
        });
        let artifact = artifact.ok_or(ArtifactError::MissingBundle)?;
        let name = artifact
            .path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or(ArtifactError::MissingBundle)?
            .to_string();
        Ok(GeneratedBundle {
            path: artifact.path.clone(),
            output_dir: artifact.output_dir.clone(),
            name,
        })
    }

    pub fn unpack_generated_bundle(&mut self) -> Result<PublicArtifact, ArtifactError> {
        let index = self
            .artifacts
            .iter()
            .rposition(is_generated_bundle)
            .ok_or(ArtifactError::MissingBundle)?;
        let registered = self.artifacts[index].clone();
        let output_dir = fs::canonicalize(&registered.output_dir).map_err(|_| ArtifactError::UnsafeArtifact)?;
        let bundle_path = fs::canonicalize(&registered.path).map_err(|_| ArtifactError::MissingArtifact)?;
        if !bundle_path.starts_with(&output_dir) || !bundle_path.is_file() {
            return Err(ArtifactError::UnsafeArtifact);
        }
        let directory_name = bundle_directory_name(&bundle_path)?;
        let destination = available_bundle_directory(&output_dir, &directory_name)?;
        let staging = create_unpack_staging(&output_dir)?;

        // 先解压到任务私有暂存目录
        if unpack_archive(&bundle_path, &staging).is_err() {
            cleanup_directory(&staging);
            return Err(ArtifactError::BundleUnpackFailed);
        }
        if fs::rename(&staging, &destination).is_err() {
            cleanup_directory(&staging);
            return Err(ArtifactError::BundleUnpackFailed);
        }

        let public = PublicArtifact {
            artifact_id: registered.public.artifact_id,
            kind: "bundle-directory".to_string(),
            label: directory_name,
        };
        self.artifacts[index] = RegisteredArtifact {
            public: public.clone(),
            path: destination,
            output_dir,
        };
        Ok(public)
    }
}

impl GeneratedBundle {
    pub fn read(self) -> Result<(String, Vec<u8>), ArtifactError> {
        let output_dir = fs::canonicalize(&self.output_dir).map_err(|_| ArtifactError::UnsafeArtifact)?;
        let path = fs::canonicalize(&self.path).map_err(|_| ArtifactError::MissingArtifact)?;
        if !path.starts_with(output_dir) || !path.is_file() {
            return Err(ArtifactError::UnsafeArtifact);
        }
        let metadata = fs::metadata(&path).map_err(|_| ArtifactError::MissingArtifact)?;
        if metadata.len() > MAX_GENERATED_BUNDLE_BYTES {
            return Err(ArtifactError::BundleTooLarge);
        }
        let bytes = fs::read(path).map_err(|_| ArtifactError::MissingArtifact)?;
        Ok((self.name, bytes))
    }
}

fn is_generated_bundle(artifact: &RegisteredArtifact) -> bool {
    artifact.public.kind == "bundle"
        && artifact
            .path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.ends_with(".psd-bundle.zip"))
}

fn bundle_directory_name(path: &Path) -> Result<String, ArtifactError> {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .and_then(|value| value.strip_suffix(".zip"))
        .filter(|value| safe_label(value))
        .ok_or(ArtifactError::MissingBundle)?;
    Ok(name.to_string())
}

fn available_bundle_directory(output_dir: &Path, name: &str) -> Result<PathBuf, ArtifactError> {
    for index in 1..=999 {
        let candidate_name = if index == 1 {
            name.to_string()
        } else {
            format!("{name}-{index}")
        };
        let candidate = output_dir.join(candidate_name);
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err(ArtifactError::BundleUnpackFailed)
}

fn create_unpack_staging(output_dir: &Path) -> Result<PathBuf, ArtifactError> {
    for _ in 0..3 {
        let staging = output_dir.join(format!(".framecheck-unpack-{}", Uuid::new_v4()));
        match fs::create_dir(&staging) {
            Ok(()) => return Ok(staging),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err(ArtifactError::BundleUnpackFailed),
        }
    }
    Err(ArtifactError::BundleUnpackFailed)
}

fn unpack_archive(path: &Path, staging: &Path) -> Result<(), ArtifactError> {
    let file = File::open(path).map_err(|_| ArtifactError::BundleUnpackFailed)?;
    let mut archive = ZipArchive::new(file).map_err(|_| ArtifactError::BundleUnpackFailed)?;
    let mut total_size = 0_u64;
    let mut paths = HashSet::new();
    let mut buffer = [0_u8; 64 * 1024];

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|_| ArtifactError::BundleUnpackFailed)?;
        let entry_path = entry
            .enclosed_name()
            .ok_or(ArtifactError::BundleUnpackFailed)?;
        let path_key = entry_path.to_string_lossy().replace('\\', "/").to_lowercase();
        if !paths.insert(path_key) {
            return Err(ArtifactError::BundleUnpackFailed);
        }
        let target = staging.join(&entry_path);
        if !target.starts_with(staging) {
            return Err(ArtifactError::BundleUnpackFailed);
        }
        if entry.is_dir() {
            fs::create_dir_all(&target).map_err(|_| ArtifactError::BundleUnpackFailed)?;
            continue;
        }
        let parent = target.parent().ok_or(ArtifactError::BundleUnpackFailed)?;
        fs::create_dir_all(parent).map_err(|_| ArtifactError::BundleUnpackFailed)?;
        let mut output = File::create(&target).map_err(|_| ArtifactError::BundleUnpackFailed)?;
        loop {
            let bytes_read = entry
                .read(&mut buffer)
                .map_err(|_| ArtifactError::BundleUnpackFailed)?;
            if bytes_read == 0 {
                break;
            }
            total_size = total_size
                .checked_add(bytes_read as u64)
                .filter(|size| *size <= MAX_UNCOMPRESSED_BUNDLE_BYTES)
                .ok_or(ArtifactError::BundleUnpackFailed)?;
            output
                .write_all(&buffer[..bytes_read])
                .map_err(|_| ArtifactError::BundleUnpackFailed)?;
        }
    }
    Ok(())
}

fn cleanup_directory(path: &Path) {
    let _ = fs::remove_dir_all(path);
}

fn safe_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
}

fn safe_label(value: &str) -> bool {
    !value.is_empty() && value.len() <= 256 && !value.chars().any(char::is_control)
}

#[cfg(test)]
mod tests {
    use std::{fs, io::Write};

    use uuid::Uuid;
    use zip::{write::SimpleFileOptions, ZipWriter};

    use super::{ArtifactRegistry, RunnerArtifact};

    fn output_directory() -> std::path::PathBuf {
        let output = std::env::temp_dir().join(format!("framecheck-artifacts-{}", Uuid::new_v4()));
        fs::create_dir_all(&output).expect("output directory");
        output
    }

    fn write_bundle_archive(path: &std::path::Path) {
        let file = fs::File::create(path).expect("bundle archive");
        let mut archive = ZipWriter::new(file);
        archive
            .start_file("bundle.json", SimpleFileOptions::default())
            .expect("bundle entry");
        archive.write_all(br#"{"kind":"psd-design-bundle"}"#).expect("bundle content");
        archive.finish().expect("bundle finish");
    }

    #[test]
    fn only_registers_bundle_inside_current_output() {
        let output = output_directory();
        let bundle = output.join("home.psd-bundle.zip");
        fs::write(&bundle, "bundle").expect("bundle file");
        let mut registry = ArtifactRegistry::default();
        registry
            .register(
                RunnerArtifact {
                    artifact_id: "bundle".to_string(),
                    kind: "bundle".to_string(),
                    path: bundle.to_string_lossy().into_owned(),
                    label: "home.psd-bundle.zip".to_string(),
                },
                &output,
            )
            .expect("registered bundle");
        let (name, bytes) = registry.generated_bundle().expect("generated bundle").read().expect("bundle bytes");

        assert_eq!(name, "home.psd-bundle.zip");
        assert_eq!(bytes, b"bundle".to_vec());
        fs::remove_dir_all(output).expect("cleanup output");
    }

    #[test]
    fn rejects_artifact_outside_current_output() {
        let output = output_directory();
        let outside = std::env::temp_dir().join(format!("framecheck-outside-{}.zip", Uuid::new_v4()));
        fs::write(&outside, "bundle").expect("outside file");
        let mut registry = ArtifactRegistry::default();

        assert!(registry
            .register(
                RunnerArtifact {
                    artifact_id: "bundle".to_string(),
                    kind: "bundle".to_string(),
                    path: outside.to_string_lossy().into_owned(),
                    label: "outside.psd-bundle.zip".to_string(),
                },
                &output,
            )
            .is_err());

        fs::remove_file(outside).expect("cleanup outside");
        fs::remove_dir_all(output).expect("cleanup output");
    }

    #[test]
    fn expands_bundle_into_directory_without_removing_zip_backup() {
        let output = output_directory();
        let bundle = output.join("home.psd-bundle.zip");
        write_bundle_archive(&bundle);
        let mut registry = ArtifactRegistry::default();
        registry
            .register(
                RunnerArtifact {
                    artifact_id: "bundle".to_string(),
                    kind: "bundle".to_string(),
                    path: bundle.to_string_lossy().into_owned(),
                    label: "home.psd-bundle.zip".to_string(),
                },
                &output,
            )
            .expect("registered bundle");

        let directory = registry.unpack_generated_bundle().expect("unpacked bundle");

        assert_eq!(directory.kind, "bundle-directory");
        assert_eq!(directory.label, "home.psd-bundle");
        assert_eq!(fs::read(output.join("home.psd-bundle").join("bundle.json")).expect("bundle file"), br#"{"kind":"psd-design-bundle"}"#);
        assert!(bundle.exists());
        assert!(registry.generated_bundle().is_err());
        fs::remove_dir_all(output).expect("cleanup output");
    }
}
