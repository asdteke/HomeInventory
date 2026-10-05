//! LAN address discovery and reachability checks.

use std::{
    net::{SocketAddr, TcpStream},
    time::Duration,
};

use crate::types::LanAccessStatus;

pub(crate) fn get_local_ip() -> Option<String> {
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

pub(crate) fn check_lan_access_status(
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

pub(crate) fn tcp_reachable(host: &str, port: u16) -> bool {
    let Ok(addr) = format!("{host}:{port}").parse::<SocketAddr>() else {
        return false;
    };
    TcpStream::connect_timeout(&addr, Duration::from_millis(350)).is_ok()
}
