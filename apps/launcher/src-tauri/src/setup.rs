//! First-time setup: dependency install, bootstrap and Store app files.

use sha2::Digest;
use std::{
    env,
    fs::{self, File},
    path::{Path, PathBuf},
    process::Command as ProcessCommand,
    sync::atomic::Ordering,
    time::SystemTime,
};
use tauri::{Manager, State};

use crate::archive::extract_archive;
use crate::config::is_store_distribution;
use crate::logs::{append_log, append_process_output};
use crate::manifest::{
    validate_app_manifest_policy, verify_manifest_signature, AppManifest, APP_MANIFEST_URL,
};
use crate::node::{
    ensure_portable_node, get_node_major_version, resolve_tools, resolved_command_env,
};
use crate::paths::app_data_dir;
use crate::project::{
    is_empty_dir, is_valid_project_root, project_root_handle, project_run_mode,
    read_version_from_package_json, seed_env_file, validate_project_root, RunMode,
};
use crate::snapshot::{build_snapshot, ready_setup_count};
use crate::state::{InstallFlagGuard, LauncherState};
use crate::types::{CommandResult, ToolOverrides};
use crate::util::path_string;

#[tauri::command]
pub(crate) async fn install_dependencies(
    app: tauri::AppHandle,
    state: State<'_, LauncherState>,
    overrides: Option<ToolOverrides>,
) -> Result<CommandResult, String> {
    if state
        .installing
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err(
            "Setup is already running. Wait for the current install attempt to finish.".into(),
        );
    }
    let _install_guard = InstallFlagGuard {
        flag: &state.installing,
    };

    let overrides = overrides.unwrap_or_default();
    let project_root = project_root_handle(&app, &overrides)?;

    if is_store_distribution() {
        ensure_portable_node(&app, &state).await?;
        sync_store_project_root(&app, &state, &project_root)?;
        seed_env_file(&project_root)?;
        let snapshot = build_snapshot(&app, &state, overrides)?;
        append_log(
            &state,
            "setup",
            "success",
            "HomeInventory Local is ready. App files and runtime were prepared from the Microsoft Store package.",
        );
        return Ok(CommandResult {
            ok: true,
            message: format!(
                "HomeInventory Local prepared. {} setup checks are now ready.",
                ready_setup_count(&snapshot.setup)
            ),
        });
    }

    if !is_valid_project_root(&project_root) {
        bootstrap_project_root(&app, &state, &project_root).await?;
    }
    validate_project_root(&project_root)?;
    seed_env_file(&project_root)?;
    let mut envs = resolved_command_env();
    ensure_portable_node(&app, &state).await?;
    let tools = resolve_tools(&app, &envs, &overrides);
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
    let npm = if is_store_distribution() {
        tools.npm_path.clone().unwrap_or_default()
    } else {
        tools
            .npm_path
            .clone()
            .ok_or_else(|| "npm was not found. Configure the npm path in Settings.".to_string())?
    };

    // A managed install that ships the prebuilt client only needs the
    // server's production dependencies.
    let production = project_run_mode(&app, Some(&project_root)) == RunMode::Production;
    append_log(&state, "setup", "info", "Installing root dependencies...");
    let mut command = ProcessCommand::new(&npm);
    if production {
        command.args(["ci", "--omit=dev", "--no-audit", "--no-fund"]);
    } else {
        command.arg("install");
    }
    command.current_dir(&project_root).envs(&envs);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let output = command
        .output()
        .map_err(|err| format!("Failed to run npm install at root: {err}"))?;

    append_process_output(&state, "setup", &output.stdout, "info");
    append_process_output(&state, "setup", &output.stderr, "error");

    if !output.status.success() {
        return Err(format!(
            "Root dependency install failed with exit code {:?}. Check Logs for details.",
            output.status.code()
        ));
    }

    if production {
        let snapshot = build_snapshot(&app, &state, overrides)?;
        append_log(
            &state,
            "setup",
            "success",
            "Server dependencies installed. The prebuilt app needs no client dependencies.",
        );
        return Ok(CommandResult {
            ok: true,
            message: format!(
                "Dependencies installed. {} setup checks are now ready.",
                ready_setup_count(&snapshot.setup)
            ),
        });
    }

    append_log(&state, "setup", "info", "Installing client dependencies...");
    let mut command2 = ProcessCommand::new(&npm);
    command2
        .arg("install")
        .arg("--prefix")
        .arg("client")
        .current_dir(&project_root)
        .envs(&envs);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command2.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let output2 = command2
        .output()
        .map_err(|err| format!("Failed to run npm install in client: {err}"))?;

    append_process_output(&state, "setup", &output2.stdout, "info");
    append_process_output(&state, "setup", &output2.stderr, "error");

    if output2.status.success() {
        let snapshot = build_snapshot(&app, &state, overrides)?;
        append_log(
            &state,
            "setup",
            "success",
            "Dependencies installed successfully.",
        );
        Ok(CommandResult {
            ok: true,
            message: format!(
                "Dependencies installed. {} setup checks are now ready.",
                ready_setup_count(&snapshot.setup)
            ),
        })
    } else {
        Err(format!(
            "Client dependency install failed with exit code {:?}. Check Logs for details.",
            output2.status.code()
        ))
    }
}

