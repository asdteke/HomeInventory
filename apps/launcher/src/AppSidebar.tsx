import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Archive,
  ArrowLeftToLine,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Gauge,
  Globe,
  Home,
  KeyRound,
  Loader2,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Smartphone,
  Terminal,
  UserRound,
  Wifi,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import logoFull from './logo-full.svg';
import logoFullLight from './logo-full-light.svg';
import logoSymbolLight from './logo-symbol-light.svg';
import logoSymbolLightSvg from './logo-symbol-light.svg?raw';
import appLabels from './generated/appLabels.json';
import {
  AdvancedConfigPanel,
  DevPanelContent,
  hasTauriRuntime,
  loadSettings,
  localizedPortMessage,
  mockSnapshot,
  overrides,
  parsePort,
  saveSettings,
  validatePortInputs,
  type BackupResult,
  type CommandResult,
  type HttpsStatus,
  type LauncherSettings,
  type LauncherSnapshot,
  type PortCheckResult,
  type ProfileStatus,
  type SuggestedPorts,
  type UpdateCheckResult,
  type ViewKey,
} from './App';
import { LogConsole } from './LogConsole';
import { QrCodeCard } from './QrCode';
import { APP_LANGUAGE_KEY, LauncherI18nProvider, useLauncherI18n, type Translate, type TranslationKey } from './i18n';

/*
 * Sidebar of the optional app window ("app mode"). It runs in its own webview
 * next to the HomeInventory content webview and replaces the app's own
 * sidebar there: the app's pages first, the launcher folded into one small
 * server card that opens a launcher panel. It only talks to the launcher's
 * validated Rust commands. The page gets plain DOM events (page, language,
 * account menu) and publishes its language, theme and account on a window
 * object the launcher reads; it has no IPC.
 */

type SidebarMode = 'collapsed' | 'expanded' | 'panel';
type PanelTab = 'overview' | 'logs' | 'network' | 'server' | 'backups' | 'settings' | 'updates';
type Ports = { backendPort: number; frontendPort: number };
type UpdateProgress = { state: string; message: string; progress: number; error?: string | null };
type AppLabelName = keyof typeof appLabels.labels.en;
type ContentState = {
  path: string;
  /** False for app builds that do not publish their state yet. */
  published?: boolean;
  language?: string | null;
  theme?: 'light' | 'dark' | null;
  signedIn: boolean;
  isAdmin: boolean;
  userName?: string | null;
};

const APP_PAGES: { route: string; label: AppLabelName; icon: LucideIcon; also?: string[] }[] = [
  { route: '/', label: 'home', icon: Home },
  { route: '/items', label: 'inventory', icon: Package, also: ['/organize'] },
  { route: '/maintenance', label: 'maintenance', icon: Wrench },
  { route: '/shopping', label: 'shopping', icon: ShoppingCart },
  { route: '/borrow-requests', label: 'borrow', icon: ArrowRightLeft },
  { route: '/vault', label: 'vault', icon: KeyRound },
  { route: '/settings', label: 'settings', icon: Settings },
];

const SIGNED_OUT_PATHS = [
  '/landing', '/login', '/register', '/forgot-password', '/reset-password',
  '/google-house-select', '/recovery-key-setup', '/house-access', '/legal-consent',
  '/privacy-policy', '/terms-of-service',
];

const PANEL_TABS: { key: PanelTab; icon: LucideIcon; label: TranslationKey }[] = [
  { key: 'overview', icon: Gauge, label: 'shell.overview' },
  { key: 'logs', icon: Terminal, label: 'dev.logs' },
  { key: 'network', icon: Smartphone, label: 'shell.network' },
  { key: 'server', icon: Server, label: 'shell.server' },
  { key: 'backups', icon: Archive, label: 'dev.backups' },
  { key: 'settings', icon: SlidersHorizontal, label: 'shell.launcherSettings' },
  { key: 'updates', icon: Download, label: 'dev.updates' },
];

// HomeInventory hides its own sidebar and follows this one from 2.8.0 on.
const SHELL_SUPPORT_VERSION = [2, 8, 0];

export function supportsLauncherShell(version: string | undefined) {
  const parts = (version ?? '').split(/[.-]/).slice(0, 3).map(part => Number.parseInt(part, 10));
  if (parts.length < 3 || parts.some(Number.isNaN)) return false;
  for (let index = 0; index < 3; index += 1) {
    if (parts[index] !== SHELL_SUPPORT_VERSION[index]) return parts[index] > SHELL_SUPPORT_VERSION[index];
  }
  return true;
}

