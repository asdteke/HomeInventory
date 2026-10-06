//! Optional "app mode": HomeInventory inside a launcher window with a sidebar.
//!
//! The window hosts two child webviews. The sidebar loads the launcher's own
//! bundle and talks to the Rust commands through its own capability
//! (`capabilities/app-sidebar.json`). The content webview loads the local
//! HomeInventory URL as a normal top-level page, so its cookies and headers
//! behave exactly as in a browser, and it gets no IPC access at all.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, AtomicU8, Ordering};
use std::time::Duration;
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

const SIDEBAR_COLLAPSED_WIDTH: f64 = 76.0;
const SIDEBAR_EXPANDED_WIDTH: f64 = 272.0;
/// A panel (logs, settings, ...) opens as a drawer over the app content, so
/// the HomeInventory page keeps its size instead of reflowing.
const SIDEBAR_DRAWER_WIDTH: f64 = 480.0;
const MIN_CONTENT_WIDTH: f64 = 320.0;
/// Sidebar transitions. Only the light sidebar is resized per frame; the
/// HomeInventory page is moved, never re-laid out mid-animation.
const SIDEBAR_ANIMATION_MS: u64 = 220;
const SIDEBAR_ANIMATION_FRAMES: u64 = 14;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum SidebarMode {
    Collapsed,
    Expanded,
    /// Expanded with a panel drawer open over the content.
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

    /// Width the sidebar reserves next to the content.
    fn width(self) -> f64 {
        match self {
            SidebarMode::Collapsed => SIDEBAR_COLLAPSED_WIDTH,
            SidebarMode::Expanded | SidebarMode::Panel => SIDEBAR_EXPANDED_WIDTH,
        }
    }

    /// Extra width the sidebar webview covers on top of the content.
    fn overlay_width(self) -> f64 {
        match self {
            SidebarMode::Panel => SIDEBAR_DRAWER_WIDTH,
            _ => 0.0,
        }
    }
}

static SIDEBAR_MODE: AtomicU8 = AtomicU8::new(1);
/// Bumped by every layout change so a running transition stops.
static LAYOUT_GENERATION: AtomicU64 = AtomicU64::new(0);

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
/// An open panel widens only the sidebar webview, which sits above the
/// content, so the HomeInventory page is never resized for it.
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
    let overlay_width = (sidebar_width + mode.overlay_width()).min(window_width);
    (
        Bounds {
            x: 0.0,
            width: overlay_width,
            height,
        },
        Bounds {
            x: sidebar_width,
            width: content_width,
            height,
        },
    )
}

/// HomeInventory language codes look like `en`, `pt-BR` or `zh-Hant`. Only
/// such a code is ever written into the page, so it cannot carry script.
pub(crate) fn shared_language(value: &str) -> Option<String> {
    let value = value.trim();
    let mut parts = value.split('-');
    let primary = parts.next()?;
    let primary_ok = (2..=3).contains(&primary.len()) && primary.chars().all(|c| c.is_ascii_lowercase());
    let rest_ok = parts.all(|part| (2..=8).contains(&part.len()) && part.chars().all(|c| c.is_ascii_alphanumeric()));
    (primary_ok && rest_ok && value.len() <= 16).then(|| value.to_string())
}

/// Runs in the content page before its own scripts on every load. It only
/// marks the page as shown inside the launcher; the page gets no IPC.
/// Also gives the page the usual history keys of a browser window:
/// Cmd/Ctrl+[ and ], Cmd/Ctrl+Left and Right, and the mouse side buttons.
const CONTENT_SHELL_SCRIPT: &str = r#"window.__HOMEINVENTORY_LAUNCHER_SHELL__ = Object.freeze({ version: 1 });
(() => {
  const editable = (target) => target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]');
  window.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
    const back = event.key === '[' || (event.key === 'ArrowLeft' && !editable(event.target));
    const forward = event.key === ']' || (event.key === 'ArrowRight' && !editable(event.target));
    if (!back && !forward) return;
    event.preventDefault();
    if (back) history.back(); else history.forward();
  }, true);
  window.addEventListener('mouseup', (event) => {
    if (event.button === 3) { event.preventDefault(); history.back(); }
    if (event.button === 4) { event.preventDefault(); history.forward(); }
  }, true);
})();"#;

