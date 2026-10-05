//! HTTP readiness and startup health checks for the managed app.

use std::time::Duration;

#[tauri::command]
pub(crate) async fn is_server_ready(port: u16) -> bool {
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

pub(crate) async fn run_health_checks(
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
