//! Launcher data locations and per-profile paths.

use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::Manager;

use crate::config::ProfileConfig;

pub(crate) struct ProfilePaths {
    pub(crate) profile_root: PathBuf,
    pub(crate) data_dir: PathBuf,
    pub(crate) db_path: PathBuf,
    pub(crate) uploads_dir: PathBuf,
    pub(crate) log_dir: PathBuf,
    pub(crate) secrets_path: PathBuf,
}

pub(crate) fn profile_paths(app_data_dir: &Path, profile: &ProfileConfig) -> ProfilePaths {
    let profile_root = app_data_dir.join("profiles").join(profile.id);
    let data_dir = profile_root.join("data");
    let db_path = data_dir.join("inventory.db");
    let uploads_dir = profile_root.join("uploads");
    let log_dir = profile_root.join("logs");
    let secrets_path = profile_root.join("env").join("launcher-secrets.env");
    ProfilePaths {
        profile_root,
        db_path,
        uploads_dir,
        log_dir,
        secrets_path,
        data_dir,
    }
}

pub(crate) fn store_project_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("managed-app").join("store-current"))
}

pub(crate) fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Could not resolve app data directory: {err}"))?;
    fs::create_dir_all(&path).map_err(|err| err.to_string())?;
    Ok(path)
}
