//! Optional "app mode": HomeInventory inside a launcher window with a sidebar.
//!
//! The window hosts two child webviews. The sidebar loads the launcher's own
//! bundle and talks to the Rust commands through its own capability
//! (`capabilities/app-sidebar.json`). The content webview loads the local
//! HomeInventory URL as a normal top-level page, so its cookies and headers
//! behave exactly as in a browser, and it gets no IPC access at all.

use serde::Serialize;
use std::sync::atomic::{AtomicU8, Ordering};
use tauri::{
    webview::WebviewBuilder, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, Window,
    WindowEvent,
};

use crate::commands::validate_local_app_url;
use crate::types::CommandResult;

pub(crate) const MAIN_WINDOW_LABEL: &str = "main";
pub(crate) const APP_WINDOW_LABEL: &str = "app";
pub(crate) const SIDEBAR_WEBVIEW_LABEL: &str = "app-sidebar";
pub(crate) const CONTENT_WEBVIEW_LABEL: &str = "app-content";

/// Emitted to the classic launcher when the app window closes.
pub(crate) const APP_WINDOW_CLOSED_EVENT: &str = "app-window-closed";
/// Emitted to the classic launcher to open one of its panels.
pub(crate) const LAUNCHER_OPEN_TAB_EVENT: &str = "launcher-open-tab";

const SIDEBAR_COLLAPSED_WIDTH: f64 = 56.0;
const SIDEBAR_EXPANDED_WIDTH: f64 = 232.0;
const SIDEBAR_PANEL_WIDTH: f64 = 440.0;
const MIN_CONTENT_WIDTH: f64 = 320.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum SidebarMode {
    Collapsed,
    Expanded,
    /// Expanded with a panel (logs) open.
    Panel,
}

impl SidebarMode {
    fn as_u8(self) -> u8 {
        match self {
            SidebarMode::Collapsed => 0,
            SidebarMode::Expanded => 1,
            SidebarMode::Panel => 2,
        }
    }

    fn from_u8(value: u8) -> Self {
        match value {
            0 => SidebarMode::Collapsed,
            2 => SidebarMode::Panel,
            _ => SidebarMode::Expanded,
        }
    }

    pub(crate) fn parse(value: &str) -> Result<Self, String> {
        match value {
            "collapsed" => Ok(SidebarMode::Collapsed),
            "expanded" => Ok(SidebarMode::Expanded),
            "panel" => Ok(SidebarMode::Panel),
            _ => Err(format!("Unknown sidebar mode: {value}")),
        }
    }

    fn width(self) -> f64 {
        match self {
            SidebarMode::Collapsed => SIDEBAR_COLLAPSED_WIDTH,
            SidebarMode::Expanded => SIDEBAR_EXPANDED_WIDTH,
            SidebarMode::Panel => SIDEBAR_PANEL_WIDTH,
        }
    }
}

static SIDEBAR_MODE: AtomicU8 = AtomicU8::new(1);

