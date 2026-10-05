mod archive;
mod commands;
mod config;
mod health;
mod https;
mod install;
mod logs;
mod managed;
mod manifest;
mod network;
mod node;
mod paths;
mod platform;
mod ports;
mod process;
mod project;
mod secrets;
mod setup;
mod snapshot;
mod state;
mod types;
mod updater;
mod util;

#[cfg(test)]
mod updater_tests;

use crate::process::stop_all_internal;
use crate::state::LauncherState;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .manage(LauncherState::default())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::detect_tools,
            setup::install_dependencies,
            install::install_managed_app,
            process::start_profile,
            ports::check_ports,
            ports::suggest_random_ports,
            commands::choose_path,
            commands::reveal_path,
            commands::stop_profile,
            commands::stop_all,
            commands::open_app,
            commands::backup_now,
            commands::write_env,
            commands::read_logs,
            updater::check_updates,
            updater::update_all,
            updater::sync_bundled_managed_app,
            health::is_server_ready,
            https::enable_https,
            https::disable_https,
            https::rotate_https_ca
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
