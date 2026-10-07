import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Archive,
  ChevronDown,
  ChevronRight,
  CircleDot,
  FolderArchive,
  FolderOpen,
  Globe,
  Info,
  Loader2,
  Mail,
  Play,
  Power,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Terminal,
  Wifi,
  AlertCircle,
  ExternalLink,
  CheckCircle2,
  Download,
  RefreshCw,
  Shuffle,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import launcherPackage from '../package.json';
import logoFull from './logo-full.svg';
import logoSymbolLight from './logo-symbol-light.svg';
import logoSymbolLightSvg from './logo-symbol-light.svg?raw';
import { QrCodeCard } from './QrCode';
import { LogConsole } from './LogConsole';
import {
  LANGUAGE_OPTIONS,
  LauncherI18nProvider,
  useLauncherI18n,
  type Translate,
} from './i18n';

/* ── Types ── */
export type ViewKey = 'logs' | 'backups' | 'settings' | 'updates';

type ToolStatus = { name: string; path?: string | null; ok: boolean; detail: string };

type SetupStatus = {
  node: boolean; npm: boolean;
  projectRootValid: boolean;
  projectRootInstallable: boolean;
  rootDependencies: boolean; clientDependencies: boolean; envFile: boolean;
};

export type ProfileStatus = {
  id: string; name: string; description: string; available: boolean; running: boolean;
  backendPort: number; frontendPort: number; frontendUrl: string; backendUrl: string;
  dataDir: string; dbPath: string; uploadsDir: string; brandAssets: boolean;
};

export type LogEntry = { timestamp: number; source: string; level: string; message: string };

export type LanAccessStatus = {
  ok: boolean;
  frontendOk: boolean;
  backendOk: boolean;
  frontendUrl?: string | null;
  backendUrl?: string | null;
  message: string;
};

export type HttpsStatus = {
  enabled: boolean;
  httpsPort: number;
  enrollmentPort: number;
  httpsUrl: string;
  iosEnrollmentUrl: string;
  androidEnrollmentUrl: string;
  caName: string;
  caFingerprint: string;
  enrollmentExpiresAt: number;
  certificateExpiresAt: number;
  localIp: string;
};

export type LauncherSnapshot = {
  projectRoot: string; appDataDir: string; localIp?: string | null;
  tools: ToolStatus[]; setup: SetupStatus; profiles: ProfileStatus[];
  activeProfileId?: string | null; lanStatus?: LanAccessStatus | null; logs: LogEntry[];
  launcherVersion: string;
  appVersion: string;
  appSource: 'managed' | 'custom' | 'store' | 'development' | 'missing';
  bundledSyncRequired: boolean;
  /** production: prebuilt client on one port; development: dev server on two ports. */
  runMode: 'production' | 'development';
  distribution: string;
  storeBuild: boolean;
  httpsStatus?: HttpsStatus | null;
};

export type UpdateCheckResult = {
  currentAppVersion: string;
  latestAppVersion: string;
  currentLauncherVersion: string;
  latestLauncherVersion: string;
  appReleaseNotes?: string | null;
  launcherReleaseNotes?: string | null;
  appUpdateAvailable: boolean;
  launcherUpdateAvailable: boolean;
  requiredActions: string[];
};

type InstallProgress = { state: string; message: string; progress: number; error?: string | null };

export type CommandResult = { ok: boolean; message: string };
export type BackupResult = CommandResult & { path: string };

export type PortCheckResult = {
  ok: boolean;
  backendPort: number;
  frontendPort: number;
  backendOk: boolean;
  frontendOk: boolean;
  suggestedBackendPort: number;
  suggestedFrontendPort: number;
  existingHomeInventory: boolean;
  existingFrontendUrl?: string | null;
  message: string;
};

export type SuggestedPorts = { backendPort: number; frontendPort: number };

export type LauncherSettings = {
  projectPath: string; nodePath: string; npmPath: string; autoOpen: boolean; mobileHttps: boolean;
  /** Update version the user chose to skip; newer versions are offered again. */
  skippedUpdateVersion: string;
  /** Optional app mode: open HomeInventory in the launcher's app window. */
  appMode: boolean;
};

type UpdateOffer = { kind: 'online'; version: string; blockedByNode: boolean };

type PathKind = 'project' | 'node' | 'npm';
type AndroidGuideBrand = 'samsung' | 'pixel' | 'other';

const LAUNCHER_VERSION = launcherPackage.version;

const defaultSettings: LauncherSettings = {
  projectPath: '', nodePath: '', npmPath: '', autoOpen: true, mobileHttps: false,
  skippedUpdateVersion: '',
  appMode: false,
};

export const hasTauriRuntime = () =>
  Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

export function loadSettings(): LauncherSettings {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem('hi-settings') || '{}') };
  } catch { return defaultSettings; }
}

export function saveSettings(s: LauncherSettings) {
  localStorage.setItem('hi-settings', JSON.stringify(s));
}

export function overrides(s: LauncherSettings) {
  return { projectPath: s.projectPath || null, nodePath: s.nodePath || null, npmPath: s.npmPath || null };
}

export function isCmd(v: unknown): v is CommandResult {
  return Boolean(v && typeof v === 'object' && 'message' in v);
}

export function sanitizePortInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 5);
}

