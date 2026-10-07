//! Starting, supervising and stopping the HomeInventory process tree.

use std::{
    fs,
    path::Path,
    process::{Child, Command as ProcessCommand, Stdio},
    thread,
    time::Duration,
};
use tauri::State;

#[cfg(unix)]
use std::os::unix::process::CommandExt;

#[cfg(windows)]
use std::os::windows::io::AsRawHandle;

use crate::config::{is_store_distribution, profile_config};
use crate::logs::{append_log, stream_process_output};
use crate::node::{ensure_native_modules_match, resolve_tools, resolved_command_env};
use crate::paths::{app_data_dir, profile_paths};
use crate::ports::{is_port_available, next_free_port, requested_ports};
use crate::project::{
    project_root_handle, project_run_mode, seed_env_file, validate_project_root, RunMode,
};
use crate::secrets::{ensure_profile_secrets, write_launcher_brand_env};
use crate::setup::sync_store_project_root;
#[cfg(windows)]
use crate::state::WindowsJob;
use crate::state::{LauncherState, ManagedProcess};
use crate::types::{CommandResult, StartProfileRequest, ToolOverrides};
use crate::util::path_string;

pub(crate) fn start_profile_internal(
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
    let run_mode = project_run_mode(app, Some(&project_root));
    let production = run_mode == RunMode::Production;
    let (backend_port, frontend_port) =
        requested_ports(profile, backend_port, frontend_port, run_mode.single_port())?;

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

    if !run_mode.single_port() && !is_port_available(frontend_port) {
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
        if production {
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

    let actual_frontend_port = if production {
        backend_port
    } else {
        frontend_port
    };

    command_env.insert("FRONTEND_PORT".into(), actual_frontend_port.to_string());
    command_env.insert("VITE_PORT".into(), actual_frontend_port.to_string());
    if production {
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
    // The launcher manages app updates itself; skip the server's own
    // GitHub "new version" check for launcher-managed processes.
    command_env.insert("UPDATE_CHECK".into(), "false".into());
    if production {
        ensure_native_modules_match(state, &node, &npm, &project_root, &command_env);
    }
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

    let mut args = if production {
        vec!["server.js".to_string()]
    } else {
        vec!["scripts/dev.mjs".to_string()]
    };
    if let Some(brand_key) = profile.brand_key.filter(|_| !production) {
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
        &if production {
            format!(
                "Starting {} (production build) on port {backend_port}...",
                profile.name
            )
        } else {
            format!(
                "Starting {} (development server) on ports {backend_port}/{frontend_port}...",
                profile.name
            )
        },
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
    stream_process_output(
        state,
        profile.id,
        stdout,
        "info",
        Some(profile_paths.log_dir.clone()),
    );
    stream_process_output(
        state,
        profile.id,
        stderr,
        "error",
        Some(profile_paths.log_dir.clone()),
    );

    #[cfg(windows)]
    let job = create_windows_job(&child);

    let managed = ManagedProcess {
        profile_id: profile.id.to_string(),
        backend_port,
        frontend_port,
        https_gateway: None,
        https_status: None,
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

pub(crate) fn profile_start_is_blocked(updating: bool, allow_during_update: bool) -> bool {
    updating && !allow_during_update
}

#[tauri::command]
pub(crate) async fn start_profile(
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

pub(crate) fn reconcile_active(state: &LauncherState) {
    let Ok(mut active) = state.active.lock() else {
        return;
    };

    if let Some(process) = active.as_mut() {
        if let Some(gateway) = process.https_gateway.as_mut() {
            match gateway.try_wait() {
                Ok(Some(status)) => {
                    let profile_id = process.profile_id.clone();
                    process.https_gateway = None;
                    process.https_status = None;
                    append_log(
                        state,
                        &profile_id,
                        "error",
                        &format!("Optional HTTPS gateway exited with status {status}. Normal HTTP access is still available."),
                    );
                }
                Ok(None) => {}
                Err(err) => {
                    let profile_id = process.profile_id.clone();
                    process.https_gateway = None;
                    process.https_status = None;
                    append_log(
                        state,
                        &profile_id,
                        "error",
                        &format!("Could not check HTTPS gateway state: {err}"),
                    );
                }
            }
        }
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

pub(crate) fn stop_all_internal(state: &LauncherState) -> Result<(), String> {
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
    if let Some(gateway) = process.https_gateway.as_mut() {
        #[cfg(unix)]
        unsafe {
            libc::kill(-(gateway.id() as i32), libc::SIGTERM);
        }
        #[cfg(not(unix))]
        {
            let _ = gateway.kill();
        }
        wait_or_kill(gateway);
    }
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

pub(crate) fn terminate_process_tree(process: &mut ManagedProcess) {
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

pub(crate) fn wait_or_kill(child: &mut Child) {
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
pub(crate) fn create_windows_job(child: &Child) -> Option<WindowsJob> {
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

#[cfg(windows)]
pub(crate) fn assign_windows_job(job: &WindowsJob, child: &Child) -> Result<(), String> {
    use windows_sys::Win32::System::JobObjects::AssignProcessToJobObject;
    let assigned = unsafe { AssignProcessToJobObject(job.0, child.as_raw_handle() as _) };
    if assigned == 0 {
        Err("Could not attach the HTTPS gateway to the launcher process job.".into())
    } else {
        Ok(())
    }
}