fn dispatch_content_event(webview: &tauri::Webview, event: &str, detail: &str) {
    let _ = webview.eval(format!(
        "window.dispatchEvent(new CustomEvent('{event}', {{ detail: '{detail}' }}));"
    ));
}

/// Routes of the HomeInventory sidebar the launcher may open in the page.
pub(crate) const CONTENT_ROUTES: [&str; 8] = [
    "/",
    "/items",
    "/maintenance",
    "/shopping",
    "/borrow-requests",
    "/vault",
    "/settings",
    "/admin",
];

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

fn window_size(app: &tauri::AppHandle) -> Option<(f64, f64)> {
    let window = app.get_window(APP_WINDOW_LABEL)?;
    let (size, scale) = (window.inner_size().ok()?, window.scale_factor().ok()?);
    let logical = size.to_logical::<f64>(scale);
    Some((logical.width, logical.height))
}

fn place_sidebar(app: &tauri::AppHandle, width: f64, height: f64) {
    if let Some(webview) = app.get_webview(SIDEBAR_WEBVIEW_LABEL) {
        let _ = webview.set_position(LogicalPosition::new(0.0, 0.0));
        let _ = webview.set_size(LogicalSize::new(width, height));
    }
}

fn place_content(app: &tauri::AppHandle, x: f64, size: Option<(f64, f64)>) {
    if let Some(webview) = app.get_webview(CONTENT_WEBVIEW_LABEL) {
        let _ = webview.set_position(LogicalPosition::new(x, 0.0));
        if let Some((width, height)) = size {
            let _ = webview.set_size(LogicalSize::new(width, height));
        }
    }
}

fn apply_layout(app: &tauri::AppHandle) {
    LAYOUT_GENERATION.fetch_add(1, Ordering::SeqCst);
    let Some((width, height)) = window_size(app) else {
        return;
    };
    let (sidebar, content) = sidebar_layout(width, height, sidebar_mode());
    place_sidebar(app, sidebar.width, sidebar.height);
    place_content(app, content.x, Some((content.width, content.height)));
}

/// Ease-in-out cubic: gentle start and landing.
pub(crate) fn ease_in_out_cubic(t: f64) -> f64 {
    let t = t.clamp(0.0, 1.0);
    if t < 0.5 {
        4.0 * t * t * t
    } else {
        1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
    }
}

