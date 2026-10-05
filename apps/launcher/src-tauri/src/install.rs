//! First install of the launcher-managed HomeInventory app.
//!
//! This is its own flow rather than an "update": it unpacks the app that
//! ships with the launcher into the managed versions folder, installs the
//! server's production dependencies and stops. It never starts the app; the
//! launcher UI starts it like any other launch once the install succeeds.

use serde::Serialize;
use std::{fs, path::Path, sync::atomic::Ordering};
use tauri::{Emitter, State};

use crate::archive::extract_archive;
use crate::config::is_store_distribution;
use crate::logs::append_log;
use crate::managed::{
    managed_installed_app_version, managed_version_dir, read_updater_metadata,
    write_updater_metadata,
};
use crate::manifest::AppManifest;
use crate::node::{ensure_portable_node, REQUIRED_NODE_MAJOR};
use crate::paths::app_data_dir;
use crate::project::{has_prebuilt_client, read_version_from_package_json, seed_env_file};
use crate::setup::{
    bundled_app_archive_path, download_bootstrap_archive, normalized_extracted_project_dir,
};
use crate::state::{InstallFlagGuard, LauncherState};
use crate::types::{CommandResult, ToolOverrides};
use crate::updater::run_dependency_install;
use crate::util::path_string;

pub(crate) const INSTALL_PROGRESS_EVENT: &str = "install-progress";

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InstallProgressPayload {
    /// Preparing, Extracting, Installing, Finalizing, Completed or Failed.
    pub(crate) state: String,
    pub(crate) message: String,
    pub(crate) progress: f64,
    pub(crate) error: Option<String>,
}

fn emit_install_progress(
    app: &tauri::AppHandle,
    state: &str,
    message: &str,
    progress: f64,
    error: Option<String>,
) {
    let _ = app.emit(
        INSTALL_PROGRESS_EVENT,
        InstallProgressPayload {
            state: state.to_string(),
            message: message.to_string(),
            progress,
            error,
        },
    );
}

/// Resets the shared "updating" lock so Start and updates are blocked only
/// while the first install runs.
struct UpdatingGuard<'a> {
    state: &'a LauncherState,
}

impl Drop for UpdatingGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut updating) = self.state.updating.lock() {
            *updating = false;
        }
    }
}

