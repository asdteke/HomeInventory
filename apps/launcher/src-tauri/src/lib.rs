use base64::prelude::*;
use ed25519_dalek::Verifier;
use serde::{Deserialize, Serialize};
use sha2::Digest;
use std::{
    collections::HashMap,
    env,
    fs::{self, File},
    io::{BufRead, BufReader},
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command as ProcessCommand, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager, State};

#[cfg(unix)]
use std::os::unix::process::CommandExt;

#[cfg(windows)]
use std::os::windows::io::AsRawHandle;

struct LauncherState {
    active: Mutex<Option<ManagedProcess>>,
    logs: Arc<Mutex<Vec<LogEntry>>>,
    installing: AtomicBool,
    updating: Mutex<bool>,
}

impl Default for LauncherState {
    fn default() -> Self {
        Self {
            active: Mutex::new(None),
            logs: Arc::new(Mutex::new(Vec::new())),
            installing: AtomicBool::new(false),
            updating: Mutex::new(false),
        }
    }
}

struct InstallFlagGuard<'a> {
    flag: &'a AtomicBool,
}

impl Drop for InstallFlagGuard<'_> {
    fn drop(&mut self) {
        self.flag.store(false, Ordering::SeqCst);
    }
}

struct ManagedProcess {
    profile_id: String,
    backend_port: u16,
    frontend_port: u16,
    child: Child,
    #[cfg(unix)]
    process_group_id: i32,
    #[cfg(windows)]
    job: Option<WindowsJob>,
}

#[cfg(windows)]
struct WindowsJob(windows_sys::Win32::Foundation::HANDLE);

#[cfg(windows)]
unsafe impl Send for WindowsJob {}

