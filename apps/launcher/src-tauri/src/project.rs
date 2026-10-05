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
