//! Request and response types exchanged with the launcher UI.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ToolOverrides {
    pub(crate) node_path: Option<String>,
    pub(crate) npm_path: Option<String>,
    pub(crate) project_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StartProfileRequest {
    pub(crate) profile_id: String,
    pub(crate) overrides: Option<ToolOverrides>,
    pub(crate) backend_port: Option<u16>,
    pub(crate) frontend_port: Option<u16>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EnableHttpsRequest {
    pub(crate) profile_id: String,
    pub(crate) overrides: Option<ToolOverrides>,
    pub(crate) https_port: Option<u16>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackupRequest {
    pub(crate) profile_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WriteEnvRequest {
    pub(crate) entries: HashMap<String, String>,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CheckPortsRequest {
    pub(crate) backend_port: u16,
    pub(crate) frontend_port: u16,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SuggestedPorts {
    pub(crate) backend_port: u16,
    pub(crate) frontend_port: u16,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BundledSyncRequest {
    pub(crate) overrides: Option<ToolOverrides>,
    pub(crate) backend_port: Option<u16>,
    pub(crate) frontend_port: Option<u16>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChoosePathRequest {
    pub(crate) kind: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ToolStatus {
    pub(crate) name: String,
    pub(crate) path: Option<String>,
    pub(crate) ok: bool,
    pub(crate) detail: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProfileStatus {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) available: bool,
    pub(crate) running: bool,
    pub(crate) backend_port: u16,
    pub(crate) frontend_port: u16,
    pub(crate) frontend_url: String,
    pub(crate) backend_url: String,
    pub(crate) data_dir: String,
    pub(crate) db_path: String,
    pub(crate) uploads_dir: String,
    pub(crate) brand_assets: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SetupStatus {
    pub(crate) node: bool,
    pub(crate) npm: bool,
    pub(crate) project_root_valid: bool,
    pub(crate) project_root_installable: bool,
    pub(crate) root_dependencies: bool,
    pub(crate) client_dependencies: bool,
    pub(crate) env_file: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LauncherSnapshot {
    pub(crate) project_root: String,
    pub(crate) app_data_dir: String,
    pub(crate) local_ip: Option<String>,
    pub(crate) lan_status: Option<LanAccessStatus>,
    pub(crate) tools: Vec<ToolStatus>,
    pub(crate) setup: SetupStatus,
    pub(crate) profiles: Vec<ProfileStatus>,
    pub(crate) active_profile_id: Option<String>,
    pub(crate) logs: Vec<LogEntry>,
    pub(crate) launcher_version: String,
    pub(crate) app_version: String,
    pub(crate) app_source: String,
    pub(crate) bundled_sync_required: bool,
    pub(crate) distribution: String,
    pub(crate) store_build: bool,
    pub(crate) https_status: Option<HttpsStatus>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CommandResult {
    pub(crate) ok: bool,
    pub(crate) message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackupResult {
    pub(crate) ok: bool,
    pub(crate) message: String,
    pub(crate) path: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PortCheckResult {
    pub(crate) ok: bool,
    pub(crate) backend_port: u16,
    pub(crate) frontend_port: u16,
    pub(crate) backend_ok: bool,
    pub(crate) frontend_ok: bool,
    pub(crate) suggested_backend_port: u16,
    pub(crate) suggested_frontend_port: u16,
    pub(crate) existing_home_inventory: bool,
    pub(crate) existing_frontend_url: Option<String>,
    pub(crate) message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LanAccessStatus {
    pub(crate) ok: bool,
    pub(crate) frontend_ok: bool,
    pub(crate) backend_ok: bool,
    pub(crate) frontend_url: Option<String>,
    pub(crate) backend_url: Option<String>,
    pub(crate) message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HttpsStatus {
    pub(crate) enabled: bool,
    pub(crate) https_port: u16,
    pub(crate) enrollment_port: u16,
    pub(crate) https_url: String,
    pub(crate) ios_enrollment_url: String,
    pub(crate) android_enrollment_url: String,
    pub(crate) ca_name: String,
    pub(crate) ca_fingerprint: String,
    pub(crate) enrollment_expires_at: u64,
    pub(crate) certificate_expires_at: u64,
    pub(crate) local_ip: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LogEntry {
    pub(crate) timestamp: u64,
    pub(crate) source: String,
    pub(crate) level: String,
    pub(crate) message: String,
}