pub(crate) async fn bootstrap_project_root(
    app: &tauri::AppHandle,
    state: &LauncherState,
    target_dir: &Path,
) -> Result<(), String> {
    if is_store_distribution() {
        sync_store_project_root(app, state, target_dir)?;
        return Ok(());
    }

    if !target_dir.is_dir() {
        return Err("Choose an existing empty folder to install HomeInventory.".into());
    }
    if !is_empty_dir(target_dir)? {
        return Err("Selected folder is not empty and is not a HomeInventory install folder. Choose an empty folder or an existing HomeInventory folder.".into());
    }

    append_log(
        state,
        "setup",
        "info",
        "Empty install folder selected. Preparing HomeInventory files...",
    );

    let app_data = app_data_dir(app)?;
    let (archive_path, cleanup_archive, archive_source) = match download_bootstrap_archive(
        app, state, &app_data,
    )
    .await
    {
        Ok(result) => result,
        Err(remote_err) => {
            append_log(
                state,
                "setup",
                "warning",
                &format!(
                    "Online release package unavailable ({remote_err}). Using bundled app package."
                ),
            );
            let bundled_path = bundled_app_archive_path(app)?;
            if !bundled_path.exists() {
                return Err(format!(
                        "Could not download the online release package and the bundled app package is missing: {}",
                        path_string(&bundled_path)
                    ));
            }
            (bundled_path, false, "bundled")
        }
    };

    append_log(state, "setup", "info", "Extracting app files...");
    let staging_dir = app_data.join("managed-app").join("bootstrap-staging");
    let _ = fs::remove_dir_all(&staging_dir);
    extract_archive(&archive_path, &staging_dir)?;
    if cleanup_archive {
        let _ = fs::remove_file(&archive_path);
    }

    let source_dir = normalized_extracted_project_dir(&staging_dir)?;
    move_dir_contents(&source_dir, target_dir)?;
    let _ = fs::remove_dir_all(&staging_dir);
    seed_env_file(target_dir)?;

    append_log(
        state,
        "setup",
        "success",
        &format!(
            "HomeInventory app files installed from {archive_source} package into {}.",
            path_string(target_dir)
        ),
    );
    Ok(())
}

