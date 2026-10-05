//! Optional mobile HTTPS gateway and its private local CA.

use base64::prelude::*;
use rcgen::{
    BasicConstraints, CertificateParams, DistinguishedName, DnType, ExtendedKeyUsagePurpose, IsCa,
    KeyPair, KeyUsagePurpose, SanType,
};
use sha2::Digest;
use std::{
    fs,
    net::IpAddr,
    path::{Path, PathBuf},
    process::{Command as ProcessCommand, Stdio},
    thread,
    time::Duration,
};
use tauri::State;
use time::{Duration as TimeDuration, OffsetDateTime};

#[cfg(unix)]
use std::os::unix::process::CommandExt;

use crate::config::profile_config;
use crate::logs::{append_log, stream_process_output};
use crate::network::{get_local_ip, tcp_reachable};
use crate::node::{resolve_tools, resolved_command_env};
use crate::paths::{app_data_dir, profile_paths};
use crate::ports::{is_port_available, next_free_port, validate_port};
#[cfg(windows)]
use crate::process::assign_windows_job;
use crate::project::project_root_handle;
use crate::state::LauncherState;
use crate::types::{BackupRequest, CommandResult, EnableHttpsRequest, HttpsStatus};
use crate::util::{now, path_string, random_hex, set_private_permissions, write_private_file};

pub(crate) struct HttpsMaterial {
    pub(crate) ca_name: String,
    pub(crate) ca_fingerprint: String,
    pub(crate) ca_cert_path: PathBuf,
    pub(crate) server_cert_path: PathBuf,
    pub(crate) server_key_path: PathBuf,
}

pub(crate) fn local_ca_params(name: &str) -> Result<CertificateParams, String> {
    let mut params = CertificateParams::new(Vec::<String>::new())
        .map_err(|err| format!("Could not create CA parameters: {err}"))?;
    params.not_before = OffsetDateTime::now_utc() - TimeDuration::days(1);
    params.not_after = OffsetDateTime::now_utc() + TimeDuration::days(3650);
    params.is_ca = IsCa::Ca(BasicConstraints::Constrained(0));
    params.key_usages = vec![
        KeyUsagePurpose::DigitalSignature,
        KeyUsagePurpose::KeyCertSign,
        KeyUsagePurpose::CrlSign,
    ];
    let mut distinguished_name = DistinguishedName::new();
    distinguished_name.push(DnType::OrganizationName, "HomeInventory");
    distinguished_name.push(DnType::CommonName, name);
    params.distinguished_name = distinguished_name;
    Ok(params)
}

pub(crate) fn ensure_https_material(
    profile_root: &Path,
    local_ip: IpAddr,
) -> Result<HttpsMaterial, String> {
    let https_dir = profile_root.join("https");
    fs::create_dir_all(&https_dir).map_err(|err| err.to_string())?;
    set_private_permissions(&https_dir, true)?;

    let ca_cert_path = https_dir.join("homeinventory-local-ca.pem");
    let ca_key_path = https_dir.join("homeinventory-local-ca-key.pem");
    let ca_name_path = https_dir.join("homeinventory-local-ca-name.txt");
    let server_cert_path = https_dir.join("homeinventory-lan-chain.pem");
    let server_key_path = https_dir.join("homeinventory-lan-key.pem");

    let existing_ca = ca_cert_path.exists() && ca_key_path.exists() && ca_name_path.exists();
    let (ca_name, ca_pem, ca_key) = if existing_ca {
        let name = fs::read_to_string(&ca_name_path)
            .map_err(|err| format!("Could not read CA name: {err}"))?
            .trim()
            .to_string();
        let pem = fs::read_to_string(&ca_cert_path)
            .map_err(|err| format!("Could not read public CA certificate: {err}"))?;
        let key_pem = fs::read_to_string(&ca_key_path)
            .map_err(|err| format!("Could not read private CA key: {err}"))?;
        let key = KeyPair::from_pem(&key_pem)
            .map_err(|err| format!("Could not parse the private CA key: {err}"))?;
        (name, pem, key)
    } else {
        let instance_id = random_hex(4)?.to_uppercase();
        let name = format!("HomeInventory Local CA {instance_id}");
        let key = KeyPair::generate().map_err(|err| format!("Could not create CA key: {err}"))?;
        let params = local_ca_params(&name)?;
        let certificate = params
            .self_signed(&key)
            .map_err(|err| format!("Could not create CA certificate: {err}"))?;
        let pem = certificate.pem();
        write_private_file(&ca_key_path, &key.serialize_pem())?;
        fs::write(&ca_cert_path, &pem)
            .map_err(|err| format!("Could not write public CA certificate: {err}"))?;
        fs::write(&ca_name_path, &name)
            .map_err(|err| format!("Could not write CA metadata: {err}"))?;
        (name, pem, key)
    };

    set_private_permissions(&ca_key_path, false)?;
    let ca_params = local_ca_params(&ca_name)?;
    let ca_certificate = ca_params
        .self_signed(&ca_key)
        .map_err(|err| format!("Could not load the CA signer: {err}"))?;

    let server_key =
        KeyPair::generate().map_err(|err| format!("Could not create HTTPS server key: {err}"))?;
    let mut server_params = CertificateParams::new(Vec::<String>::new())
        .map_err(|err| format!("Could not create HTTPS certificate parameters: {err}"))?;
    server_params.not_before = OffsetDateTime::now_utc() - TimeDuration::days(1);
    server_params.not_after = OffsetDateTime::now_utc() + TimeDuration::days(90);
    server_params.is_ca = IsCa::ExplicitNoCa;
    server_params.subject_alt_names = vec![SanType::IpAddress(local_ip)];
    server_params.key_usages = vec![KeyUsagePurpose::DigitalSignature];
    server_params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];
    let mut server_name = DistinguishedName::new();
    server_name.push(DnType::OrganizationName, "HomeInventory");
    server_name.push(DnType::CommonName, format!("HomeInventory LAN {local_ip}"));
    server_params.distinguished_name = server_name;
    let server_certificate = server_params
        .signed_by(&server_key, &ca_certificate, &ca_key)
        .map_err(|err| format!("Could not sign HTTPS certificate: {err}"))?;
    write_private_file(&server_key_path, &server_key.serialize_pem())?;
    fs::write(
        &server_cert_path,
        format!("{}\n{}", server_certificate.pem(), ca_pem),
    )
    .map_err(|err| format!("Could not write HTTPS certificate chain: {err}"))?;

    let ca_der_base64 = ca_pem
        .lines()
        .filter(|line| !line.starts_with("-----"))
        .collect::<String>();
    let ca_der = BASE64_STANDARD
        .decode(ca_der_base64)
        .map_err(|err| format!("Could not decode the public CA certificate: {err}"))?;
    let digest = sha2::Sha256::digest(ca_der);
    let ca_fingerprint = digest
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect::<Vec<_>>()
        .join(":");
    Ok(HttpsMaterial {
        ca_name,
        ca_fingerprint,
        ca_cert_path,
        server_cert_path,
        server_key_path,
    })
}

