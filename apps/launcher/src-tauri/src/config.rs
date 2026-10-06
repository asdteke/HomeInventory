//! Static launcher configuration: distribution flavour and the built-in profiles.

#[derive(Clone)]
pub(crate) struct ProfileConfig {
    pub(crate) id: &'static str,
    pub(crate) name: &'static str,
    pub(crate) description: &'static str,
    pub(crate) backend_port: u16,
    pub(crate) frontend_port: u16,
    pub(crate) brand_key: Option<&'static str>,
}

pub(crate) const LOG_LIMIT: usize = 600;
pub(crate) const STORE_DISTRIBUTION: &str = "store";
pub(crate) const PROFILE_CONFIGS: &[ProfileConfig] = &[ProfileConfig {
    id: "homeinventory",
    name: "HomeInventory",
    description: "Open-source local development profile",
    backend_port: 3001,
    frontend_port: 5173,
    brand_key: None,
}];

pub(crate) fn distribution() -> &'static str {
    match option_env!("HOMEINVENTORY_DISTRIBUTION") {
        Some(STORE_DISTRIBUTION) => STORE_DISTRIBUTION,
        _ => "standard",
    }
}

pub(crate) fn is_store_distribution() -> bool {
    distribution() == STORE_DISTRIBUTION
}

pub(crate) fn profile_config(profile_id: &str) -> Result<&'static ProfileConfig, String> {
    PROFILE_CONFIGS
        .iter()
        .find(|profile| profile.id == profile_id)
        .ok_or_else(|| format!("Unknown profile: {profile_id}"))
}
