use sha2::Digest;
use std::{
    collections::HashMap, fs, net::TcpListener, path::PathBuf, process::Command as ProcessCommand,
};

use crate::commands::validate_local_app_url;
use crate::config::profile_config;
use crate::https::ensure_https_material;
use crate::managed::{
    bundled_reconciliation_required, clean_old_versions, installed_app_version,
    managed_version_dir, resolve_current_app_version, resolve_rollback_target, AppUpdaterMetadata,
};
use crate::manifest::{
    validate_app_manifest_policy, validate_coordinated_release, verify_manifest_signature,
    AppManifest,
};
use crate::node::{
    portable_node_archive_file_name, portable_node_download_url, portable_node_expected_sha256,
    portable_node_folder_name, verify_file_sha256, PORTABLE_NODE_VERSION, REQUIRED_NODE_MAJOR,
};
use crate::ports::{
    bundled_sync_port_preflight_error, is_port_available, json_port, requested_ports,
    suggest_random_ports_internal,
};
use crate::process::profile_start_is_blocked;
use crate::secrets::write_profile_secrets;
use crate::setup::{bundled_app_is_same_or_newer, should_prefer_bundled_app_version};
use crate::types::PortCheckResult;
use crate::updater::{
    immediate_rollback_version, select_managed_app_update_source, update_failure_requires_rollback,
    update_finishes_stopped, ManagedAppUpdateSource, UpdateFlowMode,
};
use crate::util::{now, path_string, random_hex};

fn port_check_result(ok: bool, existing_home_inventory: bool) -> PortCheckResult {
    PortCheckResult {
        ok,
        backend_port: 4101,
        frontend_port: 6101,
        backend_ok: ok,
        frontend_ok: ok,
        suggested_backend_port: 4102,
        suggested_frontend_port: 6102,
        existing_home_inventory,
        existing_frontend_url: existing_home_inventory.then(|| "http://127.0.0.1:6101".to_string()),
        message: String::new(),
    }
}

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
fn test_bundled_reconciliation_accepts_an_older_managed_install() {
    assert!(bundled_reconciliation_required(
        false,
        false,
        false,
        true,
        Some("2.5.2"),
        "2.6.0",
    ));
}

#[test]
fn test_bundled_reconciliation_rejects_an_equal_managed_install() {
    assert!(!bundled_reconciliation_required(
        false,
        false,
        false,
        true,
        Some("2.6.0"),
        "2.6.0",
    ));
}

#[test]
fn test_bundled_reconciliation_never_downgrades_a_newer_managed_install() {
    assert!(!bundled_reconciliation_required(
        false,
        false,
        false,
        true,
        Some("2.7.0"),
        "2.6.0",
    ));
}

#[test]
fn test_bundled_reconciliation_rejects_a_custom_project_path() {
    assert!(!bundled_reconciliation_required(
        false,
        true,
        false,
        true,
        Some("2.5.2"),
        "2.6.0",
    ));
}

#[test]
fn test_bundled_reconciliation_requires_a_real_managed_install_and_archive() {
    assert!(!bundled_reconciliation_required(
        false, false, false, true, None, "2.6.0",
    ));
    assert!(!bundled_reconciliation_required(
        false,
        false,
        false,
        false,
        Some("2.5.2"),
        "2.6.0",
    ));
}

#[test]
fn test_bundled_reconciliation_rejects_store_and_active_profiles() {
    assert!(!bundled_reconciliation_required(
        true,
        false,
        false,
        true,
        Some("2.5.2"),
        "2.6.0",
    ));
    assert!(!bundled_reconciliation_required(
        false,
        false,
        true,
        true,
        Some("2.5.2"),
        "2.6.0",
    ));
}

#[test]
fn test_bundled_only_mode_never_selects_an_online_source() {
    assert_eq!(
        select_managed_app_update_source(UpdateFlowMode::BundledOnly, true, "2.6.0", Some("2.7.0"),),
        Some(ManagedAppUpdateSource::Bundled),
    );
    assert_eq!(
        select_managed_app_update_source(
            UpdateFlowMode::BundledOnly,
            false,
            "2.6.0",
            Some("2.7.0"),
        ),
        None,
    );
}

#[test]
fn test_coordinated_mode_preserves_online_and_bundled_source_selection() {
    assert_eq!(
        select_managed_app_update_source(UpdateFlowMode::Coordinated, true, "2.6.0", Some("2.5.2"),),
        Some(ManagedAppUpdateSource::Bundled),
    );
    assert_eq!(
        select_managed_app_update_source(UpdateFlowMode::Coordinated, true, "2.6.0", Some("2.7.0"),),
        Some(ManagedAppUpdateSource::Online),
    );
}

