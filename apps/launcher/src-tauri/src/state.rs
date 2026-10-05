//! Shared launcher state managed by Tauri.

use std::{
    process::Child,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

use crate::types::{HttpsStatus, LogEntry};

pub(crate) struct LauncherState {
    pub(crate) active: Mutex<Option<ManagedProcess>>,
    pub(crate) logs: Arc<Mutex<Vec<LogEntry>>>,
    pub(crate) installing: AtomicBool,
    pub(crate) updating: Mutex<bool>,
}

impl Default for LauncherState {
    fn default() -> Self {
        Self {
            active: Mutex::new(None),
            logs: Arc::new(Mutex::new(Vec::new())),
            installing: AtomicBool::new(false),
            updating: Mutex::new(false),
        }
    }
}

pub(crate) struct InstallFlagGuard<'a> {
    pub(crate) flag: &'a AtomicBool,
}

impl Drop for InstallFlagGuard<'_> {
    fn drop(&mut self) {
        self.flag.store(false, Ordering::SeqCst);
    }
}

pub(crate) struct ManagedProcess {
    pub(crate) profile_id: String,
    pub(crate) backend_port: u16,
    pub(crate) frontend_port: u16,
    pub(crate) child: Child,
    pub(crate) https_gateway: Option<Child>,
    pub(crate) https_status: Option<HttpsStatus>,
    #[cfg(unix)]
    pub(crate) process_group_id: i32,
    #[cfg(windows)]
    pub(crate) job: Option<WindowsJob>,
}

#[cfg(windows)]
pub(crate) struct WindowsJob(pub(crate) windows_sys::Win32::Foundation::HANDLE);

#[cfg(windows)]
unsafe impl Send for WindowsJob {}

#[cfg(windows)]
impl Drop for WindowsJob {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}