export function parsePort(value: string, fallback: number) {
  const normalized = sanitizePortInput(value);
  if (!normalized) return fallback;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function validatePortInputs(apiPort: string, uiPort: string, profile: ProfileStatus | null, t: Translate) {
  if (!profile) return t('status.noProfile');
  const backendPort = parsePort(apiPort, profile.backendPort);
  const frontendPort = parsePort(uiPort, profile.frontendPort);
  if (backendPort < 1024 || backendPort > 65535) return t('status.apiPortRange');
  if (frontendPort < 1024 || frontendPort > 65535) return t('status.uiPortRange');
  if (backendPort === frontendPort) return t('status.portsDifferent');
  return '';
}

export function localizedPortMessage(status: PortCheckResult | null, t: Translate, singlePort = false) {
  if (!status) return t('status.portsAvailable');
  if (status.existingHomeInventory) return t('status.existingInstance');
  if (status.ok) return t('status.portsAvailable');
  if (singlePort) {
    return t('status.localPortBusy', { port: status.backendPort, suggested: status.suggestedBackendPort });
  }
  if (!status.backendOk && status.frontendOk) {
    return t('status.apiPortBusy', { port: status.backendPort, suggested: status.suggestedBackendPort });
  }
  if (status.backendOk && !status.frontendOk) {
    return t('status.uiPortBusy', { port: status.frontendPort, suggested: status.suggestedFrontendPort });
  }
  return t('status.bothPortsBusy', {
    backend: status.backendPort,
    frontend: status.frontendPort,
    suggestedBackend: status.suggestedBackendPort,
    suggestedFrontend: status.suggestedFrontendPort,
  });
}

function localizedLanMessage(status: LanAccessStatus, t: Translate) {
  if (status.frontendOk && status.backendOk) return t('status.networkReady');
  if (!status.frontendOk && status.backendOk) return t('status.lanUiBlocked');
  if (status.frontendOk && !status.backendOk) return t('status.lanApiBlocked');
  return t('status.lanBlocked');
}

function localizedUpdateState(state: string, t: Translate) {
  const keys: Record<string, Parameters<Translate>[0]> = {
    Starting: 'update.stateStarting',
    'Backing Up': 'update.stateBackingUp',
    Downloading: 'update.stateDownloading',
    Installing: 'update.stateInstalling',
    Completed: 'update.stateCompleted',
    RollingBack: 'update.stateRollback',
    RollbackComplete: 'update.stateRollbackComplete',
    RollbackFailed: 'update.stateFailed',
    Failed: 'update.stateFailed',
  };
  return keys[state] ? t(keys[state]) : state;
}

function localizedInstallState(state: string, t: Translate) {
  const keys: Record<string, Parameters<Translate>[0]> = {
    Preparing: 'firstInstall.statePreparing',
    Extracting: 'firstInstall.stateExtracting',
    Installing: 'firstInstall.stateInstalling',
    Finalizing: 'firstInstall.stateFinalizing',
    Completed: 'firstInstall.stateCompleted',
    Failed: 'firstInstall.stateFailed',
  };
  return keys[state] ? t(keys[state]) : state;
}

function formatElapsed(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function LanguageQuickPicker() {
  const { locale, setLocale, t } = useLauncherI18n();

  return (
    <label className="language-quick-picker">
      <Globe size={14} aria-hidden="true" />
      <select
        value={locale}
        aria-label={t('language.launcherLanguage')}
        onChange={event => setLocale(event.target.value as typeof locale)}
      >
        {LANGUAGE_OPTIONS.map(option => (
          <option key={option.code} value={option.code}>{option.label}</option>
        ))}
      </select>
      <ChevronDown size={13} aria-hidden="true" />
    </label>
  );
}

// One-click switch for the beta app window, next to the language picker.
function AppModeQuickToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  const { t } = useLauncherI18n();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`app-mode-quick-toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
      title={t('appMode.toggleHelp')}
    >
      <span className="app-mode-quick-track" aria-hidden="true"><span /></span>
      <span>{t('appMode.quickLabel')}</span>
      <span className="app-mode-quick-beta">{t('appMode.beta')}</span>
    </button>
  );
}

/* ── Root Component ── */
export function App() {
  return <LauncherI18nProvider><AppContent /></LauncherI18nProvider>;
}

function AppContent() {
  const { t } = useLauncherI18n();
  const [snapshot, setSnapshot] = useState<LauncherSnapshot | null>(null);
  const [settings, setSettings] = useState<LauncherSettings>(() => loadSettings());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState(() => t('status.launcherReady'));

  const [showDevPanel, setShowDevPanel] = useState(false);
  const [devTab, setDevTab] = useState<ViewKey>('logs');
  const [showLogs, setShowLogs] = useState(false);

  const [serverReady, setServerReady] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [warmup, setWarmup] = useState(10);
  const [openedUrl, setOpenedUrl] = useState('');

  // Advanced config
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [resendKey, setResendKey] = useState('');
  const [emailFrom, setEmailFrom] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [bootstrapAdminEmail, setBootstrapAdminEmail] = useState('');
  const [portApi, setPortApi] = useState('');
  const [portUi, setPortUi] = useState('');
  const [portCheck, setPortCheck] = useState<PortCheckResult | null>(null);
  const [portCheckRevision, setPortCheckRevision] = useState(0);

  // User must click to start — no auto-boot
  const [userStarted, setUserStarted] = useState(false);
  const [autoStartPending, setAutoStartPending] = useState(false);
  const [setupAutoBlocked, setSetupAutoBlocked] = useState(false);
  const [installStartedAt, setInstallStartedAt] = useState<number | null>(null);
  const [elapsedNow, setElapsedNow] = useState(() => Date.now());

  // Updater state
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<{ state: string; message: string; progress: number; error?: string | null } | null>(null);
  const [updateNotice, setUpdateNotice] = useState('');
  const [initialUpdateCheckStarted, setInitialUpdateCheckStarted] = useState(false);
  const [updateListenerReady, setUpdateListenerReady] = useState(false);
  const [bundledSyncRetryAvailable, setBundledSyncRetryAvailable] = useState(false);
  // "Later" hides an update offer for this session only.
  const [deferredUpdateVersion, setDeferredUpdateVersion] = useState('');
  const bundledSyncInFlightRef = useRef(false);
  const httpsActivationRef = useRef(false);

  // First install of the managed app (standard, non-Store launcher)
  const [firstInstall, setFirstInstall] = useState<InstallProgress | null>(null);

  // Production installs (Store, or a managed install with the prebuilt UI)
  // serve the app and the API on one port.
  const singlePort = Boolean(snapshot?.storeBuild) || snapshot?.runMode === 'production';

  /* ── Refresh ── */
  const refresh = useCallback(async () => {
    if (!hasTauriRuntime()) {
      setSnapshot(prev => {
        const next = mockSnapshot(settings, t);
        if (!prev?.activeProfileId) return next;
        const activePreview = prev.profiles.find(profile => profile.id === prev.activeProfileId);
        if (!activePreview) return next;
        return {
          ...next,
          activeProfileId: prev.activeProfileId,
          profiles: next.profiles.map(profile => profile.id === prev.activeProfileId ? {
            ...profile,
            running: true,
            backendPort: activePreview.backendPort,
            frontendPort: activePreview.frontendPort,
            backendUrl: activePreview.backendUrl,
            frontendUrl: activePreview.frontendUrl,
          } : profile),
        };
      });
      setNotice(t('status.browserPreview'));
      return;
    }
    try {
      setSnapshot(await invoke<LauncherSnapshot>('detect_tools', { overrides: overrides(settings) }));
    } catch (e) { setNotice(String(e)); }
  }, [settings, t]);

  useEffect(() => { saveSettings(settings); refresh(); }, [settings, refresh]);
  useEffect(() => { const t = setInterval(refresh, 2000); return () => clearInterval(t); }, [refresh]);
  // The app window sidebar edits the same settings; keep both windows in sync.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'hi-settings') setSettings(loadSettings());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Listener for update-progress
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let mounted = true;
    if (hasTauriRuntime()) {
      listen<{ state: string; message: string; progress: number; error?: string | null }>('update-progress', (event) => {
        setUpdateProgress(event.payload);
        if (event.payload.error) {
          setUpdateNotice(event.payload.error);
        }
        const terminal = event.payload.state === 'Completed'
          || event.payload.state === 'RollbackComplete'
          || event.payload.state === 'RollbackFailed'
          || event.payload.state === 'Failed';
        if (terminal) {
          const bundledSyncTerminal = bundledSyncInFlightRef.current;
          if (bundledSyncTerminal) {
            bundledSyncInFlightRef.current = false;
            const canRetry = event.payload.state !== 'Completed';
            setBundledSyncRetryAvailable(canRetry);
            if (canRetry) {
              setUpdateNotice(event.payload.message);
            }
          }
          if (event.payload.state === 'Completed') {
            // A successful managed update becomes the active install. Clear a
            // legacy/custom project path so later launches keep using it.
            setSettings(current => current.projectPath
              ? { ...current, projectPath: '' }
              : current);
          }
          setTimeout(() => {
            setUpdateProgress(null);
            setUpdateResult(null);
            setBusy(null);
          }, 3000);
          refresh();
        }
      }).then((fn) => {
        if (!mounted) {
          fn();
          return;
        }
        unlisten = fn;
        setUpdateListenerReady(true);
      }).catch((err) => {
        if (mounted) {
          setUpdateNotice(err instanceof Error ? err.message : String(err));
        }
      });
    }
    return () => {
      mounted = false;
      if (unlisten) unlisten();
    };
  }, [refresh]);

  // Listener for install-progress (first install)
  useEffect(() => {
    if (!hasTauriRuntime()) return;
    let unlisten: (() => void) | null = null;
    let mounted = true;
    listen<InstallProgress>('install-progress', (event) => {
      setFirstInstall(event.payload);
    }).then((fn) => {
      if (!mounted) {
        fn();
        return;
      }
      unlisten = fn;
    }).catch(() => undefined);
    return () => {
      mounted = false;
      if (unlisten) unlisten();
    };
  }, []);

  // Events from the optional app window (app mode)
  useEffect(() => {
    if (!hasTauriRuntime()) return;
    let mounted = true;
    const unlisteners: Array<() => void> = [];
    const keep = (fn: () => void) => {
      if (mounted) unlisteners.push(fn);
      else fn();
    };
    listen<{ classic: boolean }>('app-window-closed', (event) => {
      if (!event.payload.classic) return;
      setSettings(current => ({ ...current, appMode: false }));
      setNotice(t('appMode.classicNotice'));
    }).then(keep).catch(() => undefined);
    listen<{ tab: ViewKey }>('launcher-open-tab', (event) => {
      setDevTab(event.payload.tab);
      setShowDevPanel(true);
    }).then(keep).catch(() => undefined);
    return () => {
      mounted = false;
      unlisteners.forEach(fn => fn());
    };
  }, [t]);

  const checkForUpdates = async () => {
    setCheckingUpdates(true);
    setUpdateNotice('');
    setUpdateResult(null);
    try {
      if (!hasTauriRuntime()) {
        await new Promise((r) => setTimeout(r, 1000));
        setUpdateResult({
          currentAppVersion: snapshot?.appVersion || LAUNCHER_VERSION,
          latestAppVersion: LAUNCHER_VERSION,
          currentLauncherVersion: snapshot?.launcherVersion || LAUNCHER_VERSION,
          latestLauncherVersion: LAUNCHER_VERSION,
          appReleaseNotes: null,
          launcherReleaseNotes: null,
          appUpdateAvailable: false,
          launcherUpdateAvailable: false,
          requiredActions: [],
        });
        return;
      }
      const result = await invoke<UpdateCheckResult>('check_updates', { overrides: overrides(settings) });
      setUpdateResult(result);
      if (!result.appUpdateAvailable && !result.launcherUpdateAvailable) {
        setUpdateNotice(t('update.upToDateNotice'));
      }
    } catch (err) {
      setUpdateNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckingUpdates(false);
    }
  };

  useEffect(() => {
    if (
      initialUpdateCheckStarted
      || !updateListenerReady
      || !hasTauriRuntime()
      || !snapshot
      || snapshot.storeBuild
      || snapshot.appSource === 'missing'
      || snapshot.activeProfileId
      || busy === 'bundled-sync'
      || busy === 'first-install'
      || Boolean(updateProgress)
      || bundledSyncRetryAvailable
    ) {
      return;
    }

    // Only checks. Updates are offered, never installed automatically.
    setInitialUpdateCheckStarted(true);
    checkForUpdates();
  }, [
    bundledSyncRetryAvailable,
    busy,
    initialUpdateCheckStarted,
    snapshot?.activeProfileId,
    snapshot?.appSource,
    snapshot?.appVersion,
    snapshot?.bundledSyncRequired,
    snapshot?.launcherVersion,
    snapshot?.storeBuild,
    updateListenerReady,
    updateProgress,
  ]);

  const triggerUpdate = async () => {
    if (!updateResult) {
      setUpdateNotice(t('update.checkFirst'));
      setUpdateProgress(null);
      return;
    }

    if (!updateResult.appUpdateAvailable && !updateResult.launcherUpdateAvailable) {
      setUpdateNotice(t('update.noInstallAvailable'));
      setUpdateProgress(null);
      return;
    }

    setUpdateNotice('');
    setBusy('update');
    setUpdateProgress({ state: 'Starting', message: t('update.initializing'), progress: 0.01 });
    try {
      if (!hasTauriRuntime()) {
        setUpdateProgress({ state: 'Backing Up', message: t('update.backingUp'), progress: 0.2 });
        await new Promise((r) => setTimeout(r, 1000));
        setUpdateProgress({ state: 'Downloading', message: t('update.downloading'), progress: 0.4 });
        await new Promise((r) => setTimeout(r, 1000));
        setUpdateProgress({ state: 'Installing', message: t('update.installing'), progress: 0.7 });
        await new Promise((r) => setTimeout(r, 1500));
        setUpdateProgress({ state: 'Completed', message: t('update.complete'), progress: 1.0 });
        setTimeout(() => {
          setUpdateProgress(null);
          setUpdateResult(null);
          setBusy(null);
        }, 3000);
        return;
      }
      await invoke('update_all', { overrides: overrides(settings) });
    } catch (err) {
      setUpdateNotice(err instanceof Error ? err.message : String(err));
      setUpdateProgress(null);
      setBusy(null);
    }
  };

  const profiles = snapshot?.profiles ?? [];
  const isStoreBuild = Boolean(snapshot?.storeBuild);
  const active = profiles.find(p => p.id === snapshot?.activeProfileId) ?? null;
  const [selId, setSelId] = useState('homeinventory');
  useEffect(() => { if (snapshot?.activeProfileId) setSelId(snapshot.activeProfileId); }, [snapshot?.activeProfileId]);
  const selProfile = profiles.find(p => p.id === selId) || profiles[0] || null;
  const selectedProfileId = selProfile?.id ?? null;
  const selectedBackendPort = selProfile ? parsePort(portApi, selProfile.backendPort) : 3001;
  const selectedFrontendPort = selProfile
    ? singlePort ? selectedBackendPort : parsePort(portUi, selProfile.frontendPort)
    : 5173;
  const portInputError = useMemo(() => {
    if (!singlePort) return validatePortInputs(portApi, portUi, selProfile, t);
    if (!selProfile) return t('status.noProfile');
    const backendPort = parsePort(portApi, selProfile.backendPort);
    if (backendPort < 1024 || backendPort > 65535) return t('status.localPortRange');
    return '';
  }, [singlePort, portApi, portUi, selProfile, t]);
  const existingHomeInventory = Boolean(portCheck?.existingHomeInventory && portCheck.existingFrontendUrl);
  const portBusy = Boolean(!portInputError && portCheck && !portCheck.ok && !existingHomeInventory);
  const checkingPorts = Boolean(selectedProfileId && !portInputError && !portCheck);
  const portBlocked = Boolean(portInputError);
  const portStatusBlocked = Boolean(portInputError || (portCheck && !portCheck.ok && !existingHomeInventory));
  const portMessage = portInputError || localizedPortMessage(portCheck, t, singlePort);
  const launchBackendPort = portBusy && portCheck ? portCheck.suggestedBackendPort : selectedBackendPort;
  const launchFrontendPort = singlePort
    ? launchBackendPort
    : portBusy && portCheck ? portCheck.suggestedFrontendPort : selectedFrontendPort;

  const ready = useMemo(() => {
    if (!snapshot) return false;
    const s = snapshot.setup;
    return s.node && s.npm && s.projectRootValid && s.rootDependencies && s.clientDependencies && s.envFile;
  }, [snapshot]);

  const updateAvailable = Boolean(updateResult?.appUpdateAvailable || updateResult?.launcherUpdateAvailable);
  const updateBlockedByNode = Boolean(updateResult?.requiredActions.includes('nodeMajorUpgrade'));

  // The app bundled with this launcher is not optional: the user already
  // chose this launcher version, and launcher and app are released together,
  // so it is installed automatically (see the effect after startBundledSync).
  // Only the verified online release is offered as an optional update.
  const bundledSyncPending = Boolean(
    !isStoreBuild
    && snapshot?.bundledSyncRequired
    && snapshot.appSource === 'managed'
    && !settings.projectPath.trim()
  );
  const updateOffer: UpdateOffer | null = isStoreBuild || !snapshot || bundledSyncPending
    ? null
    : updateResult && updateAvailable
        ? {
          kind: 'online',
          version: updateResult.appUpdateAvailable ? updateResult.latestAppVersion : updateResult.latestLauncherVersion,
          blockedByNode: updateBlockedByNode,
        }
        : null;
  const updateOfferSkipped = Boolean(updateOffer && settings.skippedUpdateVersion === updateOffer.version);
  const updateOfferHidden = Boolean(updateOffer && (updateOfferSkipped || deferredUpdateVersion === updateOffer.version));

  const deferUpdate = () => {
    if (updateOffer) setDeferredUpdateVersion(updateOffer.version);
    setUpdateNotice('');
  };

  const skipUpdate = () => {
    if (!updateOffer) return;
    const version = updateOffer.version;
    setSettings(current => ({ ...current, skippedUpdateVersion: version }));
    setNotice(t('update.skippedNotice', { version }));
  };

  const reviewUpdateOffer = () => {
    setDeferredUpdateVersion('');
    setSettings(current => current.skippedUpdateVersion ? { ...current, skippedUpdateVersion: '' } : current);
  };

  // Installs the newer app bundled with this launcher. It only replaces the
  // app files and finishes stopped; the next Start runs the new version.
  const startBundledSync = () => {
    if (!hasTauriRuntime() || bundledSyncInFlightRef.current || busy) return;
    bundledSyncInFlightRef.current = true;
    setBundledSyncRetryAvailable(false);
    setUpdateNotice('');
    setBusy('bundled-sync');
    setUpdateProgress({
      state: 'Starting',
      message: t('update.bundledInstalling', { version: snapshot?.launcherVersion || '' }),
      progress: 0.01,
    });
    invoke<CommandResult>('sync_bundled_managed_app', {
      request: {
        overrides: overrides(settings),
        backendPort: launchBackendPort,
        frontendPort: launchFrontendPort,
      },
    }).catch((err) => {
      bundledSyncInFlightRef.current = false;
      setBundledSyncRetryAvailable(true);
      setUpdateNotice(err instanceof Error ? err.message : String(err));
      setUpdateProgress(null);
      setBusy(null);
      refresh();
    });
  };

  // Brings the managed app up to the version bundled with this launcher as
  // soon as nothing is running, once per launcher session. A failure leaves
  // the retry card (bundledSyncRetryAvailable) instead of looping.
  const bundledSyncAttemptedRef = useRef(false);
  useEffect(() => {
    if (
      !bundledSyncPending
      || bundledSyncAttemptedRef.current
      || !hasTauriRuntime()
      || snapshot?.activeProfileId
      || busy
      || bundledSyncRetryAvailable
    ) {
      return;
    }
    bundledSyncAttemptedRef.current = true;
    startBundledSync();
  });

  const applyUpdateOffer = () => {
    if (!updateOffer) return;
    triggerUpdate();
  };
  // A standard launcher with nothing installed yet offers the first install
  // of the app that ships with it instead of asking for a folder.
  const firstInstallAvailable = !isStoreBuild
    && snapshot?.appSource === 'missing'
    && !settings.projectPath.trim();
  const projectRootMissing = !isStoreBuild && Boolean(snapshot && !snapshot.projectRoot.trim());
  const projectRootInvalid = !isStoreBuild && Boolean(snapshot?.projectRoot.trim() && !snapshot.setup.projectRootValid);
  const projectRootInstallable = !isStoreBuild && Boolean(snapshot?.setup.projectRootInstallable);
  const projectRootBlocked = !isStoreBuild && (projectRootMissing || (projectRootInvalid && !projectRootInstallable));
  const visibleLaunchNotice = existingHomeInventory
    ? portMessage
    : portBusy
      ? portMessage
    : isStoreBuild && !ready
    ? t('setup.storePreparation')
    : firstInstallAvailable
    ? ''
    : projectRootMissing
    ? t('setup.chooseFolderHelp')
    : projectRootInstallable
      ? t('setup.emptyFolderSelected')
      : projectRootInvalid
        ? t('setup.invalidFolder')
    : notice && ![t('status.launcherReady'), t('status.browserPreview')].includes(notice)
      ? notice
      : '';

  const chooseInstallFolder = async () => {
    if (!hasTauriRuntime()) {
      setNotice(t('status.folderPickerDesktop'));
      return;
    }
    try {
      const selected = await invoke<string | null>('choose_path', { request: { kind: 'project' } });
      if (!selected) return;
      setSettings(current => ({ ...current, projectPath: selected }));
      setSetupAutoBlocked(false);
      setNotice(t('status.folderSelected'));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  };

  const clearInstallFolder = () => {
    setSettings(current => ({ ...current, projectPath: '' }));
    setSetupAutoBlocked(false);
    setNotice(t('status.folderCleared'));
  };

  const renderPreLaunchUpdateCheck = () => {
    if (isStoreBuild) {
      return null;
    }

    // Updates are always optional: the card offers Update now / Later /
    // Skip this version, and Start keeps launching the installed version.
    if (updateProgress) {
      return (
        <div className="prelaunch-update-card" role="status" aria-live="polite">
          <div className="prelaunch-update-copy">
            <span className="prelaunch-update-kicker">{t('update.kicker')}</span>
            <strong>{t('update.inProgress')}</strong>
            <p>{updateProgress.message}</p>
          </div>
        </div>
      );
    }

    if (bundledSyncRetryAvailable) {
      return (
        <div className="prelaunch-update-card">
          <div className="prelaunch-update-copy">
            <span className="prelaunch-update-kicker">{t('update.kicker')}</span>
            <strong>{t('update.syncPaused')}</strong>
            <p>{updateNotice || t('update.previousAvailable')}</p>
          </div>
          <div className="update-offer-actions">
            <button type="button" className="btn-primary" onClick={startBundledSync} disabled={Boolean(busy)}>
              <RefreshCw size={13} />
              {t('update.retrySync')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => { setBundledSyncRetryAvailable(false); deferUpdate(); }} disabled={Boolean(busy)}>
              {t('update.later')}
            </button>
          </div>
        </div>
      );
    }

    if (updateOffer && !updateOfferHidden) {
      return (
        <div className="prelaunch-update-card update-offer">
          <div className="prelaunch-update-copy">
            <span className="prelaunch-update-kicker">{t('update.kicker')}</span>
            <strong>{t('update.offerTitle', { version: updateOffer.version })}</strong>
            <p>
              {updateOffer.blockedByNode
                ? t('update.nodeUpgradeBeforeInstall')
                : t('update.offerOnline')}
            </p>
          </div>
          <div className="update-offer-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={applyUpdateOffer}
              disabled={Boolean(busy) || updateOffer.blockedByNode}
            >
              <Download size={13} />
              {t('update.updateNow')}
            </button>
            <button type="button" className="btn-secondary" onClick={deferUpdate} disabled={Boolean(busy)}>
              {t('update.later')}
            </button>
            <button type="button" className="btn-secondary" onClick={skipUpdate} disabled={Boolean(busy)}>
              {t('update.skipVersion')}
            </button>
          </div>
        </div>
      );
    }

    const title = updateOffer
      ? updateOfferSkipped
        ? t('update.skippedTitle', { version: updateOffer.version })
        : t('update.postponedTitle', { version: updateOffer.version })
      : checkingUpdates
        ? t('update.checking')
        : updateResult
          ? t('update.noneAvailable')
          : t('update.checkForUpdates');

    return (
      <div className="prelaunch-update-card">
        <div className="prelaunch-update-copy">
          <span className="prelaunch-update-kicker">{t('update.kicker')}</span>
          <strong>{title}</strong>
          <p>{updateOffer ? t('update.postponedBody') : checkingUpdates ? t('update.lookingForReleases') : t('update.optionalHelp')}</p>
        </div>
        {updateOffer ? (
          <button type="button" className="btn-secondary" onClick={reviewUpdateOffer} disabled={Boolean(busy)}>
            <Download size={13} />
            {t('update.review')}
          </button>
        ) : (
          <button type="button" className="btn-secondary" onClick={checkForUpdates} disabled={checkingUpdates || Boolean(busy)}>
            {checkingUpdates ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
            {checkingUpdates ? t('common.checking') : updateResult ? t('common.checkAgain') : t('update.checkUpdates')}
          </button>
        )}
      </div>
    );
  };

  /* ── Server polling ── */
  useEffect(() => {
    if (!active) { setServerReady(false); return; }
    if (!hasTauriRuntime() && new URLSearchParams(window.location.search).get('preview') === 'running') {
      setServerReady(true);
      return;
    }
    let on = true;
    const poll = async () => {
      try {
        const ready = await invoke<boolean>('is_server_ready', { port: active.frontendPort });
        if (ready) {
          if (on) setServerReady(true);
        } else {
          if (on) setTimeout(poll, 500);
        }
      } catch {
        if (on) setTimeout(poll, 500);
      }
    };
    poll();
    return () => { on = false; };
  }, [active]);

  useEffect(() => {
    if (active && !serverReady) {
      // The first start of a fresh install can take up to two minutes, so the
      // bar slows down as it approaches the end instead of stalling early.
      const t = setInterval(() => setWarmup(p => p < 95 ? p + Math.max(1, Math.round((95 - p) / 12)) : p), 600);
      return () => clearInterval(t);
    }
    if (serverReady) setWarmup(100);
    else setWarmup(10);
  }, [active, serverReady]);

  useEffect(() => {
    if (!userStarted || busy || active || serverReady || stopped || !ready || !snapshot) return;
    const lastError = [...snapshot.logs].reverse().find(log => log.level === 'error');
    const nextNotice = lastError
      ? `${lastError.source}: ${lastError.message}`
      : t('status.setupStopped');
    setNotice(current => current === nextNotice ? current : nextNotice);
    setUserStarted(false);
  }, [active, busy, ready, serverReady, snapshot, stopped, userStarted]);

  useEffect(() => {
    if (
      busy === 'bundled-sync'
      || bundledSyncInFlightRef.current
      || !active
      || !serverReady
      || !settings.autoOpen
      || openedUrl === active.frontendUrl
      || !hasTauriRuntime()
    ) return;
    setOpenedUrl(active.frontendUrl);
    const opened = settings.appMode
      ? invoke('open_app_window', { url: active.frontendUrl, reload: true })
      : invoke('open_app', { url: active.frontendUrl });
    opened.catch(e => setNotice(String(e)));
  }, [active, busy, serverReady, settings.autoOpen, settings.appMode, openedUrl]);

  const openActiveApp = (url: string) => run(
    'open browser',
    () => settings.appMode
      ? invoke('open_app_window', { url })
      : invoke('open_app', { url }),
  );

  useEffect(() => {
    const certificateNeedsRefresh = Boolean(
      snapshot?.httpsStatus
      && (
        (snapshot.localIp && snapshot.httpsStatus.localIp !== snapshot.localIp)
        || snapshot.httpsStatus.certificateExpiresAt <= Math.floor(Date.now() / 1000) + 24 * 60 * 60
      )
    );
    if (!active || !serverReady || !settings.mobileHttps || (snapshot?.httpsStatus && !certificateNeedsRefresh) || busy || !hasTauriRuntime()) {
      if (!active || !settings.mobileHttps) httpsActivationRef.current = false;
      return;
    }
    if (httpsActivationRef.current) return;
    httpsActivationRef.current = true;
    enableMobileHttps().finally(() => { httpsActivationRef.current = false; });
  }, [active, serverReady, settings.mobileHttps, snapshot?.httpsStatus, snapshot?.localIp, busy]);

  useEffect(() => {
    if (!selectedProfileId || portInputError) {
      setPortCheck(null);
      return;
    }

    setPortCheck(null);

    if (isStoreBuild) {
      setPortCheck({
        ok: true,
        backendPort: selectedBackendPort,
        frontendPort: selectedBackendPort,
        backendOk: true,
        frontendOk: true,
        suggestedBackendPort: selectedBackendPort,
        suggestedFrontendPort: selectedBackendPort,
        existingHomeInventory: false,
        existingFrontendUrl: null,
        message: t('status.localPortValid'),
      });
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (!hasTauriRuntime()) {
        setPortCheck({
          ok: true,
          backendPort: selectedBackendPort,
          frontendPort: selectedFrontendPort,
          backendOk: true,
          frontendOk: true,
          suggestedBackendPort: selectedBackendPort,
          suggestedFrontendPort: selectedFrontendPort,
          existingHomeInventory: false,
          existingFrontendUrl: null,
          message: t('status.previewPortsValid'),
        });
        return;
      }

      try {
        const result = await invoke<PortCheckResult>('check_ports', {
          request: { backendPort: selectedBackendPort, frontendPort: selectedFrontendPort, singlePort },
        });
        if (!cancelled) setPortCheck(result);
      } catch (e) {
        if (!cancelled) {
          setPortCheck({
            ok: false,
            backendPort: selectedBackendPort,
            frontendPort: selectedFrontendPort,
            backendOk: false,
            frontendOk: false,
            suggestedBackendPort: selectedBackendPort,
            suggestedFrontendPort: selectedFrontendPort,
            existingHomeInventory: false,
            existingFrontendUrl: null,
            message: String(e),
          });
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    isStoreBuild,
    portCheckRevision,
    singlePort,
    selectedProfileId,
    selectedBackendPort,
    selectedFrontendPort,
    portInputError,
  ]);

  /* ── Actions ── */
  async function run(label: string, action: () => Promise<CommandResult | unknown>): Promise<boolean> {
    setBusy(label);
    try {
      if (!hasTauriRuntime()) {
        setNotice(`${label}: simulated in browser mode.`);
        await new Promise(r => setTimeout(r, 1500));
        return true;
      }
      const r = await action();
      setNotice(isCmd(r) ? r.message : `${label} done.`);
      await refresh();
      return true;
    } catch (e) {
      setNotice(String(e));
      return false;
    }
    finally { setBusy(null); }
  }

  async function chooseRandomPorts() {
    setBusy('random-ports');
    try {
      const suggested = hasTauriRuntime()
        ? await invoke<SuggestedPorts>('suggest_random_ports')
        : { backendPort: 43101, frontendPort: 43102 };
      setPortApi(String(suggested.backendPort));
      setPortUi(String(suggested.frontendPort));
      setPortCheck(null);
      setPortCheckRevision(current => current + 1);
      setNotice(singlePort
        ? t('status.randomLocalPort', { port: suggested.backendPort })
        : t('status.randomPorts', { backend: suggested.backendPort, frontend: suggested.frontendPort }));
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(null);
    }
  }

  const doStart = async (
    p: ProfileStatus,
    requestedBackendPort = launchBackendPort,
    requestedFrontendPort = launchFrontendPort,
  ) => {
    if (checkingPorts) {
      setNotice(t('status.checkingPorts'));
      return;
    }
    if (existingHomeInventory && portCheck?.existingFrontendUrl) {
      setAutoStartPending(false);
      setUserStarted(false);
      await run('open-existing', () => invoke('open_app', { url: portCheck.existingFrontendUrl }));
      return;
    }
    if (portBlocked) {
      setNotice(portMessage);
      return;
    }
    const backendPort = requestedBackendPort;
    const frontendPort = requestedFrontendPort;
    if (portBusy && portCheck) {
      setPortApi(String(backendPort));
      setPortUi(String(frontendPort));
      setNotice(t('status.defaultPortsBusy', { backend: backendPort, frontend: frontendPort }));
    }
    setUserStarted(true);
    setStopped(false);
    setServerReady(false);
    if (!hasTauriRuntime()) {
      setSnapshot(prev => prev ? {
        ...prev,
        activeProfileId: p.id,
        profiles: prev.profiles.map(profile => profile.id === p.id ? {
          ...profile,
          running: true,
          backendPort,
          frontendPort,
          frontendUrl: `http://127.0.0.1:${frontendPort}`,
          backendUrl: `http://127.0.0.1:${backendPort}`,
        } : profile),
      } : prev);
      setServerReady(true);
      setNotice(t('status.startPreview', { name: p.name }));
      return;
    }
    const started = await run(`start-${p.id}`, () => invoke('start_profile', {
      request: { profileId: p.id, backendPort, frontendPort, overrides: overrides(settings) },
    }));
    if (!started) {
      setAutoStartPending(false);
      setUserStarted(false);
    }
  };

  const doStop = async () => {
    setStopped(true); setServerReady(false); setShowDevPanel(false);
    setAutoStartPending(false); setUserStarted(false);
    if (!hasTauriRuntime()) {
      setSnapshot(prev => prev ? {
        ...prev,
        activeProfileId: null,
        profiles: prev.profiles.map(profile => ({ ...profile, running: false })),
      } : prev);
      setNotice(t('status.stopPreview'));
      return;
    }
    await run('stop', () => invoke('stop_profile'));
  };

  const enableMobileHttps = async () => {
    if (!active) {
      setNotice(t('https.startFirst'));
      return;
    }
    setBusy('mobile-https');
    try {
      if (!hasTauriRuntime()) {
        setSettings(current => ({ ...current, mobileHttps: true }));
        setNotice(t('https.previewEnabled'));
        return;
      }
      const status = await invoke<HttpsStatus>('enable_https', {
        request: {
          profileId: active.id,
          overrides: overrides(settings),
          httpsPort: 5443,
        },
      });
      setSettings(current => ({ ...current, mobileHttps: true }));
      setNotice(t('https.readyNotice', { url: status.httpsUrl }));
      await refresh();
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(null);
    }
  };

  const disableMobileHttps = async () => {
    setBusy('mobile-https');
    try {
      if (hasTauriRuntime() && snapshot?.httpsStatus) {
        const result = await invoke<CommandResult>('disable_https');
        setNotice(result.message);
      } else {
        setNotice(t('https.disabledNotice'));
      }
      setSettings(current => ({ ...current, mobileHttps: false }));
      await refresh();
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(null);
    }
  };

  const rotateMobileCa = async () => {
    if (!active || !window.confirm(
      t('https.rotateConfirm')
    )) return;
    setBusy('mobile-https');
    try {
      if (hasTauriRuntime()) {
        if (snapshot?.httpsStatus) await invoke<CommandResult>('disable_https');
        const result = await invoke<CommandResult>('rotate_https_ca', {
          request: { profileId: active.id },
        });
        setNotice(result.message);
      } else {
        setNotice(t('https.rotatePreview'));
      }
      setSettings(current => ({ ...current, mobileHttps: false }));
      await refresh();
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(null);
    }
  };

  const doInstall = async (automatic = false) => {
    setInstallStartedAt(Date.now());
    const ok = await run('install', () => invoke('install_dependencies', { overrides: overrides(settings) }));
    setInstallStartedAt(null);
    if (!ok) {
      setSetupAutoBlocked(true);
      setAutoStartPending(false);
      setUserStarted(false);
      return false;
    }
    if (!automatic) setSetupAutoBlocked(false);
    return ok;
  };

  const doBackup = async (p: ProfileStatus): Promise<BackupResult> => {
    setBusy('backup');
    try {
      if (!hasTauriRuntime()) {
        const simulated = {
          ok: true,
          message: t('status.backupPreview', { name: p.name }),
          path: `${snapshot?.appDataDir || '/tmp'}/backups/${p.id}-preview`,
        };
        setNotice(simulated.message);
        return simulated;
      }
      const result = await invoke<BackupResult>('backup_now', { request: { profileId: p.id } });
      setNotice(result.message);
      await refresh();
      return result;
    } catch (e) {
      setNotice(String(e));
      throw e;
    } finally {
      setBusy(null);
    }
  };

  const doLaunch = async (p: ProfileStatus) => {
    if (portBlocked) {
      setNotice(portMessage);
      return;
    }

    const entries: Record<string, string> = {};
    if (resendKey.trim()) entries['RESEND_API_KEY'] = resendKey.trim();
    if (emailFrom.trim()) entries['EMAIL_FROM'] = emailFrom.trim();
    if (supportEmail.trim()) entries['SUPPORT_EMAIL'] = supportEmail.trim();
    if (bootstrapAdminEmail.trim()) entries['BOOTSTRAP_ADMIN_EMAIL'] = bootstrapAdminEmail.trim().toLowerCase();
    const backendPort = launchBackendPort;
    const frontendPort = launchFrontendPort;
    if (portApi.trim()) entries['PORT'] = String(backendPort);
    // The production server has no separate UI port.
    if (!singlePort && portUi.trim()) entries['FRONTEND_PORT'] = String(frontendPort);
    if (!singlePort && portUi.trim()) entries['VITE_PORT'] = String(frontendPort);

    if (Object.keys(entries).length > 0 && hasTauriRuntime()) {
      try { await invoke('write_env', { overrides: overrides(settings), request: { entries } }); }
      catch (e) { setNotice(String(e)); }
    }

    await doStart(p, backendPort, frontendPort);
  };

  /* ── Continue once after a user-requested first-time setup ── */
  useEffect(() => {
    if (autoStartPending && userStarted && hasTauriRuntime() && snapshot && ready && !snapshot.activeProfileId && !busy && !stopped && portCheck) {
      setAutoStartPending(false);
      const dp = snapshot.profiles.find(p => p.id === 'homeinventory');
      if (dp) doStart(dp);
    }
  }, [autoStartPending, snapshot, ready, busy, stopped, userStarted, portCheck]);

  useEffect(() => {
    if (busy !== 'install' && busy !== 'first-install') return;
    const timer = window.setInterval(() => setElapsedNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  /* ── First install of the app that ships with the launcher ── */
  const doFirstInstall = async () => {
    setSetupAutoBlocked(false);
    setNotice('');
    setInstallStartedAt(Date.now());
    setElapsedNow(Date.now());
    setFirstInstall({ state: 'Preparing', message: t('firstInstall.statePreparing'), progress: 0.02 });
    setBusy('first-install');
    try {
      if (!hasTauriRuntime()) {
        await new Promise(r => setTimeout(r, 1500));
        setFirstInstall({ state: 'Completed', message: t('firstInstall.stateCompleted'), progress: 1 });
        setNotice(t('status.browserPreview'));
        return;
      }
      await invoke<CommandResult>('install_managed_app', { overrides: overrides(settings) });
      // Start the freshly installed app once, exactly like pressing Start.
      setAutoStartPending(true);
      setUserStarted(true);
      setStopped(false);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFirstInstall({ state: 'Failed', message, progress: 1, error: message });
      setSetupAutoBlocked(true);
      setAutoStartPending(false);
      setUserStarted(false);
    } finally {
      setInstallStartedAt(null);
      setBusy(null);
    }
  };

  /* ── Render ── */
  if (!snapshot) return <div className="loading-state"><Loader2 size={28} className="spin" /><span>{t('status.loadingEnvironment')}</span></div>;

  /* ─── STATE 1: Setup ─── */
  if (!ready && !(active && serverReady)) {
    const s = snapshot.setup;
    const installing = busy === 'install';
    const elapsedSeconds = installStartedAt ? Math.max(0, Math.floor((elapsedNow - installStartedAt) / 1000)) : 0;
    const elapsedLabel = formatElapsed(elapsedSeconds);
    const firstInstalling = busy === 'first-install';
    const showFirstInstall = firstInstalling || firstInstallAvailable;
    const firstInstallFailed = !firstInstalling && firstInstall?.state === 'Failed';

    let msg = t('setup.waiting');
    if (!isStoreBuild && (!s.node || !s.npm)) msg = t('setup.nodeRequired');
    else if (installing) {
      msg = isStoreBuild
        ? t('setup.preparingFiles')
        : t('setup.installing');
    } else if (setupAutoBlocked) {
      msg = t('setup.failed');
    }

    return (
      <div className="splash-layout">
        <div className="splash-card">
          <div className="splash-logo-wrap">
            <img src={logoFull} alt="HomeInventory" className="splash-logo-full pulsing" />
            <div className="logo-aura" />
          </div>
          <p className="splash-subtitle">{t('setup.subtitle')}</p>
          <span className="version-badge">
            {snapshot ? `App v${snapshot.appVersion} · ${t('common.launcher')} v${snapshot.launcherVersion} · ${t('setup.localFirst')}` : `v${LAUNCHER_VERSION} · ${t('setup.localFirst')}`}
          </span>
          <LanguageQuickPicker />

          {showFirstInstall ? (
            <div className="action-stack first-install" style={{ width: '100%', marginTop: 28 }}>
              <div className="prelaunch-update-card">
                <div className="prelaunch-update-copy">
                  <span className="prelaunch-update-kicker">{t('firstInstall.kicker')}</span>
                  <strong>{firstInstalling ? t('firstInstall.installing') : firstInstallFailed ? t('firstInstall.stateFailed') : t('firstInstall.title')}</strong>
                  <p>{firstInstallFailed ? firstInstall?.message : t('firstInstall.body')}</p>
                </div>
              </div>

              {firstInstalling && firstInstall ? (
                <div className="progress-wrap" role="status" aria-live="polite">
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.round(firstInstall.progress * 100)}%` }} /></div>
                  <div className="progress-meta">
                    <span>{localizedInstallState(firstInstall.state, t)}</span>
                    <span>{Math.round(firstInstall.progress * 100)}%</span>
                  </div>
                  <p className="field-hint">{t('firstInstall.elapsed', { elapsed: elapsedLabel })}</p>
                </div>
              ) : (
                <button
                  className="btn-primary"
                  onClick={doFirstInstall}
                  disabled={Boolean(busy)}
                >
                  {firstInstallFailed ? <RefreshCw size={16} /> : <Download size={16} />}
                  {firstInstallFailed ? t('firstInstall.retry') : t('firstInstall.button')}
                </button>
              )}

              <p className="field-hint">{t('firstInstall.network')}</p>

              {!firstInstalling && (
                <button type="button" className="btn-outline" onClick={chooseInstallFolder}>
                  <FolderOpen size={13} /> {t('firstInstall.customFolder')}
                </button>
              )}
            </div>
          ) : installing ? (
            <div className="install-status" style={{ marginTop: 28 }}>
              <Loader2 size={18} className="spin" />
              <div>
                <strong>{msg}</strong>
                <p>{isStoreBuild ? t('setup.elapsedBundled', { elapsed: elapsedLabel }) : t('setup.elapsedInstall', { elapsed: elapsedLabel })}</p>
              </div>
            </div>
          ) : (!isStoreBuild && (!s.node || !s.npm)) ? (
            <div className="error-box">
              <AlertCircle size={16} />
              <div>
                <strong>{isStoreBuild ? t('setup.runtimeNotReady') : t('setup.nodeNotFound')}</strong>
                <p>{isStoreBuild ? t('setup.runtimeHelp') : <>{t('setup.nodeHelpPrefix')} <a href="https://nodejs.org" target="_blank" rel="noreferrer">nodejs.org</a> {t('setup.nodeHelpSuffix')}</>}</p>
              </div>
            </div>
          ) : (
            <div className="action-stack" style={{ width: '100%', marginTop: 28 }}>
              {renderPreLaunchUpdateCheck()}

              <button
                className="btn-primary"
                onClick={() => {
                  if (projectRootBlocked) {
                    chooseInstallFolder();
                    return;
                  }
                  setSetupAutoBlocked(false);
                  setAutoStartPending(true);
                  setUserStarted(true);
                  doInstall(false);
                }}
                disabled={Boolean(busy) || portBlocked || checkingPorts}
              >
                {busy || checkingPorts ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
                {checkingPorts ? t('setup.checkingLocalPorts') : isStoreBuild ? t('setup.launchLocal') : projectRootBlocked ? t('setup.chooseInstallFolder') : projectRootInstallable ? t('setup.installLaunch') : existingHomeInventory ? t('setup.openRunning') : portBusy ? (singlePort ? t('setup.launchOnPort', { port: launchBackendPort }) : t('setup.launchOn', { backend: launchBackendPort, frontend: launchFrontendPort })) : t('setup.initializeLaunch')}
              </button>

              {visibleLaunchNotice && (
                <div className="launch-notice">
                  <AlertCircle size={14} />
                  <div className="launch-notice-body">
                    <span>{visibleLaunchNotice}</span>
                    {projectRootBlocked && (
                      <div className="launch-notice-actions">
                        <button type="button" className="mini-action" onClick={chooseInstallFolder}>
                          {t('setup.chooseInstallFolder')}
                        </button>
                        {settings.projectPath && (
                          <button type="button" className="mini-action" onClick={clearInstallFolder}>
                            {t('common.clear')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <AdvancedConfigPanel
                showAdvanced={showAdvanced} setShowAdvanced={setShowAdvanced}
                resendKey={resendKey} setResendKey={setResendKey}
                emailFrom={emailFrom} setEmailFrom={setEmailFrom}
                supportEmail={supportEmail} setSupportEmail={setSupportEmail}
                bootstrapAdminEmail={bootstrapAdminEmail} setBootstrapAdminEmail={setBootstrapAdminEmail}
                portApi={portApi} setPortApi={setPortApi}
                portUi={portUi} setPortUi={setPortUi}
                localIp={snapshot?.localIp}
                lanStatus={snapshot?.lanStatus}
                portCheck={portCheck}
                portMessage={portMessage}
                portBlocked={portStatusBlocked}
                storeBuild={isStoreBuild}
                singlePort={singlePort}
                randomPortBusy={busy === 'random-ports'}
                onChooseRandomPorts={chooseRandomPorts}
                onUseSuggestedPorts={() => {
                  if (!portCheck) return;
                  setPortApi(String(portCheck.suggestedBackendPort));
                  setPortUi(String(portCheck.suggestedFrontendPort));
                }}
              />

              <button className="btn-outline" onClick={() => { setDevTab(isStoreBuild ? 'logs' : 'settings'); setShowDevPanel(true); }}>
                <SlidersHorizontal size={13} /> {t('setup.developerTools')}
              </button>
            </div>
          )}

          <footer className="splash-footer">
            <button className="link-btn" onClick={() => setShowLogs(!showLogs)}>
              <Terminal size={11} />{showLogs ? t('setup.hideConsole') : t('setup.systemConsole')}
            </button>
            {snapshot.appDataDir && <span className="data-path">{snapshot.appDataDir}</span>}
          </footer>
        </div>

        {showLogs && (
          <div className="drawer-overlay">
            <div className="drawer">
              <div className="drawer-header">
                <h3>{t('setup.systemConsole')}</h3>
                <button className="btn-secondary compact" onClick={() => setShowLogs(false)}>{t('common.close')}</button>
              </div>
              <div className="drawer-body"><LogConsole logs={snapshot.logs} /></div>
            </div>
          </div>
        )}

        {showDevPanel && (
          <div className="modal-overlay" onClick={() => setShowDevPanel(false)}>
            <div className="modal-panel" onClick={e => e.stopPropagation()}>
              <DevPanelContent
                snapshot={snapshot} profiles={profiles} settings={settings} setSettings={setSettings}
                devTab={devTab} setDevTab={setDevTab} busy={busy} notice={notice}
                onNotice={setNotice}
                onClose={() => setShowDevPanel(false)}
                onBackup={doBackup}
                updateResult={updateResult}
                checkingUpdates={checkingUpdates}
                updateProgress={updateProgress}
                updateNotice={updateNotice}
                onCheckUpdates={checkForUpdates}
                onTriggerUpdate={triggerUpdate}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ─── STATE 2: Warm-up ─── */
  if (!stopped && (busy?.startsWith('start-') || (active && !serverReady))) {
    const starting = busy?.startsWith('start-');
    const msg2 = !active ? (starting ? t('setup.startingServices') : t('setup.launching')) : t('setup.connectingDatabase');
    return (
      <div className="splash-layout">
        <div className="splash-card">
          <div className="splash-logo-wrap">
            <img src={logoFull} alt="HomeInventory" className="splash-logo-full pulsing" />
            <div className="logo-aura" />
          </div>
          <p className="splash-subtitle">{t('setup.connectingRegistry')}</p>
          <LanguageQuickPicker />
          <div className="progress-wrap" style={{ marginTop: 24 }}>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${warmup}%` }} /></div>
            <div className="progress-meta"><span>{msg2}</span><span>{warmup}%</span></div>
            {active && <p className="field-hint">{t('setup.warmupHint')}</p>}
          </div>
          <footer className="splash-footer center">
            <span>{active?.frontendUrl ?? `http://127.0.0.1:${launchFrontendPort}`}</span>
          </footer>
        </div>
      </div>
    );
  }

  /* ─── STATE 3: Running ─── */
  if (active && serverReady) {
    const lanStatus = snapshot?.lanStatus;
    const activeLanUrl = lanStatus?.frontendUrl || (snapshot?.localIp ? `http://${snapshot.localIp}:${active.frontendPort}` : active.frontendUrl);

    return (
      <div className="running-layout">
        <section className="running-card">
          <header className="running-topbar">
            <img src={logoFull} alt="HomeInventory" className="running-logo" />
            <div className="running-status" role="status">
              <span className="status-pulse" />
              <span>{t('running.status')}</span>
            </div>
          </header>
          <LanguageQuickPicker />

          <div className="running-intro">
            <span className="running-eyebrow">{t('running.localAccess')}</span>
            <h1>{t('running.ready')}</h1>
            <p>{t('running.help')}</p>
          </div>

          <NetworkAccessPanel
            snapshot={snapshot}
            lanUrl={activeLanUrl}
            busy={busy === 'mobile-https'}
            onEnable={enableMobileHttps}
            onDisable={disableMobileHttps}
            onRotate={rotateMobileCa}
          />

          <button
            className="open-app-button"
            onClick={() => openActiveApp(active.frontendUrl)}
            title={settings.appMode ? t('appMode.open') : t('running.openBrowser')}
          >
            <span className="open-app-icon"><ExternalLink size={16} /></span>
            <span>{settings.appMode ? t('appMode.open') : t('running.openApp')}</span>
          </button>
          {settings.appMode && (
            <button
              type="button"
              className="mini-action open-browser-secondary"
              onClick={() => run('open browser', () => invoke('open_app', { url: active.frontendUrl }))}
            >
              <Globe size={12} /> {t('running.openBrowser')}
            </button>
          )}

          <div className="running-meta">
            <span>App v{snapshot.appVersion}</span>
            <span>{t('common.launcher')} v{snapshot.launcherVersion}</span>
            <span>{singlePort ? t('running.port', { port: active.backendPort }) : t('running.ports', { backend: active.backendPort, frontend: active.frontendPort })}</span>
          </div>

          <div className="running-actions" aria-label={t('running.controls')}>
            <button className="icon-action" onClick={() => { setDevTab(isStoreBuild ? 'logs' : 'settings'); setShowDevPanel(true); }} title={t('running.settings')} aria-label={t('running.settings')}>
              <SlidersHorizontal size={15} />
            </button>
            <button className="icon-action danger" onClick={doStop} title={t('running.stop')} aria-label={t('running.stop')}>
              <Power size={15} />
            </button>
          </div>
        </section>

        {showDevPanel && (
          <div className="modal-overlay" onClick={() => setShowDevPanel(false)}>
            <div className="modal-panel" onClick={e => e.stopPropagation()}>
              <DevPanelContent
                snapshot={snapshot} profiles={profiles} settings={settings} setSettings={setSettings}
                devTab={devTab} setDevTab={setDevTab} busy={busy} notice={t('running.active', { name: active.name })}
                onNotice={setNotice}
                onClose={() => setShowDevPanel(false)}
                onBackup={doBackup}
                onStop={doStop}
                updateResult={updateResult}
                checkingUpdates={checkingUpdates}
                updateProgress={updateProgress}
                updateNotice={updateNotice}
                onCheckUpdates={checkForUpdates}
                onTriggerUpdate={triggerUpdate}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ─── STATE 4: Stopped ─── */
  const startButtonLabel = stopped
    ? isStoreBuild ? t('setup.restartLocal') : t('setup.restart')
    : isStoreBuild ? t('setup.launchLocal') : t('setup.launch');

  return (
    <div className="splash-layout">
      <div className="splash-card">
        <div className="splash-logo-wrap">
          <img src={logoFull} alt="HomeInventory" className="splash-logo-full stopped" />
          <div className="logo-aura off" />
        </div>
        <p className="splash-subtitle dimmed">{stopped ? t('setup.servicesStopped') : t('setup.readyToLaunch')}</p>
        <span className="version-badge">{stopped ? t('common.offline') : t('common.ready')}</span>
        <div className="quick-row">
          <LanguageQuickPicker />
          <AppModeQuickToggle
            checked={settings.appMode}
            onChange={appMode => setSettings({ ...settings, appMode })}
          />
        </div>

        <div className="action-stack" style={{ marginTop: 24 }}>
          {renderPreLaunchUpdateCheck()}

          <button
            className="btn-primary"
            disabled={Boolean(busy) || checkingPorts || Boolean(updateProgress) || !selProfile || portBlocked}
            onClick={() => {
              if (projectRootBlocked) {
                chooseInstallFolder();
                return;
              }
              // Start always runs the installed version; updates are offered
              // separately and never replace this action.
              if (selProfile) doLaunch(selProfile);
            }}
          >
            {busy?.startsWith('start-') || checkingPorts ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
            {checkingPorts
              ? t('setup.checkingLocalPorts')
              : isStoreBuild
                  ? startButtonLabel
                  : projectRootBlocked
                    ? t('setup.chooseInstallFolder')
                    : existingHomeInventory
                      ? t('setup.openRunning')
                    : portBusy
                      ? (singlePort ? t('setup.launchOnPort', { port: launchBackendPort }) : t('setup.launchOn', { backend: launchBackendPort, frontend: launchFrontendPort }))
                      : startButtonLabel}
          </button>

          {visibleLaunchNotice && (
            <div className="launch-notice">
              <AlertCircle size={14} />
              <div className="launch-notice-body">
                <span>{visibleLaunchNotice}</span>
                {projectRootBlocked && (
                  <div className="launch-notice-actions">
                    <button type="button" className="mini-action" onClick={chooseInstallFolder}>
                      {t('setup.chooseInstallFolder')}
                    </button>
                    {settings.projectPath && (
                      <button type="button" className="mini-action" onClick={clearInstallFolder}>
                        {t('common.clear')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <AdvancedConfigPanel
            showAdvanced={showAdvanced} setShowAdvanced={setShowAdvanced}
            resendKey={resendKey} setResendKey={setResendKey}
            emailFrom={emailFrom} setEmailFrom={setEmailFrom}
            supportEmail={supportEmail} setSupportEmail={setSupportEmail}
            bootstrapAdminEmail={bootstrapAdminEmail} setBootstrapAdminEmail={setBootstrapAdminEmail}
            portApi={portApi} setPortApi={setPortApi}
            portUi={portUi} setPortUi={setPortUi}
            localIp={snapshot?.localIp}
            lanStatus={snapshot?.lanStatus}
            portCheck={portCheck}
            portMessage={portMessage}
            portBlocked={portStatusBlocked}
            storeBuild={isStoreBuild}
            singlePort={singlePort}
            randomPortBusy={busy === 'random-ports'}
            onChooseRandomPorts={chooseRandomPorts}
            onUseSuggestedPorts={() => {
              if (!portCheck) return;
              setPortApi(String(portCheck.suggestedBackendPort));
              setPortUi(String(portCheck.suggestedFrontendPort));
            }}
          />

          <button className="btn-outline" onClick={() => { setDevTab('logs'); setShowDevPanel(true); }}>
            <SlidersHorizontal size={13} /> {t('setup.developerTools')}
          </button>
        </div>

        <footer className="splash-footer center">
          <span>{singlePort ? `Local: ${launchBackendPort}` : `API: ${launchBackendPort} · UI: ${launchFrontendPort}`}</span>
        </footer>
      </div>

      {showDevPanel && (
        <div className="modal-overlay" onClick={() => setShowDevPanel(false)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <DevPanelContent
              snapshot={snapshot} profiles={profiles} settings={settings} setSettings={setSettings}
              devTab={devTab} setDevTab={setDevTab} busy={busy} notice={notice}
              onNotice={setNotice}
              onClose={() => setShowDevPanel(false)}
              onBackup={doBackup}
              updateResult={updateResult}
              checkingUpdates={checkingUpdates}
              updateProgress={updateProgress}
              updateNotice={updateNotice}
              onCheckUpdates={checkForUpdates}
              onTriggerUpdate={triggerUpdate}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Shared Advanced Config Panel ── */
export function AdvancedConfigPanel({
  showAdvanced, setShowAdvanced, resendKey, setResendKey,
  emailFrom, setEmailFrom, supportEmail, setSupportEmail,
  bootstrapAdminEmail, setBootstrapAdminEmail,
  portApi, setPortApi, portUi, setPortUi, localIp,
  lanStatus, portCheck, portMessage, portBlocked, storeBuild, singlePort, randomPortBusy,
  onChooseRandomPorts, onUseSuggestedPorts, embedded = false,
}: {
  showAdvanced: boolean; setShowAdvanced: (v: boolean) => void;
  resendKey: string; setResendKey: (v: string) => void;
  emailFrom: string; setEmailFrom: (v: string) => void;
  supportEmail: string; setSupportEmail: (v: string) => void;
  bootstrapAdminEmail: string; setBootstrapAdminEmail: (v: string) => void;
  portApi: string; setPortApi: (v: string) => void;
  portUi: string; setPortUi: (v: string) => void;
  localIp?: string | null;
  lanStatus?: LanAccessStatus | null;
  portCheck: PortCheckResult | null;
  portMessage: string;
  portBlocked: boolean;
  storeBuild: boolean;
  /** One port serves the app and the API (Store and production installs). */
  singlePort: boolean;
  randomPortBusy: boolean;
  onChooseRandomPorts: () => void;
  onUseSuggestedPorts: () => void;
  /** Inside the app window drawer: always open, network help lives elsewhere. */
  embedded?: boolean;
}) {
  const { t } = useLauncherI18n();
  const uiPort = singlePort ? portApi.trim() || '3001' : portUi.trim() || '5173';
  const lanUrl = lanStatus?.frontendUrl || (localIp ? `http://${localIp}:${uiPort}` : null);

  return (
    <>
      {!embedded && <div className="divider"><span>{t('advanced.title')}</span></div>}

      {!embedded && <button className="advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
        <ChevronRight size={12} className={`chevron ${showAdvanced ? 'open' : ''}`} />
        {t('advanced.configuration')}
      </button>}

      <div className={`collapse-panel ${showAdvanced || embedded ? 'open' : ''}`}>
        <div className="config-grid">
          <div className="guide-box">
            <div className="guide-title">
              <Info size={13} />
              <span>{t('advanced.whatMatters')}</span>
            </div>
            <ul>
              <li><strong>{t('advanced.emailLabel')}</strong> {t('advanced.emailHelp')}</li>
              <li><strong>{t('advanced.adminLabel')}</strong> {t('advanced.adminHelp')}</li>
              <li><strong>{t('advanced.networkLabel')}</strong> {storeBuild ? t('advanced.networkStore') : singlePort ? t('advanced.networkSingle') : t('advanced.networkDesktop')}</li>
            </ul>
          </div>

          {/* Email */}
          <div className="config-section">
            <div className="config-section-header">
              <Mail size={13} />
              <span>{t('advanced.emailDelivery')}</span>
              <span className="config-badge recommended">{t('common.recommended')}</span>
            </div>
            <div className="field">
              <label className="field-label">{t('advanced.resendKey')}</label>
              <input className="field-input" type="password" value={resendKey}
                onChange={e => setResendKey(e.target.value)} placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxx" />
              <span className="field-hint">
                {t('advanced.resendHelp')}
              </span>
            </div>
            <div className="field">
              <label className="field-label">{t('advanced.sender')}</label>
              <input className="field-input" value={emailFrom}
                onChange={e => setEmailFrom(e.target.value)} placeholder="HomeInventory <hello@your-domain.com>" />
              <span className="field-hint">
                {t('advanced.senderHelp')}
              </span>
            </div>
            <div className="field">
              <label className="field-label">{t('advanced.supportEmail')}</label>
              <input className="field-input" type="email" value={supportEmail}
                onChange={e => setSupportEmail(e.target.value)} placeholder="support@example.com" />
              <span className="field-hint">{t('advanced.supportHelp')}</span>
            </div>
          </div>

          {/* Instance env */}
          <div className="config-section">
            <div className="config-section-header">
              <Settings size={13} />
              <span>{t('advanced.instanceAdmin')}</span>
              <span className="config-badge recommended">{t('common.recommended')}</span>
            </div>
            <div className="field">
              <label className="field-label">{t('advanced.bootstrapAdmin')}</label>
              <input className="field-input" type="email" value={bootstrapAdminEmail}
                onChange={e => setBootstrapAdminEmail(e.target.value)} placeholder="admin@example.com" />
              <span className="field-hint">{t('advanced.bootstrapHelp')}</span>
            </div>
            <span className="field-hint">{t('advanced.envHelp')}</span>
          </div>

          {/* Ports */}
          <div className="config-section">
            <div className="config-section-header">
              <Globe size={13} />
              <span>{singlePort ? t('advanced.localPort') : t('advanced.networkPorts')}</span>
              <span className="config-badge required">{t('common.required')}</span>
            </div>
            <div className={singlePort ? '' : 'row-2'}>
              <div className="field">
                <label className="field-label">{singlePort ? t('advanced.localPort') : t('advanced.apiPort')}</label>
                <input className={`field-input ${portBlocked && !portCheck?.backendOk ? 'invalid' : ''}`}
                  type="number" inputMode="numeric" min={1024} max={65535} value={portApi}
                  onChange={e => setPortApi(sanitizePortInput(e.target.value))} placeholder="3001" />
              </div>
              {!singlePort && (
                <div className="field">
                  <label className="field-label">{t('advanced.uiPort')}</label>
                  <input className={`field-input ${portBlocked && !portCheck?.frontendOk ? 'invalid' : ''}`}
                    type="number" inputMode="numeric" min={1024} max={65535} value={portUi}
                    onChange={e => setPortUi(sanitizePortInput(e.target.value))} placeholder="5173" />
                </div>
              )}
            </div>
            <span className="field-hint">{singlePort ? t('advanced.storePortHelp') : t('advanced.desktopPortHelp')}</span>
            <button type="button" className="mini-action random-port-action" onClick={onChooseRandomPorts} disabled={randomPortBusy}>
              {randomPortBusy ? <Loader2 size={12} className="spin" /> : <Shuffle size={12} />}
              {singlePort ? t('advanced.randomPort') : t('advanced.randomPorts')}
            </button>
            <div className={`port-status ${portBlocked ? 'blocked' : 'ok'}`}>
              <span>{portMessage}</span>
              {portBlocked && portCheck && (
                <button type="button" className="mini-action" onClick={onUseSuggestedPorts}>
                  {singlePort ? t('advanced.usePort', { port: portCheck.suggestedBackendPort }) : t('advanced.usePorts', { backend: portCheck.suggestedBackendPort, frontend: portCheck.suggestedFrontendPort })}
                </button>
              )}
            </div>
          </div>

          {/* LAN Access Guide + QR */}
          {!embedded && <div className="tip-box">
            <div className="tip-header">
              <Wifi size={13} />
              <span>{t('advanced.otherDevices')}</span>
            </div>
            <ol className="tip-steps">
              <li>{t('advanced.sameWifiPrefix')} <strong>{t('advanced.sameWifi')}</strong>.</li>
              <li>{t('advanced.firewall')}</li>
            </ol>
            {lanStatus && (
              <div className={`lan-status ${lanStatus.ok ? 'ok' : 'blocked'}`}>
                <Wifi size={12} />
                <span>{localizedLanMessage(lanStatus, t)}</span>
              </div>
            )}
            {lanUrl ? (
              <div className="qr-section">
                <QrCodeCard url={lanUrl} size={224} logoSrc={logoSymbolLight} logoSvg={logoSymbolLightSvg} />
              </div>
            ) : (
              <>
                <code className="lan-url">http://&lt;your-ip&gt;:{uiPort}</code>
                <div className="tip-note">
                  <Info size={11} />
                  <span>{t('advanced.findIp')}</span>
                </div>
              </>
            )}
          </div>}

        </div>
      </div>
    </>
  );
}

/* ── Shared Dev Panel ── */
/* LAN address and optional mobile HTTPS: shown by the classic launcher and
 * by the app window sidebar. */
export function NetworkAccessPanel({ snapshot, lanUrl, busy, onEnable, onDisable, onRotate }: {
  snapshot: LauncherSnapshot;
  lanUrl: string;
  busy: boolean;
  onEnable: () => void;
  onDisable: () => void;
  onRotate: () => void;
}) {
  const { t } = useLauncherI18n();
  const [androidGuideBrand, setAndroidGuideBrand] = useState<AndroidGuideBrand>('samsung');
  const androidCertificateGuides = useMemo<Record<AndroidGuideBrand, { label: string; path: string }>>(() => ({
    samsung: { label: t('android.samsung'), path: t('android.samsungPath') },
    pixel: { label: t('android.pixel'), path: t('android.pixelPath') },
    other: { label: t('android.other'), path: t('android.otherPath') },
  }), [t]);

  return (
    <>
      <div className="running-qr">
        <span className="running-qr-label">{t('running.standardLan')}</span>
        <QrCodeCard url={lanUrl} size={220} logoSrc={logoSymbolLight} logoSvg={logoSymbolLightSvg} />
        <div className={`lan-status ${snapshot.lanStatus?.ok ? 'ok' : 'blocked'}`}>
          <Wifi size={12} />
          <span>{snapshot.lanStatus ? localizedLanMessage(snapshot.lanStatus, t) : t('running.lanPending')}</span>
        </div>
      </div>

      {snapshot.httpsStatus ? (
        <section className="mobile-https-card" aria-label={t('https.setupLabel')}>
          <div className="mobile-https-heading">
            <span className="mobile-https-icon"><ShieldCheck size={16} /></span>
            <div>
              <strong>{t('https.title')}</strong>
              <span>{t('https.subtitle')}</span>
            </div>
          </div>

          <div className="mobile-https-step-title">
            <strong>{t('https.installTitle')}</strong>
            <span>{t('https.choosePlatform')}</span>
          </div>
          <div className="mobile-https-qr-grid">
            <div className="mobile-https-qr">
              <span>{t('https.ios')}</span>
              <QrCodeCard url={snapshot.httpsStatus.iosEnrollmentUrl} size={220} logoSrc={logoSymbolLight} logoSvg={logoSymbolLightSvg} />
              <small>{t('https.iosHelp')}</small>
            </div>
            <div className="mobile-https-qr">
              <span>{t('https.android')}</span>
              <QrCodeCard url={snapshot.httpsStatus.androidEnrollmentUrl} size={220} logoSrc={logoSymbolLight} logoSvg={logoSymbolLightSvg} />
              <div className="certificate-download-notice">
                <Download size={13} />
                <p>{t('https.downloadPrefix')} <strong>HomeInventory-Local-CA.crt</strong>, {t('https.downloadSuffix')}</p>
              </div>
              <label className="android-guide-picker">
                <span>{t('https.phoneBrand')}</span>
                <select
                  value={androidGuideBrand}
                  onChange={event => setAndroidGuideBrand(event.target.value as AndroidGuideBrand)}
                >
                  {Object.entries(androidCertificateGuides).map(([value, guide]) => (
                    <option key={value} value={value}>{guide.label}</option>
                  ))}
                </select>
              </label>
              <ol className="android-guide-steps">
                <li>{t('https.scanDownload')}</li>
                <li><span>{t('https.typicalPath')}</span> {androidCertificateGuides[androidGuideBrand].path}</li>
                <li>{t('https.finishInstall')} <strong>{t('https.openSecureApp')}</strong>.</li>
              </ol>
              <small>{t('https.menuVariation')}</small>
            </div>
            <div className="mobile-https-qr secure-app-qr">
              <span>{t('https.openSecureApp')}</span>
              <QrCodeCard url={snapshot.httpsStatus.httpsUrl} size={220} logoSrc={logoSymbolLight} logoSvg={logoSymbolLightSvg} />
              <small>{t('https.secureHelp')}</small>
            </div>
          </div>

          <div className="mobile-https-identity">
            <span><strong>CA:</strong> {snapshot.httpsStatus.caName}</span>
            <code title={snapshot.httpsStatus.caFingerprint}>{snapshot.httpsStatus.caFingerprint}</code>
            <small>{t('https.linksExpire')}</small>
          </div>
          <div className="mobile-https-actions">
            <button type="button" className="settings-action" onClick={onEnable} disabled={busy}>
              <RefreshCw size={13} /> {t('https.refreshLinks')}
            </button>
            <button type="button" className="settings-action danger" onClick={onDisable} disabled={busy}>
              <Power size={13} /> {t('https.disable')}
            </button>
            <button type="button" className="settings-action danger wide" onClick={onRotate} disabled={busy}>
              <RotateCcw size={13} /> {t('https.rotate')}
            </button>
          </div>
          <small className="mobile-https-removal">{t('https.removal')}</small>
        </section>
      ) : (
        <section className="mobile-https-card mobile-https-compact" aria-label={t('https.optionalLabel')}>
          <div className="mobile-https-heading">
            <span className="mobile-https-icon"><Smartphone size={16} /></span>
            <div>
              <strong>{t('https.wantCamera')}</strong>
              <span>{t('https.oneTimeSetup')}</span>
            </div>
          </div>
          <button type="button" className="btn-secondary mobile-https-enable" onClick={onEnable} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
            {t('https.enable')}
          </button>
          <small>{t('https.normalRemains')}</small>
        </section>
      )}
    </>
  );
}

export function DevPanelContent({
  snapshot, profiles, settings, setSettings, devTab, setDevTab, busy, notice,
  onNotice, onClose, onBackup, onStop,
  updateResult, checkingUpdates, updateProgress, updateNotice, onCheckUpdates, onTriggerUpdate, embedded = false,
}: {
  snapshot: LauncherSnapshot; profiles: ProfileStatus[];
  settings: LauncherSettings; setSettings: (s: LauncherSettings) => void;
  devTab: ViewKey; setDevTab: (t: ViewKey) => void;
  busy: string | null; notice: string;
  onNotice: (message: string, tone?: 'success' | 'error') => void;
  onClose: () => void; onBackup: (p: ProfileStatus) => Promise<BackupResult>; onStop?: () => void;
  updateResult: UpdateCheckResult | null;
  checkingUpdates: boolean;
  updateProgress: { state: string; message: string; progress: number; error?: string | null } | null;
  updateNotice: string;
  onCheckUpdates: () => Promise<void>;
  onTriggerUpdate: () => Promise<void>;
  /** Inside the app window drawer, which brings its own header and tabs. */
  embedded?: boolean;
}) {
  const { locale, setLocale, t } = useLauncherI18n();
  const isStoreBuild = snapshot.storeBuild;
  const nodeTool = snapshot.tools.find(tool => tool.name === 'Node.js');
  const npmTool = snapshot.tools.find(tool => tool.name === 'npm');
  const updatesAvailable = Boolean(updateResult?.appUpdateAvailable || updateResult?.launcherUpdateAvailable);
  const nodeUpgradeRequired = Boolean(updateResult?.requiredActions.includes('nodeMajorUpgrade'));
  const [backupResults, setBackupResults] = useState<Record<string, BackupResult>>({});

  const handleBackup = async (profile: ProfileStatus) => {
    try {
      const result = await onBackup(profile);
      setBackupResults(current => ({ ...current, [profile.id]: result }));
      onNotice(result.message, 'success');
    } catch (err) {
      onNotice(err instanceof Error ? err.message : String(err));
    }
  };

  const chooseSettingPath = async (kind: PathKind) => {
    if (!hasTauriRuntime()) {
      onNotice(t('status.pathPickerDesktop'));
      return;
    }
    try {
      const selected = await invoke<string | null>('choose_path', { request: { kind } });
      if (!selected) return;
      if (kind === 'project') setSettings({ ...settings, projectPath: selected });
      if (kind === 'node') setSettings({ ...settings, nodePath: selected });
      if (kind === 'npm') setSettings({ ...settings, npmPath: selected });
      onNotice(t('status.pathUpdated'));
    } catch (err) {
      onNotice(err instanceof Error ? err.message : String(err));
    }
  };

  const revealSettingPath = async (path: string, label: string) => {
    if (!path.trim()) {
      onNotice(t('status.pathEmpty', { label }));
      return;
    }
    if (!hasTauriRuntime()) {
      onNotice(t('status.folderRevealDesktop'));
      return;
    }
    try {
      const result = await invoke<CommandResult>('reveal_path', { path });
      onNotice(isCmd(result) ? result.message : t('status.pathOpened', { label }));
    } catch (err) {
      onNotice(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      {!embedded && <header className="modal-header">
        <div className="modal-header-left">
          <Archive size={15} className="accent-icon" />
          <h3>{t('dev.console')}</h3>
        </div>
        <button className="close-x" onClick={onClose} aria-label={t('common.close')}>✕</button>
      </header>}

      {!embedded && <nav className="modal-tabs">
        <button className={devTab === 'logs' ? 'active' : ''} onClick={() => setDevTab('logs')}>{t('dev.logs')}</button>
        <button className={devTab === 'backups' ? 'active' : ''} onClick={() => setDevTab('backups')}>{t('dev.backups')}</button>
        <button className={devTab === 'settings' ? 'active' : ''} onClick={() => setDevTab('settings')}>{t('dev.settings')}</button>
        {!isStoreBuild && <button className={devTab === 'updates' ? 'active' : ''} onClick={() => setDevTab('updates')}>{t('dev.updates')}</button>}
      </nav>}

      <div className="modal-body">
        {devTab === 'logs' && <div className="tab-logs"><LogConsole logs={snapshot.logs} /></div>}

        {!isStoreBuild && devTab === 'updates' && (
          <div className="tab-updates">
            <p className="tab-description">{t('update.manage')}</p>

            {checkingUpdates && (
              <div className="backup-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <Loader2 size={20} className="spin" style={{ marginRight: 8 }} />
                <span>{t('update.checkingForUpdates')}</span>
              </div>
            )}

            {!checkingUpdates && updateProgress && (
              <div className="update-status-card">
                <div className="update-progress-section">
                  <div className="update-progress-header">
                    <span className="progress-state-badge">{localizedUpdateState(updateProgress.state, t)}</span>
                    <span className="progress-message">{updateProgress.message}</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${Math.round(updateProgress.progress * 100)}%` }} />
                  </div>
                  <div className="progress-pct">{Math.round(updateProgress.progress * 100)}%</div>
                </div>
              </div>
            )}

            {!checkingUpdates && !updateProgress && updateResult && (
              <div className="update-status-card">
                <div className="version-info-grid">
                  <div className="version-info-item">
                    <span className="version-info-label">{t('common.managedApp')}</span>
                    <span className="version-info-value">
                      v{updateResult.currentAppVersion}
                      {updateResult.appUpdateAvailable && (
                        <span style={{ fontSize: 11, color: '#e74c3c', marginLeft: 6 }}>{t('update.toVersion', { version: updateResult.latestAppVersion })}</span>
                      )}
                    </span>
                  </div>
                  <div className="version-info-item">
                    <span className="version-info-label">{t('common.launcher')}</span>
                    <span className="version-info-value">
                      v{updateResult.currentLauncherVersion}
                      {updateResult.launcherUpdateAvailable && (
                        <span style={{ fontSize: 11, color: '#e74c3c', marginLeft: 6 }}>{t('update.toVersion', { version: updateResult.latestLauncherVersion })}</span>
                      )}
                    </span>
                  </div>
                </div>

                {updateResult.requiredActions.includes('nodeMajorUpgrade') && (
                  <div className="error-box" style={{ margin: 0 }}>
                    <AlertCircle size={16} />
                    <div>
                      <strong>{t('update.nodeRequired')}</strong>
                      <p>{t('update.nodeRequiredBody', { version: updateResult.appReleaseNotes?.match(/Node\.js >= v(\d+)/)?.[1] || '20' })}</p>
                    </div>
                  </div>
                )}

                {updateResult.appReleaseNotes && (
                  <div className="release-notes-box">
                    <h4>{t('update.appReleaseNotes')}</h4>
                    <div className="release-notes-content">{updateResult.appReleaseNotes}</div>
                  </div>
                )}

                {updateResult.launcherReleaseNotes && (
                  <div className="release-notes-box">
                    <h4>{t('update.launcherReleaseNotes')}</h4>
                    <div className="release-notes-content">{updateResult.launcherReleaseNotes}</div>
                  </div>
                )}

                {!updatesAvailable && (
                  <div className="success-box">
                    <CheckCircle2 size={16} className="text-success" />
                    <div>
                      <strong>{t('update.softwareCurrent')}</strong>
                      <p>{t('update.latestVersions')}</p>
                    </div>
                  </div>
                )}

                <div className="update-actions-section">
                  {updatesAvailable && (
                    <button
                      className="btn-primary"
                      onClick={onTriggerUpdate}
                      disabled={nodeUpgradeRequired || busy === 'update'}
                    >
                      {busy === 'update' ? <Loader2 size={13} className="spin" /> : <Download size={13} />}
                      {t('update.updateHomeInventory')}
                    </button>
                  )}
                  <button className="btn-secondary" onClick={onCheckUpdates} disabled={checkingUpdates || busy === 'update'}>
                    <RefreshCw size={12} className={checkingUpdates ? 'spin' : ''} />
                    {t('common.checkAgain')}
                  </button>
                </div>
              </div>
            )}

            {!checkingUpdates && !updateProgress && !updateResult && !updateNotice && (
              <div className="update-status-card">
                <div className="update-guidance-box">
                  <Info size={16} />
                  <div>
                    <strong>{t('update.checkBeforeInstalling')}</strong>
                    <p>{t('update.checkExplanation')}</p>
                  </div>
                </div>
                <div className="update-actions-section">
                  <button className="btn-primary" onClick={onCheckUpdates} disabled={checkingUpdates}>
                    <RefreshCw size={13} className={checkingUpdates ? 'spin' : ''} />
                    {t('update.checkForUpdates')}
                  </button>
                </div>
              </div>
            )}

            {!checkingUpdates && !updateProgress && updateNotice && !updateResult && (
              <div className="update-status-card">
                <div className="version-info-grid">
                  <div className="version-info-item">
                    <span className="version-info-label">{t('common.managedApp')}</span>
                    <span className="version-info-value">v{snapshot.appVersion}</span>
                  </div>
                  <div className="version-info-item">
                    <span className="version-info-label">{t('common.launcher')}</span>
                    <span className="version-info-value">v{snapshot.launcherVersion}</span>
                  </div>
                </div>
                <div className="update-guidance-box unavailable">
                  <Info size={16} />
                  <div>
                    <strong>{t('update.temporarilyUnavailable')}</strong>
                    <p>{updateNotice}</p>
                  </div>
                </div>
                <button className="btn-secondary update-check-inline" onClick={onCheckUpdates} disabled={checkingUpdates}>
                  <RefreshCw size={12} className={checkingUpdates ? 'spin' : ''} />
                  {t('common.checkAgain')}
                </button>
              </div>
            )}
          </div>
        )}

        {devTab === 'backups' && (
          <div>
            <p className="tab-description">{t('dev.backupDescription')}</p>
            <div className="backup-actions">
              {profiles.map(p => (
                <div className="backup-card" key={p.id}>
                  <strong>{p.name}</strong>
                  <span className="path-text">{p.dbPath}</span>
                  {backupResults[p.id] && (
                    <div className="backup-result">
                      <CheckCircle2 size={13} />
                      <span>{backupResults[p.id].path}</span>
                    </div>
                  )}
                  <button className="btn-secondary" onClick={() => handleBackup(p)} disabled={busy === 'backup' || !p.available}>
                    {busy === 'backup' ? <Loader2 size={13} className="spin" /> : <FolderArchive size={13} />}
                    {busy === 'backup' ? t('dev.backingUp') : t('dev.backupNow')}
                  </button>
                  {backupResults[p.id] && (
                    <button className="btn-secondary" onClick={() => revealSettingPath(backupResults[p.id].path, 'Backup')}>
                      <FolderOpen size={13} />
                      {t('dev.openBackup')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {devTab === 'settings' && (
          <div className="tab-settings">
            <section className="language-settings-card" aria-label={t('language.label')}>
              <div className="language-settings-heading">
                <span className="language-settings-icon"><Globe size={15} /></span>
                <div>
                  <strong>{t('language.launcherLanguage')}</strong>
                  <span>{t('language.savedHelp')}</span>
                </div>
              </div>
              <div className="language-options" role="radiogroup" aria-label={t('language.label')}>
                {LANGUAGE_OPTIONS.map(option => (
                  <button
                    key={option.code}
                    type="button"
                    className={locale === option.code ? 'active' : ''}
                    role="radio"
                    aria-checked={locale === option.code}
                    onClick={() => setLocale(option.code)}
                    title={option.label}
                  >
                    <span>{option.code.split('-')[0].toUpperCase()}</span>
                    <small>{option.label}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="language-settings-card app-mode-card" aria-label={t('appMode.title')}>
              <label className="app-mode-toggle">
                <input
                  type="checkbox"
                  checked={settings.appMode}
                  onChange={event => setSettings({ ...settings, appMode: event.target.checked })}
                />
                <span>
                  <strong>{t('appMode.title')}</strong>
                  <small>{t('appMode.toggleHelp')}</small>
                </span>
              </label>
            </section>

            {!isStoreBuild && <>
              <PathSettingField
                label={t('dev.installFolder')}
                value={settings.projectPath}
                placeholder={snapshot.projectRoot}
                onChange={v => setSettings({ ...settings, projectPath: v })}
                onChoose={() => chooseSettingPath('project')}
                onOpen={() => revealSettingPath(settings.projectPath || snapshot.projectRoot, 'Install folder')}
                onReset={() => setSettings({ ...settings, projectPath: '' })}
                hint={t('dev.installFolderHelp')}
              />
              <PathSettingField
                label={t('dev.nodePath')}
                value={settings.nodePath}
                placeholder={nodeTool?.path || t('dev.autoDetected')}
                onChange={v => setSettings({ ...settings, nodePath: v })}
                onChoose={() => chooseSettingPath('node')}
                onOpen={() => revealSettingPath(settings.nodePath || nodeTool?.path || '', 'Node')}
                onReset={() => setSettings({ ...settings, nodePath: '' })}
                hint={nodeTool?.path ? t('common.detected', { path: nodeTool.path }) : t('dev.nodePathHelp')}
              />
              <PathSettingField
                label={t('dev.npmPath')}
                value={settings.npmPath}
                placeholder={npmTool?.path || t('dev.autoDetected')}
                onChange={v => setSettings({ ...settings, npmPath: v })}
                onChoose={() => chooseSettingPath('npm')}
                onOpen={() => revealSettingPath(settings.npmPath || npmTool?.path || '', 'npm')}
                onReset={() => setSettings({ ...settings, npmPath: '' })}
                hint={npmTool?.path ? t('common.detected', { path: npmTool.path }) : t('dev.npmPathHelp')}
              />
              <div className="settings-actions">
                <button className="settings-action" onClick={() => revealSettingPath(snapshot.projectRoot, 'Install folder')}>
                  <FolderOpen size={13} /> {t('dev.openFolder')}
                </button>
                <button className="settings-action" onClick={() => revealSettingPath(snapshot.appDataDir, 'Launcher data')}>
                  <FolderOpen size={13} /> {t('dev.openData')}
                </button>
                <button className="settings-action wide" onClick={() => {
                  setSettings({ ...settings, nodePath: '', npmPath: '' });
                  onNotice(t('status.nodeOverridesCleared'));
                }}>
                  <RotateCcw size={13} /> {t('dev.resetDetection')}
                </button>
              </div>
              <div className="settings-info"><CircleDot size={11} /><span>{snapshot.appDataDir}</span></div>
            </>}
          </div>
        )}
      </div>

      {!embedded && <footer className="modal-footer">
        {onStop && <button className="btn-danger" onClick={onStop}><Power size={13} /> {t('dev.stopServer')}</button>}
        <span className="notice-text">{notice}</span>
      </footer>}
    </>
  );
}

/* ── Small components ── */

function PathSettingField({ label, value, placeholder, hint, onChange, onChoose, onOpen, onReset }: {
  label: string;
  value: string;
  placeholder: string;
  hint: string;
  onChange: (v: string) => void;
  onChoose: () => void;
  onOpen: () => void;
  onReset: () => void;
}) {
  const { t } = useLauncherI18n();
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="path-control">
        <input className="field-input" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
        <span className="path-buttons">
          <button type="button" className="icon-mini" onClick={onChoose} title={t('dev.choosePath')} aria-label={t('dev.choosePath')}>
            <FolderOpen size={14} />
          </button>
          <button type="button" className="icon-mini" onClick={onOpen} title={t('dev.openLocation')} aria-label={t('dev.openLocation')}>
            <ExternalLink size={14} />
          </button>
          <button type="button" className="icon-mini" onClick={onReset} title={t('dev.useDetectedPath')} aria-label={t('dev.useDetectedPath')}>
            <RotateCcw size={14} />
          </button>
        </span>
      </span>
      <span className="field-hint">{hint}</span>
    </label>
  );
}

/* ── Mock data for browser preview ── */
export function mockSnapshot(settings: LauncherSettings, t: Translate): LauncherSnapshot {
  const root = settings.projectPath || '/Users/demo/HomeInventory';
  const data = '/Users/demo/Library/Application Support/net.homeinventory.launcher';
  const runningPreview = new URLSearchParams(window.location.search).get('preview') === 'running';
  return {
    launcherVersion: LAUNCHER_VERSION,
    appVersion: LAUNCHER_VERSION,
    appSource: settings.projectPath ? 'custom' : 'development',
    bundledSyncRequired: false,
    runMode: 'development',
    distribution: 'standard',
    storeBuild: false,
    projectRoot: root, appDataDir: data, activeProfileId: runningPreview ? 'homeinventory' : null,
    httpsStatus: runningPreview && settings.mobileHttps ? {
      enabled: true,
      httpsPort: 5443,
      enrollmentPort: 5444,
      httpsUrl: 'https://192.168.1.42:5443',
      iosEnrollmentUrl: 'http://192.168.1.42:5444/enroll/preview/ios.mobileconfig',
      androidEnrollmentUrl: 'http://192.168.1.42:5444/enroll/preview/android.crt',
      caName: 'HomeInventory Local CA PREVIEW',
      caFingerprint: 'AA:BB:CC:DD:EE:FF',
      enrollmentExpiresAt: Math.floor(Date.now() / 1000) + 600,
      certificateExpiresAt: Math.floor(Date.now() / 1000) + 89 * 24 * 60 * 60,
      localIp: '192.168.1.42',
    } : null,
    lanStatus: runningPreview ? {
      ok: true,
      frontendOk: true,
      backendOk: true,
      frontendUrl: 'http://192.168.1.42:5173',
      backendUrl: 'http://192.168.1.42:3001',
      message: t('status.networkReady'),
    } : null,
    tools: [
      { name: 'Node.js', path: '/usr/local/bin/node', ok: true, detail: 'Ready' },
      { name: 'npm', path: '/usr/local/bin/npm', ok: true, detail: 'Ready' },
    ],
    setup: {
      node: true,
      npm: true,
      projectRootValid: true,
      projectRootInstallable: false,
      rootDependencies: runningPreview,
      clientDependencies: runningPreview,
      envFile: runningPreview,
    },
    localIp: '192.168.1.42',
    profiles: [{
      id: 'homeinventory', name: 'HomeInventory', description: 'Default', available: true, running: runningPreview,
      backendPort: 3001, frontendPort: 5173,
      frontendUrl: 'http://localhost:5173', backendUrl: 'http://localhost:3001',
      dataDir: `${data}/profiles/homeinventory/data`, dbPath: `${data}/profiles/homeinventory/data/inventory.db`,
      uploadsDir: `${data}/profiles/homeinventory/uploads`, brandAssets: false,
    }],
    logs: [
      { timestamp: 1, source: 'system', level: 'success', message: 'Client loaded.' },
      { timestamp: 2, source: 'system', level: 'info', message: 'Environment checked.' },
    ],
  };
}