pub(crate) fn first_install_allowed(
    store_build: bool,
    custom_project_path: bool,
    installed_managed_version: Option<&str>,
) -> Result<(), String> {
    if store_build {
        return Err(
            "HomeInventory Local prepares its app files from the Microsoft Store package.".into(),
        );
    }
    if custom_project_path {
        return Err(
            "A custom install folder is selected. Clear it in Settings to use the standard install."
                .into(),
        );
    }
    if let Some(version) = installed_managed_version {
        return Err(format!("HomeInventory {version} is already installed."));
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn install_managed_app(
    app: tauri::AppHandle,
    state: State<'_, LauncherState>,
    overrides: Option<ToolOverrides>,
) -> Result<CommandResult, String> {
    let overrides = overrides.unwrap_or_default();
    let custom_project_path = overrides
        .project_path
        .as_ref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let app_data = app_data_dir(&app)?;
    let metadata = read_updater_metadata(&app_data);
    first_install_allowed(
        is_store_distribution(),
        custom_project_path,
        managed_installed_app_version(&app_data, &metadata).as_deref(),
    )?;

    if state
        .installing
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Installation is already running.".into());
    }
    let _install_guard = InstallFlagGuard {
        flag: &state.installing,
    };
    {
        let mut updating = state
            .updating
            .lock()
            .map_err(|_| "Update state is locked".to_string())?;
        if *updating {
            return Err("An update is running. Try again when it has finished.".into());
        }
        *updating = true;
    }
    let _updating_guard = UpdatingGuard {
        state: state.inner(),
    };

    match run_first_install(&app, state.inner(), &overrides, &app_data).await {
        Ok(version) => {
            let message = format!("HomeInventory {version} is installed.");
            append_log(&state, "setup", "success", &message);
            emit_install_progress(&app, "Completed", &message, 1.0, None);
            Ok(CommandResult { ok: true, message })
        }
        Err(error) => {
            append_log(&state, "setup", "error", &error);
            emit_install_progress(&app, "Failed", &error, 1.0, Some(error.clone()));
            Err(error)
        }
    }
}

async fn run_first_install(
    app: &tauri::AppHandle,
    state: &LauncherState,
    overrides: &ToolOverrides,
    app_data: &Path,
) -> Result<String, String> {
    emit_install_progress(
        app,
        "Preparing",
        "Preparing the Node.js runtime...",
        0.05,
        None,
    );
    ensure_portable_node(app, state).await?;

    emit_install_progress(app, "Extracting", "Unpacking HomeInventory...", 0.25, None);
    let bundled_path = bundled_app_archive_path(app)?;
    let (archive_path, cleanup_archive) = if bundled_path.exists() {
        (bundled_path, false)
    } else {
        // Development builds of the launcher have no bundled archive.
        let (path, cleanup, _) = download_bootstrap_archive(app, state, app_data).await?;
        (path, cleanup)
    };

    let staging_dir = app_data.join("managed-app").join("install-staging");
    let _ = fs::remove_dir_all(&staging_dir);
    let extracted = extract_archive(&archive_path, &staging_dir);
    if cleanup_archive {
        let _ = fs::remove_file(&archive_path);
    }
    extracted?;

    let result = install_extracted_app(app, state, overrides, app_data, &staging_dir);
    let _ = fs::remove_dir_all(&staging_dir);
    result
}

fn install_extracted_app(
    app: &tauri::AppHandle,
    state: &LauncherState,
    overrides: &ToolOverrides,
    app_data: &Path,
    staging_dir: &Path,
) -> Result<String, String> {
    let extracted_root = normalized_extracted_project_dir(staging_dir)?;
    let version = read_version_from_package_json(&extracted_root)
        .ok_or_else(|| "The app package does not contain a valid version.".to_string())?;
    semver::Version::parse(&version)
        .map_err(|err| format!("The app package has an invalid version {version}: {err}"))?;
    if !has_prebuilt_client(&extracted_root) {
        return Err(
            "This app package does not include the prebuilt HomeInventory UI. Choose a custom install folder in Settings instead."
                .into(),
        );
    }

    let target_dir = managed_version_dir(app_data, &version);
    let _ = fs::remove_dir_all(&target_dir);
    if let Some(parent) = target_dir.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    fs::rename(&extracted_root, &target_dir)
        .map_err(|err| format!("Could not move the app files into place: {err}"))?;
    seed_env_file(&target_dir)?;

    emit_install_progress(
        app,
        "Installing",
        "Installing server dependencies (one time; needs an internet connection)...",
        0.45,
        None,
    );
    let manifest = AppManifest {
        version: version.clone(),
        sha256: String::new(),
        url: String::new(),
        node_major: REQUIRED_NODE_MAJOR,
        root_install: true,
        client_install: false,
        signature: String::new(),
        signature_v2: String::new(),
    };
    let mut managed_overrides = overrides.clone();
    managed_overrides.project_path = Some(path_string(&target_dir));
    if let Err(error) =
        run_dependency_install(app, state, &target_dir, &manifest, &managed_overrides)
    {
        let _ = fs::remove_dir_all(&target_dir);
        return Err(error);
    }

    emit_install_progress(
        app,
        "Finalizing",
        "Finishing the installation...",
        0.95,
        None,
    );
    let mut metadata = read_updater_metadata(app_data);
    metadata.current_version = Some(version.clone());
    metadata.last_known_good_version = Some(version.clone());
    write_updater_metadata(app_data, &metadata)?;
    Ok(version)
}
