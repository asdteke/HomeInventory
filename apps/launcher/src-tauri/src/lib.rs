use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    env, fs,
    io::{BufRead, BufReader},
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command as ProcessCommand, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, State};

#[cfg(unix)]
use std::os::unix::process::CommandExt;

#[cfg(windows)]
use std::os::windows::io::AsRawHandle;

#[derive(Default)]
struct LauncherState {
    active: Mutex<Option<ManagedProcess>>,
    logs: Arc<Mutex<Vec<LogEntry>>>,
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
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandResult {
    ok: bool,
    message: String,
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
const PROFILE_CONFIGS: &[ProfileConfig] = &[ProfileConfig {
    id: "homeinventory",
    name: "HomeInventory",
    description: "Open-source local development profile",
    backend_port: 3001,
    frontend_port: 5173,
    brand_key: None,
}];

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
fn install_dependencies(
    app: tauri::AppHandle,
    state: State<LauncherState>,
    overrides: Option<ToolOverrides>,
) -> Result<CommandResult, String> {
    let overrides = overrides.unwrap_or_default();
    let project_root = project_root(&overrides)?;
    let envs = resolved_command_env();
    let tools = resolve_tools(&envs, &overrides);
    let npm = tools
        .npm_path
        .clone()
        .ok_or_else(|| "npm was not found. Configure the npm path in Settings.".to_string())?;

    append_log(
        &state,
        "setup",
        "info",
        "Installing root and client dependencies...",
    );
    let output = ProcessCommand::new(&npm)
        .arg("run")
        .arg("install-all")
        .current_dir(&project_root)
        .envs(&envs)
        .output()
        .map_err(|err| format!("Failed to run npm install-all: {err}"))?;

    append_process_output(&state, "setup", &output.stdout, "info");
    append_process_output(&state, "setup", &output.stderr, "error");

    if output.status.success() {
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
            "Dependency install failed with exit code {:?}. Check Logs for details.",
            output.status.code()
        ))
    }
}

#[tauri::command]
fn start_profile(
    app: tauri::AppHandle,
    state: State<LauncherState>,
    request: StartProfileRequest,
) -> Result<CommandResult, String> {
    reconcile_active(&state);
    let overrides = request.overrides.unwrap_or_default();
    let project_root = project_root(&overrides)?;
    let app_data_dir = app_data_dir(&app)?;
    let profile = profile_config(&request.profile_id)?;
    let (backend_port, frontend_port) =
        requested_ports(profile, request.backend_port, request.frontend_port)?;

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

    let envs = resolved_command_env();
    let tools = resolve_tools(&envs, &overrides);
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
    command_env.insert("NODE_ENV".into(), "development".into());
    command_env.insert("HOST".into(), "0.0.0.0".into());
    command_env.insert("FRONTEND_HOST".into(), "0.0.0.0".into());
    command_env.insert("VITE_HOST".into(), "0.0.0.0".into());
    command_env.insert("PORT".into(), backend_port.to_string());
    command_env.insert("FRONTEND_PORT".into(), frontend_port.to_string());
    command_env.insert("VITE_PORT".into(), frontend_port.to_string());
    command_env.insert(
        "SITE_URL".into(),
        format!("http://localhost:{}", frontend_port),
    );
    command_env.insert(
        "APP_SITE_URL".into(),
        format!("http://localhost:{}", frontend_port),
    );
    command_env.insert("HOMEINVENTORY_NPM_EXEC".into(), npm);
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
    command_env.extend(ensure_profile_secrets(&state, profile.id, &profile_paths)?);

    let mut args = vec!["scripts/dev.mjs".to_string()];
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
        &state,
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

    #[cfg(unix)]
    {
        command.process_group(0);
    }

    let mut child = command
        .spawn()
        .map_err(|err| format!("Failed to start {}: {err}", profile.name))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    stream_process_output(&state, profile.id, stdout, "info");
    stream_process_output(&state, profile.id, stderr, "error");

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
fn backup_now(app: tauri::AppHandle, request: BackupRequest) -> Result<CommandResult, String> {
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

    Ok(CommandResult {
        ok: true,
        message: format!("Backup created at {}", path_string(&destination)),
    })
}

#[tauri::command]
fn write_env(
    overrides: Option<ToolOverrides>,
    request: WriteEnvRequest,
) -> Result<CommandResult, String> {
    let overrides = overrides.unwrap_or_default();
    let project_root = project_root(&overrides)?;
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

pub fn run() {
    tauri::Builder::default()
        .manage(LauncherState::default())
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
            read_logs
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

fn build_snapshot(
    app: &tauri::AppHandle,
    state: &LauncherState,
    overrides: ToolOverrides,
) -> Result<LauncherSnapshot, String> {
    let project_root = project_root(&overrides)?;
    let app_data_dir = app_data_dir(app)?;
    let envs = resolved_command_env();
    let tools = resolve_tools(&envs, &overrides);
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
                .map(|brand_key| project_root.join("local-brands").join(brand_key).exists())
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

            ProfileStatus {
                id: profile.id.to_string(),
                name: profile.name.to_string(),
                description: profile.description.to_string(),
                available: profile.brand_key.is_none() || brand_assets,
                running: active_profile_id.as_deref() == Some(profile.id),
                backend_port,
                frontend_port,
                frontend_url: format!("http://localhost:{}", frontend_port),
                backend_url: format!("http://localhost:{}", backend_port),
                data_dir: path_string(&paths.data_dir),
                db_path: path_string(&paths.db_path),
                uploads_dir: path_string(&paths.uploads_dir),
                brand_assets,
            }
        })
        .collect::<Vec<_>>();

    let setup = SetupStatus {
        node: tools.node_path.is_some(),
        npm: tools.npm_path.is_some(),
        root_dependencies: project_root.join("node_modules").exists(),
        client_dependencies: project_root.join("client").join("node_modules").exists(),
        env_file: project_root.join(".env").exists(),
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
            check_lan_access_status(local_ip.as_deref(), *backend_port, *frontend_port)
        });

    Ok(LauncherSnapshot {
        project_root: path_string(&project_root),
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
    })
}

