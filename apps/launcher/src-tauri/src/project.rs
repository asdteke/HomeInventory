//! Resolving and validating the HomeInventory install folder.

use std::{
    env, fs,
    path::{Path, PathBuf},
};

use crate::config::is_store_distribution;
use crate::managed::read_updater_metadata;
use crate::paths::{app_data_dir, store_project_root};
use crate::types::ToolOverrides;
use crate::util::path_string;

pub(crate) fn read_version_from_package_json(project_root: &Path) -> Option<String> {
    let package_json_path = project_root.join("package.json");
    let content = fs::read_to_string(&package_json_path).ok();
    if content.is_none() {
        println!(
            "DEBUG read_version_from_package_json: failed to read {:?}",
            package_json_path
        );
    }
    let content = content?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;
    let version = json.get("version")?.as_str().map(|s| s.to_string());
    println!(
        "DEBUG read_version_from_package_json: path={:?}, version={:?}",
        package_json_path, version
    );
    version
}

pub(crate) fn project_root_handle(
    app: &tauri::AppHandle,
    overrides: &ToolOverrides,
) -> Result<PathBuf, String> {
    project_root_for_snapshot(app, overrides)?.ok_or_else(|| {
        "Install folder is not configured. Choose an empty folder to install HomeInventory, or choose an existing HomeInventory folder.".to_string()
    })
}

pub(crate) fn validate_project_root(project_root: &Path) -> Result<(), String> {
    if is_valid_project_root(project_root) {
        return Ok(());
    }

    if is_empty_dir(project_root).unwrap_or(false) {
        return Err(format!(
            "The selected install folder is empty. Click Initialize & Launch to download and install HomeInventory into {}.",
            path_string(project_root)
        ));
    }

    let expected_paths = if is_store_distribution() {
        vec![
            project_root.join("package.json"),
            project_root.join("server.js"),
            project_root.join("client").join("dist").join("index.html"),
            project_root.join("node_modules"),
        ]
    } else {
        vec![
            project_root.join("package.json"),
            project_root.join("scripts").join("dev.mjs"),
            project_root.join("client").join("package.json"),
        ]
    };
    let expected = expected_paths
        .into_iter()
        .map(|path| path_string(&path))
        .collect::<Vec<_>>();

    Err(format!(
        "Selected folder is not a valid HomeInventory install folder: {}. Choose an empty folder, or choose the folder that contains these files: {}.",
        path_string(project_root),
        expected.join(", ")
    ))
}

pub(crate) fn is_valid_project_root(project_root: &Path) -> bool {
    if is_store_distribution() {
        return project_root.join("package.json").exists()
            && project_root.join("server.js").exists()
            && project_root
                .join("client")
                .join("dist")
                .join("index.html")
                .exists()
            && project_root.join("node_modules").exists();
    }

    project_root.join("package.json").exists()
        && project_root.join("scripts").join("dev.mjs").exists()
        && project_root.join("client").join("package.json").exists()
}

pub(crate) fn is_empty_dir(path: &Path) -> Result<bool, String> {
    if !path.is_dir() {
        return Ok(false);
    }
    let mut entries =
        fs::read_dir(path).map_err(|err| format!("Could not read selected folder: {err}"))?;
    Ok(entries.next().is_none())
}

pub(crate) fn seed_env_file(project_root: &Path) -> Result<(), String> {
    let env_path = project_root.join(".env");
    if env_path.exists() {
        return Ok(());
    }

    let example_path = project_root.join(".env.example");
    if example_path.exists() {
        fs::copy(&example_path, &env_path)
            .map_err(|err| format!("Could not create .env from .env.example: {err}"))?;
    } else {
        fs::write(&env_path, "# HomeInventory Environment\n")
            .map_err(|err| format!("Could not create .env: {err}"))?;
    }

    Ok(())
}

pub(crate) fn project_root_for_snapshot(
    app: &tauri::AppHandle,
    overrides: &ToolOverrides,
) -> Result<Option<PathBuf>, String> {
    if is_store_distribution() {
        return Ok(Some(store_project_root(app)?));
    }

    if let Some(project_path) = overrides
        .project_path
        .as_ref()
        .filter(|value| !value.trim().is_empty())
    {
        return fs::canonicalize(project_path)
            .map(Some)
            .map_err(|err| format!("Configured install folder is invalid: {err}"));
    }

    let app_data = app_data_dir(app)?;
    let metadata = read_updater_metadata(&app_data);
    if let Some(ref version) = metadata.current_version {
        let version_path = app_data.join("managed-app").join("versions").join(version);
        if version_path.exists() {
            return fs::canonicalize(&version_path)
                .map(Some)
                .map_err(|err| format!("Managed app version path is invalid: {err}"));
        }
    }

    if cfg!(debug_assertions) {
        return fs::canonicalize(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.."))
            .map(Some)
            .map_err(|err| format!("Could not resolve development workspace: {err}"));
    }

    Ok(None)
}

/// How the launcher runs a HomeInventory install folder.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum RunMode {
    /// `node server.js` with NODE_ENV=production serving the prebuilt
    /// `client/dist` on one port. Used by the Store package and by managed
    /// installs whose archive ships the prebuilt client.
    Production,
    /// The developer entrypoint `scripts/dev.mjs` (API + Vite dev server on
    /// two ports). Kept for custom/development folders and for managed
    /// installs created before the archive shipped a prebuilt client.
    Development,
}

impl RunMode {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            RunMode::Production => "production",
            RunMode::Development => "development",
        }
    }

    pub(crate) fn single_port(self) -> bool {
        self == RunMode::Production
    }
}

pub(crate) fn has_prebuilt_client(project_root: &Path) -> bool {
    project_root
        .join("client")
        .join("dist")
        .join("index.html")
        .is_file()
}

pub(crate) fn is_managed_project_root(app_data_dir: &Path, project_root: &Path) -> bool {
    let versions_dir = app_data_dir.join("managed-app").join("versions");
    let versions_dir = fs::canonicalize(&versions_dir).unwrap_or(versions_dir);
    let project_root =
        fs::canonicalize(project_root).unwrap_or_else(|_| project_root.to_path_buf());
    project_root.starts_with(versions_dir)
}

pub(crate) fn run_mode_for(store_build: bool, managed: bool, project_root: &Path) -> RunMode {
    if store_build || (managed && has_prebuilt_client(project_root)) {
        RunMode::Production
    } else {
        RunMode::Development
    }
}

/// Resolves the run mode of an install folder. Without a folder (nothing is
/// installed yet) the next managed install runs in production mode.
pub(crate) fn project_run_mode(app: &tauri::AppHandle, project_root: Option<&Path>) -> RunMode {
    let Some(project_root) = project_root else {
        return RunMode::Production;
    };
    let managed = app_data_dir(app)
        .map(|app_data| is_managed_project_root(&app_data, project_root))
        .unwrap_or(false);
    run_mode_for(is_store_distribution(), managed, project_root)
}
