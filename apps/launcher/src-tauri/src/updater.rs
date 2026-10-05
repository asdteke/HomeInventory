//! Managed-app update, bundled synchronization and rollback flows.

use serde::Serialize;
use sha2::Digest;
use std::{
    env,
    fs::{self, File},
    path::{Path, PathBuf},
};
use tauri::{Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::archive::extract_archive;
use crate::config::{is_store_distribution, profile_config};
use crate::health::run_health_checks;
use crate::logs::append_log;
use crate::managed::{
    bundled_reconciliation_required, clean_old_versions, managed_installed_app_version,
    managed_version_dir, managed_version_exists, read_updater_metadata,
    resolve_current_app_version, resolve_rollback_target, write_updater_metadata,
};
use crate::manifest::{
    validate_app_manifest_policy, validate_coordinated_release, verify_manifest_signature,
    AppManifest, APP_MANIFEST_URL,
};
use crate::node::{
    ensure_portable_node, get_node_major_version, resolve_tools, resolved_command_env,
    REQUIRED_NODE_MAJOR,
};
use crate::paths::{app_data_dir, profile_paths};
use crate::ports::{bundled_sync_port_preflight_error, check_ports_internal, requested_ports};
use crate::process::{reconcile_active, start_profile_internal, stop_all_internal};
use crate::project::{project_root_handle, read_version_from_package_json};
use crate::setup::{
    bundled_app_archive_path, bundled_app_is_same_or_newer, normalized_extracted_project_dir,
    should_prefer_bundled_app_version,
};
use crate::state::LauncherState;
use crate::types::{BundledSyncRequest, CheckPortsRequest, CommandResult, ToolOverrides};
use crate::util::{copy_dir_all, now, path_string, set_private_permissions};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateCheckResult {
    pub(crate) current_app_version: String,
    pub(crate) latest_app_version: String,
    pub(crate) current_launcher_version: String,
    pub(crate) latest_launcher_version: String,
    pub(crate) app_release_notes: Option<String>,
    pub(crate) launcher_release_notes: Option<String>,
    pub(crate) app_update_available: bool,
    pub(crate) launcher_update_available: bool,
    pub(crate) required_actions: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateProgressPayload {
    pub(crate) state: String,
    pub(crate) message: String,
    pub(crate) progress: f64,
    pub(crate) error: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum UpdateFlowMode {
    Coordinated,
    BundledOnly,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ManagedAppUpdateSource {
    Bundled,
    Online,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct UpdatePorts {
    pub(crate) backend_port: Option<u16>,
    pub(crate) frontend_port: Option<u16>,
}

pub(crate) fn emit_progress(
    app: &tauri::AppHandle,
    state: &str,
    message: &str,
    progress: f64,
    error: Option<String>,
) {
    let payload = UpdateProgressPayload {
        state: state.to_string(),
        message: message.to_string(),
        progress,
        error,
    };
    let _ = app.emit("update-progress", payload);
}

pub(crate) fn select_managed_app_update_source(
    mode: UpdateFlowMode,
    bundled_archive_exists: bool,
    bundled_version: &str,
    online_version: Option<&str>,
) -> Option<ManagedAppUpdateSource> {
    if mode == UpdateFlowMode::BundledOnly {
        return bundled_archive_exists.then_some(ManagedAppUpdateSource::Bundled);
    }

    if bundled_archive_exists
        && online_version
            .map(|version| bundled_app_is_same_or_newer(bundled_version, version))
            .unwrap_or(true)
    {
        return Some(ManagedAppUpdateSource::Bundled);
    }

    online_version.map(|_| ManagedAppUpdateSource::Online)
}

pub(crate) fn update_finishes_stopped(mode: UpdateFlowMode) -> bool {
    mode == UpdateFlowMode::BundledOnly
}

#[tauri::command]
pub(crate) async fn check_updates(
    app: tauri::AppHandle,
    overrides: Option<ToolOverrides>,
) -> Result<UpdateCheckResult, String> {
    let launcher_version = env!("CARGO_PKG_VERSION").to_string();

    let app_data = app_data_dir(&app)?;
    let metadata = read_updater_metadata(&app_data);

    let overrides = overrides.unwrap_or_default();
    let project_root_dir = project_root_handle(&app, &overrides).ok();
    let current_app_version = resolve_current_app_version(
        &app_data,
        &metadata,
        project_root_dir.as_deref(),
        &launcher_version,
    );

    if is_store_distribution() {
        return Ok(UpdateCheckResult {
            current_app_version: current_app_version.clone(),
            latest_app_version: current_app_version,
            current_launcher_version: launcher_version.clone(),
            latest_launcher_version: launcher_version,
            app_release_notes: Some(
                "HomeInventory Local updates are delivered through Microsoft Store.".to_string(),
            ),
            launcher_release_notes: None,
            app_update_available: false,
            launcher_update_available: false,
            required_actions: Vec::new(),
        });
    }

    let launcher_update = app
        .updater()
        .map_err(|e| format!("Launcher updater is not available: {e}"))?
        .check()
        .await
        .map_err(|e| format!("Launcher update metadata could not be verified: {e}"))?;
    let latest_launcher_version = launcher_update
        .as_ref()
        .map(|update| update.version.clone())
        .unwrap_or_else(|| launcher_version.clone());
    let launcher_update_available = launcher_update.is_some();
    let launcher_release_notes = launcher_update
        .as_ref()
        .and_then(|update| update.body.clone());

    let mut latest_app_version = current_app_version.clone();
    let mut app_update_available = false;
    let mut app_release_notes = None;
    let mut required_actions = Vec::new();

    let client = reqwest::Client::new();
    let mut manifest_opt: Option<AppManifest> = None;
    match client.get(APP_MANIFEST_URL).send().await {
        Ok(resp) => {
            if resp.status().is_success() {
                if let Ok(manifest) = resp.json::<AppManifest>().await {
                    manifest_opt = Some(manifest);
                }
            }
        }
        Err(e) => {
            println!("Failed to fetch app update manifest: {}", e);
        }
    }

    if let Some(manifest) = manifest_opt {
        if let Err(e) = verify_manifest_signature(&manifest)
            .and_then(|_| validate_app_manifest_policy(&manifest))
        {
            println!("App manifest verification failed: {}", e);
        } else {
            latest_app_version = manifest.version.clone();

            let current_semver = semver::Version::parse(&current_app_version)
                .unwrap_or_else(|_| semver::Version::new(2, 2, 0));
            let latest_semver = semver::Version::parse(&latest_app_version)
                .unwrap_or_else(|_| semver::Version::new(2, 2, 0));

            if latest_semver > current_semver {
                app_update_available = true;
                required_actions.push("appUpdate".to_string());
                app_release_notes = Some(format!(
                    "HomeInventory managed app update available. Requires Node.js >= v{}.0.",
                    manifest.node_major
                ));

                let node_major = get_node_major_version(&app).await.unwrap_or(0);
                if node_major > 0 && node_major < manifest.node_major {
                    required_actions.push("nodeMajorUpgrade".to_string());
                }
            }
        }
    }

    let bundled_path = bundled_app_archive_path(&app)?;
    if bundled_path.exists()
        && should_prefer_bundled_app_version(&launcher_version, &latest_app_version)
    {
        latest_app_version = launcher_version.clone();
        app_update_available =
            should_prefer_bundled_app_version(&latest_app_version, &current_app_version);
        if app_update_available {
            if !required_actions.contains(&"appUpdate".to_string()) {
                required_actions.push("appUpdate".to_string());
            }
            app_release_notes = Some(
                "A newer HomeInventory managed app is included with this launcher.".to_string(),
            );
            let node_major = get_node_major_version(&app).await.unwrap_or(0);
            if node_major > 0
                && node_major < REQUIRED_NODE_MAJOR
                && !required_actions.contains(&"nodeMajorUpgrade".to_string())
            {
                required_actions.push("nodeMajorUpgrade".to_string());
            }
        }
    }

    if launcher_update_available {
        required_actions.push("launcherUpdate".to_string());
    }

    validate_coordinated_release(
        &launcher_version,
        &latest_app_version,
        launcher_update
            .as_ref()
            .map(|update| update.version.as_str()),
    )?;

    Ok(UpdateCheckResult {
        current_app_version,
        latest_app_version,
        current_launcher_version: launcher_version,
        latest_launcher_version,
        app_release_notes,
        launcher_release_notes,
        app_update_available,
        launcher_update_available,
        required_actions,
    })
}

#[tauri::command]
pub(crate) async fn update_all(
    app: tauri::AppHandle,
    state: tauri::State<'_, LauncherState>,
    overrides: Option<ToolOverrides>,
) -> Result<CommandResult, String> {
    if is_store_distribution() {
        return Ok(CommandResult {
            ok: true,
            message: "HomeInventory Local updates are delivered through Microsoft Store."
                .to_string(),
        });
    }

    start_update_task(
        app,
        state.inner(),
        overrides.unwrap_or_default(),
        UpdateFlowMode::Coordinated,
        UpdatePorts::default(),
    )
}

#[tauri::command]
pub(crate) async fn sync_bundled_managed_app(
    app: tauri::AppHandle,
    state: tauri::State<'_, LauncherState>,
    request: BundledSyncRequest,
) -> Result<CommandResult, String> {
    reconcile_active(&state);
    let overrides = request.overrides.unwrap_or_default();
    let ports = UpdatePorts {
        backend_port: request.backend_port,
        frontend_port: request.frontend_port,
    };
    let (backend_port, frontend_port) = requested_ports(
        profile_config("homeinventory")?,
        ports.backend_port,
        ports.frontend_port,
    )?;
    let custom_project_path = overrides
        .project_path
        .as_ref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let active_profile = state
        .active
        .lock()
        .map_err(|_| "Process state is locked".to_string())?
        .is_some();
    let app_data = app_data_dir(&app)?;
    let metadata = read_updater_metadata(&app_data);
    let installed_managed_version = managed_installed_app_version(&app_data, &metadata);
    let bundled_path = bundled_app_archive_path(&app)?;
    let bundled_version = env!("CARGO_PKG_VERSION");

    if !bundled_reconciliation_required(
        is_store_distribution(),
        custom_project_path,
        active_profile,
        bundled_path.exists(),
        installed_managed_version.as_deref(),
        bundled_version,
    ) {
        return Err(
            "Bundled managed-app synchronization is not eligible for this installation."
                .to_string(),
        );
    }

    let initial_port_check = check_ports_internal(CheckPortsRequest {
        backend_port,
        frontend_port,
    })
    .await?;
    if let Some(error) = bundled_sync_port_preflight_error(&initial_port_check) {
        return Err(error);
    }

    start_update_task(
        app,
        state.inner(),
        overrides,
        UpdateFlowMode::BundledOnly,
        ports,
    )
}

pub(crate) fn start_update_task(
    app: tauri::AppHandle,
    state: &LauncherState,
    overrides: ToolOverrides,
    mode: UpdateFlowMode,
    ports: UpdatePorts,
) -> Result<CommandResult, String> {
    {
        let mut updating = state.updating.lock().map_err(|_| "State lock failed")?;
        if *updating {
            return Err("Another update action is already running.".to_string());
        }
        if mode == UpdateFlowMode::BundledOnly
            && state
                .active
                .lock()
                .map_err(|_| "Process state is locked".to_string())?
                .is_some()
        {
            return Err(
                "Bundled managed-app synchronization waits until the active profile is stopped."
                    .to_string(),
            );
        }
        *updating = true;
    }

    let app_clone = app.clone();

    tauri::async_runtime::spawn(async move {
        let state_clone = app_clone.state::<LauncherState>();
        let version_before_update = app_data_dir(&app_clone)
            .ok()
            .map(|path| read_updater_metadata(&path).current_version)
            .unwrap_or_default();
        if let Err(e) =
            run_update_flow(&app_clone, &state_clone, overrides.clone(), mode, ports).await
        {
            let version_after_failure = app_data_dir(&app_clone)
                .ok()
                .map(|path| read_updater_metadata(&path).current_version)
                .unwrap_or_default();
            let rollback_required =
                update_failure_requires_rollback(&version_before_update, &version_after_failure);
            if rollback_required {
                emit_progress(
                    &app_clone,
                    "RollbackStarting",
                    &format!("Update failed: {e}. Restoring the previous managed app..."),
                    0.92,
                    Some(e.clone()),
                );
                if let Err(rollback_err) =
                    run_rollback_flow(&app_clone, &state_clone, overrides, mode, ports).await
                {
                    emit_progress(
                        &app_clone,
                        "RollbackFailed",
                        &format!("Rollback failed: {rollback_err}"),
                        1.0,
                        Some(rollback_err),
                    );
                } else {
                    emit_progress(
                        &app_clone,
                        "RollbackComplete",
                        if update_finishes_stopped(mode) {
                            "Previous managed app restored and stopped safely. You can retry synchronization."
                        } else {
                            "System successfully rolled back to the previous version."
                        },
                        1.0,
                        None,
                    );
                }
            } else {
                emit_progress(
                    &app_clone,
                    "Failed",
                    &format!("Update failed: {e}. The installed version was not changed."),
                    1.0,
                    Some(e),
                );
            }
        } else {
            emit_progress(
                &app_clone,
                "Completed",
                if mode == UpdateFlowMode::BundledOnly {
                    "Bundled HomeInventory app synchronized and verified. Ready to launch."
                } else {
                    "Update complete! Application is running."
                },
                1.0,
                None,
            );
        }

        if let Ok(mut updating) = state_clone.updating.lock() {
            *updating = false;
        };
    });

    Ok(CommandResult {
        ok: true,
        message: if mode == UpdateFlowMode::BundledOnly {
            "Bundled managed-app synchronization started."
        } else {
            "Update process started."
        }
        .to_string(),
    })
}

pub(crate) fn update_failure_requires_rollback(
    version_before_update: &Option<String>,
    version_after_failure: &Option<String>,
) -> bool {
    version_before_update != version_after_failure
}

pub(crate) async fn run_update_flow(
    app: &tauri::AppHandle,
    state: &LauncherState,
    overrides: ToolOverrides,
    mode: UpdateFlowMode,
    ports: UpdatePorts,
) -> Result<(), String> {
    let app_data = app_data_dir(app)?;
    let mut metadata = read_updater_metadata(&app_data);
    let client = reqwest::Client::new();
    let bundled_path = bundled_app_archive_path(app)?;
    let bundled_version = env!("CARGO_PKG_VERSION").to_string();
    let launcher_version = env!("CARGO_PKG_VERSION").to_string();
    let (backend_port, frontend_port) = requested_ports(
        profile_config("homeinventory")?,
        ports.backend_port,
        ports.frontend_port,
    )?;

    let (manifest, bundled_archive, launcher_update) = if mode == UpdateFlowMode::BundledOnly {
        let custom_project_path = overrides
            .project_path
            .as_ref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false);
        let active_profile = state
            .active
            .lock()
            .map_err(|_| "Process state is locked".to_string())?
            .is_some();
        let installed_managed_version = managed_installed_app_version(&app_data, &metadata);
        if !bundled_reconciliation_required(
            is_store_distribution(),
            custom_project_path,
            active_profile,
            bundled_path.exists(),
            installed_managed_version.as_deref(),
            &bundled_version,
        ) {
            return Err("Bundled managed-app synchronization is no longer eligible.".to_string());
        }

        emit_progress(
            app,
            "Checking",
            "Preparing the managed app included with this launcher...",
            0.05,
            None,
        );
        let source =
            select_managed_app_update_source(mode, bundled_path.exists(), &bundled_version, None);
        if source != Some(ManagedAppUpdateSource::Bundled) {
            return Err("Bundled HomeInventory update package is missing.".to_string());
        }
        append_log(
            state,
            "updater",
            "info",
            &format!(
                "Synchronizing the existing managed install with bundled HomeInventory {bundled_version}."
            ),
        );
        (
            AppManifest {
                version: bundled_version,
                sha256: String::new(),
                url: "bundled://homeinventory-app.tar.gz".to_string(),
                node_major: REQUIRED_NODE_MAJOR,
                root_install: true,
                client_install: true,
                signature: "bundled".to_string(),
                signature_v2: "bundled".to_string(),
            },
            Some(bundled_path),
            None,
        )
    } else {
        emit_progress(
            app,
            "Checking",
            "Checking for latest release manifest...",
            0.05,
            None,
        );
        let online_manifest = match client.get(APP_MANIFEST_URL).send().await {
            Ok(resp) if resp.status().is_success() => match resp.json::<AppManifest>().await {
                Ok(manifest) => {
                    verify_manifest_signature(&manifest)?;
                    validate_app_manifest_policy(&manifest)?;
                    Some(manifest)
                }
                Err(err) => {
                    append_log(
                        state,
                        "updater",
                        "warning",
                        &format!("Online app manifest could not be parsed: {err}"),
                    );
                    None
                }
            },
            Ok(resp) => {
                append_log(
                    state,
                    "updater",
                    "warning",
                    &format!("Online app manifest returned HTTP {}.", resp.status()),
                );
                None
            }
            Err(err) => {
                append_log(
                    state,
                    "updater",
                    "warning",
                    &format!("Online app manifest could not be downloaded: {err}"),
                );
                None
            }
        };

        let source = select_managed_app_update_source(
            mode,
            bundled_path.exists(),
            &bundled_version,
            online_manifest
                .as_ref()
                .map(|manifest| manifest.version.as_str()),
        );
        let (manifest, bundled_archive) = match source {
            Some(ManagedAppUpdateSource::Bundled) => {
                append_log(
                    state,
                    "updater",
                    "info",
                    &format!("Using bundled HomeInventory {bundled_version} update package."),
                );
                (
                    AppManifest {
                        version: bundled_version,
                        sha256: String::new(),
                        url: "bundled://homeinventory-app.tar.gz".to_string(),
                        node_major: REQUIRED_NODE_MAJOR,
                        root_install: true,
                        client_install: true,
                        signature: "bundled".to_string(),
                        signature_v2: "bundled".to_string(),
                    },
                    Some(bundled_path),
                )
            }
            Some(ManagedAppUpdateSource::Online) => (
                online_manifest.ok_or_else(|| {
                    "No valid online HomeInventory update package is available.".to_string()
                })?,
                None,
            ),
            None => {
                return Err(
                    "No valid online or bundled HomeInventory update package is available."
                        .to_string(),
                );
            }
        };
        let launcher_update = app
            .updater()
            .map_err(|e| format!("Launcher updater is not available: {e}"))?
            .check()
            .await
            .map_err(|e| format!("Launcher update metadata could not be verified: {e}"))?;
        (manifest, bundled_archive, launcher_update)
    };

    validate_coordinated_release(
        &launcher_version,
        &manifest.version,
        launcher_update
            .as_ref()
            .map(|update| update.version.as_str()),
    )?;

    let node_major = get_node_major_version(app).await.unwrap_or(0);
    if node_major > 0 && node_major < manifest.node_major {
        return Err(format!(
            "Compatible Node.js major version required is v{}.0, but detected v{}.0",
            manifest.node_major, node_major
        ));
    }

    if mode == UpdateFlowMode::BundledOnly {
        let final_port_check = check_ports_internal(CheckPortsRequest {
            backend_port,
            frontend_port,
        })
        .await?;
        if let Some(error) = bundled_sync_port_preflight_error(&final_port_check) {
            return Err(error);
        }
    }

    emit_progress(app, "Stopping", "Stopping active services...", 0.1, None);
    let _ = stop_all_internal(state);

    emit_progress(
        app,
        "Backing Up",
        "Creating database and uploads backup...",
        0.2,
        None,
    );
    let backup_dir = perform_mandatory_backup(app)?;
    append_log(
        state,
        "updater",
        "info",
        &format!("Mandatory backup created at: {:?}", backup_dir),
    );

    emit_progress(
        app,
        "Downloading",
        if bundled_archive.is_some() {
            "Preparing bundled app release archive..."
        } else {
            "Downloading app release archive..."
        },
        0.3,
        None,
    );
    let temp_archive_path = app_data.join("managed-app").join("temp-release.tar.gz");
    if let Some(parent) = temp_archive_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    if let Some(bundled_archive_path) = bundled_archive {
        fs::copy(&bundled_archive_path, &temp_archive_path).map_err(|err| {
            format!(
                "Failed to prepare bundled app archive from {}: {err}",
                path_string(&bundled_archive_path)
            )
        })?;
    } else {
        let mut archive_resp = client
            .get(&manifest.url)
            .send()
            .await
            .map_err(|e| format!("Failed to download archive: {e}"))?;
        if !archive_resp.status().is_success() {
            return Err(format!(
                "Archive download returned status: {}",
                archive_resp.status()
            ));
        }

        let mut archive_file = File::create(&temp_archive_path).map_err(|e| e.to_string())?;
        let mut sha_hasher = sha2::Sha256::new();

        while let Some(chunk) = archive_resp
            .chunk()
            .await
            .map_err(|e| format!("Error downloading chunk: {e}"))?
        {
            use std::io::Write;
            archive_file.write_all(&chunk).map_err(|e| e.to_string())?;
            sha_hasher.update(&chunk);
        }

        let calculated_hash = format!("{:x}", sha_hasher.finalize());
        if calculated_hash != manifest.sha256 {
            let _ = fs::remove_file(&temp_archive_path);
            return Err(format!(
                "SHA-256 mismatch: calculated {}, expected {}",
                calculated_hash, manifest.sha256
            ));
        }
    }

    emit_progress(
        app,
        "Extracting",
        "Extracting files to staging area...",
        0.5,
        None,
    );
    let staging_dir = app_data.join("managed-app").join("staging");
    let _ = fs::remove_dir_all(&staging_dir);
    extract_archive(&temp_archive_path, &staging_dir)?;

    let _ = fs::remove_file(&temp_archive_path);

    let extracted_root = normalized_extracted_project_dir(&staging_dir)?;
    let extracted_version = read_version_from_package_json(&extracted_root)
        .ok_or_else(|| "Extracted app archive does not contain a valid version.".to_string())?;
    if extracted_version != manifest.version {
        let _ = fs::remove_dir_all(&staging_dir);
        return Err(format!(
            "Extracted app version mismatch: expected {}, found {}.",
            manifest.version, extracted_version
        ));
    }

    emit_progress(
        app,
        "Extracting",
        "Switching to new app version...",
        0.6,
        None,
    );
    // Updates always install into the launcher's versioned managed-app area.
    // A manually selected project path may be a development checkout or a
    // user-owned folder and must never be removed or replaced by the updater.
    let target_version_dir = managed_version_dir(&app_data, &manifest.version);
    let _ = fs::remove_dir_all(&target_version_dir);
    if let Some(parent) = target_version_dir.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&staging_dir, &target_version_dir)
        .map_err(|e| format!("Atomic switch failed: {e}"))?;

    // Dependency installation must run under the pinned portable Node.js
    // runtime. A newer system Node may lack prebuilt native modules
    // (e.g. better-sqlite3) and fails the update with a bare npm status.
    ensure_portable_node(app, state).await?;

    emit_progress(
        app,
        "Installing",
        if mode == UpdateFlowMode::BundledOnly {
            "Installing dependencies (npm ci; internet access may be required)..."
        } else {
            "Installing project dependencies (npm ci)..."
        },
        0.7,
        None,
    );
    let mut managed_overrides = overrides.clone();
    managed_overrides.project_path = Some(path_string(&target_version_dir));
    run_dependency_install(app, &target_version_dir, &manifest, &managed_overrides)?;

    let previous_current = metadata.current_version.clone();
    if let Some(previous) =
        immediate_rollback_version(&app_data, previous_current.as_deref(), &manifest.version)
    {
        metadata.last_known_good_version = Some(previous);
        write_updater_metadata(&app_data, &metadata)?;
    }
    metadata.current_version = Some(manifest.version.clone());
    write_updater_metadata(&app_data, &metadata)?;

    emit_progress(app, "Starting", "Starting updated services...", 0.8, None);
    start_profile_internal(
        app,
        state,
        "homeinventory",
        Some(backend_port),
        Some(frontend_port),
        Some(managed_overrides.clone()),
        true,
    )?;

    emit_progress(
        app,
        "Verifying",
        "Running startup health checks...",
        0.9,
        None,
    );
    run_health_checks(app, backend_port, frontend_port).await?;

    metadata.last_known_good_version = Some(manifest.version.clone());
    if let Some(prev) = previous_current.filter(|prev| prev != &manifest.version) {
        if !metadata.previous_versions.contains(&prev) {
            metadata.previous_versions.push(prev);
        }
    }

    clean_old_versions(&app_data, &mut metadata)?;
    write_updater_metadata(&app_data, &metadata)?;

    if update_finishes_stopped(mode) {
        emit_progress(
            app,
            "Stopping",
            "Health verification passed. Returning HomeInventory to its stopped state...",
            0.97,
            None,
        );
        stop_all_internal(state)?;
        return Ok(());
    }

    emit_progress(
        app,
        "SelfUpdating",
        "Checking for launcher updates...",
        0.95,
        None,
    );
    if let Some(update) = launcher_update {
        emit_progress(
            app,
            "SelfUpdating",
            "Downloading and applying launcher update...",
            0.98,
            None,
        );
        let _ = stop_all_internal(state);
        update
            .download_and_install(|_, _| {}, || {})
            .await
            .map_err(|e| format!("Launcher self-update failed: {e}"))?;
        app.restart();
    }

    Ok(())
}

pub(crate) fn immediate_rollback_version(
    app_data_dir: &Path,
    previous_version: Option<&str>,
    next_version: &str,
) -> Option<String> {
    let previous = previous_version?.trim();
    if previous.is_empty()
        || previous == next_version
        || !managed_version_exists(app_data_dir, previous)
    {
        return None;
    }
    Some(previous.to_string())
}

pub(crate) async fn run_rollback_flow(
    app: &tauri::AppHandle,
    state: &LauncherState,
    overrides: ToolOverrides,
    mode: UpdateFlowMode,
    ports: UpdatePorts,
) -> Result<(), String> {
    emit_progress(app, "RollingBack", "Stopping active services...", 0.1, None);
    let _ = stop_all_internal(state);

    let app_data = app_data_dir(app)?;
    let mut metadata = read_updater_metadata(&app_data);
    let (backend_port, frontend_port) = requested_ports(
        profile_config("homeinventory")?,
        ports.backend_port,
        ports.frontend_port,
    )?;

    let target_version = match resolve_rollback_target(&app_data, &mut metadata) {
        Some(v) => v,
        None => {
            metadata.current_version = None;
            metadata.last_known_good_version = None;
            let _ = write_updater_metadata(&app_data, &metadata);
            emit_progress(
                app,
                "RollingBack",
                "No usable last known good version found. Reverting to development workspace...",
                0.5,
                None,
            );
            start_profile_internal(
                app,
                state,
                "homeinventory",
                Some(backend_port),
                Some(frontend_port),
                Some(overrides),
                true,
            )?;
            if update_finishes_stopped(mode) {
                stop_all_internal(state)?;
            }
            return Ok(());
        }
    };

    emit_progress(
        app,
        "RollingBack",
        &format!("Reverting current version to last known good: {target_version}..."),
        0.3,
        None,
    );
    let target_dir = managed_version_dir(&app_data, &target_version);
    if !target_dir.exists() {
        metadata.current_version = None;
        metadata.last_known_good_version = None;
        metadata
            .previous_versions
            .retain(|version| version != &target_version);
        let _ = write_updater_metadata(&app_data, &metadata);
        emit_progress(
            app,
            "RollingBack",
            "Last known good version disappeared. Reverting to development workspace...",
            0.5,
            None,
        );
        start_profile_internal(
            app,
            state,
            "homeinventory",
            Some(backend_port),
            Some(frontend_port),
            Some(overrides),
            true,
        )?;
        if update_finishes_stopped(mode) {
            stop_all_internal(state)?;
        }
        return Ok(());
    }
    metadata.current_version = Some(target_version.clone());
    metadata.last_known_good_version = Some(target_version.clone());
    write_updater_metadata(&app_data, &metadata)?;

    emit_progress(
        app,
        "RollingBack",
        "Ensuring dependencies are clean...",
        0.6,
        None,
    );
    let mock_manifest = AppManifest {
        version: target_version.clone(),
        sha256: "".into(),
        url: "".into(),
        node_major: REQUIRED_NODE_MAJOR,
        root_install: true,
        client_install: true,
        signature: "".into(),
        signature_v2: "".into(),
    };
    run_dependency_install(app, &target_dir, &mock_manifest, &overrides)?;

    emit_progress(
        app,
        "RollingBack",
        "Starting restored service...",
        0.8,
        None,
    );
    start_profile_internal(
        app,
        state,
        "homeinventory",
        Some(backend_port),
        Some(frontend_port),
        Some(overrides),
        true,
    )?;

    emit_progress(app, "RollingBack", "Running health checks...", 0.9, None);
    run_health_checks(app, backend_port, frontend_port).await?;
    if update_finishes_stopped(mode) {
        stop_all_internal(state)?;
    }

    Ok(())
}

pub(crate) fn run_dependency_install(
    app: &tauri::AppHandle,
    target_dir: &Path,
    manifest: &AppManifest,
    overrides: &ToolOverrides,
) -> Result<(), String> {
    let mut envs = resolved_command_env();
    let tools = resolve_tools(app, &envs, overrides);
    if let Some(node_path_str) = &tools.node_path {
        if let Some(node_bin_dir) = Path::new(node_path_str).parent() {
            let path_key = if cfg!(windows) {
                envs.keys()
                    .find(|k| k.eq_ignore_ascii_case("PATH"))
                    .cloned()
                    .unwrap_or_else(|| "PATH".to_string())
            } else {
                "PATH".to_string()
            };
            let current_path = envs.get(&path_key).cloned().unwrap_or_default();
            let new_path = if current_path.is_empty() {
                path_string(node_bin_dir)
            } else {
                let sep = if cfg!(windows) { ";" } else { ":" };
                format!("{}{}{}", path_string(node_bin_dir), sep, current_path)
            };
            envs.insert(path_key, new_path);
        }
    }
    let npm = tools.npm_path.ok_or_else(|| {
        "npm path not found. Dependency installation may require npm and internet access."
            .to_string()
    })?;

    if !target_dir.join("package-lock.json").exists() {
        return Err("Missing root package-lock.json in release archive".into());
    }
    if manifest.client_install && !target_dir.join("client").join("package-lock.json").exists() {
        return Err("Missing client package-lock.json in release archive".into());
    }

    if manifest.root_install {
        let mut command = std::process::Command::new(&npm);
        command.arg("ci").current_dir(target_dir).envs(&envs);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        let status = command
            .status()
            .map_err(|e| format!("Failed to execute npm ci at root: {e}"))?;
        if !status.success() {
            return Err(format!(
                "npm ci at root failed with status: {:?}. Dependency installation may require internet access; check npm and network configuration.",
                status.code()
            ));
        }
    }

    if manifest.client_install {
        let mut command = std::process::Command::new(&npm);
        command
            .arg("ci")
            .arg("--prefix")
            .arg("client")
            .current_dir(target_dir)
            .envs(&envs);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        let status = command
            .status()
            .map_err(|e| format!("Failed to execute npm ci in client: {e}"))?;
        if !status.success() {
            return Err(format!(
                "npm ci in client failed with status: {:?}. Dependency installation may require internet access; check npm and network configuration.",
                status.code()
            ));
        }
    }

    Ok(())
}

pub(crate) fn perform_mandatory_backup(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data = app_data_dir(app)?;
    let backup_root = app_data.join("backups");
    fs::create_dir_all(&backup_root).map_err(|e| e.to_string())?;

    let timestamp = now();
    let destination = backup_root.join(format!("update-backup-{}", timestamp));
    fs::create_dir_all(&destination).map_err(|e| e.to_string())?;

    let profile = profile_config("homeinventory")?;
    let paths = profile_paths(&app_data, profile);

    if paths.data_dir.exists() {
        let dest_data = destination.join("data");
        fs::create_dir_all(&dest_data).map_err(|e| e.to_string())?;

        for entry in fs::read_dir(&paths.data_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("inventory.db") {
                fs::copy(entry.path(), dest_data.join(&name)).map_err(|e| e.to_string())?;
            }
        }
    }

    if paths.uploads_dir.exists() {
        let dest_uploads = destination.join("uploads");
        copy_dir_all(&paths.uploads_dir, &dest_uploads).map_err(|e| e.to_string())?;
    }

    if paths.secrets_path.exists() {
        let dest_env = destination.join("env");
        fs::create_dir_all(&dest_env).map_err(|e| e.to_string())?;
        set_private_permissions(&dest_env, true)?;
        let backup_secrets = dest_env.join("launcher-secrets.env");
        fs::copy(&paths.secrets_path, &backup_secrets).map_err(|e| e.to_string())?;
        set_private_permissions(&backup_secrets, false)?;
    }

    let metadata_path = app_data.join("managed-app").join("updater-metadata.json");
    if metadata_path.exists() {
        fs::copy(&metadata_path, destination.join("updater-metadata.json"))
            .map_err(|e| e.to_string())?;
    }

    Ok(destination)
}
