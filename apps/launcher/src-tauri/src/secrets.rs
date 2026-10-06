//! Per-profile launcher secrets and brand env files.

use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use crate::logs::append_log;
use crate::paths::ProfilePaths;
use crate::state::LauncherState;
use crate::util::{now, path_string, random_hex, set_private_permissions, write_private_file};

pub(crate) fn ensure_profile_secrets(
    state: &LauncherState,
    profile_id: &str,
    paths: &ProfilePaths,
) -> Result<HashMap<String, String>, String> {
    if paths.secrets_path.exists() {
        if let Some(parent) = paths.secrets_path.parent() {
            set_private_permissions(parent, true)?;
        }
        set_private_permissions(&paths.secrets_path, false)?;
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

pub(crate) fn read_simple_env_file(path: &Path) -> Result<HashMap<String, String>, String> {
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

pub(crate) fn write_profile_secrets(
    path: &Path,
    values: &HashMap<String, String>,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        set_private_permissions(parent, true)?;
    }

    let mut contents =
        "# Managed by HomeInventory Launcher. Do not edit while services are running.\n"
            .to_string();
    for key in ["JWT_SECRET", "APP_ENCRYPTION_KEY", "APP_ENCRYPTION_KEY_ID"] {
        if let Some(value) = values.get(key) {
            contents.push_str(&format!("{key}={value}\n"));
        }
    }
    write_private_file(path, &contents)
        .map_err(|err| format!("Could not write launcher secrets: {err}"))
}

pub(crate) fn quarantine_legacy_launcher_db(
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

pub(crate) fn write_launcher_brand_env(
    project_root: &Path,
    profile_paths: &ProfilePaths,
    brand_key: &str,
    backend_port: u16,
    frontend_port: u16,
    command_env: &HashMap<String, String>,
) -> Result<PathBuf, String> {
    let env_dir = profile_paths.profile_root.join("env");
    fs::create_dir_all(&env_dir).map_err(|err| err.to_string())?;
    set_private_permissions(&env_dir, true)?;
    let env_file = env_dir.join("env.local");
    let example_path = project_root
        .join("local-brands")
        .join(brand_key)
        .join("env.example");
    let mut contents = fs::read_to_string(&example_path)
        .map_err(|err| format!("Could not read brand env example: {err}"))?;
    contents.push_str("\n# Managed by HomeInventory Launcher\n");
    contents.push_str("NODE_ENV=development\n");
    contents.push_str("HOST=0.0.0.0\n");
    contents.push_str("FRONTEND_HOST=0.0.0.0\n");
    contents.push_str("VITE_HOST=0.0.0.0\n");
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
    write_private_file(&env_file, &contents)?;
    Ok(env_file)
}