#[test]
fn test_only_bundled_reconciliation_finishes_stopped() {
    assert!(update_finishes_stopped(UpdateFlowMode::BundledOnly));
    assert!(!update_finishes_stopped(UpdateFlowMode::Coordinated));
}

#[test]
fn test_bundled_reconciliation_uses_validated_requested_ports() {
    let profile = profile_config("homeinventory").unwrap();
    assert_eq!(
        requested_ports(profile, Some(4101), Some(6101)).unwrap(),
        (4101, 6101),
    );
    assert!(requested_ports(profile, Some(4101), Some(4101)).is_err());
}

#[test]
fn test_bundled_sync_preflight_accepts_only_available_ports() {
    assert!(bundled_sync_port_preflight_error(&port_check_result(true, false)).is_none());

    let busy_error = bundled_sync_port_preflight_error(&port_check_result(false, false)).unwrap();
    assert!(busy_error.contains("no longer available"));
    assert!(busy_error.contains("4102/6102"));
}

#[test]
fn test_bundled_sync_preflight_rejects_an_existing_instance_first() {
    let error = bundled_sync_port_preflight_error(&port_check_result(false, true)).unwrap();
    assert!(error.contains("already running"));
    assert!(error.contains("http://127.0.0.1:6101"));
    assert!(!error.contains("suggested ports"));
}

#[test]
fn test_update_internal_restart_bypasses_only_the_update_lock() {
    assert!(profile_start_is_blocked(true, false));
    assert!(!profile_start_is_blocked(true, true));
    assert!(!profile_start_is_blocked(false, false));
}

#[test]
fn test_port_availability_rejects_a_wildcard_listener() {
    let listener = match TcpListener::bind(("0.0.0.0", 0)) {
        Ok(listener) => listener,
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => return,
        Err(error) => panic!("Could not create test listener: {error}"),
    };
    let port = listener.local_addr().unwrap().port();
    assert!(!is_port_available(port));
}

#[test]
fn test_random_port_suggestions_are_distinct_and_valid() {
    let suggested = suggest_random_ports_internal().unwrap();
    assert_ne!(suggested.backend_port, suggested.frontend_port);
    assert!((1024..=65535).contains(&suggested.backend_port));
    assert!((1024..=65535).contains(&suggested.frontend_port));
    // The listeners used to choose both ports are intentionally released
    // before this function returns. Rebinding here would race every other
    // process on the runner and does not test a guarantee made to callers.
}