/// Moves from one sidebar mode to another over a few frames. The page keeps
/// the larger of its two widths while it slides (the window clips the rest)
/// and gets its final width once, so it never reflows mid-animation.
fn animate_layout(app: &tauri::AppHandle, from: SidebarMode) {
    let generation = LAYOUT_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let Some((width, height)) = window_size(app) else {
        return;
    };
    let to = sidebar_mode();
    let (from_sidebar, from_content) = sidebar_layout(width, height, from);
    let (to_sidebar, to_content) = sidebar_layout(width, height, to);
    let content_width = from_content.width.max(to_content.width);
    if (content_width - from_content.width).abs() > f64::EPSILON {
        place_content(app, from_content.x, Some((content_width, height)));
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let frame = Duration::from_millis(SIDEBAR_ANIMATION_MS / SIDEBAR_ANIMATION_FRAMES);
        for step in 1..=SIDEBAR_ANIMATION_FRAMES {
            tokio::time::sleep(frame).await;
            if LAYOUT_GENERATION.load(Ordering::SeqCst) != generation {
                return;
            }
            let progress = ease_in_out_cubic(step as f64 / SIDEBAR_ANIMATION_FRAMES as f64);
            let sidebar_width = from_sidebar.width + (to_sidebar.width - from_sidebar.width) * progress;
            let content_x = from_content.x + (to_content.x - from_content.x) * progress;
            place_sidebar(&app, sidebar_width, height);
            place_content(&app, content_x, None);
        }
        if LAYOUT_GENERATION.load(Ordering::SeqCst) == generation {
            place_sidebar(&app, to_sidebar.width, to_sidebar.height);
            place_content(&app, to_content.x, Some((to_content.width, to_content.height)));
        }
    });
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
        // Built hidden and shown once maximized and laid out, so it opens in
        // one smooth step instead of growing on screen.
        let window = tauri::window::WindowBuilder::new(&app, APP_WINDOW_LABEL)
            .title("HomeInventory")
            .visible(false)
            .inner_size(1280.0, 820.0)
            .min_inner_size(720.0, 480.0);
        // The sidebar and the page run up to the top edge; the traffic
        // lights sit over the sidebar, like in Finder or Notes.
        #[cfg(target_os = "macos")]
        let window = window
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true);
        let window = window
            .build()
            .map_err(|err| format!("Could not open the app window: {err}"))?;
        let _ = window.maximize();
        // A new sidebar starts expanded with no panel, whatever the last
        // window was showing.
        SIDEBAR_MODE.store(SidebarMode::Expanded.as_u8(), Ordering::SeqCst);
        let (sidebar, content) = sidebar_layout(1280.0, 820.0, sidebar_mode());
        // The content goes in first so the sidebar, and its panel drawer,
        // stay above it.
        window
            .add_child(
                WebviewBuilder::new(CONTENT_WEBVIEW_LABEL, WebviewUrl::External(parsed))
                    // The app window only shows the local HomeInventory app.
                    // Other sites and pop-ups stay blocked; "Open in browser"
                    // is the way out.
                    .on_navigation(content_navigation_allowed)
                    .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                    .initialization_script(CONTENT_SHELL_SCRIPT),
                LogicalPosition::new(content.x, 0.0),
                LogicalSize::new(content.width, content.height),
            )
            .map_err(|err| format!("Could not open HomeInventory: {err}"))?;
        window
            .add_child(
                WebviewBuilder::new(SIDEBAR_WEBVIEW_LABEL, WebviewUrl::App("index.html".into()))
                    .background_color(tauri::window::Color(24, 29, 26, 255)),
                LogicalPosition::new(sidebar.x, 0.0),
                LogicalSize::new(sidebar.width, sidebar.height),
            )
            .map_err(|err| format!("Could not open the app sidebar: {err}"))?;
        apply_layout(&app);
        // Give the sidebar a moment to paint, then show the finished window.
        let shown = window.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(140)).await;
            let _ = shown.show();
            let _ = shown.set_focus();
        });
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
pub(crate) fn set_app_sidebar(
    app: tauri::AppHandle,
    mode: String,
    animate: Option<bool>,
) -> Result<(), String> {
    let mode = SidebarMode::parse(mode.trim())?;
    let previous = SidebarMode::from_u8(SIDEBAR_MODE.swap(mode.as_u8(), Ordering::SeqCst));
    if animate.unwrap_or(false) && previous != mode {
        animate_layout(&app, previous);
    } else {
        apply_layout(&app);
    }
    Ok(())
}

/// Switches the HomeInventory page to a language the user picked in the
/// launcher, as a DOM event carrying a validated language code. The page
/// remains the owner of its language and stores the choice itself.
#[tauri::command]
pub(crate) fn set_app_content_language(app: tauri::AppHandle, language: String) -> Result<(), String> {
    let code = shared_language(&language).ok_or_else(|| format!("Unknown language: {language}"))?;
    if let Some(webview) = app.get_webview(CONTENT_WEBVIEW_LABEL) {
        dispatch_content_event(&webview, "homeinventory:launcher-language", &code);
    }
    Ok(())
}

/// Opens one of the HomeInventory sidebar routes inside the page (a client
/// side navigation, so the app keeps its state).
#[tauri::command]
pub(crate) fn navigate_app_content(app: tauri::AppHandle, route: String) -> Result<(), String> {
    let route = CONTENT_ROUTES
        .iter()
        .copied()
        .find(|known| *known == route.as_str())
        .ok_or_else(|| format!("Unknown HomeInventory page: {route}"))?;
    let webview = app
        .get_webview(CONTENT_WEBVIEW_LABEL)
        .ok_or_else(|| "The app window is not open.".to_string())?;
    dispatch_content_event(&webview, "homeinventory:launcher-navigate", route);
    Ok(())
}

/// Opens or closes the HomeInventory account menu (profile, theme, sign out).
#[tauri::command]
pub(crate) fn toggle_app_account_menu(app: tauri::AppHandle) -> Result<(), String> {
    let webview = app
        .get_webview(CONTENT_WEBVIEW_LABEL)
        .ok_or_else(|| "The app window is not open.".to_string())?;
    dispatch_content_event(&webview, "homeinventory:launcher-account", "toggle");
    Ok(())
}

