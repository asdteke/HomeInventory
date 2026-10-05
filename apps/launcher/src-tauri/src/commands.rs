//! Small Tauri commands for paths, browser opening, backups, `.env` edits and logs.

use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::State;

use crate::config::profile_config;
use crate::paths::{app_data_dir, profile_paths};
use crate::platform::{choose_path_platform, open_path, open_url};
use crate::process::{reconcile_active, stop_all_internal};
use crate::project::project_root_handle;
use crate::snapshot::build_snapshot;
use crate::state::LauncherState;
use crate::types::{
    BackupRequest, BackupResult, ChoosePathRequest, CommandResult, LauncherSnapshot, LogEntry,
    ToolOverrides, WriteEnvRequest,
};
use crate::util::{copy_dir_all, now, path_string, set_private_permissions};

#[tauri::command]
pub(crate) fn detect_tools(
    app: tauri::AppHandle,
    state: State<LauncherState>,
    overrides: Option<ToolOverrides>,
) -> Result<LauncherSnapshot, String> {
    reconcile_active(&state);
    build_snapshot(&app, &state, overrides.unwrap_or_default())
}

#[tauri::command]
pub(crate) fn choose_path(request: ChoosePathRequest) -> Result<Option<String>, String> {
    match request.kind.as_str() {
        "project" | "node" | "npm" => choose_path_platform(&request.kind),
        _ => Err("Unsupported path picker type.".into()),
    }
}

#[tauri::command]
pub(crate) fn reveal_path(path: String) -> Result<CommandResult, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("No path was provided.".into());
    }

    let path = PathBuf::from(trimmed);
    let target = if path.is_file() {
        path.parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "Could not resolve containing folder.".to_string())?
    } else {
        path
    };

    if !target.exists() {
        return Err(format!("Path does not exist: {}", path_string(&target)));
    }

    open_path(&target)?;
    Ok(CommandResult {
        ok: true,
        message: format!("Opening {}", path_string(&target)),
    })
}

#[tauri::command]
pub(crate) fn stop_profile(state: State<LauncherState>) -> Result<CommandResult, String> {
    stop_all_internal(&state)?;
    Ok(CommandResult {
        ok: true,
        message: "Stopped active profile.".into(),
    })
}

#[tauri::command]
pub(crate) fn stop_all(state: State<LauncherState>) -> Result<CommandResult, String> {
    stop_all_internal(&state)?;
    Ok(CommandResult {
        ok: true,
        message: "All launcher-managed processes are stopped.".into(),
    })
}

#[tauri::command]
pub(crate) fn open_app(url: String) -> Result<CommandResult, String> {
    let normalized = url.trim();
    validate_local_app_url(normalized)?;

    open_url(normalized)?;
    Ok(CommandResult {
        ok: true,
        message: format!("Opening {normalized}"),
    })
}

pub(crate) fn validate_local_app_url(value: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(value)
        .map_err(|_| "Launcher can only open a valid local HomeInventory URL.".to_string())?;
    let local_host = matches!(parsed.host_str(), Some("localhost" | "127.0.0.1"));
    let valid_port = parsed
        .port()
        .map(|port| (1024..=65535).contains(&port))
        .unwrap_or(false);
    if parsed.scheme() != "http"
        || !local_host
        || !valid_port
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("Launcher can only open local HomeInventory URLs.".into());
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn backup_now(
    app: tauri::AppHandle,
    request: BackupRequest,
) -> Result<BackupResult, String> {
    let app_data_dir = app_data_dir(&app)?;
    let profile = profile_config(&request.profile_id)?;
    let paths = profile_paths(&app_data_dir, profile);
    let backup_root = app_data_dir.join("backups");
    fs::create_dir_all(&backup_root).map_err(|err| err.to_string())?;
    let destination = backup_root.join(format!("{}-{}", profile.id, now()));
    fs::create_dir_all(&destination).map_err(|err| err.to_string())?;

    if paths.data_dir.exists() {
        copy_dir_all(&paths.data_dir, &destination.join("data")).map_err(|err| err.to_string())?;
    }
    if paths.uploads_dir.exists() {
        copy_dir_all(&paths.uploads_dir, &destination.join("uploads"))
            .map_err(|err| err.to_string())?;
    }

    Ok(BackupResult {
        ok: true,
        message: format!("Backup created at {}", path_string(&destination)),
        path: path_string(&destination),
    })
}

#[tauri::command]
pub(crate) fn write_env(
    app: tauri::AppHandle,
    overrides: Option<ToolOverrides>,
    request: WriteEnvRequest,
) -> Result<CommandResult, String> {
    let overrides = overrides.unwrap_or_default();
    let project_root = project_root_handle(&app, &overrides)?;
    let env_path = project_root.join(".env");
    let example_path = project_root.join(".env.example");

    // If .env doesn't exist, seed from .env.example
    if !env_path.exists() && example_path.exists() {
        fs::copy(&example_path, &env_path)
            .map_err(|err| format!("Could not copy .env.example: {err}"))?;
    } else if !env_path.exists() {
        fs::write(&env_path, "# HomeInventory Environment\n")
            .map_err(|err| format!("Could not create .env: {err}"))?;
    }
    set_private_permissions(&env_path, false)?;

    let content =
        fs::read_to_string(&env_path).map_err(|err| format!("Could not read .env: {err}"))?;

    let mut lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();

    for (key, value) in &request.entries {
        if value.trim().is_empty() {
            continue;
        }
        let prefix = format!("{}=", key);
        let mut found = false;
        for line in lines.iter_mut() {
            let trimmed = line.trim();
            // Match both active and commented-out keys
            if trimmed.starts_with(&prefix) || trimmed.starts_with(&format!("# {}", prefix)) {
                *line = format!("{}={}", key, value);
                found = true;
                break;
            }
        }
        if !found {
            lines.push(format!("{}={}", key, value));
        }
    }

    let merged = lines.join("\n") + "\n";
    fs::write(&env_path, merged).map_err(|err| format!("Could not write .env: {err}"))?;
    set_private_permissions(&env_path, false)?;

    Ok(CommandResult {
        ok: true,
        message: format!("Environment updated with {} key(s).", request.entries.len()),
    })
}

#[tauri::command]
pub(crate) fn read_logs(state: State<LauncherState>) -> Result<Vec<LogEntry>, String> {
    let logs = state
        .logs
        .lock()
        .map_err(|_| "Log state is locked".to_string())?;
    Ok(logs.clone())
}