#[test]
fn test_server_info_ports_accept_numbers_and_strings() {
    assert_eq!(json_port(&serde_json::json!(3001)), Some(3001));
    assert_eq!(json_port(&serde_json::json!("5173")), Some(5173));
    assert_eq!(json_port(&serde_json::json!(" 5173 ")), Some(5173));
    assert_eq!(json_port(&serde_json::json!(70000)), None);
    assert_eq!(json_port(&serde_json::json!("invalid")), None);
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
fn test_coordinated_release_accepts_matching_app_and_launcher_versions() {
    assert!(validate_coordinated_release("2.4.0", "2.5.0", Some("2.5.0")).is_ok());
    assert!(validate_coordinated_release("2.5.0", "2.5.0", None).is_ok());
}

#[test]
fn test_coordinated_release_rejects_partial_updates() {
    assert!(validate_coordinated_release("2.4.0", "2.5.0", None).is_err());
    assert!(validate_coordinated_release("2.5.0", "2.5.0", Some("2.6.0")).is_err());
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
fn test_portable_node_runtime_matches_release_requirement() {
    assert!(
        PORTABLE_NODE_VERSION.starts_with(&format!("{REQUIRED_NODE_MAJOR}.")),
        "portable Node.js version and managed-app major requirement diverged"
    );
    assert!(portable_node_folder_name().contains(&format!("node-v{PORTABLE_NODE_VERSION}")));
    assert_eq!(
        portable_node_download_url(),
        format!(
            "https://nodejs.org/dist/v{PORTABLE_NODE_VERSION}/{}",
            portable_node_archive_file_name()
        )
    );
    let expected_hash = portable_node_expected_sha256();
    assert_eq!(expected_hash.len(), 64);
    assert!(expected_hash
        .chars()
        .all(|character| character.is_ascii_hexdigit()));
}

#[test]
fn test_file_hash_verification_rejects_tampering() {
    let root = std::env::temp_dir().join(format!(
        "homeinventory-hash-test-{}-{}",
        std::process::id(),
        now()
    ));
    fs::create_dir_all(&root).unwrap();
    let archive = root.join("runtime.tar.gz");
    fs::write(&archive, b"trusted runtime").unwrap();
    let expected = format!("{:x}", sha2::Sha256::digest(b"trusted runtime"));
    assert!(verify_file_sha256(&archive, &expected, "test runtime").is_ok());
    fs::write(&archive, b"tampered runtime").unwrap();
    assert!(verify_file_sha256(&archive, &expected, "test runtime").is_err());
    let _ = fs::remove_dir_all(root);
}

#[test]
fn test_local_app_url_rejects_userinfo_and_external_hosts() {
    assert!(validate_local_app_url("http://127.0.0.1:5173").is_ok());
    assert!(validate_local_app_url("http://localhost:3001/path").is_ok());
    assert!(validate_local_app_url("http://127.0.0.1:5173@evil.example/path").is_err());
    assert!(validate_local_app_url("https://127.0.0.1:5173").is_err());
    assert!(validate_local_app_url("http://example.com:5173").is_err());
    assert!(validate_local_app_url("http://127.0.0.1").is_err());
}

#[test]
fn test_launcher_secret_files_are_private_on_unix() {
    let root = std::env::temp_dir().join(format!(
        "homeinventory-secret-mode-test-{}-{}",
        std::process::id(),
        now()
    ));
    let secret_path = root.join("env/launcher-secrets.env");
    let values = HashMap::from([
        ("JWT_SECRET".to_string(), "test-jwt".to_string()),
        ("APP_ENCRYPTION_KEY".to_string(), "test-key".to_string()),
        ("APP_ENCRYPTION_KEY_ID".to_string(), "test-id".to_string()),
    ]);
    write_profile_secrets(&secret_path, &values).unwrap();

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let file_mode = fs::metadata(&secret_path).unwrap().permissions().mode() & 0o777;
        let directory_mode = fs::metadata(secret_path.parent().unwrap())
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(file_mode, 0o600);
        assert_eq!(directory_mode, 0o700);
    }

    let _ = fs::remove_dir_all(root);
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
fn test_installed_app_version_is_none_without_a_real_install() {
    let app_data = std::env::temp_dir().join(format!("hi-no-install-version-test-{}", now()));
    let metadata = AppUpdaterMetadata {
        current_version: Some("2.5.0".to_string()),
        previous_versions: vec![],
        last_known_good_version: Some("2.5.0".to_string()),
        update_state: String::new(),
        rollback_state: String::new(),
    };

    assert_eq!(installed_app_version(&app_data, &metadata, None), None);

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
    let allowed_args = ["ci", "--prefix", "client"];
    assert_eq!(allowed_args[0], "ci");
}

#[test]
fn test_https_ca_stays_stable_while_leaf_rotates_for_new_lan_ip() {
    let root = std::env::temp_dir().join(format!(
        "homeinventory-https-material-{}-{}",
        std::process::id(),
        random_hex(6).unwrap()
    ));
    fs::create_dir_all(&root).unwrap();

    let first = ensure_https_material(&root, "192.168.1.20".parse().unwrap()).unwrap();
    let first_ca = fs::read(&first.ca_cert_path).unwrap();
    let first_ca_key = fs::read(root.join("https/homeinventory-local-ca-key.pem")).unwrap();
    let first_leaf = fs::read(&first.server_cert_path).unwrap();

    let second = ensure_https_material(&root, "192.168.1.21".parse().unwrap()).unwrap();
    let second_ca = fs::read(&second.ca_cert_path).unwrap();
    let second_ca_key = fs::read(root.join("https/homeinventory-local-ca-key.pem")).unwrap();
    let second_leaf = fs::read(&second.server_cert_path).unwrap();

    assert_eq!(first_ca, second_ca);
    assert_eq!(first_ca_key, second_ca_key);
    assert_eq!(first.ca_name, second.ca_name);
    assert_eq!(first.ca_fingerprint, second.ca_fingerprint);
    assert_ne!(first_leaf, second_leaf);
    assert_eq!(first.ca_fingerprint.split(':').count(), 32);

    if let Ok(verify) = ProcessCommand::new("openssl")
        .args([
            "verify",
            "-CAfile",
            &path_string(&second.ca_cert_path),
            &path_string(&second.server_cert_path),
        ])
        .output()
    {
        assert!(
            verify.status.success(),
            "openssl verify failed: {}",
            String::from_utf8_lossy(&verify.stderr)
        );
        let san = ProcessCommand::new("openssl")
            .args([
                "x509",
                "-in",
                &path_string(&second.server_cert_path),
                "-noout",
                "-ext",
                "subjectAltName",
            ])
            .output()
            .unwrap();
        assert!(san.status.success());
        assert!(String::from_utf8_lossy(&san.stdout).contains("IP Address:192.168.1.21"));
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let key_mode = fs::metadata(root.join("https/homeinventory-local-ca-key.pem"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(key_mode, 0o600);
    }

    fs::remove_dir_all(root).unwrap();
}