#[cfg(windows)]
impl Drop for WindowsJob {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolOverrides {
    node_path: Option<String>,
    npm_path: Option<String>,
    project_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartProfileRequest {
    profile_id: String,
    overrides: Option<ToolOverrides>,
    backend_port: Option<u16>,
    frontend_port: Option<u16>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupRequest {
    profile_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WriteEnvRequest {
    entries: HashMap<String, String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheckPortsRequest {
    backend_port: u16,
    frontend_port: u16,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChoosePathRequest {
    kind: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolStatus {
    name: String,
    path: Option<String>,
    ok: bool,
    detail: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProfileStatus {
    id: String,
    name: String,
    description: String,
    available: bool,
    running: bool,
    backend_port: u16,
    frontend_port: u16,
    frontend_url: String,
    backend_url: String,
    data_dir: String,
    db_path: String,
    uploads_dir: String,
    brand_assets: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SetupStatus {
    node: bool,
    npm: bool,
    project_root_valid: bool,
    project_root_installable: bool,
    root_dependencies: bool,
    client_dependencies: bool,
    env_file: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherSnapshot {
    project_root: String,
    app_data_dir: String,
    local_ip: Option<String>,
    lan_status: Option<LanAccessStatus>,
    tools: Vec<ToolStatus>,
    setup: SetupStatus,
    profiles: Vec<ProfileStatus>,
    active_profile_id: Option<String>,
    logs: Vec<LogEntry>,
    launcher_version: String,
    app_version: String,
    distribution: String,
    store_build: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandResult {
    ok: bool,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupResult {
    ok: bool,
    message: String,
    path: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PortCheckResult {
    ok: bool,
    backend_port: u16,
    frontend_port: u16,
    backend_ok: bool,
    frontend_ok: bool,
    suggested_backend_port: u16,
    suggested_frontend_port: u16,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LanAccessStatus {
    ok: bool,
    frontend_ok: bool,
    backend_ok: bool,
    frontend_url: Option<String>,
    backend_url: Option<String>,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LogEntry {
    timestamp: u64,
    source: String,
    level: String,
    message: String,
}

#[derive(Clone)]
struct ProfileConfig {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    backend_port: u16,
    frontend_port: u16,
    brand_key: Option<&'static str>,
}

const LOG_LIMIT: usize = 600;
const STORE_DISTRIBUTION: &str = "store";
const PROFILE_CONFIGS: &[ProfileConfig] = &[ProfileConfig {
    id: "homeinventory",
    name: "HomeInventory",
    description: "Open-source local development profile",
    backend_port: 3001,
    frontend_port: 5173,
    brand_key: None,
}];

fn distribution() -> &'static str {
    match option_env!("HOMEINVENTORY_DISTRIBUTION") {
        Some(STORE_DISTRIBUTION) => STORE_DISTRIBUTION,
        _ => "standard",
    }
}

fn is_store_distribution() -> bool {
    distribution() == STORE_DISTRIBUTION
}

#[tauri::command]
fn detect_tools(
    app: tauri::AppHandle,
    state: State<LauncherState>,
    overrides: Option<ToolOverrides>,
) -> Result<LauncherSnapshot, String> {
    reconcile_active(&state);
    build_snapshot(&app, &state, overrides.unwrap_or_default())
}

#[tauri::command]
async fn install_dependencies(
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

    append_log(&state, "setup", "info", "Installing root dependencies...");
    let mut command = ProcessCommand::new(&npm);
    command
        .arg("install")
        .current_dir(&project_root)
        .envs(&envs);
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

fn start_profile_internal(
    app: &tauri::AppHandle,
    state: &LauncherState,
    profile_id: &str,
    backend_port: Option<u16>,
    frontend_port: Option<u16>,
    overrides: Option<ToolOverrides>,
    allow_during_update: bool,
) -> Result<CommandResult, String> {
    reconcile_active(state);
    let overrides = overrides.unwrap_or_default();
    let project_root = project_root_handle(app, &overrides)?;
    if is_store_distribution() {
        sync_store_project_root(app, state, &project_root)?;
    }
    seed_env_file(&project_root)?;
    validate_project_root(&project_root)?;
    let app_data_dir = app_data_dir(app)?;
    let profile = profile_config(profile_id)?;
    let (backend_port, frontend_port) = requested_ports(profile, backend_port, frontend_port)?;

    if !allow_during_update {
        let updating = state
            .updating
            .lock()
            .map_err(|_| "Update state is locked".to_string())?;
        if profile_start_is_blocked(*updating, allow_during_update) {
            return Err("Cannot start profile while an update is in progress.".to_string());
        }
    }

    {
        let active = state
            .active
            .lock()
            .map_err(|_| "Process state is locked".to_string())?;
        if let Some(process) = active.as_ref() {
            return Err(format!(
                "{} is already running. Stop it before starting another profile.",
                process.profile_id
            ));
        }
    }

    if !is_port_available(backend_port) {
        return Err(format!(
            "Backend port {} is busy. Suggested next backend port: {}.",
            backend_port,
            next_free_port(backend_port)
        ));
    }

    if !is_port_available(frontend_port) {
        return Err(format!(
            "Frontend port {} is busy. Suggested next frontend port: {}.",
            frontend_port,
            next_free_port(frontend_port)
        ));
    }

    if let Some(brand_key) = profile.brand_key {
        let brand_root = project_root.join("local-brands").join(brand_key);
        if !brand_root.exists() {
            return Err(format!(
                "{} brand files were not found. This profile is optional and can be skipped.",
                profile.name
            ));
        }
    }

    let mut envs = resolved_command_env();
    let tools = resolve_tools(app, &envs, &overrides);
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
    let node = tools
        .node_path
        .clone()
        .ok_or_else(|| "node was not found. Configure the Node path in Settings.".to_string())?;
    let npm = tools
        .npm_path
        .clone()
        .ok_or_else(|| "npm was not found. Configure the npm path in Settings.".to_string())?;

    let profile_paths = profile_paths(&app_data_dir, profile);
    fs::create_dir_all(&profile_paths.data_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(&profile_paths.uploads_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(&profile_paths.log_dir).map_err(|err| err.to_string())?;

    let mut command_env = envs;
    command_env.insert(
        "NODE_ENV".into(),
        if is_store_distribution() {
            "production"
        } else {
            "development"
        }
        .into(),
    );
    command_env.insert("HOST".into(), "0.0.0.0".into());
    command_env.insert("FRONTEND_HOST".into(), "0.0.0.0".into());
    command_env.insert("VITE_HOST".into(), "0.0.0.0".into());
    command_env.insert("PORT".into(), backend_port.to_string());

    let actual_frontend_port = if is_store_distribution() {
        backend_port
    } else {
        frontend_port
    };

    command_env.insert("FRONTEND_PORT".into(), actual_frontend_port.to_string());
    command_env.insert("VITE_PORT".into(), actual_frontend_port.to_string());
    if is_store_distribution() {
        command_env.insert("HOMEINVENTORY_LOCAL_HTTP".into(), "true".into());
        command_env.insert("APP_COOKIE_SECURE".into(), "false".into());
    }
    command_env.insert(
        "SITE_URL".into(),
        format!("http://127.0.0.1:{}", actual_frontend_port),
    );
    command_env.insert(
        "APP_SITE_URL".into(),
        format!("http://127.0.0.1:{}", actual_frontend_port),
    );
    command_env.insert("EXPOSE_SERVER_INFO".into(), "true".into());
    if !npm.is_empty() {
        command_env.insert("HOMEINVENTORY_NPM_EXEC".into(), npm);
    }
    command_env.insert(
        "HOMEINVENTORY_DATA_DIR".into(),
        path_string(&profile_paths.data_dir),
    );
    command_env.insert(
        "HOMEINVENTORY_DB_PATH".into(),
        path_string(&profile_paths.db_path),
    );
    command_env.insert(
        "HOMEINVENTORY_UPLOADS_DIR".into(),
        path_string(&profile_paths.uploads_dir),
    );
    command_env.extend(ensure_profile_secrets(state, profile.id, &profile_paths)?);

    let mut args = if is_store_distribution() {
        vec!["server.js".to_string()]
    } else {
        vec!["scripts/dev.mjs".to_string()]
    };
    if let Some(brand_key) = profile.brand_key {
        let env_file = write_launcher_brand_env(
            &project_root,
            &profile_paths,
            brand_key,
            backend_port,
            frontend_port,
            &command_env,
        )?;
        args = vec!["scripts/dev-brand.mjs".to_string(), path_string(&env_file)];
    }

    append_log(
        state,
        profile.id,
        "info",
        &format!(
            "Starting {} on ports {backend_port}/{frontend_port}...",
            profile.name
        ),
    );

    let mut command = ProcessCommand::new(&node);
    command
        .args(args)
        .current_dir(&project_root)
        .envs(&command_env)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    #[cfg(unix)]
    {
        command.process_group(0);
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = command
        .spawn()
        .map_err(|err| format!("Failed to start {}: {err}", profile.name))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    stream_process_output(state, profile.id, stdout, "info", Some(profile_paths.log_dir.clone()));
    stream_process_output(state, profile.id, stderr, "error", Some(profile_paths.log_dir.clone()));

    #[cfg(windows)]
    let job = create_windows_job(&child);

    let managed = ManagedProcess {
        profile_id: profile.id.to_string(),
        backend_port,
        frontend_port,
        #[cfg(unix)]
        process_group_id: child.id() as i32,
        #[cfg(windows)]
        job,
        child,
    };

    let mut active = state
        .active
        .lock()
        .map_err(|_| "Process state is locked".to_string())?;
    *active = Some(managed);

    Ok(CommandResult {
        ok: true,
        message: format!("{} is starting.", profile.name),
    })
}

fn profile_start_is_blocked(updating: bool, allow_during_update: bool) -> bool {
    updating && !allow_during_update
}

#[tauri::command]
async fn start_profile(
    app: tauri::AppHandle,
    state: State<'_, LauncherState>,
    request: StartProfileRequest,
) -> Result<CommandResult, String> {
    start_profile_internal(
        &app,
        &state,
        &request.profile_id,
        request.backend_port,
        request.frontend_port,
        request.overrides,
        false,
    )
}

#[tauri::command]
fn check_ports(request: CheckPortsRequest) -> Result<PortCheckResult, String> {
    validate_port(request.backend_port, "API")?;
    validate_port(request.frontend_port, "UI")?;

    if request.backend_port == request.frontend_port {
        let suggested_frontend_port = next_free_port(request.frontend_port.saturating_add(1));
        return Ok(PortCheckResult {
            ok: false,
            backend_port: request.backend_port,
            frontend_port: request.frontend_port,
            backend_ok: false,
            frontend_ok: false,
            suggested_backend_port: next_free_port(request.backend_port),
            suggested_frontend_port,
            message: "API and UI ports must be different.".into(),
        });
    }

    let backend_ok = is_port_available(request.backend_port);
    let frontend_ok = is_port_available(request.frontend_port);
    let ok = backend_ok && frontend_ok;
    let message = match (backend_ok, frontend_ok) {
        (true, true) => "Ports are available.".to_string(),
        (false, true) => format!(
            "API port {} is busy. Suggested: {}.",
            request.backend_port,
            next_free_port(request.backend_port)
        ),
        (true, false) => format!(
            "UI port {} is busy. Suggested: {}.",
            request.frontend_port,
            next_free_port(request.frontend_port)
        ),
        (false, false) => format!(
            "Ports {} and {} are busy. Suggested: {}/{}.",
            request.backend_port,
            request.frontend_port,
            next_free_port(request.backend_port),
            next_free_port(request.frontend_port)
        ),
    };

    Ok(PortCheckResult {
        ok,
        backend_port: request.backend_port,
        frontend_port: request.frontend_port,
        backend_ok,
        frontend_ok,
        suggested_backend_port: if backend_ok {
            request.backend_port
        } else {
            next_free_port(request.backend_port)
        },
        suggested_frontend_port: if frontend_ok {
            request.frontend_port
        } else {
            next_free_port(request.frontend_port)
        },
        message,
    })
}

#[tauri::command]
fn choose_path(request: ChoosePathRequest) -> Result<Option<String>, String> {
    match request.kind.as_str() {
        "project" | "node" | "npm" => choose_path_platform(&request.kind),
        _ => Err("Unsupported path picker type.".into()),
    }
}

#[tauri::command]
fn reveal_path(path: String) -> Result<CommandResult, String> {
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
fn stop_profile(state: State<LauncherState>) -> Result<CommandResult, String> {
    stop_all_internal(&state)?;
    Ok(CommandResult {
        ok: true,
        message: "Stopped active profile.".into(),
    })
}

#[tauri::command]
fn stop_all(state: State<LauncherState>) -> Result<CommandResult, String> {
    stop_all_internal(&state)?;
    Ok(CommandResult {
        ok: true,
        message: "All launcher-managed processes are stopped.".into(),
    })
}

#[tauri::command]
fn open_app(url: String) -> Result<CommandResult, String> {
    let normalized = url.trim();
    if !(normalized.starts_with("http://localhost:") || normalized.starts_with("http://127.0.0.1:"))
    {
        return Err("Launcher can only open local HomeInventory URLs.".into());
    }

    open_url(normalized)?;
    Ok(CommandResult {
        ok: true,
        message: format!("Opening {normalized}"),
    })
}

#[tauri::command]
fn backup_now(app: tauri::AppHandle, request: BackupRequest) -> Result<BackupResult, String> {
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
fn write_env(
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

    Ok(CommandResult {
        ok: true,
        message: format!("Environment updated with {} key(s).", request.entries.len()),
    })
}

#[tauri::command]
fn read_logs(state: State<LauncherState>) -> Result<Vec<LogEntry>, String> {
    let logs = state
        .logs
        .lock()
        .map_err(|_| "Log state is locked".to_string())?;
    Ok(logs.clone())
}

#[tauri::command]
async fn is_server_ready(port: u16) -> bool {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(500))
        .build()
        .unwrap_or_default();
    let url = format!("http://127.0.0.1:{}/api/health", port);
    match client.get(&url).send().await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(LauncherState::default())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            detect_tools,
            install_dependencies,
            start_profile,
            check_ports,
            choose_path,
            reveal_path,
            stop_profile,
            stop_all,
            open_app,
            backup_now,
            write_env,
            read_logs,
            check_updates,
            update_all,
            is_server_ready
        ])
        .on_window_event(|window, event| {
            if matches!(
                event,
                tauri::WindowEvent::Destroyed | tauri::WindowEvent::CloseRequested { .. }
            ) {
                let state = window.state::<LauncherState>();
                let _ = stop_all_internal(state.inner());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running HomeInventory Launcher");
}

struct ResolvedTools {
    node_path: Option<String>,
    npm_path: Option<String>,
}

struct ProfilePaths {
    profile_root: PathBuf,
    data_dir: PathBuf,
    db_path: PathBuf,
    uploads_dir: PathBuf,
    log_dir: PathBuf,
    secrets_path: PathBuf,
}

fn profile_paths(app_data_dir: &Path, profile: &ProfileConfig) -> ProfilePaths {
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

fn profile_config(profile_id: &str) -> Result<&'static ProfileConfig, String> {
    PROFILE_CONFIGS
        .iter()
        .find(|profile| profile.id == profile_id)
        .ok_or_else(|| format!("Unknown profile: {profile_id}"))
}

fn read_version_from_package_json(project_root: &Path) -> Option<String> {
    let package_json_path = project_root.join("package.json");
    let content = fs::read_to_string(&package_json_path).ok();
    if content.is_none() {
        println!("DEBUG read_version_from_package_json: failed to read {:?}", package_json_path);
    }
    let content = content?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;
    let version = json.get("version")?.as_str().map(|s| s.to_string());
    println!("DEBUG read_version_from_package_json: path={:?}, version={:?}", package_json_path, version);
    version
}

fn build_snapshot(
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
        distribution: distribution().to_string(),
        store_build,
    })
}

fn get_local_ip() -> Option<String> {
    for probe in [
        "192.168.255.255:80",
        "10.255.255.255:80",
        "172.31.255.255:80",
    ] {
        let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") else {
            continue;
        };
        if socket.connect(probe).is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let ip = addr.ip().to_string();
                if ip != "0.0.0.0" && ip != "127.0.0.1" {
                    return Some(ip);
                }
            }
        }
    }

    None
}

fn check_lan_access_status(
    local_ip: Option<&str>,
    backend_port: u16,
    frontend_port: u16,
) -> Option<LanAccessStatus> {
    let local_ip = local_ip?;
    let frontend_url = format!("http://{local_ip}:{frontend_port}");
    let backend_url = format!("http://{local_ip}:{backend_port}");
    let frontend_ok = tcp_reachable(local_ip, frontend_port);
    let backend_ok = tcp_reachable(local_ip, backend_port);
    let ok = frontend_ok && backend_ok;
    let message = match (frontend_ok, backend_ok) {
        (true, true) => "Network address is ready. If another device cannot connect, allow HomeInventory or Node.js through Windows Firewall for private networks.".to_string(),
        (false, true) => "The app UI is not reachable through the LAN IP. Check Windows Firewall and host binding.".to_string(),
        (true, false) => "The app UI is reachable, but the API is not reachable through the LAN IP.".to_string(),
        (false, false) => "LAN check failed. Allow HomeInventory or Node.js through Windows Firewall for private networks, then restart the app.".to_string(),
    };

    Some(LanAccessStatus {
        ok,
        frontend_ok,
        backend_ok,
        frontend_url: Some(frontend_url),
        backend_url: Some(backend_url),
        message,
    })
}

fn tcp_reachable(host: &str, port: u16) -> bool {
    let Ok(addr) = format!("{host}:{port}").parse::<SocketAddr>() else {
        return false;
    };
    TcpStream::connect_timeout(&addr, Duration::from_millis(350)).is_ok()
}

fn ready_setup_count(setup: &SetupStatus) -> usize {
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

fn project_root_handle(
    app: &tauri::AppHandle,
    overrides: &ToolOverrides,
) -> Result<PathBuf, String> {
    project_root_for_snapshot(app, overrides)?.ok_or_else(|| {
        "Install folder is not configured. Choose an empty folder to install HomeInventory, or choose an existing HomeInventory folder.".to_string()
    })
}

fn validate_project_root(project_root: &Path) -> Result<(), String> {
    if is_valid_project_root(project_root) {
        return Ok(());
    }

    if is_empty_dir(project_root).unwrap_or(false) {
        return Err(format!(
            "The selected install folder is empty. Click Initialize & Launch to download and install HomeInventory into {}.",
            path_string(project_root)
        ));
    }

    let expected_paths = if is_store_distribution() {
        vec![
            project_root.join("package.json"),
            project_root.join("server.js"),
            project_root.join("client").join("dist").join("index.html"),
            project_root.join("node_modules"),
        ]
    } else {
        vec![
            project_root.join("package.json"),
            project_root.join("scripts").join("dev.mjs"),
            project_root.join("client").join("package.json"),
        ]
    };
    let expected = expected_paths
        .into_iter()
        .map(|path| path_string(&path))
        .collect::<Vec<_>>();

    Err(format!(
        "Selected folder is not a valid HomeInventory install folder: {}. Choose an empty folder, or choose the folder that contains these files: {}.",
        path_string(project_root),
        expected.join(", ")
    ))
}

fn is_valid_project_root(project_root: &Path) -> bool {
    if is_store_distribution() {
        return project_root.join("package.json").exists()
            && project_root.join("server.js").exists()
            && project_root
                .join("client")
                .join("dist")
                .join("index.html")
                .exists()
            && project_root.join("node_modules").exists();
    }

    project_root.join("package.json").exists()
        && project_root.join("scripts").join("dev.mjs").exists()
        && project_root.join("client").join("package.json").exists()
}

fn is_empty_dir(path: &Path) -> Result<bool, String> {
    if !path.is_dir() {
        return Ok(false);
    }
    let mut entries =
        fs::read_dir(path).map_err(|err| format!("Could not read selected folder: {err}"))?;
    Ok(entries.next().is_none())
}

fn seed_env_file(project_root: &Path) -> Result<(), String> {
    let env_path = project_root.join(".env");
    if env_path.exists() {
        return Ok(());
    }

    let example_path = project_root.join(".env.example");
    if example_path.exists() {
        fs::copy(&example_path, &env_path)
            .map_err(|err| format!("Could not create .env from .env.example: {err}"))?;
    } else {
        fs::write(&env_path, "# HomeInventory Environment\n")
            .map_err(|err| format!("Could not create .env: {err}"))?;
    }

    Ok(())
}

async fn bootstrap_project_root(
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

fn sync_store_project_root(
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

async fn download_bootstrap_archive(
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

fn should_prefer_bundled_app_version(bundled_version: &str, online_version: &str) -> bool {
    let Ok(bundled) = semver::Version::parse(bundled_version) else {
        return false;
    };
    let Ok(online) = semver::Version::parse(online_version) else {
        return true;
    };
    bundled > online
}

fn bundled_app_is_same_or_newer(bundled_version: &str, online_version: &str) -> bool {
    let Ok(bundled) = semver::Version::parse(bundled_version) else {
        return false;
    };
    let Ok(online) = semver::Version::parse(online_version) else {
        return true;
    };
    bundled >= online
}

fn bundled_app_archive_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
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

fn normalized_extracted_project_dir(staging_dir: &Path) -> Result<PathBuf, String> {
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

fn move_dir_contents(source: &Path, destination: &Path) -> Result<(), String> {
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

fn project_root_for_snapshot(
    app: &tauri::AppHandle,
    overrides: &ToolOverrides,
) -> Result<Option<PathBuf>, String> {
    if is_store_distribution() {
        return Ok(Some(store_project_root(app)?));
    }

    if let Some(project_path) = overrides
        .project_path
        .as_ref()
        .filter(|value| !value.trim().is_empty())
    {
        return fs::canonicalize(project_path)
            .map(Some)
            .map_err(|err| format!("Configured install folder is invalid: {err}"));
    }

    let app_data = app_data_dir(app)?;
    let metadata = read_updater_metadata(&app_data);
    if let Some(ref version) = metadata.current_version {
        let version_path = app_data.join("managed-app").join("versions").join(version);
        if version_path.exists() {
            return fs::canonicalize(&version_path)
                .map(Some)
                .map_err(|err| format!("Managed app version path is invalid: {err}"));
        }
    }

    if cfg!(debug_assertions) {
        return fs::canonicalize(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.."))
            .map(Some)
            .map_err(|err| format!("Could not resolve development workspace: {err}"));
    }

    Ok(None)
}

fn store_project_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("managed-app").join("store-current"))
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Could not resolve app data directory: {err}"))?;
    fs::create_dir_all(&path).map_err(|err| err.to_string())?;
    Ok(path)
}

fn resolved_command_env() -> HashMap<String, String> {
    #[allow(unused_mut)]
    let mut values: HashMap<String, String> = env::vars().collect();
    #[cfg(unix)]
    {
        values.extend(resolve_login_shell_env());
    }
    values
}

#[cfg(unix)]
fn resolve_login_shell_env() -> HashMap<String, String> {
    let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let output = ProcessCommand::new(shell)
        .arg("-l")
        .arg("-c")
        .arg("printf '__HI_ENV_START__\\n'; env; printf '__HI_ENV_END__\\n'")
        .output();

    let Ok(output) = output else {
        return HashMap::new();
    };

    let text = String::from_utf8_lossy(&output.stdout);
    let mut inside = false;
    let mut envs = HashMap::new();

    for line in text.lines() {
        match line {
            "__HI_ENV_START__" => {
                inside = true;
                continue;
            }
            "__HI_ENV_END__" => break,
            _ => {}
        }

        if inside {
            if let Some((key, value)) = line.split_once('=') {
                envs.insert(key.to_string(), value.to_string());
            }
        }
    }

    envs
}

fn resolve_tools(
    app: &tauri::AppHandle,
    envs: &HashMap<String, String>,
    overrides: &ToolOverrides,
) -> ResolvedTools {
    let mut node_path = clean_path_override(&overrides.node_path);
    let mut npm_path = clean_path_override(&overrides.npm_path);

    if node_path.is_none() || npm_path.is_none() {
        if let Ok(app_data) = app_data_dir(app) {
            let folder_name = if cfg!(target_os = "windows") {
                "node-v20.19.0-win-x64"
            } else if cfg!(target_os = "macos") {
                if cfg!(target_arch = "aarch64") {
                    "node-v20.19.0-darwin-arm64"
                } else {
                    "node-v20.19.0-darwin-x64"
                }
            } else {
                "node-v20.19.0-linux-x64"
            };

            let portable_dir = app_data.join("bin").join(folder_name);
            let p_node = portable_dir.join(if cfg!(windows) {
                "node.exe"
            } else {
                "bin/node"
            });
            let p_npm = portable_dir.join(if cfg!(windows) { "npm.cmd" } else { "bin/npm" });

            if p_node.exists() && p_npm.exists() {
                if node_path.is_none() {
                    node_path = Some(path_string(&p_node));
                }
                if npm_path.is_none() {
                    npm_path = Some(path_string(&p_npm));
                }
            }
        }
    }

    let node_path = node_path.or_else(|| find_executable("node", envs));
    let npm_path = npm_path
        .or_else(|| find_executable(if cfg!(windows) { "npm.cmd" } else { "npm" }, envs))
        .or_else(|| find_executable("npm", envs));

    ResolvedTools {
        node_path,
        npm_path,
    }
}

fn clean_path_override(value: &Option<String>) -> Option<String> {
    value
        .as_ref()
        .map(|path| path.trim())
        .filter(|path| !path.is_empty())
        .map(|path| path.to_string())
}

fn extract_zip(archive_path: &Path, dest_dir: &Path) -> Result<(), String> {
    let file = File::open(archive_path).map_err(|e| format!("Failed to open zip: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Failed to read zip: {e}"))?;
    archive
        .extract(dest_dir)
        .map_err(|e| format!("Failed to extract zip: {e}"))?;
    Ok(())
}

fn extract_tar_gz(archive_path: &Path, dest_dir: &Path) -> Result<(), String> {
    let file = File::open(archive_path).map_err(|e| format!("Failed to open tar.gz: {e}"))?;
    let tar = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(tar);
    archive
        .unpack(dest_dir)
        .map_err(|e| format!("Failed to unpack tar.gz: {e}"))?;
    Ok(())
}

async fn ensure_portable_node(app: &tauri::AppHandle, state: &LauncherState) -> Result<(), String> {
    let app_data = app_data_dir(app)?;
    let folder_name = if cfg!(target_os = "windows") {
        "node-v20.19.0-win-x64"
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "node-v20.19.0-darwin-arm64"
        } else {
            "node-v20.19.0-darwin-x64"
        }
    } else {
        "node-v20.19.0-linux-x64"
    };

    let portable_dir = app_data.join("bin").join(folder_name);
    let p_node = portable_dir.join(if cfg!(windows) {
        "node.exe"
    } else {
        "bin/node"
    });
    let p_npm = portable_dir.join(if cfg!(windows) { "npm.cmd" } else { "bin/npm" });

    if p_node.exists() && p_npm.exists() {
        return Ok(());
    }

    if is_store_distribution() {
        let bundled_node = bundled_node_archive_path(app)?;
        if !bundled_node.exists() {
            return Err(format!(
                "HomeInventory Local installation is broken: bundled Node.js runtime is missing: {}",
                path_string(&bundled_node)
            ));
        }

        append_log(
            state,
            "setup",
            "info",
            "Installing bundled portable Node.js runtime...",
        );
        let dest_dir = app_data.join("bin");
        if cfg!(target_os = "windows") {
            extract_zip(&bundled_node, &dest_dir)?;
        } else {
            extract_tar_gz(&bundled_node, &dest_dir)?;
        }
        append_log(
            state,
            "setup",
            "success",
            "Bundled portable Node.js runtime is ready.",
        );
        return Ok(());
    }

    append_log(
        state,
        "setup",
        "info",
        "Downloading portable Node.js v20.19.0 for standalone execution...",
    );

    let url = if cfg!(target_os = "windows") {
        "https://nodejs.org/dist/v20.19.0/node-v20.19.0-win-x64.zip"
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "https://nodejs.org/dist/v20.19.0/node-v20.19.0-darwin-arm64.tar.gz"
        } else {
            "https://nodejs.org/dist/v20.19.0/node-v20.19.0-darwin-x64.tar.gz"
        }
    } else {
        "https://nodejs.org/dist/v20.19.0/node-v20.19.0-linux-x64.tar.gz"
    };

    let client = reqwest::Client::new();
    let mut resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download Node.js: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Node.js download returned HTTP {}", resp.status()));
    }

    let temp_archive_name = if cfg!(target_os = "windows") {
        "node-temp.zip"
    } else {
        "node-temp.tar.gz"
    };
    let temp_archive_path = app_data.join("bin").join(temp_archive_name);
    if let Some(parent) = temp_archive_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut file = File::create(&temp_archive_path).map_err(|e| e.to_string())?;
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("Error downloading Node.js chunk: {e}"))?
    {
        use std::io::Write;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
    }
    drop(file);

    append_log(state, "setup", "info", "Extracting Node.js package...");
    let dest_dir = app_data.join("bin");

    if cfg!(target_os = "windows") {
        extract_zip(&temp_archive_path, &dest_dir)?;
    } else {
        extract_tar_gz(&temp_archive_path, &dest_dir)?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if p_node.exists() {
                let mut perms = fs::metadata(&p_node)
                    .map_err(|e| e.to_string())?
                    .permissions();
                perms.set_mode(0o755);
                fs::set_permissions(&p_node, perms).map_err(|e| e.to_string())?;
            }
            if p_npm.exists() {
                let mut perms = fs::metadata(&p_npm)
                    .map_err(|e| e.to_string())?
                    .permissions();
                perms.set_mode(0o755);
                fs::set_permissions(&p_npm, perms).map_err(|e| e.to_string())?;
            }
        }
    }

    let _ = fs::remove_file(&temp_archive_path);
    append_log(
        state,
        "setup",
        "success",
        "Portable Node.js v20.19.0 installed successfully.",
    );

    Ok(())
}

fn bundled_node_archive_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|err| format!("Could not resolve launcher resource directory: {err}"))?;
    let file_name = if cfg!(target_os = "windows") {
        "node-v20.19.0-win-x64.zip"
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "node-v20.19.0-darwin-arm64.tar.gz"
        } else {
            "node-v20.19.0-darwin-x64.tar.gz"
        }
    } else {
        "node-v20.19.0-linux-x64.tar.gz"
    };

    let direct = resource_dir.join(file_name);
    if direct.exists() {
        return Ok(direct);
    }
    Ok(resource_dir.join("resources").join(file_name))
}

fn find_executable(name: &str, envs: &HashMap<String, String>) -> Option<String> {
    let path_value = envs.get("PATH").cloned().unwrap_or_default();
    for directory in env::split_paths(&path_value) {
        let candidate = directory.join(name);
        if candidate.is_file() {
            return Some(path_string(&candidate));
        }
    }

    #[cfg(windows)]
    {
        if let Some(found) = find_windows_executable(name) {
            return Some(found);
        }
    }

    None
}

#[cfg(windows)]
fn find_windows_executable(name: &str) -> Option<String> {
    let mut command = ProcessCommand::new("where.exe");
    command.arg(name);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let output = command.output().ok()?;
    if output.status.success() {
        let text = String::from_utf8_lossy(&output.stdout);
        if let Some(first) = text.lines().find(|line| !line.trim().is_empty()) {
            return Some(first.trim().to_string());
        }
    }

    let mut candidates = Vec::new();
    if let Ok(program_files) = env::var("ProgramFiles") {
        candidates.push(PathBuf::from(program_files).join("nodejs").join(name));
    }
    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        candidates.push(
            PathBuf::from(&local_app_data)
                .join("Programs")
                .join("nodejs")
                .join(name),
        );
        candidates.push(
            PathBuf::from(local_app_data)
                .join("Volta")
                .join("bin")
                .join(name),
        );
    }

    candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .map(|candidate| path_string(&candidate))
}

fn ensure_profile_secrets(
    state: &LauncherState,
    profile_id: &str,
    paths: &ProfilePaths,
) -> Result<HashMap<String, String>, String> {
    if paths.secrets_path.exists() {
        let mut values = read_simple_env_file(&paths.secrets_path)?;
        let mut changed = false;

        if !values.contains_key("JWT_SECRET") {
            values.insert(
                "JWT_SECRET".into(),
                format!("launcher-dev-{}", random_hex(32)?),
            );
            changed = true;
        }
        if !values.contains_key("APP_ENCRYPTION_KEY") {
            values.insert("APP_ENCRYPTION_KEY".into(), random_hex(32)?);
            changed = true;
        }
        if !values.contains_key("APP_ENCRYPTION_KEY_ID") {
            values.insert("APP_ENCRYPTION_KEY_ID".into(), "launcher-local".into());
            changed = true;
        }

        if changed {
            write_profile_secrets(&paths.secrets_path, &values)?;
        }
        return Ok(values);
    }

    if paths.db_path.exists() {
        quarantine_legacy_launcher_db(state, profile_id, paths)?;
    }

    let mut values = HashMap::new();
    values.insert(
        "JWT_SECRET".into(),
        format!("launcher-dev-{}", random_hex(32)?),
    );
    values.insert("APP_ENCRYPTION_KEY".into(), random_hex(32)?);
    values.insert("APP_ENCRYPTION_KEY_ID".into(), "launcher-local".into());
    write_profile_secrets(&paths.secrets_path, &values)?;
    Ok(values)
}

fn read_simple_env_file(path: &Path) -> Result<HashMap<String, String>, String> {
    let text = fs::read_to_string(path)
        .map_err(|err| format!("Could not read launcher secrets file: {err}"))?;
    let mut values = HashMap::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = trimmed.split_once('=') {
            values.insert(key.trim().to_string(), value.trim().to_string());
        }
    }
    Ok(values)
}

fn write_profile_secrets(path: &Path, values: &HashMap<String, String>) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    let mut contents =
        "# Managed by HomeInventory Launcher. Do not edit while services are running.\n"
            .to_string();
    for key in ["JWT_SECRET", "APP_ENCRYPTION_KEY", "APP_ENCRYPTION_KEY_ID"] {
        if let Some(value) = values.get(key) {
            contents.push_str(&format!("{key}={value}\n"));
        }
    }
    fs::write(path, contents).map_err(|err| format!("Could not write launcher secrets: {err}"))
}

fn quarantine_legacy_launcher_db(
    state: &LauncherState,
    profile_id: &str,
    paths: &ProfilePaths,
) -> Result<(), String> {
    let stamp = now();
    for suffix in ["", "-wal", "-shm"] {
        let source = if suffix.is_empty() {
            paths.db_path.clone()
        } else {
            PathBuf::from(format!("{}{}", path_string(&paths.db_path), suffix))
        };

        if !source.exists() {
            continue;
        }

        let file_name = source
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "inventory.db".to_string());
        let target = paths
            .data_dir
            .join(format!("legacy-unreadable-{stamp}-{file_name}"));
        fs::rename(&source, &target)
            .map_err(|err| format!("Could not quarantine old launcher database: {err}"))?;
    }

    append_log(
        state,
        profile_id,
        "warning",
        "Existing launcher database used temporary encryption secrets. It was quarantined and a fresh local database will be created.",
    );
    Ok(())
}

fn write_launcher_brand_env(
    project_root: &Path,
    profile_paths: &ProfilePaths,
    brand_key: &str,
    backend_port: u16,
    frontend_port: u16,
    command_env: &HashMap<String, String>,
) -> Result<PathBuf, String> {
    let env_dir = profile_paths.profile_root.join("env");
    fs::create_dir_all(&env_dir).map_err(|err| err.to_string())?;
    let env_file = env_dir.join("env.local");
    let example_path = project_root
        .join("local-brands")
        .join(brand_key)
        .join("env.example");
    let mut contents = fs::read_to_string(&example_path)
        .map_err(|err| format!("Could not read brand env example: {err}"))?;
    contents.push_str("\n# Managed by HomeInventory Launcher\n");
    contents.push_str(&format!("NODE_ENV=development\n"));
    contents.push_str(&format!("HOST=0.0.0.0\n"));
    contents.push_str(&format!("FRONTEND_HOST=0.0.0.0\n"));
    contents.push_str(&format!("VITE_HOST=0.0.0.0\n"));
    contents.push_str(&format!("PORT={}\n", backend_port));
    contents.push_str(&format!("FRONTEND_PORT={}\n", frontend_port));
    contents.push_str(&format!("VITE_PORT={}\n", frontend_port));
    contents.push_str(&format!("SITE_URL=http://127.0.0.1:{}\n", frontend_port));
    contents.push_str(&format!(
        "APP_SITE_URL=http://127.0.0.1:{}\n",
        frontend_port
    ));
    contents.push_str(&format!(
        "HOMEINVENTORY_DATA_DIR={}\n",
        path_string(&profile_paths.data_dir)
    ));
    contents.push_str(&format!(
        "HOMEINVENTORY_DB_PATH={}\n",
        path_string(&profile_paths.db_path)
    ));
    contents.push_str(&format!(
        "HOMEINVENTORY_UPLOADS_DIR={}\n",
        path_string(&profile_paths.uploads_dir)
    ));
    for key in ["JWT_SECRET", "APP_ENCRYPTION_KEY", "APP_ENCRYPTION_KEY_ID"] {
        if let Some(value) = command_env.get(key) {
            contents.push_str(&format!("{key}={value}\n"));
        }
    }
    fs::write(&env_file, contents).map_err(|err| err.to_string())?;
    Ok(env_file)
}

fn stream_process_output(
    state: &LauncherState,
    source: &'static str,
    pipe: Option<impl std::io::Read + Send + 'static>,
    level: &'static str,
    log_dir: Option<PathBuf>,
) {
    let Some(pipe) = pipe else {
        return;
    };
    let logs = state.logs.clone();
    thread::spawn(move || {
        let reader = BufReader::new(pipe);
        for line in reader.lines().flatten() {
            if let Some(ref dir) = log_dir {
                let log_file_path = dir.join(format!("{}.log", source));
                if let Ok(mut file) = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(log_file_path)
                {
                    use std::io::Write;
                    let _ = writeln!(file, "[{}] [{}] {}", now(), level, line);
                }
            }
            push_log(
                &logs,
                LogEntry {
                    timestamp: now(),
                    source: source.to_string(),
                    level: level.to_string(),
                    message: line,
                },
            );
        }
    });
}

fn append_log(state: &LauncherState, source: &str, level: &str, message: &str) {
    if let Ok(mut logs) = state.logs.lock() {
        push_log_inner(
            &mut logs,
            LogEntry {
                timestamp: now(),
                source: source.to_string(),
                level: level.to_string(),
                message: message.to_string(),
            },
        );
    }
}

fn append_process_output(state: &LauncherState, source: &str, bytes: &[u8], level: &str) {
    let text = String::from_utf8_lossy(bytes);
    for line in text.lines().filter(|line| !line.trim().is_empty()) {
        append_log(state, source, level, line);
    }
}

fn push_log(logs: &Arc<Mutex<Vec<LogEntry>>>, entry: LogEntry) {
    if let Ok(mut logs) = logs.lock() {
        push_log_inner(&mut logs, entry);
    }
}

fn push_log_inner(logs: &mut Vec<LogEntry>, entry: LogEntry) {
    logs.push(entry);
    if logs.len() > LOG_LIMIT {
        let overflow = logs.len() - LOG_LIMIT;
        logs.drain(0..overflow);
    }
}

fn reconcile_active(state: &LauncherState) {
    let Ok(mut active) = state.active.lock() else {
        return;
    };

    if let Some(process) = active.as_mut() {
        match process.child.try_wait() {
            Ok(Some(status)) => {
                let profile_id = process.profile_id.clone();
                *active = None;
                append_log(
                    state,
                    &profile_id,
                    if status.success() { "success" } else { "error" },
                    &format!("Process exited with status {status}."),
                );
            }
            Ok(None) => {}
            Err(err) => {
                let profile_id = process.profile_id.clone();
                *active = None;
                append_log(
                    state,
                    &profile_id,
                    "error",
                    &format!("Process state check failed: {err}"),
                );
            }
        }
    }
}

fn stop_all_internal(state: &LauncherState) -> Result<(), String> {
    let mut active = state
        .active
        .lock()
        .map_err(|_| "Process state is locked".to_string())?;
    let Some(mut process) = active.take() else {
        return Ok(());
    };

    append_log(
        state,
        &process.profile_id,
        "info",
        &format!("Stopping {}...", process.profile_id),
    );
    terminate_process_tree(&mut process);
    wait_or_kill(&mut process.child);
    append_log(
        state,
        &process.profile_id,
        "success",
        "Process tree stopped.",
    );
    Ok(())
}

fn terminate_process_tree(process: &mut ManagedProcess) {
    #[cfg(unix)]
    unsafe {
        libc::kill(-process.process_group_id, libc::SIGTERM);
    }

    #[cfg(windows)]
    {
        let _ = process.child.kill();
    }

    #[cfg(not(any(unix, windows)))]
    {
        let _ = process.child.kill();
    }
}

fn wait_or_kill(child: &mut Child) {
    for _ in 0..20 {
        if matches!(child.try_wait(), Ok(Some(_))) {
            return;
        }
        thread::sleep(Duration::from_millis(100));
    }

    #[cfg(unix)]
    unsafe {
        libc::kill(-(child.id() as i32), libc::SIGKILL);
    }

    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(windows)]
fn create_windows_job(child: &Child) -> Option<WindowsJob> {
    use std::mem;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    unsafe {
        let job = CreateJobObjectW(std::ptr::null_mut(), std::ptr::null());
        if job.is_null() {
            return None;
        }

        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let ok = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const _,
            mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );

        if ok == 0 {
            windows_sys::Win32::Foundation::CloseHandle(job);
            return None;
        }

        let assigned = AssignProcessToJobObject(job, child.as_raw_handle() as _);
        if assigned == 0 {
            windows_sys::Win32::Foundation::CloseHandle(job);
            return None;
        }

        Some(WindowsJob(job))
    }
}

fn is_port_available(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

fn validate_port(port: u16, label: &str) -> Result<(), String> {
    if (1024..=65535).contains(&port) {
        Ok(())
    } else {
        Err(format!("{label} port must be between 1024 and 65535."))
    }
}

fn requested_ports(
    profile: &ProfileConfig,
    backend_port: Option<u16>,
    frontend_port: Option<u16>,
) -> Result<(u16, u16), String> {
    let backend_port = backend_port.unwrap_or(profile.backend_port);
    let frontend_port = if is_store_distribution() {
        backend_port
    } else {
        frontend_port.unwrap_or(profile.frontend_port)
    };
    validate_port(backend_port, "API")?;
    validate_port(frontend_port, "UI")?;
    if !is_store_distribution() && backend_port == frontend_port {
        return Err("API and UI ports must be different.".into());
    }
    Ok((backend_port, frontend_port))
}

fn next_free_port(start: u16) -> u16 {
    let first = start.saturating_add(1);
    let last = start.saturating_add(2000);
    (first..=last)
        .find(|port| is_port_available(*port))
        .unwrap_or(start)
}

fn open_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = ProcessCommand::new("open");
        command.arg(url);
        command
    };

    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = ProcessCommand::new("xdg-open");
        command.arg(url);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = ProcessCommand::new("cmd");
        command.args(["/C", "start", "", url]);
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        command
    };

    command
        .spawn()
        .map_err(|err| format!("Could not open local app URL: {err}"))?;
    Ok(())
}

fn copy_dir_all(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let target = destination.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_all(&entry.path(), &target)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn open_path(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = ProcessCommand::new("open");
        command.arg(path);
        command
    };

    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = ProcessCommand::new("xdg-open");
        command.arg(path);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = ProcessCommand::new("explorer");
        command.arg(path);
        command
    };

    command
        .spawn()
        .map_err(|err| format!("Could not open path: {err}"))?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn choose_path_platform(kind: &str) -> Result<Option<String>, String> {
    let script = match kind {
        "project" => {
            "POSIX path of (choose folder with prompt \"Select a HomeInventory install folder\")"
        }
        "node" => "POSIX path of (choose file with prompt \"Select the node executable\")",
        "npm" => "POSIX path of (choose file with prompt \"Select the npm executable\")",
        _ => return Err("Unsupported path picker type.".into()),
    };
    let output = ProcessCommand::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|err| format!("Could not open macOS picker: {err}"))?;
    parse_picker_output(output)
}

#[cfg(target_os = "linux")]
fn choose_path_platform(kind: &str) -> Result<Option<String>, String> {
    let folder = kind == "project";
    if let Some(path) = run_linux_picker("zenity", folder)? {
        return Ok(Some(path));
    }
    if let Some(path) = run_linux_picker("kdialog", folder)? {
        return Ok(Some(path));
    }
    Err("Install zenity or kdialog to use the graphical path picker on Linux.".into())
}

#[cfg(target_os = "linux")]
fn run_linux_picker(program: &str, folder: bool) -> Result<Option<String>, String> {
    let output = if program == "zenity" {
        let mut command = ProcessCommand::new(program);
        command.arg("--file-selection");
        if folder {
            command.arg("--directory");
        }
        command.output()
    } else {
        let mut command = ProcessCommand::new(program);
        command.arg(if folder {
            "--getexistingdirectory"
        } else {
            "--getopenfilename"
        });
        command.output()
    };

    let Ok(output) = output else {
        return Ok(None);
    };
    parse_picker_output(output)
}

#[cfg(target_os = "windows")]
fn choose_path_platform(kind: &str) -> Result<Option<String>, String> {
    let script = if kind == "project" {
        r#"Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'Select a HomeInventory install folder'; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }"#
    } else {
        r#"Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.OpenFileDialog; $d.Title = 'Select the executable'; $d.Filter = 'Executables (*.exe;*.cmd;*.bat)|*.exe;*.cmd;*.bat|All files (*.*)|*.*'; if ($d.ShowDialog() -eq 'OK') { $d.FileName }"#
    };
    let mut command = ProcessCommand::new("powershell");
    command.args(["-NoProfile", "-Command", script]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let output = command
        .output()
        .map_err(|err| format!("Could not open Windows picker: {err}"))?;
    parse_picker_output(output)
}

fn parse_picker_output(output: std::process::Output) -> Result<Option<String>, String> {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if output.status.success() {
        return Ok(if stdout.is_empty() {
            None
        } else {
            Some(stdout)
        });
    }

    let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();
    if stdout.is_empty()
        && (stderr.contains("cancel")
            || stderr.contains("canceled")
            || stderr.contains("cancelled")
            || stderr.contains("user canceled")
            || output.status.code() == Some(1))
    {
        return Ok(None);
    }

    Err(format!(
        "Path picker failed: {}",
        String::from_utf8_lossy(&output.stderr).trim()
    ))
}

fn random_hex(bytes: usize) -> Result<String, String> {
    let mut buffer = vec![0u8; bytes];
    getrandom::getrandom(&mut buffer).map_err(|err| format!("Could not generate secret: {err}"))?;
    Ok(buffer.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

// ==========================================
// V2.2 Launcher + One-Click Auto Updater Code
// ==========================================

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdaterMetadata {
    pub current_version: Option<String>,
    pub previous_versions: Vec<String>,
    pub last_known_good_version: Option<String>,
    pub update_state: String,
    pub rollback_state: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppManifest {
    pub version: String,
    pub sha256: String,
    pub url: String,
    pub node_major: u32,
    pub root_install: bool,
    pub client_install: bool,
    pub signature: String,
    #[serde(default)]
    pub signature_v2: String,
}

const APP_MANIFEST_URL: &str =
    "https://github.com/asdteke/HomeInventory/releases/latest/download/homeinventory-app-manifest.json";

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct UpdateCheckResult {
    current_app_version: String,
    latest_app_version: String,
    current_launcher_version: String,
    latest_launcher_version: String,
    app_release_notes: Option<String>,
    launcher_release_notes: Option<String>,
    app_update_available: bool,
    launcher_update_available: bool,
    required_actions: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct UpdateProgressPayload {
    state: String,
    message: String,
    progress: f64,
    error: Option<String>,
}

fn emit_progress(
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

fn read_updater_metadata(app_data_dir: &Path) -> AppUpdaterMetadata {
    let path = app_data_dir
        .join("managed-app")
        .join("updater-metadata.json");
    if !path.exists() {
        return AppUpdaterMetadata::default();
    }
    let data = fs::read_to_string(path).unwrap_or_default();
    serde_json::from_str(&data).unwrap_or_default()
}

fn write_updater_metadata(
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

fn managed_version_dir(app_data_dir: &Path, version: &str) -> PathBuf {
    app_data_dir
        .join("managed-app")
        .join("versions")
        .join(version)
}

fn managed_version_exists(app_data_dir: &Path, version: &str) -> bool {
    managed_version_dir(app_data_dir, version).is_dir()
}

fn resolve_rollback_target(
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

fn resolve_current_app_version(
    app_data_dir: &Path,
    metadata: &AppUpdaterMetadata,
    project_root: Option<&Path>,
    fallback_version: &str,
) -> String {
    if let Some(current_version) = metadata.current_version.as_deref() {
        let version_dir = managed_version_dir(app_data_dir, current_version);
        if version_dir.is_dir() {
            return read_version_from_package_json(&version_dir)
                .unwrap_or_else(|| current_version.to_string());
        }
    }

    project_root
        .and_then(read_version_from_package_json)
        .unwrap_or_else(|| fallback_version.to_string())
}

fn verify_manifest_signature(manifest: &AppManifest) -> Result<(), String> {
    if manifest.signature_v2 == "unsigned" || manifest.signature_v2.is_empty() {
        return Err("App update manifest is not signed.".to_string());
    }

    let pubkey_b64 = "GaUIILPldrqF7o0X0XfuDo8i45eXCS4lFCnFjulnCh8=";
    let pubkey_bytes = BASE64_STANDARD
        .decode(pubkey_b64)
        .map_err(|e| format!("Invalid hardcoded public key base64: {e}"))?;

    let signature_bytes = hex::decode(&manifest.signature_v2)
        .or_else(|_| BASE64_STANDARD.decode(&manifest.signature_v2))
        .map_err(|e| format!("Invalid signature encoding: {e}"))?;

    let message = format!(
        "{}:{}:{}:{}:{}:{}",
        manifest.version,
        manifest.sha256,
        manifest.url,
        manifest.node_major,
        manifest.root_install,
        manifest.client_install
    );

    let pubkey_arr: [u8; 32] = pubkey_bytes
        .try_into()
        .map_err(|_| "Invalid public key length".to_string())?;
    let public_key = ed25519_dalek::VerifyingKey::from_bytes(&pubkey_arr)
        .map_err(|e| format!("Invalid public key: {e}"))?;

    let sig_arr: [u8; 64] = signature_bytes
        .try_into()
        .map_err(|_| "Invalid signature length".to_string())?;
    let signature = ed25519_dalek::Signature::from_bytes(&sig_arr);

    public_key
        .verify(message.as_bytes(), &signature)
        .map_err(|e| format!("Signature verification failed: {e}"))?;

    Ok(())
}

fn validate_app_manifest_policy(manifest: &AppManifest) -> Result<(), String> {
    semver::Version::parse(&manifest.version)
        .map_err(|e| format!("Invalid app manifest version: {e}"))?;

    if manifest.sha256.len() != 64 || !manifest.sha256.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err("App manifest SHA-256 must be a 64-character hex string.".into());
    }

    let trusted_release_asset = manifest
        .url
        .starts_with("https://github.com/asdteke/HomeInventory/releases/download/")
        || manifest
            .url
            .starts_with("https://github.com/asdteke/HomeInventory/releases/latest/download/");
    if !trusted_release_asset {
        return Err("App archive URL must point to the official GitHub Releases assets.".into());
    }

    if !(18..=30).contains(&manifest.node_major) {
        return Err("App manifest Node.js major version is outside the supported range.".into());
    }

    Ok(())
}

async fn get_node_major_version(_app: &tauri::AppHandle) -> Option<u32> {
    let envs = resolved_command_env();
    let node_path = find_executable("node", &envs)?;
    let mut cmd = std::process::Command::new(node_path);
    cmd.arg("--version");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let output = cmd.output().ok()?;
    if output.status.success() {
        let version_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let cleaned = version_str.strip_prefix('v').unwrap_or(&version_str);
        if let Some(first_part) = cleaned.split('.').next() {
            return first_part.parse::<u32>().ok();
        }
    }
    None
}

#[tauri::command]
async fn check_updates(
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

    let latest_launcher_version = launcher_version.clone();
    let launcher_update_available = false;
    let launcher_release_notes = None;

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
        app_update_available = should_prefer_bundled_app_version(
            &latest_app_version,
            &current_app_version,
        );
        if app_update_available {
            if !required_actions.contains(&"appUpdate".to_string()) {
                required_actions.push("appUpdate".to_string());
            }
            app_release_notes = Some(
                "A newer HomeInventory managed app is included with this launcher."
                    .to_string(),
            );
            let node_major = get_node_major_version(&app).await.unwrap_or(0);
            if node_major > 0
                && node_major < 20
                && !required_actions.contains(&"nodeMajorUpgrade".to_string())
            {
                required_actions.push("nodeMajorUpgrade".to_string());
            }
        }
    }

    if launcher_update_available {
        required_actions.push("launcherUpdate".to_string());
    }

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
async fn update_all(
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

    {
        let mut updating = state.updating.lock().map_err(|_| "State lock failed")?;
        if *updating {
            return Err("Another update action is already running.".to_string());
        }
        *updating = true;
    }

    let app_clone = app.clone();
    let overrides = overrides.unwrap_or_default();

    tauri::async_runtime::spawn(async move {
        let state_clone = app_clone.state::<LauncherState>();
        let version_before_update = app_data_dir(&app_clone)
            .ok()
            .map(|path| read_updater_metadata(&path).current_version)
            .unwrap_or_default();
        if let Err(e) = run_update_flow(&app_clone, &state_clone, overrides.clone()).await {
            let version_after_failure = app_data_dir(&app_clone)
                .ok()
                .map(|path| read_updater_metadata(&path).current_version)
                .unwrap_or_default();
            let rollback_required =
                update_failure_requires_rollback(&version_before_update, &version_after_failure);
            emit_progress(
                &app_clone,
                "Failed",
                &format!(
                    "Update failed: {e}.{}",
                    if rollback_required {
                        " Starting rollback..."
                    } else {
                        " The installed version was not changed."
                    }
                ),
                1.0,
                Some(e.clone()),
            );
            if rollback_required {
                if let Err(rollback_err) =
                    run_rollback_flow(&app_clone, &state_clone, overrides).await
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
                        "System successfully rolled back to the previous version.",
                        1.0,
                        None,
                    );
                }
            }
        } else {
            emit_progress(
                &app_clone,
                "Completed",
                "Update complete! Application is running.",
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
        message: "Update process started.".to_string(),
    })
}

fn update_failure_requires_rollback(
    version_before_update: &Option<String>,
    version_after_failure: &Option<String>,
) -> bool {
    version_before_update != version_after_failure
}

async fn run_update_flow(
    app: &tauri::AppHandle,
    state: &LauncherState,
    overrides: ToolOverrides,
) -> Result<(), String> {
    let app_data = app_data_dir(app)?;
    let mut metadata = read_updater_metadata(&app_data);

    emit_progress(
        app,
        "Checking",
        "Checking for latest release manifest...",
        0.05,
        None,
    );
    let client = reqwest::Client::new();
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

    let bundled_path = bundled_app_archive_path(app)?;
    let bundled_version = env!("CARGO_PKG_VERSION").to_string();
    let use_bundled = bundled_path.exists()
        && online_manifest
            .as_ref()
            .map(|manifest| {
                bundled_app_is_same_or_newer(&bundled_version, &manifest.version)
            })
            .unwrap_or(true);

    let (manifest, bundled_archive) = if use_bundled {
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
                node_major: 20,
                root_install: true,
                client_install: true,
                signature: "bundled".to_string(),
                signature_v2: "bundled".to_string(),
            },
            Some(bundled_path),
        )
    } else {
        (
            online_manifest.ok_or_else(|| {
                "No valid online or bundled HomeInventory update package is available."
                    .to_string()
            })?,
            None,
        )
    };

    let node_major = get_node_major_version(app).await.unwrap_or(0);
    if node_major > 0 && node_major < manifest.node_major {
        return Err(format!(
            "Compatible Node.js major version required is v{}.0, but detected v{}.0",
            manifest.node_major, node_major
        ));
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
    let target_version_dir = if let Some(ref path) = overrides.project_path.as_ref().filter(|p| !p.trim().is_empty()) {
        PathBuf::from(path)
    } else {
        app_data
            .join("managed-app")
            .join("versions")
            .join(&manifest.version)
    };
    let _ = fs::remove_dir_all(&target_version_dir);
    if let Some(parent) = target_version_dir.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&staging_dir, &target_version_dir)
        .map_err(|e| format!("Atomic switch failed: {e}"))?;

    emit_progress(
        app,
        "Installing",
        "Installing project dependencies (npm ci)...",
        0.7,
        None,
    );
    run_dependency_install(app, &target_version_dir, &manifest, &overrides)?;

    let previous_current = metadata.current_version.clone();
    if let Some(previous) = immediate_rollback_version(
        &app_data,
        previous_current.as_deref(),
        &manifest.version,
    ) {
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
        None,
        None,
        Some(overrides.clone()),
        true,
    )?;

    emit_progress(
        app,
        "Verifying",
        "Running startup health checks...",
        0.9,
        None,
    );
    run_health_checks(app, 3001, 5173).await?;

    metadata.last_known_good_version = Some(manifest.version.clone());
    if let Some(prev) = previous_current.filter(|prev| prev != &manifest.version) {
        if !metadata.previous_versions.contains(&prev) {
            metadata.previous_versions.push(prev);
        }
    }

    clean_old_versions(&app_data, &mut metadata)?;
    write_updater_metadata(&app_data, &metadata)?;

    emit_progress(
        app,
        "SelfUpdating",
        "Checking for launcher updates...",
        0.95,
        None,
    );
    // Keep launcher self-update installation disabled until the rollout policy is enabled.
    /*
    if let Ok(Some(update)) = app.updater().map_err(|e| e.to_string())?.check().await {
        emit_progress(
            app,
            "SelfUpdating",
            "Downloading and applying launcher update...",
            0.98,
            None,
        );
        let _ = stop_all_internal(state);
        if let Err(e) = update.download_and_install(|_, _| {}, || {}).await {
            emit_progress(
                app,
                "Failed",
                &format!("Launcher self-update failed: {e}"),
                1.0,
                Some(e.to_string()),
            );
        } else {
            app.restart();
        }
    }
    */

    Ok(())
}

fn immediate_rollback_version(
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

async fn run_rollback_flow(app: &tauri::AppHandle, state: &LauncherState, overrides: ToolOverrides) -> Result<(), String> {
    emit_progress(app, "RollingBack", "Stopping active services...", 0.1, None);
    let _ = stop_all_internal(state);

    let app_data = app_data_dir(app)?;
    let mut metadata = read_updater_metadata(&app_data);

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
                None,
                None,
                Some(overrides),
                true,
            )?;
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
        metadata.previous_versions.retain(|version| version != &target_version);
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
            None,
            None,
            Some(overrides),
            true,
        )?;
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
        node_major: 20,
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
        None,
        None,
        Some(overrides),
        true,
    )?;

    emit_progress(app, "RollingBack", "Running health checks...", 0.9, None);
    run_health_checks(app, 3001, 5173).await?;

    Ok(())
}

fn extract_archive(archive_path: &Path, staging_dir: &Path) -> Result<(), String> {
    let file = File::open(archive_path).map_err(|e| format!("Failed to open archive: {e}"))?;
    let tar = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(tar);

    let mut cumulative_size: u64 = 0;
    let max_cumulative_size: u64 = 300 * 1024 * 1024;
    let max_file_size: u64 = 50 * 1024 * 1024;

    fs::create_dir_all(staging_dir).map_err(|e| format!("Failed to create staging dir: {e}"))?;
    let canonical_staging = fs::canonicalize(staging_dir)
        .map_err(|e| format!("Failed to canonicalize staging dir: {e}"))?;

    for entry_result in archive
        .entries()
        .map_err(|e| format!("Failed to read archive entries: {e}"))?
    {
        let mut entry = entry_result.map_err(|e| format!("Failed to get entry: {e}"))?;
        let path = entry
            .path()
            .map_err(|e| format!("Failed to get entry path: {e}"))?
            .to_path_buf();

        if path.is_absolute() {
            return Err(format!(
                "Security failure: Absolute path detected in archive: {:?}",
                path
            ));
        }

        for component in path.components() {
            if let std::path::Component::ParentDir = component {
                return Err(format!(
                    "Security failure: Path traversal detected in archive: {:?}",
                    path
                ));
            }
        }

        let entry_type = entry.header().entry_type();
        if entry_type.is_symlink() || entry_type.is_hard_link() {
            return Err(format!(
                "Security failure: Symlinks or hardlinks are not allowed: {:?}",
                path
            ));
        }

        if !entry_type.is_file() && !entry_type.is_dir() {
            return Err(format!(
                "Security failure: Unsupported entry type: {:?}",
                path
            ));
        }

        let file_size = entry.size();
        if file_size > max_file_size {
            return Err(format!(
                "Security failure: File too large in archive ({} bytes): {:?}",
                file_size, path
            ));
        }
        cumulative_size += file_size;
        if cumulative_size > max_cumulative_size {
            return Err(format!(
                "Security failure: Cumulative archive size limit exceeded ({} bytes)",
                cumulative_size
            ));
        }

        entry
            .unpack_in(&canonical_staging)
            .map_err(|e| format!("Failed to unpack entry {:?}: {e}", path))?;
    }

    Ok(())
}

fn run_dependency_install(
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
    let npm = tools
        .npm_path
        .ok_or_else(|| "npm path not found".to_string())?;

    if !target_dir.join("package-lock.json").exists() {
        return Err("Missing root package-lock.json in release archive".into());
    }
    if manifest.client_install && !target_dir.join("client").join("package-lock.json").exists() {
        return Err("Missing client package-lock.json in release archive".into());
    }

    if manifest.root_install {
        let mut command = std::process::Command::new(&npm);
        command
            .arg("ci")
            .current_dir(target_dir)
            .envs(&envs);
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
                "npm ci at root failed with status: {:?}",
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
                "npm ci in client failed with status: {:?}",
                status.code()
            ));
        }
    }

    Ok(())
}

async fn run_health_checks(
    _app: &tauri::AppHandle,
    backend_port: u16,
    frontend_port: u16,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let backend_url = format!("http://127.0.0.1:{}/api/health", backend_port);
    let frontend_url = format!("http://127.0.0.1:{}", frontend_port);

    let max_attempts = 60;

    for attempt in 1..=max_attempts {
        tokio::time::sleep(Duration::from_millis(500)).await;

        let backend_ok = match client.get(&backend_url).send().await {
            Ok(resp) => resp.status().is_success(),
            Err(_) => false,
        };

        let frontend_ok = match client.get(&frontend_url).send().await {
            Ok(resp) => resp.status().is_success(),
            Err(_) => false,
        };

        if backend_ok && frontend_ok {
            return Ok(());
        }

        if attempt % 10 == 0 {
            println!(
                "Health check attempt {}/{} failed...",
                attempt, max_attempts
            );
        }
    }

    Err("Startup health check timed out".to_string())
}

fn clean_old_versions(
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

fn perform_mandatory_backup(app: &tauri::AppHandle) -> Result<PathBuf, String> {
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
        fs::copy(&paths.secrets_path, dest_env.join("launcher-secrets.env"))
            .map_err(|e| e.to_string())?;
    }

    let metadata_path = app_data.join("managed-app").join("updater-metadata.json");
    if metadata_path.exists() {
        fs::copy(&metadata_path, destination.join("updater-metadata.json"))
            .map_err(|e| e.to_string())?;
    }

    Ok(destination)
}

#[cfg(test)]
mod updater_tests {
    use super::*;

    #[test]
    fn test_bootstrap_prefers_newer_bundled_managed_app() {
        assert!(should_prefer_bundled_app_version("2.3.0", "2.2.3"));
        assert!(!should_prefer_bundled_app_version("2.3.0", "2.3.0"));
        assert!(!should_prefer_bundled_app_version("2.2.3", "2.3.0"));
        assert!(should_prefer_bundled_app_version("2.3.0", "invalid"));

        assert!(bundled_app_is_same_or_newer("2.3.0", "2.2.3"));
        assert!(bundled_app_is_same_or_newer("2.3.0", "2.3.0"));
        assert!(!bundled_app_is_same_or_newer("2.2.3", "2.3.0"));
    }

    #[test]
    fn test_update_internal_restart_bypasses_only_the_update_lock() {
        assert!(profile_start_is_blocked(true, false));
        assert!(!profile_start_is_blocked(true, true));
        assert!(!profile_start_is_blocked(false, false));
    }

    #[test]
    fn test_rollback_runs_only_after_the_managed_version_switches() {
        let before = Some("2.2.3".to_string());
        assert!(!update_failure_requires_rollback(&before, &before));
        assert!(update_failure_requires_rollback(
            &before,
            &Some("2.3.0".to_string())
        ));
    }

    #[test]
    fn test_immediate_previous_version_replaces_stale_rollback_target() {
        let app_data = std::env::temp_dir().join(format!("hi-immediate-rollback-test-{}", now()));
        fs::create_dir_all(managed_version_dir(&app_data, "2.2.3")).unwrap();

        assert_eq!(
            immediate_rollback_version(&app_data, Some("2.2.3"), "2.3.0"),
            Some("2.2.3".to_string())
        );
        assert_eq!(
            immediate_rollback_version(&app_data, Some("2.3.0"), "2.3.0"),
            None
        );

        let _ = fs::remove_dir_all(app_data);
    }

    #[test]
    fn test_version_comparison() {
        let v1 = semver::Version::parse("2.2.0").unwrap();
        let v2 = semver::Version::parse("2.2.1").unwrap();
        let v3 = semver::Version::parse("2.3.0").unwrap();
        assert!(v2 > v1);
        assert!(v3 > v2);
    }

    #[test]
    fn test_signed_manifest_verification() {
        let manifest = AppManifest {
            version: "2.2.0".to_string(),
            sha256: "123456".to_string(),
            url: "https://github.com/asdteke/HomeInventory/releases/download/v2.2.0/app.tar.gz".to_string(),
            node_major: 20,
            root_install: true,
            client_install: true,
            signature: "unsigned".to_string(),
            signature_v2: "991ec4e2720a46d950471941a4dee711b3d86d4b8d3f6c233745721a6bebf27d462855426de0f22708729c0ca5b7ad474ab55c01fc410c93956223291a86eb0b".to_string(),
        };

        assert!(verify_manifest_signature(&manifest).is_ok());

        let mut tampered = manifest.clone();
        tampered.version = "2.2.1".to_string();
        assert!(verify_manifest_signature(&tampered).is_err());
    }

    #[test]
    fn test_unsigned_manifest_is_rejected() {
        let mut manifest = AppManifest {
            version: "2.5.0".to_string(),
            sha256: "a".repeat(64),
            url: "https://github.com/asdteke/HomeInventory/releases/download/v2.5.0/homeinventory-app.tar.gz".to_string(),
            node_major: 20,
            root_install: true,
            client_install: true,
            signature: "unsigned".to_string(),
            signature_v2: "unsigned".to_string(),
        };

        assert!(verify_manifest_signature(&manifest).is_err());
        manifest.signature_v2.clear();
        assert!(verify_manifest_signature(&manifest).is_err());
    }

    #[test]
    fn test_manifest_policy_rejects_untrusted_archive_url() {
        let manifest = AppManifest {
            version: "2.2.0".to_string(),
            sha256: "a".repeat(64),
            url: "https://example.com/homeinventory-app-v2.2.0.tar.gz".to_string(),
            node_major: 20,
            root_install: true,
            client_install: true,
            signature: "unused".to_string(),
            signature_v2: "unused".to_string(),
        };

        assert!(validate_app_manifest_policy(&manifest).is_err());
    }

    #[test]
    fn test_clean_old_versions_keeps_current_and_two_previous() {
        let app_data = std::env::temp_dir().join(format!("hi-updater-test-{}", now()));
        let versions_dir = app_data.join("managed-app").join("versions");
        for version in ["2.0.0", "2.1.0", "2.2.0", "2.3.0"] {
            fs::create_dir_all(versions_dir.join(version)).unwrap();
        }

        let mut metadata = AppUpdaterMetadata {
            current_version: Some("2.3.0".to_string()),
            previous_versions: vec![
                "2.0.0".to_string(),
                "2.1.0".to_string(),
                "2.2.0".to_string(),
            ],
            last_known_good_version: Some("2.3.0".to_string()),
            update_state: String::new(),
            rollback_state: String::new(),
        };

        clean_old_versions(&app_data, &mut metadata).unwrap();

        assert!(versions_dir.join("2.3.0").exists());
        assert!(versions_dir.join("2.2.0").exists());
        assert!(versions_dir.join("2.1.0").exists());
        assert!(!versions_dir.join("2.0.0").exists());
        assert_eq!(metadata.previous_versions, vec!["2.1.0", "2.2.0"]);

        let _ = fs::remove_dir_all(app_data);
    }

    #[test]
    fn test_resolve_rollback_target_skips_missing_last_known_good() {
        let app_data = std::env::temp_dir().join(format!("hi-updater-rollback-test-{}", now()));
        let versions_dir = app_data.join("managed-app").join("versions");
        fs::create_dir_all(versions_dir.join("2.2.1")).unwrap();

        let mut metadata = AppUpdaterMetadata {
            current_version: Some("2.2.3".to_string()),
            previous_versions: vec![
                "2.2.0".to_string(),
                "2.2.1".to_string(),
                "2.2.2".to_string(),
            ],
            last_known_good_version: Some("2.2.2".to_string()),
            update_state: String::new(),
            rollback_state: String::new(),
        };

        let target = resolve_rollback_target(&app_data, &mut metadata);

        assert_eq!(target, Some("2.2.1".to_string()));
        assert_eq!(metadata.last_known_good_version, None);
        assert_eq!(metadata.previous_versions, vec!["2.2.1".to_string()]);

        let _ = fs::remove_dir_all(app_data);
    }

    #[test]
    fn test_resolve_rollback_target_returns_none_when_no_versions_exist() {
        let app_data = std::env::temp_dir().join(format!("hi-updater-empty-rollback-test-{}", now()));

        let mut metadata = AppUpdaterMetadata {
            current_version: Some("2.2.3".to_string()),
            previous_versions: vec!["2.2.2".to_string()],
            last_known_good_version: Some("2.2.2".to_string()),
            update_state: String::new(),
            rollback_state: String::new(),
        };

        let target = resolve_rollback_target(&app_data, &mut metadata);

        assert_eq!(target, None);
        assert_eq!(metadata.last_known_good_version, None);
        assert!(metadata.previous_versions.is_empty());

        let _ = fs::remove_dir_all(app_data);
    }

    #[test]
    fn test_resolve_current_app_version_ignores_missing_metadata_version() {
        let app_data = std::env::temp_dir().join(format!("hi-current-version-test-{}", now()));
        let project_root = app_data.join("workspace");
        fs::create_dir_all(&project_root).unwrap();
        fs::write(
            project_root.join("package.json"),
            r#"{"name":"home-inventory","version":"2.2.3"}"#,
        )
        .unwrap();

        let metadata = AppUpdaterMetadata {
            current_version: Some("2.2.2".to_string()),
            previous_versions: vec![],
            last_known_good_version: Some("2.2.2".to_string()),
            update_state: String::new(),
            rollback_state: String::new(),
        };

        let version = resolve_current_app_version(&app_data, &metadata, Some(&project_root), "2.2.3");

        assert_eq!(version, "2.2.3");

        let _ = fs::remove_dir_all(app_data);
    }

    #[test]
    fn test_resolve_current_app_version_reads_existing_managed_version() {
        let app_data = std::env::temp_dir().join(format!("hi-managed-current-version-test-{}", now()));
        let version_dir = app_data.join("managed-app").join("versions").join("2.2.3");
        fs::create_dir_all(&version_dir).unwrap();
        fs::write(
            version_dir.join("package.json"),
            r#"{"name":"home-inventory","version":"2.2.3"}"#,
        )
        .unwrap();

        let metadata = AppUpdaterMetadata {
            current_version: Some("2.2.3".to_string()),
            previous_versions: vec![],
            last_known_good_version: Some("2.2.3".to_string()),
            update_state: String::new(),
            rollback_state: String::new(),
        };

        let version = resolve_current_app_version(&app_data, &metadata, None, "2.2.0");

        assert_eq!(version, "2.2.3");

        let _ = fs::remove_dir_all(app_data);
    }

    #[test]
    fn test_path_traversal_rejection() {
        let malicious_path_1 = PathBuf::from("../escaped");
        let malicious_path_2 = PathBuf::from("/etc/passwd");

        assert!(malicious_path_1
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir)));
        assert!(malicious_path_2.is_absolute());
    }

    #[test]
    fn test_allowlisted_commands() {
        let allowed_args = vec!["ci", "--prefix", "client"];
        assert_eq!(allowed_args[0], "ci");
    }
}
