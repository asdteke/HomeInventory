//! Signed online app manifest verification and release policy.

use base64::prelude::*;
use ed25519_dalek::Verifier;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppManifest {
    pub version: String,
    pub sha256: String,
    pub url: String,
    pub node_major: u32,
    pub root_install: bool,
    pub client_install: bool,
    pub signature: String,
    #[serde(default)]
    pub signature_v2: String,
}

pub(crate) const APP_MANIFEST_URL: &str =
    "https://github.com/asdteke/HomeInventory/releases/latest/download/homeinventory-app-manifest.json";

pub(crate) fn verify_manifest_signature(manifest: &AppManifest) -> Result<(), String> {
    if manifest.signature_v2 == "unsigned" || manifest.signature_v2.is_empty() {
        return Err("App update manifest is not signed.".to_string());
    }

    let pubkey_b64 = "GaUIILPldrqF7o0X0XfuDo8i45eXCS4lFCnFjulnCh8=";
    let pubkey_bytes = BASE64_STANDARD
        .decode(pubkey_b64)
        .map_err(|e| format!("Invalid hardcoded public key base64: {e}"))?;

    let signature_bytes = hex::decode(&manifest.signature_v2)
        .or_else(|_| BASE64_STANDARD.decode(&manifest.signature_v2))
        .map_err(|e| format!("Invalid signature encoding: {e}"))?;

    let message = format!(
        "{}:{}:{}:{}:{}:{}",
        manifest.version,
        manifest.sha256,
        manifest.url,
        manifest.node_major,
        manifest.root_install,
        manifest.client_install
    );

    let pubkey_arr: [u8; 32] = pubkey_bytes
        .try_into()
        .map_err(|_| "Invalid public key length".to_string())?;
    let public_key = ed25519_dalek::VerifyingKey::from_bytes(&pubkey_arr)
        .map_err(|e| format!("Invalid public key: {e}"))?;

    let sig_arr: [u8; 64] = signature_bytes
        .try_into()
        .map_err(|_| "Invalid signature length".to_string())?;
    let signature = ed25519_dalek::Signature::from_bytes(&sig_arr);

    public_key
        .verify(message.as_bytes(), &signature)
        .map_err(|e| format!("Signature verification failed: {e}"))?;

    Ok(())
}

pub(crate) fn validate_app_manifest_policy(manifest: &AppManifest) -> Result<(), String> {
    semver::Version::parse(&manifest.version)
        .map_err(|e| format!("Invalid app manifest version: {e}"))?;

    if manifest.sha256.len() != 64 || !manifest.sha256.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err("App manifest SHA-256 must be a 64-character hex string.".into());
    }

    let trusted_release_asset = manifest
        .url
        .starts_with("https://github.com/asdteke/HomeInventory/releases/download/")
        || manifest
            .url
            .starts_with("https://github.com/asdteke/HomeInventory/releases/latest/download/");
    if !trusted_release_asset {
        return Err("App archive URL must point to the official GitHub Releases assets.".into());
    }

    if !(18..=30).contains(&manifest.node_major) {
        return Err("App manifest Node.js major version is outside the supported range.".into());
    }

    Ok(())
}

pub(crate) fn validate_coordinated_release(
    current_launcher_version: &str,
    target_app_version: &str,
    available_launcher_version: Option<&str>,
) -> Result<(), String> {
    let target_launcher_version = available_launcher_version.unwrap_or(current_launcher_version);

    if target_launcher_version != target_app_version {
        return Err(format!(
            "Release version mismatch: managed app targets {target_app_version}, but launcher targets {target_launcher_version}. Update was blocked to keep both components synchronized."
        ));
    }

    Ok(())
}
