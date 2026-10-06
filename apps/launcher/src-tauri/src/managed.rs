//! Managed-app version directories and updater metadata.

use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::project::read_version_from_package_json;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdaterMetadata {
    pub current_version: Option<String>,
    pub previous_versions: Vec<String>,
    pub last_known_good_version: Option<String>,
    pub update_state: String,
    pub rollback_state: String,
}

pub(crate) fn read_updater_metadata(app_data_dir: &Path) -> AppUpdaterMetadata {
    let path = app_data_dir
        .join("managed-app")
        .join("updater-metadata.json");
    if !path.exists() {
        return AppUpdaterMetadata::default();
    }
    let data = fs::read_to_string(path).unwrap_or_default();
    serde_json::from_str(&data).unwrap_or_default()
}

pub(crate) fn write_updater_metadata(
    app_data_dir: &Path,
    metadata: &AppUpdaterMetadata,
) -> Result<(), String> {
    let path = app_data_dir
        .join("managed-app")
        .join("updater-metadata.json");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let serialized = serde_json::to_string_pretty(metadata).map_err(|e| e.to_string())?;
    fs::write(path, serialized).map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn managed_version_dir(app_data_dir: &Path, version: &str) -> PathBuf {
    app_data_dir
        .join("managed-app")
        .join("versions")
        .join(version)
}

pub(crate) fn managed_version_exists(app_data_dir: &Path, version: &str) -> bool {
    managed_version_dir(app_data_dir, version).is_dir()
}

pub(crate) fn resolve_rollback_target(
    app_data_dir: &Path,
    metadata: &mut AppUpdaterMetadata,
) -> Option<String> {
    if let Some(last_known_good) = metadata.last_known_good_version.clone() {
        if managed_version_exists(app_data_dir, &last_known_good) {
            return Some(last_known_good);
        }
        metadata.last_known_good_version = None;
    }

    metadata
        .previous_versions
        .retain(|version| managed_version_exists(app_data_dir, version));

    metadata.previous_versions.last().cloned()
}

pub(crate) fn resolve_current_app_version(
    app_data_dir: &Path,
    metadata: &AppUpdaterMetadata,
    project_root: Option<&Path>,
    fallback_version: &str,
) -> String {
    installed_app_version(app_data_dir, metadata, project_root)
        .unwrap_or_else(|| fallback_version.to_string())
}

pub(crate) fn installed_app_version(
    app_data_dir: &Path,
    metadata: &AppUpdaterMetadata,
    project_root: Option<&Path>,
) -> Option<String> {
    managed_installed_app_version(app_data_dir, metadata)
        .or_else(|| project_root.and_then(read_version_from_package_json))
}

pub(crate) fn managed_installed_app_version(
    app_data_dir: &Path,
    metadata: &AppUpdaterMetadata,
) -> Option<String> {
    if let Some(current_version) = metadata.current_version.as_deref() {
        let version_dir = managed_version_dir(app_data_dir, current_version);
        if version_dir.is_dir() {
            return Some(
                read_version_from_package_json(&version_dir)
                    .unwrap_or_else(|| current_version.to_string()),
            );
        }
    }

    None
}

pub(crate) fn bundled_reconciliation_required(
    store_build: bool,
    custom_project_path: bool,
    active_profile: bool,
    bundled_archive_exists: bool,
    installed_managed_version: Option<&str>,
    bundled_version: &str,
) -> bool {
    if store_build || custom_project_path || active_profile || !bundled_archive_exists {
        return false;
    }

    let Some(installed_managed_version) = installed_managed_version else {
        return false;
    };
    let Ok(installed) = semver::Version::parse(installed_managed_version) else {
        return false;
    };
    let Ok(bundled) = semver::Version::parse(bundled_version) else {
        return false;
    };

    bundled > installed
}

pub(crate) fn clean_old_versions(
    app_data_dir: &Path,
    metadata: &mut AppUpdaterMetadata,
) -> Result<(), String> {
    let versions_dir = app_data_dir.join("managed-app").join("versions");
    if !versions_dir.exists() {
        return Ok(());
    }

    let mut kept_versions = Vec::new();
    if let Some(ref cur) = metadata.current_version {
        kept_versions.push(cur.clone());
    }
    if let Some(ref lkg) = metadata.last_known_good_version {
        if !kept_versions.contains(lkg) {
            kept_versions.push(lkg.clone());
        }
    }

    let mut kept_previous = Vec::new();
    for version in metadata.previous_versions.iter().rev() {
        if kept_versions.contains(version) || kept_previous.contains(version) {
            continue;
        }
        if kept_previous.len() < 2 {
            kept_previous.push(version.clone());
        }
    }
    kept_previous.reverse();
    kept_versions.extend(kept_previous.clone());
    metadata.previous_versions = kept_previous;

    for entry in fs::read_dir(versions_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if !kept_versions.contains(&name) {
            let _ = fs::remove_dir_all(entry.path());
        }
    }

    Ok(())
}
