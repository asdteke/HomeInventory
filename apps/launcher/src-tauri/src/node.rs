//! Node.js/npm discovery and the checksum-verified portable runtime.

use sha2::Digest;
use std::{
    collections::HashMap,
    env,
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
    process::Command as ProcessCommand,
};
use tauri::Manager;

use crate::archive::{extract_tar_gz, extract_zip};
use crate::config::is_store_distribution;
use crate::logs::append_log;
use crate::paths::app_data_dir;
use crate::state::LauncherState;
use crate::types::ToolOverrides;
use crate::util::path_string;

pub(crate) const PORTABLE_NODE_VERSION: &str = "22.23.3";
pub(crate) const REQUIRED_NODE_MAJOR: u32 = 22;

pub(crate) struct ResolvedTools {
    pub(crate) node_path: Option<String>,
    pub(crate) npm_path: Option<String>,
}

pub(crate) fn resolved_command_env() -> HashMap<String, String> {
    #[allow(unused_mut)]
    let mut values: HashMap<String, String> = env::vars().collect();
    #[cfg(unix)]
    {
        values.extend(resolve_login_shell_env());
    }
    values
}

#[cfg(unix)]
pub(crate) fn resolve_login_shell_env() -> HashMap<String, String> {
    let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let output = ProcessCommand::new(shell)
        .arg("-l")
        .arg("-c")
        .arg("printf '__HI_ENV_START__\\n'; env; printf '__HI_ENV_END__\\n'")
        .output();

    let Ok(output) = output else {
        return HashMap::new();
    };

    let text = String::from_utf8_lossy(&output.stdout);
    let mut inside = false;
    let mut envs = HashMap::new();

    for line in text.lines() {
        match line {
            "__HI_ENV_START__" => {
                inside = true;
                continue;
            }
            "__HI_ENV_END__" => break,
            _ => {}
        }

        if inside {
            if let Some((key, value)) = line.split_once('=') {
                envs.insert(key.to_string(), value.to_string());
            }
        }
    }

    envs
}

pub(crate) fn portable_node_folder_name() -> String {
    if cfg!(target_os = "windows") {
        format!("node-v{PORTABLE_NODE_VERSION}-win-x64")
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            format!("node-v{PORTABLE_NODE_VERSION}-darwin-arm64")
        } else {
            format!("node-v{PORTABLE_NODE_VERSION}-darwin-x64")
        }
    } else {
        format!("node-v{PORTABLE_NODE_VERSION}-linux-x64")
    }
}

pub(crate) fn portable_node_archive_file_name() -> String {
    let extension = if cfg!(target_os = "windows") {
        "zip"
    } else {
        "tar.gz"
    };
    format!("{}.{}", portable_node_folder_name(), extension)
}

pub(crate) fn portable_node_download_url() -> String {
    format!(
        "https://nodejs.org/dist/v{PORTABLE_NODE_VERSION}/{}",
        portable_node_archive_file_name()
    )
}

pub(crate) fn portable_node_expected_sha256() -> &'static str {
    if cfg!(target_os = "windows") {
        "2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71"
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        "23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53"
    } else if cfg!(target_os = "macos") {
        "8a677b0219178efd6eb0e475457c4afb452b521a92f6e67845a73bd85727f2a8"
    } else {
        "1084aa36196bba4c3a5e69a1ee388a6e4ff729dad09445fbcd434b28fe3c24af"
    }
}

pub(crate) fn verify_file_sha256(path: &Path, expected: &str, label: &str) -> Result<(), String> {
    let mut file = File::open(path).map_err(|err| format!("Could not open {label}: {err}"))?;
    let mut hasher = sha2::Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|err| format!("Could not read {label}: {err}"))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    let actual = format!("{:x}", hasher.finalize());
    if actual != expected {
        return Err(format!(
            "Security check failed: {label} SHA-256 mismatch. Expected {expected}, got {actual}."
        ));
    }
    Ok(())
}

pub(crate) fn resolve_tools(
    app: &tauri::AppHandle,
    envs: &HashMap<String, String>,
    overrides: &ToolOverrides,
) -> ResolvedTools {
    let mut node_path = clean_path_override(&overrides.node_path);
    let mut npm_path = clean_path_override(&overrides.npm_path);

    // node and npm must come from the same installation: npm runs lifecycle
    // scripts and picks native-module builds with the node next to it, while
    // the app itself starts with the resolved node. Mixing the pinned portable
    // runtime with a user-selected node produced modules built for one Node
    // ABI and loaded by another.
    if node_path.is_some() != npm_path.is_some() {
        if npm_path.is_none() {
            npm_path = sibling_executable(node_path.as_deref(), npm_names());
        } else {
            node_path = sibling_executable(npm_path.as_deref(), node_names());
        }
    } else if node_path.is_none() {
        if let Ok(app_data) = app_data_dir(app) {
            let portable_dir = app_data.join("bin").join(portable_node_folder_name());
            let p_node = portable_dir.join(if cfg!(windows) {
                "node.exe"
            } else {
                "bin/node"
            });
            let p_npm = portable_dir.join(if cfg!(windows) { "npm.cmd" } else { "bin/npm" });

            if p_node.exists() && p_npm.exists() {
                node_path = Some(path_string(&p_node));
                npm_path = Some(path_string(&p_npm));
            }
        }
    }

    let node_path = node_path.or_else(|| find_executable("node", envs));
    let npm_path = npm_path
        .or_else(|| find_executable(if cfg!(windows) { "npm.cmd" } else { "npm" }, envs))
        .or_else(|| find_executable("npm", envs));

    ResolvedTools {
        node_path,
        npm_path,
    }
}

