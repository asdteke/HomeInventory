//! Port validation, availability checks and suggestions.

use std::{net::TcpListener, time::Duration};

use crate::config::{is_store_distribution, ProfileConfig};
use crate::types::{CheckPortsRequest, PortCheckResult, SuggestedPorts};

#[tauri::command]
pub(crate) async fn check_ports(request: CheckPortsRequest) -> Result<PortCheckResult, String> {
    check_ports_internal(request).await
}

#[tauri::command]
pub(crate) fn suggest_random_ports() -> Result<SuggestedPorts, String> {
    suggest_random_ports_internal()
}

pub(crate) fn suggest_random_ports_internal() -> Result<SuggestedPorts, String> {
    let backend_listener = TcpListener::bind(("0.0.0.0", 0))
        .map_err(|err| format!("Could not reserve a random API port: {err}"))?;
    let frontend_listener = TcpListener::bind(("0.0.0.0", 0))
        .map_err(|err| format!("Could not reserve a random UI port: {err}"))?;

    let backend_port = backend_listener
        .local_addr()
        .map_err(|err| format!("Could not inspect the random API port: {err}"))?
        .port();
    let frontend_port = frontend_listener
        .local_addr()
        .map_err(|err| format!("Could not inspect the random UI port: {err}"))?
        .port();

    validate_port(backend_port, "API")?;
    validate_port(frontend_port, "UI")?;

    Ok(SuggestedPorts {
        backend_port,
        frontend_port,
    })
}

pub(crate) async fn check_ports_internal(
    request: CheckPortsRequest,
) -> Result<PortCheckResult, String> {
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
            existing_home_inventory: false,
            existing_frontend_url: None,
            message: "API and UI ports must be different.".into(),
        });
    }

    let backend_ok = is_port_available(request.backend_port);
    let frontend_ok = is_port_available(request.frontend_port);
    let existing_frontend_url = if !backend_ok {
        detect_existing_homeinventory(request.backend_port).await
    } else {
        None
    };
    let existing_home_inventory = existing_frontend_url.is_some();
    let ok = backend_ok && frontend_ok;
    let message = if existing_home_inventory {
        "HomeInventory is already running on the selected ports. Open the existing session instead of starting a duplicate.".to_string()
    } else {
        match (backend_ok, frontend_ok) {
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
        }
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
        existing_home_inventory,
        existing_frontend_url,
        message,
    })
}

pub(crate) fn bundled_sync_port_preflight_error(result: &PortCheckResult) -> Option<String> {
    if result.existing_home_inventory {
        let location = result
            .existing_frontend_url
            .as_deref()
            .map(|url| format!(" at {url}"))
            .unwrap_or_default();
        return Some(format!(
            "HomeInventory is already running{location}. Stop it before retrying managed app synchronization."
        ));
    }

    (!result.ok).then(|| {
        format!(
            "Selected ports {}/{} are no longer available. Retry with suggested ports {}/{}.",
            result.backend_port,
            result.frontend_port,
            result.suggested_backend_port,
            result.suggested_frontend_port,
        )
    })
}

pub(crate) async fn detect_existing_homeinventory(backend_port: u16) -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(700))
        .build()
        .ok()?;
    let response = client
        .get(format!("http://127.0.0.1:{backend_port}/api/server-info"))
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let payload = response.json::<serde_json::Value>().await.ok()?;
    let reported_backend_port = json_port(payload.get("backendPort")?)?;
    let frontend_port = json_port(payload.get("frontendPort")?)?;
    if reported_backend_port != backend_port || !(1024..=65535).contains(&frontend_port) {
        return None;
    }
    Some(format!("http://127.0.0.1:{frontend_port}"))
}

pub(crate) fn json_port(value: &serde_json::Value) -> Option<u16> {
    match value {
        serde_json::Value::Number(number) => number.as_u64()?.try_into().ok(),
        serde_json::Value::String(text) => text.trim().parse().ok(),
        _ => None,
    }
}

pub(crate) fn is_port_available(port: u16) -> bool {
    // HomeInventory listens on every IPv4 interface so LAN devices can connect.
    // Checking only 127.0.0.1 can miss a wildcard listener on macOS and briefly
    // start a duplicate process that immediately exits with EADDRINUSE.
    TcpListener::bind(("0.0.0.0", port)).is_ok()
}

pub(crate) fn validate_port(port: u16, label: &str) -> Result<(), String> {
    if (1024..=65535).contains(&port) {
        Ok(())
    } else {
        Err(format!("{label} port must be between 1024 and 65535."))
    }
}

pub(crate) fn requested_ports(
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

pub(crate) fn next_free_port(start: u16) -> u16 {
    let first = start.saturating_add(1);
    let last = start.saturating_add(2000);
    (first..=last)
        .find(|port| is_port_available(*port))
        .unwrap_or(start)
}