/// Goes back or forward in the HomeInventory page's history.
#[tauri::command]
pub(crate) fn app_content_history(app: tauri::AppHandle, direction: String) -> Result<(), String> {
    let script = match direction.as_str() {
        "back" => "history.back();",
        "forward" => "history.forward();",
        _ => return Err(format!("Unknown history direction: {direction}")),
    };
    let webview = app
        .get_webview(CONTENT_WEBVIEW_LABEL)
        .ok_or_else(|| "The app window is not open.".to_string())?;
    webview
        .eval(script)
        .map_err(|err| format!("Could not change the page: {err}"))
}

/// Reloads the HomeInventory page.
#[tauri::command]
pub(crate) fn reload_app_content(app: tauri::AppHandle) -> Result<(), String> {
    let webview = app
        .get_webview(CONTENT_WEBVIEW_LABEL)
        .ok_or_else(|| "The app window is not open.".to_string())?;
    webview
        .reload()
        .map_err(|err| format!("Could not reload HomeInventory: {err}"))
}

/// What the HomeInventory page publishes about itself on
/// `window.__HOMEINVENTORY_LAUNCHER_STATE__`. The page cannot call the
/// launcher; the launcher reads this and treats every field as untrusted.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct PageState {
    language: Option<String>,
    theme: Option<String>,
    signed_in: bool,
    is_admin: bool,
    user_name: Option<String>,
}

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ContentState {
    /// Path of the page, taken from the webview URL rather than the page.
    path: String,
    /// False when the page published nothing (older HomeInventory builds).
    published: bool,
    language: Option<String>,
    theme: Option<&'static str>,
    signed_in: bool,
    is_admin: bool,
    user_name: Option<String>,
}

/// Reads the published state, plus the language and theme every
/// HomeInventory version already sets on `<html>` (`lang`, `class="dark"`).
const PAGE_STATE_SCRIPT: &str = "(() => { try { const root = document.documentElement; return JSON.stringify({ state: window.__HOMEINVENTORY_LAUNCHER_STATE__ || null, lang: root.lang || null, dark: root.classList.contains('dark') }); } catch (_) { return 'null'; } })()";

#[derive(Deserialize, Default)]
#[serde(default)]
struct PageProbe {
    state: Option<PageState>,
    lang: Option<String>,
    dark: Option<bool>,
}

/// Keeps only well-formed values from the page state.
pub(crate) fn sanitize_content_state(path: String, raw: &str) -> ContentState {
    // eval_with_callback hands back the script result encoded as JSON once
    // more, so a JSON string wraps the page's own JSON text.
    let text: String = serde_json::from_str(raw).unwrap_or_else(|_| raw.to_string());
    let probe: PageProbe = serde_json::from_str::<Option<PageProbe>>(&text).ok().flatten().unwrap_or_default();
    let published = probe.state.is_some();
    let mut page = probe.state.unwrap_or_default();
    if page.language.is_none() {
        page.language = probe.lang;
    }
    if page.theme.is_none() {
        page.theme = probe.dark.map(|dark| if dark { "dark" } else { "light" }.to_string());
    }
    let user_name = page
        .user_name
        .map(|name| name.trim().chars().filter(|c| !c.is_control()).take(64).collect::<String>())
        .filter(|name| !name.is_empty());
    ContentState {
        path,
        published,
        language: page.language.as_deref().and_then(shared_language),
        theme: match page.theme.as_deref() {
            Some("light") => Some("light"),
            Some("dark") => Some("dark"),
            _ => None,
        },
        signed_in: page.signed_in,
        is_admin: page.signed_in && page.is_admin,
        user_name: if page.signed_in { user_name } else { None },
    }
}