fn node_names() -> &'static [&'static str] {
    if cfg!(windows) {
        &["node.exe"]
    } else {
        &["node"]
    }
}

fn npm_names() -> &'static [&'static str] {
    if cfg!(windows) {
        &["npm.cmd"]
    } else {
        &["npm"]
    }
}

/// Finds one of `names` in the folder of `anchor`. Unix npm installs keep
/// `node` and `npm` together in `bin/`; Windows installs keep them side by side.
pub(crate) fn sibling_executable(anchor: Option<&str>, names: &[&str]) -> Option<String> {
    let dir = Path::new(anchor?).parent()?;
    names
        .iter()
        .map(|name| dir.join(name))
        .find(|candidate| candidate.is_file())
        .map(|candidate| path_string(&candidate))
}

pub(crate) fn clean_path_override(value: &Option<String>) -> Option<String> {
    value
        .as_ref()
        .map(|path| path.trim())
        .filter(|path| !path.is_empty())
        .map(|path| path.to_string())
}

pub(crate) async fn ensure_portable_node(
    app: &tauri::AppHandle,
    state: &LauncherState,
) -> Result<(), String> {
    let app_data = app_data_dir(app)?;
    let portable_dir = app_data.join("bin").join(portable_node_folder_name());
    let p_node = portable_dir.join(if cfg!(windows) {
        "node.exe"
    } else {
        "bin/node"
    });
    let p_npm = portable_dir.join(if cfg!(windows) { "npm.cmd" } else { "bin/npm" });

    if p_node.exists() && p_npm.exists() {
        return Ok(());
    }

    if is_store_distribution() {
        let bundled_node = bundled_node_archive_path(app)?;
        if !bundled_node.exists() {
            return Err(format!(
                "HomeInventory Local installation is broken: bundled Node.js runtime is missing: {}",
                path_string(&bundled_node)
            ));
        }
        verify_file_sha256(
            &bundled_node,
            portable_node_expected_sha256(),
            "bundled portable Node.js archive",
        )?;

        append_log(
            state,
            "setup",
            "info",
            "Installing bundled portable Node.js runtime...",
        );
        let dest_dir = app_data.join("bin");
        if cfg!(target_os = "windows") {
            extract_zip(&bundled_node, &dest_dir)?;
        } else {
            extract_tar_gz(&bundled_node, &dest_dir)?;
        }
        append_log(
            state,
            "setup",
            "success",
            "Bundled portable Node.js runtime is ready.",
        );
        return Ok(());
    }

    append_log(
        state,
        "setup",
        "info",
        &format!(
            "Downloading portable Node.js v{PORTABLE_NODE_VERSION} for standalone execution..."
        ),
    );

    let url = portable_node_download_url();

    let client = reqwest::Client::new();
    let mut resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to download Node.js: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Node.js download returned HTTP {}", resp.status()));
    }

    let temp_archive_name = if cfg!(target_os = "windows") {
        "node-temp.zip"
    } else {
        "node-temp.tar.gz"
    };
    let temp_archive_path = app_data.join("bin").join(temp_archive_name);
    if let Some(parent) = temp_archive_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut file = File::create(&temp_archive_path).map_err(|e| e.to_string())?;
    let mut sha_hasher = sha2::Sha256::new();
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("Error downloading Node.js chunk: {e}"))?
    {
        use std::io::Write;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        sha_hasher.update(&chunk);
    }
    drop(file);

    let calculated_hash = format!("{:x}", sha_hasher.finalize());
    let expected_hash = portable_node_expected_sha256();
    if calculated_hash != expected_hash {
        let _ = fs::remove_file(&temp_archive_path);
        return Err(format!(
            "Security check failed: downloaded portable Node.js archive SHA-256 mismatch. Expected {expected_hash}, got {calculated_hash}."
        ));
    }

    append_log(state, "setup", "info", "Extracting Node.js package...");
    let dest_dir = app_data.join("bin");

    if cfg!(target_os = "windows") {
        extract_zip(&temp_archive_path, &dest_dir)?;
    } else {
        extract_tar_gz(&temp_archive_path, &dest_dir)?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if p_node.exists() {
                let mut perms = fs::metadata(&p_node)
                    .map_err(|e| e.to_string())?
                    .permissions();
                perms.set_mode(0o755);
                fs::set_permissions(&p_node, perms).map_err(|e| e.to_string())?;
            }
            if p_npm.exists() {
                let mut perms = fs::metadata(&p_npm)
                    .map_err(|e| e.to_string())?
                    .permissions();
                perms.set_mode(0o755);
                fs::set_permissions(&p_npm, perms).map_err(|e| e.to_string())?;
            }
        }
    }

    let _ = fs::remove_file(&temp_archive_path);
    append_log(
        state,
        "setup",
        "success",
        &format!("Portable Node.js v{PORTABLE_NODE_VERSION} installed successfully."),
    );

    Ok(())
}

