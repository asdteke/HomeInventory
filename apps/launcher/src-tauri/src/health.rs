//! HTTP readiness and startup health checks for the managed app.

use std::time::{Duration, Instant};

use crate::process::reconcile_active;
use crate::state::LauncherState;

/// How long an update waits for a freshly started HomeInventory to serve its
/// UI. A cold start on a slow disk (or a development-mode Vite compile) can
/// take well over the old 30 seconds.
pub(crate) const STARTUP_HEALTH_TIMEOUT: Duration = Duration::from_secs(120);
const HEALTH_POLL_INTERVAL: Duration = Duration::from_millis(500);
const HEALTH_PROGRESS_INTERVAL: Duration = Duration::from_secs(5);

/// Maps the seconds spent waiting onto a progress range for the UI.
pub(crate) fn health_wait_progress(start: f64, end: f64, seconds: u64) -> f64 {
    let ratio = (seconds as f64 / STARTUP_HEALTH_TIMEOUT.as_secs_f64()).clamp(0.0, 1.0);
    start + (end - start) * ratio
}

/// The UI is served when `/` returns the SPA shell, not just any 200.
pub(crate) fn looks_like_app_shell(content_type: &str, body: &str) -> bool {
    content_type.to_ascii_lowercase().contains("text/html") && body.contains("id=\"root\"")
}

async fn api_is_healthy(client: &reqwest::Client, port: u16) -> bool {
    match client
        .get(format!("http://127.0.0.1:{port}/api/health"))
        .send()
        .await
    {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

async fn ui_is_served(client: &reqwest::Client, port: u16) -> bool {
    let Ok(resp) = client.get(format!("http://127.0.0.1:{port}/")).send().await else {
        return false;
    };
    if !resp.status().is_success() {
        return false;
    }
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_string();
    match resp.text().await {
        Ok(body) => looks_like_app_shell(&content_type, &body),
        Err(_) => false,
    }
}

fn readiness_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .unwrap_or_default()
}

/// Ready means the API answers and the browser would get the app shell, so
/// the launcher never opens a page that is still compiling or not listening.
#[tauri::command]
pub(crate) async fn is_server_ready(port: u16) -> bool {
    let client = readiness_client();
    api_is_healthy(&client, port).await && ui_is_served(&client, port).await
}

/// Waits until the started profile serves its API and UI. Fails early when
/// the process exits, and reports the elapsed seconds every few seconds.
pub(crate) async fn run_health_checks(
    state: &LauncherState,
    backend_port: u16,
    frontend_port: u16,
    on_wait: impl Fn(u64),
) -> Result<(), String> {
    let client = readiness_client();
    let started = Instant::now();
    let mut last_report = Instant::now();

    loop {
        tokio::time::sleep(HEALTH_POLL_INTERVAL).await;

        if api_is_healthy(&client, backend_port).await && ui_is_served(&client, frontend_port).await
        {
            return Ok(());
        }

        reconcile_active(state);
        let still_running = state
            .active
            .lock()
            .map(|active| active.is_some())
            .unwrap_or(true);
        if !still_running {
            return Err(
                "HomeInventory stopped while starting. Open Logs in Developer Tools for details."
                    .to_string(),
            );
        }

        if started.elapsed() >= STARTUP_HEALTH_TIMEOUT {
            return Err(format!(
                "HomeInventory did not finish starting within {} seconds. Open Logs in Developer Tools for details.",
                STARTUP_HEALTH_TIMEOUT.as_secs()
            ));
        }

        if last_report.elapsed() >= HEALTH_PROGRESS_INTERVAL {
            last_report = Instant::now();
            on_wait(started.elapsed().as_secs());
        }
    }
}