fn get_local_ip() -> Option<String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    socket.local_addr().ok().map(|a| a.ip().to_string())
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
        (true, true) => "LAN probe passed. Other devices should be able to connect on the same network.".to_string(),
        (false, true) => "Frontend is not reachable through the LAN IP. Check firewall or frontend host binding.".to_string(),
        (true, false) => "Frontend is reachable, but the API port is not reachable through the LAN IP.".to_string(),
        (false, false) => "LAN probe failed. Check firewall permissions and make sure the service is bound to 0.0.0.0.".to_string(),
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

fn project_root(overrides: &ToolOverrides) -> Result<PathBuf, String> {
    if let Some(project_path) = overrides
        .project_path
        .as_ref()
        .filter(|value| !value.trim().is_empty())
    {
        return fs::canonicalize(project_path)
            .map_err(|err| format!("Configured project path is invalid: {err}"));
    }

    fs::canonicalize(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.."))
        .map_err(|err| format!("Could not resolve project root: {err}"))
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

fn resolve_tools(envs: &HashMap<String, String>, overrides: &ToolOverrides) -> ResolvedTools {
    let node_path =
        clean_path_override(&overrides.node_path).or_else(|| find_executable("node", envs));
    let npm_path = clean_path_override(&overrides.npm_path)
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
    let output = ProcessCommand::new("where.exe").arg(name).output().ok()?;
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
    contents.push_str(&format!("SITE_URL=http://localhost:{}\n", frontend_port));
    contents.push_str(&format!(
        "APP_SITE_URL=http://localhost:{}\n",
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
) {
    let Some(pipe) = pipe else {
        return;
    };
    let logs = state.logs.clone();
    thread::spawn(move || {
        let reader = BufReader::new(pipe);
        for line in reader.lines().flatten() {
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
        if job == 0 {
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

        let assigned = AssignProcessToJobObject(job, child.as_raw_handle());
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
    let frontend_port = frontend_port.unwrap_or(profile.frontend_port);
    validate_port(backend_port, "API")?;
    validate_port(frontend_port, "UI")?;
    if backend_port == frontend_port {
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
            "POSIX path of (choose folder with prompt \"Select the HomeInventory project folder\")"
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
        r#"Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'Select the HomeInventory project folder'; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }"#
    } else {
        r#"Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.OpenFileDialog; $d.Title = 'Select the executable'; $d.Filter = 'Executables (*.exe;*.cmd;*.bat)|*.exe;*.cmd;*.bat|All files (*.*)|*.*'; if ($d.ShowDialog() -eq 'OK') { $d.FileName }"#
    };
    let output = ProcessCommand::new("powershell")
        .args(["-NoProfile", "-Command", script])
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