/// The page shown in the app window and what it reports about itself, so the
/// sidebar can highlight the page and follow its language and theme.
#[tauri::command]
pub(crate) async fn app_content_state(app: tauri::AppHandle) -> Option<ContentState> {
    let webview = app.get_webview(CONTENT_WEBVIEW_LABEL)?;
    let url = webview.url().ok()?;
    if !content_navigation_allowed(&url) {
        return None;
    }
    let path = url.path().to_string();
    let (sender, receiver) = std::sync::mpsc::channel::<String>();
    webview
        .eval_with_callback(PAGE_STATE_SCRIPT, move |result| {
            let _ = sender.send(result);
        })
        .ok()?;
    let raw = tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(Duration::from_millis(800)).ok())
        .await
        .ok()
        .flatten()
        .unwrap_or_default();
    Some(sanitize_content_state(path, &raw))
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
            assert_eq!(sidebar.width, mode.width() + mode.overlay_width());
            assert_eq!(content.x, mode.width());
            assert_eq!(content.x + content.width, 1280.0);
            assert_eq!(content.height, 820.0);
        }
    }

    #[test]
    fn sidebar_layout_keeps_room_for_the_app_on_small_windows() {
        let (sidebar, content) = sidebar_layout(500.0, 500.0, SidebarMode::Expanded);
        assert_eq!(content.width, MIN_CONTENT_WIDTH);
        assert_eq!(sidebar.width + content.width, 500.0);

        let (sidebar, content) = sidebar_layout(200.0, 500.0, SidebarMode::Expanded);
        assert_eq!(sidebar.width, SIDEBAR_COLLAPSED_WIDTH);
        assert_eq!(sidebar.width + content.width, 200.0);
    }

    #[test]
    fn panel_drawer_covers_the_content_without_resizing_it() {
        let (expanded_sidebar, expanded_content) = sidebar_layout(1280.0, 800.0, SidebarMode::Expanded);
        let (panel_sidebar, panel_content) = sidebar_layout(1280.0, 800.0, SidebarMode::Panel);
        assert_eq!(panel_content, expanded_content);
        assert_eq!(panel_sidebar.width, expanded_sidebar.width + SIDEBAR_DRAWER_WIDTH);
        let (small_sidebar, _) = sidebar_layout(600.0, 800.0, SidebarMode::Panel);
        assert_eq!(small_sidebar.width, 600.0);
    }

    #[test]
    fn shared_language_accepts_only_language_codes() {
        assert_eq!(shared_language(" tr "), Some("tr".to_string()));
        assert_eq!(shared_language("pt-BR"), Some("pt-BR".to_string()));
        assert_eq!(shared_language("zh-Hant"), Some("zh-Hant".to_string()));
        assert_eq!(shared_language("tr'); alert(1); ('"), None);
        assert_eq!(shared_language("EN"), None);
        assert_eq!(shared_language(""), None);
    }

    #[test]
    fn content_state_keeps_only_valid_values() {
        let raw = serde_json::to_string(
            r#"{"state":{"language":"pt-BR","theme":"light","signedIn":true,"isAdmin":true,"userName":"  Ada\u0007 "},"lang":"en","dark":true}"#,
        )
        .unwrap();
        let state = sanitize_content_state("/items".into(), &raw);
        assert_eq!(state.path, "/items");
        assert_eq!(state.language.as_deref(), Some("pt-BR"));
        assert_eq!(state.theme, Some("light"));
        assert!(state.is_admin);
        assert_eq!(state.user_name.as_deref(), Some("Ada"));

        let hostile = serde_json::to_string(
            r#"{"state":{"language":"x'); alert(1)","theme":"<b>","signedIn":false,"isAdmin":true,"userName":"Eve"}}"#,
        )
        .unwrap();
        let state = sanitize_content_state("/".into(), &hostile);
        assert_eq!(state.language, None);
        assert_eq!(state.theme, None);
        assert!(!state.is_admin);
        assert_eq!(state.user_name, None);
        assert!(state.published);
        let missing = sanitize_content_state("/".into(), "\"null\"");
        assert!(!missing.published);
        // Older builds publish nothing, but <html> still tells the theme.
        let older = serde_json::to_string(r#"{"state":null,"lang":"tr","dark":false}"#).unwrap();
        let older = sanitize_content_state("/items".into(), &older);
        assert!(!older.published);
        assert_eq!(older.language.as_deref(), Some("tr"));
        assert_eq!(older.theme, Some("light"));
        assert_eq!(sanitize_content_state("/".into(), "garbage").theme, None);
    }

    #[test]
    fn sidebar_transition_eases_in_and_out() {
        assert_eq!(ease_in_out_cubic(0.0), 0.0);
        assert_eq!(ease_in_out_cubic(1.0), 1.0);
        assert_eq!(ease_in_out_cubic(0.5), 0.5);
        assert!(ease_in_out_cubic(0.1) < 0.1);
        assert!(ease_in_out_cubic(0.9) > 0.9);
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
