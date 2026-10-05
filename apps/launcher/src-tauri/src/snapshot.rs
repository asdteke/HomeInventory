//! The launcher snapshot that the UI polls.

use std::env;

use crate::config::{distribution, is_store_distribution, PROFILE_CONFIGS};
use crate::managed::{
    bundled_reconciliation_required, managed_installed_app_version, read_updater_metadata,
    resolve_current_app_version,
};
use crate::network::{check_lan_access_status, get_local_ip};
use crate::node::{resolve_tools, resolved_command_env};
use crate::paths::{app_data_dir, profile_paths};
use crate::project::{is_empty_dir, is_valid_project_root, project_root_for_snapshot};
use crate::setup::bundled_app_archive_path;
use crate::state::LauncherState;
use crate::types::{LauncherSnapshot, ProfileStatus, SetupStatus, ToolOverrides, ToolStatus};
use crate::util::path_string;

pub(crate) fn build_snapshot(
    app: &tauri::AppHandle,
    state: &LauncherState,
    overrides: ToolOverrides,
) -> Result<LauncherSnapshot, String> {
    let project_root = project_root_for_snapshot(app, &overrides)?;
    let app_data_dir = app_data_dir(app)?;
    let envs = resolved_command_env();
    let tools = resolve_tools(app, &envs, &overrides);
    let active_process = state
        .active
        .lock()
        .map_err(|_| "Process state is locked".to_string())?
        .as_ref()
        .map(|process| {
            (
                process.profile_id.clone(),
                process.backend_port,
                process.frontend_port,
            )
        });
    let active_profile_id = active_process
        .as_ref()
        .map(|(profile_id, _, _)| profile_id.clone());
    let https_status = state
        .active
        .lock()
        .map_err(|_| "Process state is locked".to_string())?
        .as_ref()
        .and_then(|process| process.https_status.clone());

    let profiles = PROFILE_CONFIGS
        .iter()
        .map(|profile| {
            let paths = profile_paths(&app_data_dir, profile);
            let brand_assets = profile
                .brand_key
                .map(|brand_key| {
                    project_root
                        .as_ref()
                        .map(|root| root.join("local-brands").join(brand_key).exists())
                        .unwrap_or(false)
                })
                .unwrap_or(true);
            let backend_port = active_process
                .as_ref()
                .filter(|(profile_id, _, _)| profile_id == profile.id)
                .map(|(_, backend_port, _)| *backend_port)
                .unwrap_or(profile.backend_port);
            let frontend_port = active_process
                .as_ref()
                .filter(|(profile_id, _, _)| profile_id == profile.id)
                .map(|(_, _, frontend_port)| *frontend_port)
                .unwrap_or(profile.frontend_port);
            let display_frontend_port = if is_store_distribution() {
                backend_port
            } else {
                frontend_port
            };

            ProfileStatus {
                id: profile.id.to_string(),
                name: profile.name.to_string(),
                description: profile.description.to_string(),
                available: profile.brand_key.is_none() || brand_assets,
                running: active_profile_id.as_deref() == Some(profile.id),
                backend_port,
                frontend_port: display_frontend_port,
                frontend_url: format!("http://127.0.0.1:{}", display_frontend_port),
                backend_url: format!("http://127.0.0.1:{}", backend_port),
                data_dir: path_string(&paths.data_dir),
                db_path: path_string(&paths.db_path),
                uploads_dir: path_string(&paths.uploads_dir),
                brand_assets,
            }
        })
        .collect::<Vec<_>>();

    let project_root_valid = project_root
        .as_ref()
        .map(|root| is_valid_project_root(root))
        .unwrap_or(false);
    let project_root_installable = project_root
        .as_ref()
        .map(|root| !project_root_valid && is_empty_dir(root).unwrap_or(false))
        .unwrap_or(false);
    let store_build = is_store_distribution();
    let setup = SetupStatus {
        node: tools.node_path.is_some(),
        npm: store_build || tools.npm_path.is_some(),
        project_root_valid,
        project_root_installable,
        root_dependencies: project_root
            .as_ref()
            .map(|root| root.join("node_modules").exists())
            .unwrap_or(false),
        client_dependencies: store_build
            || project_root
                .as_ref()
                .map(|root| root.join("client").join("node_modules").exists())
                .unwrap_or(false),
        env_file: project_root
            .as_ref()
            .map(|root| root.join(".env").exists())
            .unwrap_or(false),
    };

    let logs = state
        .logs
        .lock()
        .map_err(|_| "Log state is locked".to_string())?
        .clone();

    let local_ip = get_local_ip();
    let lan_status = active_process
        .as_ref()
        .and_then(|(_, backend_port, frontend_port)| {
            let actual_frontend_port = if is_store_distribution() {
                *backend_port
            } else {
                *frontend_port
            };
            check_lan_access_status(local_ip.as_deref(), *backend_port, actual_frontend_port)
        });

    let launcher_version = env!("CARGO_PKG_VERSION").to_string();
    let metadata = read_updater_metadata(&app_data_dir);
    let custom_project_path = overrides
        .project_path
        .as_ref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let managed_version = managed_installed_app_version(&app_data_dir, &metadata);
    let app_source = if store_build {
        "store"
    } else if custom_project_path {
        "custom"
    } else if managed_version.is_some() {
        "managed"
    } else if cfg!(debug_assertions) {
        "development"
    } else {
        "missing"
    }
    .to_string();
    let bundled_archive_exists = bundled_app_archive_path(app)
        .map(|path| path.exists())
        .unwrap_or(false);
    let bundled_sync_required = bundled_reconciliation_required(
        store_build,
        custom_project_path,
        active_profile_id.is_some(),
        bundled_archive_exists,
        managed_version.as_deref(),
        &launcher_version,
    );
    let app_version = resolve_current_app_version(
        &app_data_dir,
        &metadata,
        project_root.as_deref(),
        &launcher_version,
    );

    Ok(LauncherSnapshot {
        project_root: project_root
            .as_ref()
            .map(|root| path_string(root))
            .unwrap_or_default(),
        app_data_dir: path_string(&app_data_dir),
        local_ip,
        lan_status,
        tools: vec![
            ToolStatus {
                name: "Node.js".into(),
                path: tools.node_path,
                ok: setup.node,
                detail: if setup.node {
                    "Ready".into()
                } else {
                    "Not found".into()
                },
            },
            ToolStatus {
                name: "npm".into(),
                path: tools.npm_path,
                ok: setup.npm,
                detail: if setup.npm {
                    "Ready".into()
                } else {
                    "Not found".into()
                },
            },
        ],
        setup,
        profiles,
        active_profile_id,
        logs,
        launcher_version,
        app_version,
        app_source,
        bundled_sync_required,
        distribution: distribution().to_string(),
        store_build,
        https_status,
    })
}

pub(crate) fn ready_setup_count(setup: &SetupStatus) -> usize {
    [
        setup.node,
        setup.npm,
        setup.root_dependencies,
        setup.client_dependencies,
        setup.env_file,
    ]
    .iter()
    .filter(|ready| **ready)
    .count()
}