fn sidebar_mode() -> SidebarMode {
    SidebarMode::from_u8(SIDEBAR_MODE.load(Ordering::SeqCst))
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Bounds {
    pub(crate) x: f64,
    pub(crate) width: f64,
    pub(crate) height: f64,
}

/// Splits the window (logical pixels) into the sidebar and the app content.
/// The content keeps a minimum width; the sidebar gives way on small windows.
pub(crate) fn sidebar_layout(
    window_width: f64,
    window_height: f64,
    mode: SidebarMode,
) -> (Bounds, Bounds) {
    let window_width = window_width.max(0.0);
    let height = window_height.max(0.0);
    let max_sidebar = (window_width - MIN_CONTENT_WIDTH).max(SIDEBAR_COLLAPSED_WIDTH);
    let sidebar_width = mode.width().min(max_sidebar).min(window_width);
    let content_width = (window_width - sidebar_width).max(0.0);
    (
        Bounds {
            x: 0.0,
            width: sidebar_width,
            height,
        },
        Bounds {
            x: sidebar_width,
            width: content_width,
            height,
        },
    )
}

/// Navigation rule for the content webview: the local app plus in-page
/// resources such as `blob:`/`data:` documents and `about:blank`.
pub(crate) fn content_navigation_allowed(url: &tauri::Url) -> bool {
    match url.scheme() {
        "http" | "https" => matches!(url.host_str(), Some("127.0.0.1" | "localhost")),
        "about" | "blob" | "data" => true,
        _ => false,
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppWindowClosedPayload {
    /// True when the user chose "Back to classic launcher".
    classic: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenTabPayload {
    tab: String,
}

fn apply_layout(app: &tauri::AppHandle) {
    let Some(window) = app.get_window(APP_WINDOW_LABEL) else {
        return;
    };
    let (Ok(size), Ok(scale)) = (window.inner_size(), window.scale_factor()) else {
        return;
    };
    let logical = size.to_logical::<f64>(scale);
    let (sidebar, content) = sidebar_layout(logical.width, logical.height, sidebar_mode());
    if let Some(webview) = app.get_webview(SIDEBAR_WEBVIEW_LABEL) {
        let _ = webview.set_position(LogicalPosition::new(sidebar.x, 0.0));
        let _ = webview.set_size(LogicalSize::new(sidebar.width, sidebar.height));
    }
    if let Some(webview) = app.get_webview(CONTENT_WEBVIEW_LABEL) {
        let _ = webview.set_position(LogicalPosition::new(content.x, 0.0));
        let _ = webview.set_size(LogicalSize::new(content.width, content.height));
    }
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(main) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

/// Window events of the app window: keep the layout in sync and bring the
/// classic launcher back when the window closes. Closing the app window never
/// stops HomeInventory; only closing the classic launcher does.
pub(crate) fn handle_app_window_event(window: &Window, event: &WindowEvent) {
    match event {
        WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => {
            apply_layout(window.app_handle());
        }
        WindowEvent::CloseRequested { .. } => {
            let app = window.app_handle();
            show_main_window(app);
            let _ = app.emit_to(
                MAIN_WINDOW_LABEL,
                APP_WINDOW_CLOSED_EVENT,
                AppWindowClosedPayload { classic: false },
            );
        }
        _ => {}
    }
}

/// Closes the app window together with the classic launcher.
pub(crate) fn close_app_window_on_exit(app: &tauri::AppHandle) {
    if let Some(window) = app.get_window(APP_WINDOW_LABEL) {
        let _ = window.destroy();
    }
}

#[tauri::command]
pub(crate) async fn open_app_window(
    app: tauri::AppHandle,
    url: String,
    reload: Option<bool>,
) -> Result<CommandResult, String> {
    let url = url.trim().to_string();
    validate_local_app_url(&url)?;
    let parsed: tauri::Url = url
        .parse()
        .map_err(|_| "Launcher can only open a valid local HomeInventory URL.".to_string())?;

    if let Some(window) = app.get_window(APP_WINDOW_LABEL) {
        if let Some(content) = app.get_webview(CONTENT_WEBVIEW_LABEL) {
            // Keep the page the user is on unless the app moved to another
            // port or was (re)started and must be loaded again.
            let same_origin = content
                .url()
                .map(|current| current.origin() == parsed.origin())
                .unwrap_or(false);
            if reload.unwrap_or(false) || !same_origin {
                content
                    .navigate(parsed)
                    .map_err(|err| format!("Could not load HomeInventory: {err}"))?;
            }
        }
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    } else {
        let window = tauri::window::WindowBuilder::new(&app, APP_WINDOW_LABEL)
            .title("HomeInventory")
            .inner_size(1280.0, 820.0)
            .min_inner_size(720.0, 480.0)
            .build()
            .map_err(|err| format!("Could not open the app window: {err}"))?;
        let (sidebar, content) = sidebar_layout(1280.0, 820.0, sidebar_mode());
        window
            .add_child(
                WebviewBuilder::new(SIDEBAR_WEBVIEW_LABEL, WebviewUrl::App("index.html".into())),
                LogicalPosition::new(sidebar.x, 0.0),
                LogicalSize::new(sidebar.width, sidebar.height),
            )
            .map_err(|err| format!("Could not open the app sidebar: {err}"))?;
        window
            .add_child(
                WebviewBuilder::new(CONTENT_WEBVIEW_LABEL, WebviewUrl::External(parsed))
                    // The app window only shows the local HomeInventory app.
                    // Other sites and pop-ups stay blocked; "Open in browser"
                    // is the way out.
                    .on_navigation(content_navigation_allowed)
                    .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny),
                LogicalPosition::new(content.x, 0.0),
                LogicalSize::new(content.width, content.height),
            )
            .map_err(|err| format!("Could not open HomeInventory: {err}"))?;
        apply_layout(&app);
    }

    // The classic launcher stays alive in the background and comes back when
    // the app window closes.
    if let Some(main) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = main.hide();
    }

    Ok(CommandResult {
        ok: true,
        message: format!("Opened {url} in the app window."),
    })
}

#[tauri::command]
pub(crate) fn set_app_sidebar(app: tauri::AppHandle, mode: String) -> Result<(), String> {
    let mode = SidebarMode::parse(mode.trim())?;
    SIDEBAR_MODE.store(mode.as_u8(), Ordering::SeqCst);
    apply_layout(&app);
    Ok(())
}

/// Closes the app window. With `classic`, the launcher also switches app mode
/// off and goes back to the classic launcher.
#[tauri::command]
pub(crate) fn close_app_window(app: tauri::AppHandle, classic: bool) -> Result<(), String> {
    show_main_window(&app);
    let _ = app.emit_to(
        MAIN_WINDOW_LABEL,
        APP_WINDOW_CLOSED_EVENT,
        AppWindowClosedPayload { classic },
    );
    if let Some(window) = app.get_window(APP_WINDOW_LABEL) {
        window
            .destroy()
            .map_err(|err| format!("Could not close the app window: {err}"))?;
    }
    Ok(())
}

/// Brings the classic launcher to the front, optionally on one of its panels
/// (logs, updates or settings).
#[tauri::command]
pub(crate) fn show_launcher(app: tauri::AppHandle, tab: Option<String>) -> Result<(), String> {
    show_main_window(&app);
    if let Some(tab) = tab {
        if !matches!(tab.as_str(), "logs" | "backups" | "settings" | "updates") {
            return Err(format!("Unknown launcher panel: {tab}"));
        }
        let _ = app.emit_to(
            MAIN_WINDOW_LABEL,
            LAUNCHER_OPEN_TAB_EVENT,
            OpenTabPayload { tab },
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sidebar_layout_splits_the_window_without_gaps() {
        for mode in [
            SidebarMode::Collapsed,
            SidebarMode::Expanded,
            SidebarMode::Panel,
        ] {
            let (sidebar, content) = sidebar_layout(1280.0, 820.0, mode);
            assert_eq!(sidebar.x, 0.0);
            assert_eq!(sidebar.width, mode.width());
            assert_eq!(content.x, sidebar.width);
            assert_eq!(sidebar.width + content.width, 1280.0);
            assert_eq!(content.height, 820.0);
        }
    }

    #[test]
    fn sidebar_layout_keeps_room_for_the_app_on_small_windows() {
        let (sidebar, content) = sidebar_layout(700.0, 500.0, SidebarMode::Panel);
        assert_eq!(content.width, MIN_CONTENT_WIDTH);
        assert_eq!(sidebar.width + content.width, 700.0);

        let (sidebar, content) = sidebar_layout(200.0, 500.0, SidebarMode::Expanded);
        assert_eq!(sidebar.width, SIDEBAR_COLLAPSED_WIDTH);
        assert_eq!(sidebar.width + content.width, 200.0);
    }

    #[test]
    fn sidebar_mode_accepts_only_known_values() {
        assert_eq!(SidebarMode::parse("collapsed"), Ok(SidebarMode::Collapsed));
        assert_eq!(SidebarMode::parse("expanded"), Ok(SidebarMode::Expanded));
        assert_eq!(SidebarMode::parse("panel"), Ok(SidebarMode::Panel));
        assert!(SidebarMode::parse("wide").is_err());
        for mode in [
            SidebarMode::Collapsed,
            SidebarMode::Expanded,
            SidebarMode::Panel,
        ] {
            assert_eq!(SidebarMode::from_u8(mode.as_u8()), mode);
        }
    }
}

#[cfg(test)]
mod navigation_tests {
    use super::content_navigation_allowed;

    #[test]
    fn content_webview_stays_on_the_local_app() {
        let allowed = |value: &str| content_navigation_allowed(&value.parse().unwrap());
        assert!(allowed("http://127.0.0.1:3001/items"));
        assert!(allowed("http://localhost:5173/"));
        assert!(allowed("https://127.0.0.1:5443/"));
        assert!(allowed("about:blank"));
        assert!(!allowed("https://example.com/"));
        assert!(!allowed("http://192.168.1.20:3001/"));
        assert!(!allowed("file:///etc/passwd"));
        assert!(!allowed("mailto:someone@example.com"));
    }
}
