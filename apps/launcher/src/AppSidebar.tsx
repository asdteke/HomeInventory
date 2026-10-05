import { invoke } from '@tauri-apps/api/core';
import {
  ArrowLeftToLine,
  Download,
  ExternalLink,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Power,
  RotateCcw,
  SlidersHorizontal,
  Terminal,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import logoSymbolLight from './logo-symbol-light.svg';
import {
  LogRows,
  hasTauriRuntime,
  loadSettings,
  overrides,
  type LauncherSnapshot,
  type ProfileStatus,
} from './App';
import { LauncherI18nProvider, useLauncherI18n } from './i18n';

/*
 * Sidebar of the optional app window ("app mode"). It runs in its own
 * webview next to the HomeInventory content webview and only talks to the
 * launcher's validated Rust commands.
 */

type SidebarMode = 'collapsed' | 'expanded' | 'panel';
type Ports = { backendPort: number; frontendPort: number };

export function AppSidebar() {
  return <LauncherI18nProvider><SidebarContent /></LauncherI18nProvider>;
}

function SidebarContent() {
  const { t } = useLauncherI18n();
  const [snapshot, setSnapshot] = useState<LauncherSnapshot | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [serverReady, setServerReady] = useState(false);
  const lastPortsRef = useRef<Ports | null>(null);
  const reloadPendingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!hasTauriRuntime()) return;
    try {
      setSnapshot(await invoke<LauncherSnapshot>('detect_tools', { overrides: overrides(loadSettings()) }));
    } catch (error) {
      setNotice(String(error));
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const profile: ProfileStatus | null = snapshot?.profiles.find(p => p.id === 'homeinventory')
    ?? snapshot?.profiles[0]
    ?? null;
  const active = snapshot?.profiles.find(p => p.id === snapshot.activeProfileId) ?? null;
  const activeId = active?.id;
  const activePort = active?.frontendPort;
  const activeUrl = active?.frontendUrl;

  useEffect(() => {
    if (active) lastPortsRef.current = { backendPort: active.backendPort, frontendPort: active.frontendPort };
  }, [active?.backendPort, active?.frontendPort]);

  // Wait until the app is actually served, then (re)load the content view.
  useEffect(() => {
    if (!activeId || !activePort || !activeUrl) {
      setServerReady(false);
      return;
    }
    let on = true;
    const poll = async () => {
      try {
        const ready = await invoke<boolean>('is_server_ready', { port: activePort });
        if (!on) return;
        if (!ready) {
          window.setTimeout(poll, 1000);
          return;
        }
        setServerReady(true);
        if (reloadPendingRef.current) {
          reloadPendingRef.current = false;
          invoke('open_app_window', { url: activeUrl, reload: true }).catch(error => setNotice(String(error)));
        }
      } catch {
        if (on) window.setTimeout(poll, 1000);
      }
    };
    setServerReady(false);
    poll();
    return () => { on = false; };
  }, [activeId, activePort, activeUrl]);

  const applySidebarMode = (mode: SidebarMode) => {
    invoke('set_app_sidebar', { mode }).catch(error => setNotice(String(error)));
  };

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (next) setShowLogs(false);
    applySidebarMode(next ? 'collapsed' : 'expanded');
  };

  const toggleLogs = () => {
    const next = !showLogs;
    setShowLogs(next);
    if (next) setCollapsed(false);
    applySidebarMode(next ? 'panel' : 'expanded');
  };

  const runAction = async (label: string, action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(label);
    setNotice('');
    try {
      await action();
      await refresh();
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(null);
    }
  };

  const startApp = async () => {
    if (!profile) throw new Error(t('status.noProfile'));
    const ports = lastPortsRef.current ?? { backendPort: profile.backendPort, frontendPort: profile.frontendPort };
    reloadPendingRef.current = true;
    try {
      await invoke('start_profile', {
        request: { profileId: profile.id, ...ports, overrides: overrides(loadSettings()) },
      });
    } catch (error) {
      reloadPendingRef.current = false;
      throw error;
    }
  };

  const doStart = () => runAction('start', startApp);
  const doStop = () => runAction('stop', () => invoke('stop_profile'));
  const doRestart = () => runAction('restart', async () => {
    await invoke('stop_profile');
    await startApp();
  });
  const openInBrowser = () => {
    if (!activeUrl) return;
    invoke('open_app', { url: activeUrl }).catch(error => setNotice(String(error)));
  };
  const showLauncher = (tab: 'updates' | 'settings') => {
    invoke('show_launcher', { tab }).catch(error => setNotice(String(error)));
  };
  const backToClassic = () => {
    invoke('close_app_window', { classic: true }).catch(error => setNotice(String(error)));
  };

  const status = active
    ? serverReady ? 'running' : 'starting'
    : busy === 'start' || busy === 'restart' ? 'starting' : 'stopped';
  const statusLabel = status === 'running'
    ? t('running.status')
    : status === 'starting' ? t('appMode.statusStarting') : t('appMode.statusStopped');

  return (
    <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''}`} aria-label={t('appMode.sidebarLabel')}>
      <header className="app-sidebar-header">
        <img src={logoSymbolLight} alt="" className="app-sidebar-logo" />
        {!collapsed && (
          <div className="app-sidebar-title">
            <strong>HomeInventory</strong>
            {snapshot && <span>App v{snapshot.appVersion}</span>}
          </div>
        )}
        <button
          type="button"
          className="app-sidebar-icon"
          onClick={toggleCollapsed}
          title={collapsed ? t('appMode.expand') : t('appMode.collapse')}
          aria-label={collapsed ? t('appMode.expand') : t('appMode.collapse')}
          aria-expanded={!collapsed}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </header>

      <div className={`app-sidebar-status ${status}`} role="status" title={statusLabel}>
        <span className="app-sidebar-dot" />
        {!collapsed && (
          <span>
            {statusLabel}
            {active && <small>{t('running.port', { port: active.backendPort })}</small>}
          </span>
        )}
      </div>

      <nav className="app-sidebar-actions">
        {active ? (
          <>
            <SidebarButton icon={busy === 'restart' ? <Loader2 size={16} className="spin" /> : <RotateCcw size={16} />} label={t('appMode.restart')} collapsed={collapsed} onClick={doRestart} disabled={Boolean(busy)} />
            <SidebarButton icon={busy === 'stop' ? <Loader2 size={16} className="spin" /> : <Power size={16} />} label={t('appMode.stop')} collapsed={collapsed} onClick={doStop} disabled={Boolean(busy)} danger />
          </>
        ) : (
          <SidebarButton icon={busy === 'start' ? <Loader2 size={16} className="spin" /> : <Play size={16} />} label={t('appMode.start')} collapsed={collapsed} onClick={doStart} disabled={Boolean(busy) || !profile} />
        )}
        <SidebarButton icon={<ExternalLink size={16} />} label={t('running.openBrowser')} collapsed={collapsed} onClick={openInBrowser} disabled={!activeUrl} />
        <SidebarButton icon={<Terminal size={16} />} label={t('dev.logs')} collapsed={collapsed} onClick={toggleLogs} active={showLogs} />
        <SidebarButton icon={<Download size={16} />} label={t('dev.updates')} collapsed={collapsed} onClick={() => showLauncher('updates')} hidden={Boolean(snapshot?.storeBuild)} />
        <SidebarButton icon={<SlidersHorizontal size={16} />} label={t('dev.settings')} collapsed={collapsed} onClick={() => showLauncher('settings')} />
      </nav>

      {showLogs && snapshot && (
        <section className="app-sidebar-logs" aria-label={t('dev.logs')}>
          <LogRows logs={snapshot.logs} />
        </section>
      )}

      <div className="app-sidebar-spacer" />

      {!collapsed && notice && <p className="app-sidebar-notice">{notice}</p>}
      {!collapsed && <p className="app-sidebar-hint">{t('appMode.cameraHint')}</p>}

      <footer className="app-sidebar-footer">
        <SidebarButton icon={<ArrowLeftToLine size={16} />} label={t('appMode.backToClassic')} collapsed={collapsed} onClick={backToClassic} />
      </footer>
    </aside>
  );
}

function SidebarButton({ icon, label, collapsed, onClick, disabled, danger, active, hidden }: {
  icon: ReactNode;
  label: string;
  collapsed: boolean;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <button
      type="button"
      className={`app-sidebar-button ${danger ? 'danger' : ''} ${active ? 'active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </button>
  );
}