pub(crate) fn bundled_node_archive_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|err| format!("Could not resolve launcher resource directory: {err}"))?;
    let file_name = portable_node_archive_file_name();

    let direct = resource_dir.join(&file_name);
    if direct.exists() {
        return Ok(direct);
    }
    Ok(resource_dir.join("resources").join(file_name))
}

pub(crate) fn find_executable(name: &str, envs: &HashMap<String, String>) -> Option<String> {
    let path_value = envs.get("PATH").cloned().unwrap_or_default();
    for directory in env::split_paths(&path_value) {
        let candidate = directory.join(name);
        if candidate.is_file() {
            return Some(path_string(&candidate));
        }
    }

    #[cfg(windows)]
    {
        if let Some(found) = find_windows_executable(name) {
            return Some(found);
        }
    }

    None
}

#[cfg(windows)]
pub(crate) fn find_windows_executable(name: &str) -> Option<String> {
    let mut command = ProcessCommand::new("where.exe");
    command.arg(name);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let output = command.output().ok()?;
    if output.status.success() {
        let text = String::from_utf8_lossy(&output.stdout);
        if let Some(first) = text.lines().find(|line| !line.trim().is_empty()) {
            return Some(first.trim().to_string());
        }
    }

    let mut candidates = Vec::new();
    if let Ok(program_files) = env::var("ProgramFiles") {
        candidates.push(PathBuf::from(program_files).join("nodejs").join(name));
    }
    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        candidates.push(
            PathBuf::from(&local_app_data)
                .join("Programs")
                .join("nodejs")
                .join(name),
        );
        candidates.push(
            PathBuf::from(local_app_data)
                .join("Volta")
                .join("bin")
                .join(name),
        );
    }

    candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .map(|candidate| path_string(&candidate))
}

pub(crate) async fn get_node_major_version(_app: &tauri::AppHandle) -> Option<u32> {
    let envs = resolved_command_env();
    let node_path = find_executable("node", &envs)?;
    let mut cmd = std::process::Command::new(node_path);
    cmd.arg("--version");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let output = cmd.output().ok()?;
    if output.status.success() {
        let version_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let cleaned = version_str.strip_prefix('v').unwrap_or(&version_str);
        if let Some(first_part) = cleaned.split('.').next() {
            return first_part.parse::<u32>().ok();
        }
    }
    None
}

/// Heals an install whose native modules were built for another Node ABI than
/// the node that runs the app (for example `better-sqlite3` built by the
/// pinned portable Node 22 and then started with a system Node 24). Loads the
/// module with the exact node used to start the app and rebuilds it with that
/// same node when the ABI does not match.
pub(crate) fn ensure_native_modules_match(
    state: &LauncherState,
    node: &str,
    npm: &str,
    project_root: &Path,
    envs: &HashMap<String, String>,
) {
    if !project_root
        .join("node_modules")
        .join("better-sqlite3")
        .exists()
    {
        return;
    }
    let probe = |program: &str, args: &[&str]| {
        let mut command = ProcessCommand::new(program);
        command.args(args).current_dir(project_root).envs(envs);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        command.output()
    };
    let Ok(output) = probe(
        node,
        &["-e", "new (require('better-sqlite3'))(':memory:').close()"],
    ) else {
        return;
    };
    if output.status.success() {
        return;
    }
    let message = String::from_utf8_lossy(&output.stderr);
    if !message.contains("NODE_MODULE_VERSION") {
        return;
    }
    append_log(
        state,
        "setup",
        "warning",
        "Native modules were built for a different Node.js version. Rebuilding them for the Node.js used to run HomeInventory...",
    );
    if npm.is_empty() {
        append_log(
            state,
            "setup",
            "error",
            "npm was not found; cannot rebuild native modules.",
        );
        return;
    }
    match probe(
        npm,
        &["rebuild", "better-sqlite3", "--no-audit", "--no-fund"],
    ) {
        Ok(result) if result.status.success() => {
            append_log(state, "setup", "success", "Native modules were rebuilt.");
        }
        Ok(result) => append_log(
            state,
            "setup",
            "error",
            &format!(
                "Rebuilding native modules failed: {}",
                String::from_utf8_lossy(&result.stderr).trim()
            ),
        ),
        Err(err) => append_log(
            state,
            "setup",
            "error",
            &format!("Could not run npm rebuild: {err}"),
        ),
    }
}