function pageIsActive(path: string, route: string, also: string[] = []) {
  if (route === '/') return path === '/';
  return [route, ...also].some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

function appLabelsFor(language: string) {
  const labels = appLabels.labels as Record<string, Record<AppLabelName, string>>;
  return labels[language] ?? labels[language.split('-')[0]] ?? labels.en;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function AppSidebar() {
  return <LauncherI18nProvider><SidebarContent /></LauncherI18nProvider>;
}

function SidebarContent() {
  const { appLanguage, setAppLanguage, t } = useLauncherI18n();
  const [snapshot, setSnapshot] = useState<LauncherSnapshot | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [panel, setPanel] = useState<PanelTab | null>(null);
  // The panel stays mounted while the sidebar narrows back, so the rail
  // keeps its width instead of stretching over the app for a moment.
  const [panelClosing, setPanelClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNoticeText] = useState('');
  const [noticeTone, setNoticeTone] = useState<'success' | 'error'>('error');
  // Notices default to the error look; a panel passes 'success' for finished actions.
  const setNotice = (message: string, tone: 'success' | 'error' = 'error') => {
    setNoticeTone(tone);
    setNoticeText(message);
  };
  const [serverReady, setServerReady] = useState(false);
  const [page, setPage] = useState<ContentState | null>(null);
  const [settings, setSettingsState] = useState<LauncherSettings>(() => loadSettings());
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const [updateNotice, setUpdateNotice] = useState('');
  const lastPortsRef = useRef<Ports | null>(null);
  const reloadPendingRef = useRef(false);

  // Server setup (the classic launcher's advanced settings).
  const [resendKey, setResendKey] = useState('');
  const [emailFrom, setEmailFrom] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [bootstrapAdminEmail, setBootstrapAdminEmail] = useState('');
  const [portApi, setPortApi] = useState('');
  const [portUi, setPortUi] = useState('');
  const [portCheck, setPortCheck] = useState<PortCheckResult | null>(null);

  const refresh = useCallback(async () => {
    if (!hasTauriRuntime()) {
      // Browser preview (?view=sidebar): a running app on the home page.
      const preview = mockSnapshot(settings, t);
      const first = preview.profiles[0];
      setSnapshot(first ? { ...preview, activeProfileId: first.id, profiles: [{ ...first, running: true }, ...preview.profiles.slice(1)] } : preview);
      setServerReady(true);
      setPage(current => current ?? { path: '/', signedIn: true, isAdmin: true, userName: 'Preview', theme: 'dark', language: appLanguage });
      return;
    }
    try {
      setSnapshot(await invoke<LauncherSnapshot>('detect_tools', { overrides: overrides(settings) }));
    } catch (error) {
      setNotice(String(error));
    }
  }, [settings, t, appLanguage]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // Settings are shared with the launcher window through localStorage.
  const setSettings = useCallback((next: LauncherSettings) => {
    saveSettings(next);
    setSettingsState(next);
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'hi-settings') setSettingsState(loadSettings());
      // A language picked in the classic launcher window also switches the
      // app. (Storage events only arrive from the other window.)
      if (event.key === APP_LANGUAGE_KEY && event.newValue && hasTauriRuntime()) {
        invoke('set_app_content_language', { language: event.newValue }).catch(error => setNotice(String(error)));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!hasTauriRuntime()) return;
    let unlisten: (() => void) | null = null;
    let mounted = true;
    listen<UpdateProgress>('update-progress', event => {
      setUpdateProgress(event.payload);
      if (event.payload.error) setUpdateNotice(event.payload.error);
      if (['Completed', 'RollbackComplete', 'RollbackFailed', 'Failed'].includes(event.payload.state)) {
        window.setTimeout(() => {
          setUpdateProgress(null);
          setUpdateResult(null);
        }, 3000);
      }
    }).then(fn => {
      if (mounted) unlisten = fn;
      else fn();
    }).catch(error => setUpdateNotice(String(error)));
    return () => {
      mounted = false;
      if (unlisten) unlisten();
    };
  }, []);

  const profile: ProfileStatus | null = snapshot?.profiles.find(p => p.id === 'homeinventory')
    ?? snapshot?.profiles[0]
    ?? null;
  const active = snapshot?.profiles.find(p => p.id === snapshot.activeProfileId) ?? null;
  const activeId = active?.id;
  const activePort = active?.frontendPort;
  const activeUrl = active?.frontendUrl;
  const singlePort = Boolean(snapshot?.storeBuild) || snapshot?.runMode === 'production';

  useEffect(() => {
    if (active) lastPortsRef.current = { backendPort: active.backendPort, frontendPort: active.frontendPort };
  }, [active?.backendPort, active?.frontendPort]);

  // Wait until the app is actually served, then (re)load the content view.
  useEffect(() => {
    if (!hasTauriRuntime()) return;
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

  // Mirror the page: which page is open, its language, theme and account.
  useEffect(() => {
    if (!hasTauriRuntime()) return;
    if (!serverReady) {
      setPage(null);
      return;
    }
    let on = true;
    const read = async () => {
      try {
        const state = await invoke<ContentState | null>('app_content_state');
        if (on) setPage(state);
      } catch { /* the window may be closing */ }
    };
    read();
    const timer = window.setInterval(read, 300);
    return () => {
      on = false;
      window.clearInterval(timer);
    };
  }, [serverReady]);

  // The app owns the language; the launcher follows it (and falls back to
  // English for languages it does not ship).
  useEffect(() => {
    if (page?.language && page.language !== appLanguage) setAppLanguage(page.language);
  }, [page?.language]);

  const theme = page?.theme ?? 'dark';
  // Cross-fade with the app when it switches between light and dark.
  useEffect(() => {
    const apply = () => { document.body.dataset.theme = theme; };
    const doc = document as Document & { startViewTransition?: (update: () => void) => unknown };
    if (!document.body.dataset.theme || !doc.startViewTransition || reducedMotion()) apply();
    else doc.startViewTransition(apply);
  }, [theme]);

  // Port inputs start from the ports in use.
  useEffect(() => {
    if (!profile || portApi) return;
    const ports = lastPortsRef.current ?? { backendPort: profile.backendPort, frontendPort: profile.frontendPort };
    setPortApi(String(ports.backendPort));
    setPortUi(String(ports.frontendPort));
  }, [profile?.id, profile?.backendPort, profile?.frontendPort]);

  const backendPort = profile ? parsePort(portApi, profile.backendPort) : 0;
  const frontendPort = profile ? (singlePort ? backendPort : parsePort(portUi, profile.frontendPort)) : 0;
  const portInputError = !profile
    ? ''
    : singlePort
      ? (backendPort < 1024 || backendPort > 65535 ? t('status.localPortRange') : '')
      : validatePortInputs(portApi, portUi, profile, t);
  const portsInUse = Boolean(active && active.backendPort === backendPort && active.frontendPort === frontendPort);

  useEffect(() => {
    setPortCheck(null);
    if (!profile || portInputError || portsInUse || !hasTauriRuntime()) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await invoke<PortCheckResult>('check_ports', {
          request: { backendPort, frontendPort, singlePort },
        });
        if (!cancelled) setPortCheck(result);
      } catch (error) {
        if (!cancelled) setNotice(String(error));
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [backendPort, frontendPort, singlePort, portInputError, portsInUse, profile?.id]);

  const portBlocked = Boolean(portInputError) || Boolean(portCheck && !portCheck.ok);
  const portMessage = portInputError
    || (portsInUse ? t('running.port', { port: backendPort }) : localizedPortMessage(portCheck, t, singlePort));

  const applySidebarMode = (mode: SidebarMode) => {
    if (!hasTauriRuntime()) return;
    invoke('set_app_sidebar', { mode, animate: !reducedMotion() }).catch(error => setNotice(String(error)));
  };

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  // The window may still hold the layout of a previous sidebar (for example
  // a reload with the panel open); start from the state shown here.
  useEffect(() => {
    if (hasTauriRuntime()) invoke('set_app_sidebar', { mode: 'expanded', animate: false }).catch(() => undefined);
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    clearCloseTimer();
    setCollapsed(next);
    setPanel(null);
    setPanelClosing(false);
    applySidebarMode(next ? 'collapsed' : 'expanded');
  };

  const openPanel = (tab: PanelTab) => {
    clearCloseTimer();
    setPanelClosing(false);
    setPanel(tab);
    setCollapsed(false);
    applySidebarMode('panel');
  };
  const closePanel = () => {
    if (!panel || panelClosing) return;
    applySidebarMode('expanded');
    if (reducedMotion() || !hasTauriRuntime()) {
      setPanel(null);
      return;
    }
    setPanelClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setPanel(null);
      setPanelClosing(false);
    }, 260);
  };
  useEffect(() => clearCloseTimer, []);

  useEffect(() => {
    if (!panel) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);

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

  const writeServerEnv = async (ports: Ports) => {
    const entries: Record<string, string> = {};
    if (resendKey.trim()) entries.RESEND_API_KEY = resendKey.trim();
    if (emailFrom.trim()) entries.EMAIL_FROM = emailFrom.trim();
    if (supportEmail.trim()) entries.SUPPORT_EMAIL = supportEmail.trim();
    if (bootstrapAdminEmail.trim()) entries.BOOTSTRAP_ADMIN_EMAIL = bootstrapAdminEmail.trim().toLowerCase();
    entries.PORT = String(ports.backendPort);
    if (!singlePort) {
      entries.FRONTEND_PORT = String(ports.frontendPort);
      entries.VITE_PORT = String(ports.frontendPort);
    }
    await invoke('write_env', { overrides: overrides(settings), request: { entries } });
  };

  const startApp = async (ports: Ports) => {
    if (!profile) throw new Error(t('status.noProfile'));
    reloadPendingRef.current = true;
    try {
      await invoke('start_profile', {
        request: { profileId: profile.id, ...ports, overrides: overrides(settings) },
      });
    } catch (error) {
      reloadPendingRef.current = false;
      throw error;
    }
  };

  const chosenPorts = (): Ports => ({ backendPort, frontendPort });

  const doStart = () => runAction('start', async () => {
    if (portBlocked) throw new Error(portMessage);
    await startApp(chosenPorts());
  });
  const doStop = () => runAction('stop', () => invoke('stop_profile'));
  const doRestart = () => runAction('restart', async () => {
    const ports = lastPortsRef.current ?? chosenPorts();
    await invoke('stop_profile');
    await startApp(ports);
  });
  const applyServerSetup = () => runAction('apply', async () => {
    if (portInputError) throw new Error(portInputError);
    const ports = chosenPorts();
    await writeServerEnv(ports);
    if (active) await invoke('stop_profile');
    if (!portsInUse) {
      const check = await invoke<PortCheckResult>('check_ports', { request: { ...ports, singlePort } });
      if (!check.ok) throw new Error(localizedPortMessage(check, t, singlePort));
    }
    await startApp(ports);
  });
  const chooseRandomPorts = () => runAction('random-ports', async () => {
    const suggested = await invoke<SuggestedPorts>('suggest_random_ports');
    setPortApi(String(suggested.backendPort));
    setPortUi(String(suggested.frontendPort));
  });
  const useSuggestedPorts = () => {
    if (!portCheck) return;
    setPortApi(String(portCheck.suggestedBackendPort));
    setPortUi(String(portCheck.suggestedFrontendPort));
  };

  const goHistory = (direction: 'back' | 'forward') => {
    if (hasTauriRuntime()) invoke('app_content_history', { direction }).catch(error => setNotice(String(error)));
  };
  // Dock buttons open their tab, and close the panel when pressed again.
  const togglePanel = (tab: PanelTab) => {
    if (panel === tab && !panelClosing) closePanel();
    else openPanel(tab);
  };
  const reloadPage = () => {
    if (hasTauriRuntime()) invoke('reload_app_content').catch(error => setNotice(String(error)));
  };
  const openInBrowser = () => {
    if (!activeUrl) return;
    invoke('open_app', { url: activeUrl }).catch(error => setNotice(String(error)));
  };
  const openPage = (route: string) => {
    if (hasTauriRuntime()) invoke('navigate_app_content', { route }).catch(error => setNotice(String(error)));
    setPage(current => current ? { ...current, path: route } : current);
  };
  const openAccount = () => {
    if (hasTauriRuntime()) invoke('toggle_app_account_menu').catch(error => setNotice(String(error)));
  };
  const backToClassic = () => {
    invoke('close_app_window', { classic: true }).catch(error => setNotice(String(error)));
  };

  const checkForUpdates = async () => {
    setCheckingUpdates(true);
    setUpdateNotice('');
    setUpdateResult(null);
    try {
      const result = await invoke<UpdateCheckResult>('check_updates', { overrides: overrides(settings) });
      setUpdateResult(result);
      if (!result.appUpdateAvailable && !result.launcherUpdateAvailable) setUpdateNotice(t('update.upToDateNotice'));
    } catch (error) {
      setUpdateNotice(String(error));
    } finally {
      setCheckingUpdates(false);
    }
  };

  const triggerUpdate = async () => {
    if (!updateResult?.appUpdateAvailable && !updateResult?.launcherUpdateAvailable) {
      setUpdateNotice(t(updateResult ? 'update.noInstallAvailable' : 'update.checkFirst'));
      return;
    }
    setUpdateNotice('');
    setUpdateProgress({ state: 'Starting', message: t('update.initializing'), progress: 0.01 });
    try {
      await invoke('update_all', { overrides: overrides(settings) });
    } catch (error) {
      setUpdateNotice(String(error));
      setUpdateProgress(null);
    }
  };

  const backup = async (target: ProfileStatus) => {
    const result = await invoke<BackupResult>('backup_now', { request: { profileId: target.id } });
    await refresh();
    return result;
  };

  const enableHttps = () => runAction('https', async () => {
    if (!active) throw new Error(t('https.startFirst'));
    const status = await invoke<HttpsStatus>('enable_https', {
      request: { profileId: active.id, overrides: overrides(settings), httpsPort: 5443 },
    });
    setSettings({ ...settings, mobileHttps: true });
    setNotice(t('https.readyNotice', { url: status.httpsUrl }));
  });
  const disableHttps = () => runAction('https', async () => {
    const result = await invoke<CommandResult>('disable_https');
    setSettings({ ...settings, mobileHttps: false });
    setNotice(result.message);
  });
  const rotateHttps = () => {
    if (!active || !window.confirm(t('https.rotateConfirm'))) return;
    runAction('https', async () => {
      if (snapshot?.httpsStatus) await invoke<CommandResult>('disable_https');
      const result = await invoke<CommandResult>('rotate_https_ca', { request: { profileId: active.id } });
      setSettings({ ...settings, mobileHttps: false });
      setNotice(result.message);
    });
  };

  const status = active
    ? serverReady ? 'running' : 'starting'
    : busy === 'start' || busy === 'restart' || busy === 'apply' ? 'starting' : 'stopped';
  const statusLabel = status === 'running'
    ? t('running.status')
    : status === 'starting' ? t('appMode.statusStarting') : t('appMode.statusStopped');
  const portLabel = active
    ? singlePort
      ? t('running.port', { port: active.backendPort })
      : t('running.ports', { backend: active.backendPort, frontend: active.frontendPort })
    : '';

  const labels = appLabelsFor(page?.language || appLanguage);
  const shellSupported = !hasTauriRuntime() || supportsLauncherShell(snapshot?.appVersion);
  // Older app builds do not publish their state: judge sign-in by the page.
  const signedIn = page
    ? page.published === false
      ? !SIGNED_OUT_PATHS.some(path => page.path === path || page.path.startsWith(`${path}/`))
      : page.signedIn
    : false;
  const showPages = serverReady && signedIn && shellSupported;
  const tabs = PANEL_TABS.filter(tab => tab.key !== 'updates' || !snapshot?.storeBuild);
  const lanUrl = active
    ? snapshot?.lanStatus?.frontendUrl || (snapshot?.localIp ? `http://${snapshot.localIp}:${active.frontendPort}` : active.frontendUrl)
    : '';
  // One language for the app and the sidebar: the picker switches the app,
  // and the sidebar follows the language the app reports back.
  const currentLanguage = page?.language || appLanguage;
  const languages = useMemo(
    () => [...appLabels.languages].sort((a, b) => a.label.localeCompare(b.label)),
    [],
  );
  const changeLanguage = (language: string) => {
    setAppLanguage(language);
    setPage(current => current ? { ...current, language } : current);
    if (hasTauriRuntime()) invoke('set_app_content_language', { language }).catch(error => setNotice(String(error)));
  };
  const languageLabel = languages.find(language => language.code === currentLanguage)?.label ?? currentLanguage;

  return (
    <div className={`shell theme-${theme} ${collapsed ? 'is-collapsed' : ''} ${panel ? 'has-panel' : ''} ${panelClosing ? 'is-closing' : ''}`}>
      <aside className="shell-rail" aria-label={t('appMode.sidebarLabel')}>
        <div className="shell-titlebar" data-tauri-drag-region>
          {serverReady && (
            <div className="shell-history">
              <button type="button" className="shell-icon-button" onClick={() => goHistory('back')} title={`${t('shell.back')} (⌘[)`} aria-label={t('shell.back')}>
                <ArrowLeft size={19} />
              </button>
              <button type="button" className="shell-icon-button" onClick={() => goHistory('forward')} title={`${t('shell.forward')} (⌘])`} aria-label={t('shell.forward')}>
                <ArrowRight size={19} />
              </button>
              <button type="button" className="shell-icon-button" onClick={reloadPage} title={t('shell.refresh')} aria-label={t('shell.refresh')}>
                <RefreshCw size={17} />
              </button>
            </div>
          )}
        </div>
        <header className="shell-brand" data-tauri-drag-region>
          <img src={theme === 'light' ? logoFullLight : logoFull} alt="HomeInventory" className="shell-logo" />
          <button
            type="button"
            className="shell-icon-button shell-collapse"
            onClick={toggleCollapsed}
            title={collapsed ? t('appMode.expand') : t('appMode.collapse')}
            aria-label={collapsed ? t('appMode.expand') : t('appMode.collapse')}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </header>

        {showPages && (
          <button type="button" className="shell-account" onClick={openAccount} title={labels.account}>
            <span className="shell-avatar" aria-hidden="true">
              {page?.userName ? page.userName.trim().charAt(0).toUpperCase() : <UserRound size={17} />}
            </span>
            <span className="shell-account-text">
              <strong>{page?.userName || labels.account}</strong>
              {page?.userName && <small>{labels.account}</small>}
            </span>
            <ChevronDown size={15} className="shell-account-chevron" aria-hidden="true" />
          </button>
        )}

        <div className="shell-scroll">
          <nav className="shell-nav" aria-label="HomeInventory">
            {showPages && APP_PAGES.map((item, index) => (
              <RailItem
                key={item.route}
                icon={item.icon}
                label={labels[item.label]}
                active={Boolean(page && pageIsActive(page.path, item.route, item.also))}
                onClick={() => openPage(item.route)}
                order={index}
              />
            ))}
            {showPages && page?.isAdmin && (
              <RailItem
                icon={Shield}
                label={labels.admin}
                active={Boolean(page && pageIsActive(page.path, '/admin'))}
                onClick={() => openPage('/admin')}
                tone="admin"
                order={APP_PAGES.length}
              />
            )}
            {serverReady && !shellSupported && (
              <p className="shell-note">{t('shell.oldApp', { version: snapshot?.appVersion ?? '' })}</p>
            )}
          </nav>
        </div>

        {/* Pinned to the bottom; the pages above scroll on short windows. */}
        <section className="shell-tools" aria-label={t('shell.launcher')}>
          {notice && (
            <p
              className="shell-notice"
              role={noticeTone === 'success' ? 'status' : 'alert'}
              style={noticeTone === 'success' ? { background: 'var(--hi-success-soft)', color: 'var(--hi-success)' } : undefined}
            >
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice('')} aria-label={t('common.close')}><X size={12} /></button>
            </p>
          )}

          <div className={`shell-server ${status} ${panel && !panelClosing ? 'is-open' : ''}`}>
            <button
              type="button"
              className="shell-server-main"
              onClick={() => (panel && !panelClosing ? closePanel() : openPanel('overview'))}
              title={`${t('shell.launcher')} · ${statusLabel}${portLabel ? ` · ${portLabel}` : ''}`}
              aria-expanded={Boolean(panel) && !panelClosing}
            >
              <span className="shell-server-dot" aria-hidden="true" />
              <span className="shell-server-text">
                <small className="shell-server-kicker">{t('shell.launcher')}</small>
                <strong>{statusLabel}</strong>
                {portLabel && <small>{portLabel}</small>}
              </span>
              <ChevronRight size={16} className="shell-server-chevron" aria-hidden="true" />
            </button>
            {/* Everyday server actions right on the card. */}
            <div className="shell-server-actions">
              {active ? (
                <>
                  <DockButton icon={RotateCcw} label={t('appMode.restart')} onClick={doRestart} disabled={Boolean(busy)} busy={busy === 'restart'} />
                  <DockButton icon={ExternalLink} label={t('running.openBrowser')} onClick={openInBrowser} disabled={!activeUrl} />
                  <DockButton icon={Terminal} label={t('dev.logs')} onClick={() => togglePanel('logs')} active={panel === 'logs' && !panelClosing} />
                  <DockButton icon={Smartphone} label={t('shell.network')} onClick={() => togglePanel('network')} active={panel === 'network' && !panelClosing} />
                </>
              ) : (
                <button type="button" className="shell-server-start" onClick={doStart} disabled={Boolean(busy) || !profile || portBlocked} title={portBlocked ? portMessage : t('appMode.start')}>
                  {busy === 'start' ? <Loader2 size={15} className="spin" /> : <Play size={15} />}
                  <span>{t('appMode.start')}</span>
                </button>
              )}
            </div>
          </div>

          <label className="shell-language" title={t('language.label')}>
            <Globe size={19} aria-hidden="true" />
            <span className="shell-language-value">{languageLabel}</span>
            <ChevronDown size={14} aria-hidden="true" />
            {/* The native menu covers the whole row, so any spot opens it. */}
            <select value={currentLanguage} onChange={event => changeLanguage(event.target.value)} aria-label={t('language.label')}>
              {languages.map(language => (
                <option key={language.code} value={language.code}>{language.label}</option>
              ))}
            </select>
          </label>
        </section>
      </aside>

      {panel && snapshot && (
        <section className="shell-panel" aria-label={t('shell.launcher')}>
          <header className="shell-panel-header" data-tauri-drag-region>
            <h2>{t('shell.launcher')}</h2>
            <button type="button" className="shell-icon-button" onClick={closePanel} aria-label={t('common.close')} title={t('common.close')}>
              <X size={17} />
            </button>
          </header>
          <nav className="shell-tabs" role="tablist" aria-label={t('shell.launcher')}>
            {tabs.map(tab => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={panel === tab.key}
                className={panel === tab.key ? 'is-active' : ''}
                onClick={() => setPanel(tab.key)}
              >
                <tab.icon size={14} aria-hidden="true" />
                <span>{t(tab.label)}</span>
              </button>
            ))}
          </nav>
          <div className={`shell-panel-body panel-${panel}`}>
            {panel === 'overview' && (
              <Overview
                t={t}
                status={status}
                statusLabel={statusLabel}
                portLabel={portLabel}
                appVersion={snapshot.appVersion}
                launcherVersion={snapshot.launcherVersion}
                active={Boolean(active)}
                serverReady={serverReady}
                busy={busy}
                canStart={Boolean(profile) && !portBlocked}
                startHint={portBlocked ? portMessage : ''}
                onStart={doStart}
                onStop={doStop}
                onRestart={doRestart}
                onReload={reloadPage}
                onOpenBrowser={openInBrowser}
                onOpenTab={setPanel}
                onBackToClassic={backToClassic}
              />
            )}
            {panel === 'logs' && <LogConsole logs={snapshot.logs} />}
            {panel === 'network' && (
              <NetworkPanel
                t={t}
                snapshot={snapshot}
                lanUrl={active ? lanUrl ?? '' : ''}
                busy={busy === 'https'}
                onEnable={enableHttps}
                onDisable={disableHttps}
                onRotate={rotateHttps}
              />
            )}
            {panel === 'server' && (
              <>
                <AdvancedConfigPanel
                  embedded
                  showAdvanced setShowAdvanced={() => undefined}
                  resendKey={resendKey} setResendKey={setResendKey}
                  emailFrom={emailFrom} setEmailFrom={setEmailFrom}
                  supportEmail={supportEmail} setSupportEmail={setSupportEmail}
                  bootstrapAdminEmail={bootstrapAdminEmail} setBootstrapAdminEmail={setBootstrapAdminEmail}
                  portApi={portApi} setPortApi={setPortApi}
                  portUi={portUi} setPortUi={setPortUi}
                  localIp={snapshot.localIp}
                  lanStatus={snapshot.lanStatus}
                  portCheck={portCheck}
                  portMessage={portMessage}
                  portBlocked={portBlocked}
                  storeBuild={snapshot.storeBuild}
                  singlePort={singlePort}
                  randomPortBusy={busy === 'random-ports'}
                  onChooseRandomPorts={chooseRandomPorts}
                  onUseSuggestedPorts={useSuggestedPorts}
                />
                <div className="shell-panel-actions">
                  <button type="button" className="shell-primary" onClick={applyServerSetup} disabled={Boolean(busy) || Boolean(portInputError)}>
                    {busy === 'apply' ? <Loader2 size={15} className="spin" /> : active ? <RotateCcw size={15} /> : <Play size={15} />}
                    {active ? t('shell.applyRestart') : t('shell.applyStart')}
                  </button>
                </div>
              </>
            )}
            {(panel === 'backups' || panel === 'settings' || panel === 'updates') && (
              <DevPanelContent
                embedded
                snapshot={snapshot} profiles={snapshot.profiles} settings={settings} setSettings={setSettings}
                devTab={panel as ViewKey} setDevTab={tab => setPanel(tab as PanelTab)} busy={busy} notice={notice}
                onNotice={setNotice}
                onClose={closePanel}
                onBackup={backup}
                updateResult={updateResult}
                checkingUpdates={checkingUpdates}
                updateProgress={updateProgress}
                updateNotice={updateNotice}
                onCheckUpdates={checkForUpdates}
                onTriggerUpdate={triggerUpdate}
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function RailItem({ icon: Icon, label, active, onClick, tone, order }: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick: () => void;
  tone?: 'admin';
  /** Position for the staggered entrance. */
  order?: number;
}) {
  return (
    <button
      type="button"
      style={order === undefined ? undefined : { animationDelay: `${60 + order * 28}ms` }}
      className={`shell-item ${order === undefined ? '' : 'is-entering'} ${active ? 'is-active' : ''} ${tone === 'admin' ? 'is-admin' : ''}`}
      onClick={onClick}
      title={label}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={22} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

function Overview({
  t, status, statusLabel, portLabel, appVersion, launcherVersion, active, serverReady, busy,
  canStart, startHint, onStart, onStop, onRestart, onReload, onOpenBrowser, onOpenTab, onBackToClassic,
}: {
  t: Translate;
  status: string;
  statusLabel: string;
  portLabel: string;
  appVersion: string;
  launcherVersion: string;
  active: boolean;
  serverReady: boolean;
  busy: string | null;
  canStart: boolean;
  startHint: string;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onReload: () => void;
  onOpenBrowser: () => void;
  onOpenTab: (tab: PanelTab) => void;
  onBackToClassic: () => void;
}) {
  return (
    <div className="shell-overview">
      <section className={`shell-status-card ${status}`}>
        <span className="shell-status-dot" aria-hidden="true" />
        <div>
          <strong>{statusLabel}</strong>
          <span>{portLabel || t('shell.versions', { app: appVersion, launcher: launcherVersion })}</span>
        </div>
      </section>

      <div className="shell-action-grid">
        {active ? (
          <>
            <OverviewAction icon={RefreshCw} label={t('shell.refresh')} onClick={onReload} disabled={!serverReady} />
            <OverviewAction icon={RotateCcw} label={t('appMode.restart')} onClick={onRestart} disabled={Boolean(busy)} busy={busy === 'restart'} />
            <OverviewAction icon={ExternalLink} label={t('running.openBrowser')} onClick={onOpenBrowser} />
            <OverviewAction icon={Power} label={t('appMode.stop')} onClick={onStop} disabled={Boolean(busy)} busy={busy === 'stop'} danger />
          </>
        ) : (
          <OverviewAction icon={Play} label={t('appMode.start')} onClick={onStart} disabled={Boolean(busy) || !canStart} busy={busy === 'start'} primary />
        )}
      </div>
      {!active && startHint && (
        <button type="button" className="shell-hint" onClick={() => onOpenTab('server')}>{startHint}</button>
      )}

      <div className="shell-link-list">
        <OverviewLink icon={Smartphone} label={t('shell.network')} onClick={() => onOpenTab('network')} />
        <OverviewLink icon={Server} label={t('shell.server')} onClick={() => onOpenTab('server')} />
        <OverviewLink icon={Archive} label={t('dev.backups')} onClick={() => onOpenTab('backups')} />
      </div>

      <p className="shell-versions">{t('shell.versions', { app: appVersion, launcher: launcherVersion })}</p>
      <button type="button" className="shell-classic" onClick={onBackToClassic}>
        <ArrowLeftToLine size={15} /> {t('appMode.backToClassic')}
      </button>
    </div>
  );
}

function DockButton({ icon: Icon, label, onClick, disabled, busy, danger, active }: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  danger?: boolean;
  /** Its panel tab is open; pressing again closes it. */
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`shell-dock-button ${danger ? 'is-danger' : ''} ${active ? 'is-active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
    >
      {busy ? <Loader2 size={16} className="spin" /> : <Icon size={16} />}
    </button>
  );
}

function OverviewAction({ icon: Icon, label, onClick, disabled, busy, danger, primary }: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  danger?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={`shell-action ${danger ? 'is-danger' : ''} ${primary ? 'is-primary' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {busy ? <Loader2 size={17} className="spin" /> : <Icon size={17} />}
      <span>{label}</span>
    </button>
  );
}

function OverviewLink({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" className="shell-link" onClick={onClick}>
      <Icon size={16} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

function NetworkPanel({ t, snapshot, lanUrl, busy, onEnable, onDisable, onRotate }: {
  t: Translate;
  snapshot: LauncherSnapshot;
  lanUrl: string;
  busy: boolean;
  onEnable: () => void;
  onDisable: () => void;
  onRotate: () => void;
}) {
  const [copied, setCopied] = useState('');
  const [platform, setPlatform] = useState<'ios' | 'android'>('ios');
  const [androidBrand, setAndroidBrand] = useState<'samsung' | 'pixel' | 'other'>('samsung');
  const https = snapshot.httpsStatus;
  const lan = snapshot.lanStatus;

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied(current => (current === value ? '' : current)), 1600);
    } catch { /* clipboard unavailable */ }
  };

  if (!lanUrl) return <p className="shell-empty">{t('shell.startFirst')}</p>;

  const androidPaths = {
    samsung: t('android.samsungPath'),
    pixel: t('android.pixelPath'),
    other: t('android.otherPath'),
  };

  return (
    <div className="shell-network">
      <section className="net-card">
        <header className="net-card-header">
          <span className="net-icon"><Wifi size={16} /></span>
          <div>
            <h3>{t('shell.address')}</h3>
            <p>{t('running.help')}</p>
          </div>
        </header>
        <div className="net-address">
          <QrCodeCard url={lanUrl} size={240} logoSrc={logoSymbolLight} logoSvg={logoSymbolLightSvg} bare />
          <div className="net-address-text">
            <code>{lanUrl}</code>
            <button type="button" className="net-copy" onClick={() => copy(lanUrl)}>
              {copied === lanUrl ? <Check size={14} /> : <Copy size={14} />}
              {copied === lanUrl ? t('logs.copied') : t('shell.copy')}
            </button>
            <span className={`net-status ${lan?.ok ? 'ok' : 'warn'}`}>
              <span aria-hidden="true" />
              {lan?.ok ? t('shell.lanOk') : t('running.lanPending')}
            </span>
          </div>
        </div>
      </section>

      <section className="net-card">
        <header className="net-card-header">
          <span className="net-icon"><ShieldCheck size={16} /></span>
          <div>
            <h3>{t('https.title')}</h3>
            <p>{https ? t('https.subtitle') : t('https.oneTimeSetup')}</p>
          </div>
        </header>

        {!https ? (
          <>
            <button type="button" className="shell-primary" onClick={onEnable} disabled={busy}>
              {busy ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />}
              {t('https.enable')}
            </button>
            <p className="net-footnote">{t('https.normalRemains')}</p>
          </>
        ) : (
          <>
            <ol className="net-steps">
              <li>
                <div className="net-step-head">
                  <span className="net-step-number">1</span>
                  <strong>{t('shell.stepCertificate')}</strong>
                </div>
                <div className="net-segment" role="tablist">
                  <button type="button" role="tab" aria-selected={platform === 'ios'} className={platform === 'ios' ? 'is-active' : ''} onClick={() => setPlatform('ios')}>{t('https.ios')}</button>
                  <button type="button" role="tab" aria-selected={platform === 'android'} className={platform === 'android' ? 'is-active' : ''} onClick={() => setPlatform('android')}>{t('https.android')}</button>
                </div>
                <div className="net-step-body">
                  <QrCodeCard
                    url={platform === 'ios' ? https.iosEnrollmentUrl : https.androidEnrollmentUrl}
                    size={200}
                    logoSrc={logoSymbolLight}
                    logoSvg={logoSymbolLightSvg}
                    bare
                  />
                  <div className="net-step-text">
                    {platform === 'ios' ? (
                      <p>{t('https.iosHelp')}</p>
                    ) : (
                      <>
                        <p>{t('https.downloadPrefix')} <strong>HomeInventory-Local-CA.crt</strong>, {t('https.downloadSuffix')}</p>
                        <label className="net-select">
                          <span>{t('https.phoneBrand')}</span>
                          <select value={androidBrand} onChange={event => setAndroidBrand(event.target.value as typeof androidBrand)}>
                            <option value="samsung">{t('android.samsung')}</option>
                            <option value="pixel">{t('android.pixel')}</option>
                            <option value="other">{t('android.other')}</option>
                          </select>
                        </label>
                        <p className="net-path">{androidPaths[androidBrand]}</p>
                      </>
                    )}
                  </div>
                </div>
              </li>
              <li>
                <div className="net-step-head">
                  <span className="net-step-number">2</span>
                  <strong>{t('shell.stepOpen')}</strong>
                </div>
                <div className="net-step-body">
                  <QrCodeCard url={https.httpsUrl} size={200} logoSrc={logoSymbolLight} logoSvg={logoSymbolLightSvg} bare />
                  <div className="net-step-text">
                    <code>{https.httpsUrl}</code>
                    <p>{t('https.secureHelp')}</p>
                  </div>
                </div>
              </li>
            </ol>
            <p className="net-footnote">{t('https.linksExpire')}</p>
            <div className="net-actions">
              <button type="button" className="shell-secondary" onClick={onEnable} disabled={busy}><RefreshCw size={14} /> {t('https.refreshLinks')}</button>
              <button type="button" className="shell-secondary is-danger" onClick={onDisable} disabled={busy}><Power size={14} /> {t('https.disable')}</button>
            </div>
            <details className="net-advanced">
              <summary>CA · {https.caName}</summary>
              <code>{https.caFingerprint}</code>
              <p>{t('https.removal')}</p>
              <button type="button" className="shell-secondary is-danger" onClick={onRotate} disabled={busy}><RotateCcw size={14} /> {t('https.rotate')}</button>
            </details>
          </>
        )}
      </section>
    </div>
  );
}