pub(crate) fn sync_store_project_root(
    app: &tauri::AppHandle,
    state: &LauncherState,
    target_dir: &Path,
) -> Result<(), String> {
    let bundled_path = bundled_app_archive_path(app)?;
    if !bundled_path.exists() {
        return Err(format!(
            "HomeInventory Local installation is broken: bundled app package is missing: {}",
            path_string(&bundled_path)
        ));
    }

    let bundled_metadata = fs::metadata(&bundled_path).ok();
    let stamp_metadata = fs::metadata(target_dir.join(".extraction_success")).ok();

    let needs_extract = match (bundled_metadata, stamp_metadata) {
        (Some(b), Some(s)) => {
            let b_time = b.modified().unwrap_or(SystemTime::UNIX_EPOCH);
            let s_time = s.modified().unwrap_or(SystemTime::UNIX_EPOCH);
            b_time > s_time
        }
        _ => true,
    };

    let bundled_version = env!("CARGO_PKG_VERSION").to_string();
    let current_version = read_version_from_package_json(target_dir);
    if is_valid_project_root(target_dir)
        && current_version.as_deref() == Some(&bundled_version)
        && !needs_extract
    {
        return Ok(());
    }

    append_log(
        state,
        "setup",
        "info",
        "Preparing HomeInventory Local app files from the Microsoft Store package...",
    );

    let app_data = app_data_dir(app)?;
    let staging_dir = app_data.join("managed-app").join("store-staging");
    let _ = fs::remove_dir_all(&staging_dir);
    extract_archive(&bundled_path, &staging_dir)?;
    let source_dir = normalized_extracted_project_dir(&staging_dir)?;

    if target_dir.exists() {
        fs::remove_dir_all(target_dir)
            .map_err(|err| format!("Could not replace Store app files: {err}"))?;
    }
    fs::create_dir_all(target_dir).map_err(|err| err.to_string())?;
    move_dir_contents(&source_dir, target_dir)?;
    let _ = fs::remove_dir_all(&staging_dir);
    seed_env_file(target_dir)?;
    fs::write(target_dir.join(".extraction_success"), "success").map_err(|err| err.to_string())?;

    append_log(
        state,
        "setup",
        "success",
        &format!(
            "HomeInventory Local app files are ready at {}.",
            path_string(target_dir)
        ),
    );
    Ok(())
}

pub(crate) async fn download_bootstrap_archive(
    app: &tauri::AppHandle,
    state: &LauncherState,
    app_data: &Path,
) -> Result<(PathBuf, bool, &'static str), String> {
    append_log(
        state,
        "setup",
        "info",
        "Checking signed online HomeInventory release package...",
    );

    let client = reqwest::Client::new();
    let manifest_resp = client
        .get(APP_MANIFEST_URL)
        .send()
        .await
        .map_err(|err| format!("failed to download app manifest: {err}"))?;
    if !manifest_resp.status().is_success() {
        return Err(format!(
            "app manifest returned HTTP {}",
            manifest_resp.status()
        ));
    }
    let manifest = manifest_resp
        .json::<AppManifest>()
        .await
        .map_err(|err| format!("failed to parse app manifest: {err}"))?;
    verify_manifest_signature(&manifest)?;
    validate_app_manifest_policy(&manifest)?;

    let bundled_version = env!("CARGO_PKG_VERSION");
    if bundled_app_is_same_or_newer(bundled_version, &manifest.version) {
        let bundled_path = bundled_app_archive_path(app)?;
        if !bundled_path.exists() {
            return Err(format!(
                "bundled app version {bundled_version} is newer than online version {}, but its archive is missing: {}",
                manifest.version,
                path_string(&bundled_path)
            ));
        }
        append_log(
            state,
            "setup",
            "info",
            &format!(
                "Bundled HomeInventory {bundled_version} is newer than online release {}. Using bundled app package.",
                manifest.version
            ),
        );
        return Ok((bundled_path, false, "bundled"));
    }

    let node_major = get_node_major_version(app).await.unwrap_or(0);
    if node_major > 0 && node_major < manifest.node_major {
        return Err(format!(
            "HomeInventory requires Node.js v{}.0 or newer. Detected v{}.0.",
            manifest.node_major, node_major
        ));
    }

    let temp_archive_path = app_data
        .join("managed-app")
        .join("bootstrap-release.tar.gz");
    if let Some(parent) = temp_archive_path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    append_log(state, "setup", "info", "Downloading app files...");
    let mut archive_resp = client
        .get(&manifest.url)
        .send()
        .await
        .map_err(|err| format!("failed to download app archive: {err}"))?;
    if !archive_resp.status().is_success() {
        return Err(format!(
            "app archive returned HTTP {}",
            archive_resp.status()
        ));
    }

    let mut archive_file = File::create(&temp_archive_path).map_err(|err| err.to_string())?;
    let mut sha_hasher = sha2::Sha256::new();
    while let Some(chunk) = archive_resp
        .chunk()
        .await
        .map_err(|err| format!("error downloading app archive: {err}"))?
    {
        use std::io::Write;
        archive_file
            .write_all(&chunk)
            .map_err(|err| err.to_string())?;
        sha_hasher.update(&chunk);
    }
    drop(archive_file);

    let calculated_hash = format!("{:x}", sha_hasher.finalize());
    if calculated_hash != manifest.sha256 {
        let _ = fs::remove_file(&temp_archive_path);
        return Err(format!(
            "downloaded app archive checksum did not match. Expected {}, got {}",
            manifest.sha256, calculated_hash
        ));
    }

    Ok((temp_archive_path, true, "online"))
}