#[tauri::command]
pub(crate) fn enable_https(
    app: tauri::AppHandle,
    state: State<LauncherState>,
    request: EnableHttpsRequest,
) -> Result<HttpsStatus, String> {
    let profile = profile_config(&request.profile_id)?;
    let app_data_dir = app_data_dir(&app)?;
    let project_root = project_root_handle(&app, &request.overrides.clone().unwrap_or_default())?;
    let envs = resolved_command_env();
    let tools = resolve_tools(&app, &envs, &request.overrides.unwrap_or_default());
    let node = tools
        .node_path
        .ok_or_else(|| "node was not found. Configure the Node path in Settings.".to_string())?;
    let local_ip_string = get_local_ip().ok_or_else(|| {
        "No private LAN IPv4 address was found. Connect this computer and phone to the same Wi-Fi network.".to_string()
    })?;
    let local_ip: IpAddr = local_ip_string
        .parse()
        .map_err(|_| "The detected LAN address is invalid.".to_string())?;
    if !matches!(local_ip, IpAddr::V4(ip) if ip.is_private()) {
        return Err("Mobile HTTPS setup currently requires a private LAN IPv4 address.".into());
    }

    let mut active = state
        .active
        .lock()
        .map_err(|_| "Process state is locked".to_string())?;
    let process = active
        .as_mut()
        .ok_or_else(|| "Start HomeInventory before enabling mobile HTTPS.".to_string())?;
    if process.profile_id != profile.id {
        return Err("The requested profile is not running.".into());
    }
    if let Some(mut gateway) = process.https_gateway.take() {
        let _ = gateway.kill();
        let _ = gateway.wait();
        process.https_status = None;
    }

    let preferred_https_port = request.https_port.unwrap_or(5443);
    validate_port(preferred_https_port, "HTTPS")?;
    let https_port = if is_port_available(preferred_https_port) {
        preferred_https_port
    } else {
        next_free_port(preferred_https_port)
    };
    let enrollment_port = next_free_port(https_port);
    if enrollment_port == https_port || !is_port_available(enrollment_port) {
        return Err("Could not find a free certificate-enrollment port.".into());
    }

    let paths = profile_paths(&app_data_dir, profile);
    let material = ensure_https_material(&paths.profile_root, local_ip)?;
    let token = random_hex(32)?;
    let expires_at = now() + 10 * 60;
    let https_url = format!("https://{local_ip_string}:{https_port}");
    let enrollment_base = format!("http://{local_ip_string}:{enrollment_port}/enroll/{token}");
    let status = HttpsStatus {
        enabled: true,
        https_port,
        enrollment_port,
        https_url: https_url.clone(),
        ios_enrollment_url: format!("{enrollment_base}/ios.mobileconfig"),
        android_enrollment_url: format!("{enrollment_base}/android.crt"),
        ca_name: material.ca_name.clone(),
        ca_fingerprint: material.ca_fingerprint.clone(),
        enrollment_expires_at: expires_at,
        certificate_expires_at: now() + 89 * 24 * 60 * 60,
        local_ip: local_ip_string.clone(),
    };

    let mut command = ProcessCommand::new(node);
    command
        .arg(project_root.join("scripts").join("https-gateway.mjs"))
        .current_dir(&project_root)
        .env("HOMEINVENTORY_HTTPS_PORT", https_port.to_string())
        .env("HOMEINVENTORY_ENROLLMENT_PORT", enrollment_port.to_string())
        .env(
            "HOMEINVENTORY_HTTPS_TARGET_PORT",
            process.frontend_port.to_string(),
        )
        .env("HOMEINVENTORY_HTTPS_LOCAL_IP", &local_ip_string)
        .env("HOMEINVENTORY_ENROLLMENT_TOKEN", token)
        .env("HOMEINVENTORY_CA_NAME", &material.ca_name)
        .env("HOMEINVENTORY_HTTPS_KEY_PATH", material.server_key_path)
        .env("HOMEINVENTORY_HTTPS_CERT_PATH", material.server_cert_path)
        .env("HOMEINVENTORY_CA_CERT_PATH", material.ca_cert_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    command.process_group(0);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut gateway = command
        .spawn()
        .map_err(|err| format!("Could not start the HTTPS gateway: {err}"))?;
    #[cfg(windows)]
    if let Some(job) = process.job.as_ref() {
        if let Err(err) = assign_windows_job(job, &gateway) {
            let _ = gateway.kill();
            let _ = gateway.wait();
            return Err(err);
        }
    }
    stream_process_output(
        &state,
        profile.id,
        gateway.stdout.take(),
        "info",
        Some(paths.log_dir.clone()),
    );
    stream_process_output(
        &state,
        profile.id,
        gateway.stderr.take(),
        "error",
        Some(paths.log_dir),
    );
    for _ in 0..30 {
        if tcp_reachable(&local_ip_string, https_port) {
            process.https_status = Some(status.clone());
            process.https_gateway = Some(gateway);
            append_log(
                &state,
                profile.id,
                "success",
                &format!("Optional mobile HTTPS gateway started at {https_url}."),
            );
            return Ok(status);
        }
        if matches!(gateway.try_wait(), Ok(Some(_))) {
            return Err("The HTTPS gateway stopped during startup. Check launcher logs.".into());
        }
        thread::sleep(Duration::from_millis(100));
    }
    let _ = gateway.kill();
    let _ = gateway.wait();
    Err("The HTTPS gateway did not become ready in time.".into())
}

#[tauri::command]
pub(crate) fn disable_https(state: State<LauncherState>) -> Result<CommandResult, String> {
    let mut active = state
        .active
        .lock()
        .map_err(|_| "Process state is locked".to_string())?;
    let process = active
        .as_mut()
        .ok_or_else(|| "HomeInventory is not running.".to_string())?;
    if let Some(mut gateway) = process.https_gateway.take() {
        let _ = gateway.kill();
        let _ = gateway.wait();
    }
    process.https_status = None;
    Ok(CommandResult {
        ok: true,
        message: "Optional mobile HTTPS gateway stopped. Normal HTTP access is unchanged.".into(),
    })
}

#[tauri::command]
pub(crate) fn rotate_https_ca(
    app: tauri::AppHandle,
    state: State<LauncherState>,
    request: BackupRequest,
) -> Result<CommandResult, String> {
    {
        let active = state
            .active
            .lock()
            .map_err(|_| "Process state is locked".to_string())?;
        if active
            .as_ref()
            .and_then(|process| process.https_status.as_ref())
            .is_some()
        {
            return Err("Disable mobile HTTPS before rotating its private CA.".into());
        }
    }
    let profile = profile_config(&request.profile_id)?;
    let app_data_dir = app_data_dir(&app)?;
    let https_dir = profile_paths(&app_data_dir, profile)
        .profile_root
        .join("https");
    for name in [
        "homeinventory-local-ca.pem",
        "homeinventory-local-ca-key.pem",
        "homeinventory-local-ca-name.txt",
        "homeinventory-lan-chain.pem",
        "homeinventory-lan-key.pem",
    ] {
        let path = https_dir.join(name);
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|err| format!("Could not remove {}: {err}", path_string(&path)))?;
        }
    }
    let _ = fs::remove_dir(&https_dir);
    Ok(CommandResult {
        ok: true,
        message: "Local CA rotated. Previously enrolled phones must remove the old HomeInventory CA and install the new one.".into(),
    })
}