pub(crate) fn should_prefer_bundled_app_version(
    bundled_version: &str,
    online_version: &str,
) -> bool {
    let Ok(bundled) = semver::Version::parse(bundled_version) else {
        return false;
    };
    let Ok(online) = semver::Version::parse(online_version) else {
        return true;
    };
    bundled > online
}

pub(crate) fn bundled_app_is_same_or_newer(bundled_version: &str, online_version: &str) -> bool {
    let Ok(bundled) = semver::Version::parse(bundled_version) else {
        return false;
    };
    let Ok(online) = semver::Version::parse(online_version) else {
        return true;
    };
    bundled >= online
}

pub(crate) fn bundled_app_archive_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|err| format!("Could not resolve launcher resource directory: {err}"))?;
    if is_store_distribution() {
        let direct = resource_dir.join("homeinventory-app-store.tar.gz");
        if direct.exists() {
            return Ok(direct);
        }
        return Ok(resource_dir
            .join("resources")
            .join("homeinventory-app-store.tar.gz"));
    }
    let direct = resource_dir.join("homeinventory-app.tar.gz");
    if direct.exists() {
        return Ok(direct);
    }
    Ok(resource_dir
        .join("resources")
        .join("homeinventory-app.tar.gz"))
}

pub(crate) fn normalized_extracted_project_dir(staging_dir: &Path) -> Result<PathBuf, String> {
    if is_valid_project_root(staging_dir) {
        return Ok(staging_dir.to_path_buf());
    }

    let dirs = fs::read_dir(staging_dir)
        .map_err(|err| format!("Could not inspect extracted archive: {err}"))?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false))
        .map(|entry| entry.path())
        .collect::<Vec<_>>();

    if dirs.len() == 1 && is_valid_project_root(&dirs[0]) {
        return Ok(dirs[0].clone());
    }

    Err("Downloaded app archive did not contain a valid HomeInventory install package.".into())
}

pub(crate) fn move_dir_contents(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|err| err.to_string())?;
    for entry in
        fs::read_dir(source).map_err(|err| format!("Could not read extracted files: {err}"))?
    {
        let entry = entry.map_err(|err| err.to_string())?;
        let target = destination.join(entry.file_name());
        fs::rename(entry.path(), &target).map_err(|err| {
            format!(
                "Could not move extracted file into install folder ({}): {err}",
                path_string(&target)
            )
        })?;
    }
    Ok(())
}
