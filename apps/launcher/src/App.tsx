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
import {
  LANGUAGE_OPTIONS,
  LauncherI18nProvider,
  useLauncherI18n,
  type Translate,
} from './i18n';

/* ── Types ── */
type ViewKey = 'logs' | 'backups' | 'settings' | 'updates';

type ToolStatus = { name: string; path?: string | null; ok: boolean; detail: string };

type SetupStatus = {
  node: boolean; npm: boolean;
  projectRootValid: boolean;
  projectRootInstallable: boolean;
  rootDependencies: boolean; clientDependencies: boolean; envFile: boolean;
};

type ProfileStatus = {
  id: string; name: string; description: string; available: boolean; running: boolean;
  backendPort: number; frontendPort: number; frontendUrl: string; backendUrl: string;
  dataDir: string; dbPath: string; uploadsDir: string; brandAssets: boolean;
};

type LogEntry = { timestamp: number; source: string; level: string; message: string };

type LanAccessStatus = {
  ok: boolean;
  frontendOk: boolean;
  backendOk: boolean;
  frontendUrl?: string | null;
  backendUrl?: string | null;
  message: string;
};

type HttpsStatus = {
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

type LauncherSnapshot = {
  projectRoot: string; appDataDir: string; localIp?: string | null;
  tools: ToolStatus[]; setup: SetupStatus; profiles: ProfileStatus[];
  activeProfileId?: string | null; lanStatus?: LanAccessStatus | null; logs: LogEntry[];
  launcherVersion: string;
  appVersion: string;
  appSource: 'managed' | 'custom' | 'store' | 'development' | 'missing';
  bundledSyncRequired: boolean;
  distribution: string;
  storeBuild: boolean;
  httpsStatus?: HttpsStatus | null;
};

type UpdateCheckResult = {
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

type CommandResult = { ok: boolean; message: string };
type BackupResult = CommandResult & { path: string };

type PortCheckResult = {
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

type SuggestedPorts = { backendPort: number; frontendPort: number };

type LauncherSettings = {
  projectPath: string; nodePath: string; npmPath: string; autoOpen: boolean; mobileHttps: boolean;
};

type PathKind = 'project' | 'node' | 'npm';
type AndroidGuideBrand = 'samsung' | 'pixel' | 'other';

const LAUNCHER_VERSION = launcherPackage.version;

const defaultSettings: LauncherSettings = {
  projectPath: '', nodePath: '', npmPath: '', autoOpen: true, mobileHttps: false,
};

const hasTauriRuntime = () =>
  Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

function loadSettings(): LauncherSettings {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem('hi-settings') || '{}') };
  } catch { return defaultSettings; }
}

function saveSettings(s: LauncherSettings) {
  localStorage.setItem('hi-settings', JSON.stringify(s));
}

function overrides(s: LauncherSettings) {
  return { projectPath: s.projectPath || null, nodePath: s.nodePath || null, npmPath: s.npmPath || null };
}

function isCmd(v: unknown): v is CommandResult {
  return Boolean(v && typeof v === 'object' && 'message' in v);
}

function sanitizePortInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 5);
}

function parsePort(value: string, fallback: number) {
  const normalized = sanitizePortInput(value);
  if (!normalized) return fallback;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validatePortInputs(apiPort: string, uiPort: string, profile: ProfileStatus | null, t: Translate) {
  if (!profile) return t('status.noProfile');
  const backendPort = parsePort(apiPort, profile.backendPort);
  const frontendPort = parsePort(uiPort, profile.frontendPort);
  if (backendPort < 1024 || backendPort > 65535) return t('status.apiPortRange');
  if (frontendPort < 1024 || frontendPort > 65535) return t('status.uiPortRange');
  if (backendPort === frontendPort) return t('status.portsDifferent');
  return '';
}

function localizedPortMessage(status: PortCheckResult | null, t: Translate) {
  if (!status) return t('status.portsAvailable');
  if (status.existingHomeInventory) return t('status.existingInstance');
  if (status.ok) return t('status.portsAvailable');
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

function LanguageQuickPicker() {
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
          <option key={option.code} value={option.code}>{t(option.labelKey)}</option>
        ))}
      </select>
      <ChevronDown size={13} aria-hidden="true" />
    </label>
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
  const [androidGuideBrand, setAndroidGuideBrand] = useState<AndroidGuideBrand>('samsung');
  const androidCertificateGuides = useMemo<Record<AndroidGuideBrand, { label: string; path: string }>>(() => ({
    samsung: { label: t('android.samsung'), path: t('android.samsungPath') },
    pixel: { label: t('android.pixel'), path: t('android.pixelPath') },
    other: { label: t('android.other'), path: t('android.otherPath') },
  }), [t]);

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
  const [bundledSyncStarted, setBundledSyncStarted] = useState(false);
  const [bundledSyncRetryAvailable, setBundledSyncRetryAvailable] = useState(false);
  const bundledSyncStartedRef = useRef(false);
  const bundledSyncInFlightRef = useRef(false);
  const httpsActivationRef = useRef(false);

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
      bundledSyncStartedRef.current
      || !updateListenerReady
      || !hasTauriRuntime()
      || !snapshot?.bundledSyncRequired
      || snapshot.appSource !== 'managed'
      || snapshot.storeBuild
      || snapshot.activeProfileId
      || settings.projectPath.trim()
      || bundledSyncRetryAvailable
    ) {
      return;
    }

    const managedProfile = snapshot.profiles.find(profile => profile.id === 'homeinventory')
      || snapshot.profiles[0];
    if (!managedProfile || validatePortInputs(portApi, portUi, managedProfile, t)) {
      return;
    }
    const requestedBackendPort = parsePort(portApi, managedProfile.backendPort);
    const requestedFrontendPort = parsePort(portUi, managedProfile.frontendPort);
    const portCheckIsCurrent = portCheck
      && portCheck.backendPort === requestedBackendPort
      && portCheck.frontendPort === requestedFrontendPort;
    if (!portCheckIsCurrent) {
      return;
    }

    const pauseBundledSync = (message: string) => {
      bundledSyncStartedRef.current = true;
      bundledSyncInFlightRef.current = false;
      setBundledSyncStarted(true);
      setBundledSyncRetryAvailable(true);
      setUpdateNotice(message);
      setUpdateProgress(null);
      setBusy(null);
    };

    if (portCheck.existingHomeInventory) {
      pauseBundledSync(
        `${portCheck.message} Stop the running instance, then choose Retry Sync.`,
      );
      return;
    }

    if (
      !portCheck.ok
      && portCheck.suggestedBackendPort === requestedBackendPort
      && portCheck.suggestedFrontendPort === requestedFrontendPort
    ) {
      pauseBundledSync(
        portCheck.message || t('update.previousAvailable'),
      );
      return;
    }

    const backendPort = portCheck.ok
      ? requestedBackendPort
      : portCheck.suggestedBackendPort;
    const frontendPort = portCheck.ok
      ? requestedFrontendPort
      : portCheck.suggestedFrontendPort;
    const suggestedPortError = validatePortInputs(
      String(backendPort),
      String(frontendPort),
      managedProfile,
      t,
    );
    if (suggestedPortError) {
      pauseBundledSync(suggestedPortError);
      return;
    }

    bundledSyncStartedRef.current = true;
    bundledSyncInFlightRef.current = true;
    setBundledSyncStarted(true);
    setUpdateNotice('');
    setBusy('bundled-sync');
    setUpdateProgress({
      state: 'Starting',
      message: t('setup.installing'),
      progress: 0.01,
    });
    invoke<CommandResult>('sync_bundled_managed_app', {
      request: {
        overrides: overrides(settings),
        backendPort,
        frontendPort,
      },
    }).catch((err) => {
      bundledSyncInFlightRef.current = false;
      setBundledSyncRetryAvailable(true);
      setUpdateNotice(err instanceof Error ? err.message : String(err));
      setUpdateProgress(null);
      setBusy(null);
      refresh();
    });
  }, [
    bundledSyncRetryAvailable,
    bundledSyncStarted,
    portApi,
    portCheck,
    portUi,
    refresh,
    settings,
    snapshot?.activeProfileId,
    snapshot?.appSource,
    snapshot?.bundledSyncRequired,
    snapshot?.profiles,
    snapshot?.storeBuild,
    updateListenerReady,
  ]);

  const retryBundledSync = () => {
    bundledSyncStartedRef.current = false;
    bundledSyncInFlightRef.current = false;
    setBundledSyncStarted(false);
    setBundledSyncRetryAvailable(false);
    setUpdateNotice('');
    setUpdateResult(null);
    setUpdateProgress(null);
    setBusy(null);
    setPortCheck(null);
    setPortCheckRevision(current => current + 1);
  };

  useEffect(() => {
    if (
      initialUpdateCheckStarted
      || !updateListenerReady
      || !hasTauriRuntime()
      || !snapshot
      || snapshot.storeBuild
      || snapshot.activeProfileId
      || busy === 'bundled-sync'
      || Boolean(updateProgress)
      || (snapshot.bundledSyncRequired && !bundledSyncStarted)
      || bundledSyncRetryAvailable
    ) {
      return;
    }

    setInitialUpdateCheckStarted(true);
    checkForUpdates();
  }, [
    bundledSyncRetryAvailable,
    bundledSyncStarted,
    busy,
    initialUpdateCheckStarted,
    snapshot?.activeProfileId,
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
  const selectedFrontendPort = selProfile ? parsePort(portUi, selProfile.frontendPort) : 5173;
  const portInputError = useMemo(() => {
    if (!isStoreBuild) return validatePortInputs(portApi, portUi, selProfile, t);
    if (!selProfile) return t('status.noProfile');
    const backendPort = parsePort(portApi, selProfile.backendPort);
    if (backendPort < 1024 || backendPort > 65535) return t('status.localPortRange');
    return '';
  }, [isStoreBuild, portApi, portUi, selProfile, t]);
  const existingHomeInventory = Boolean(portCheck?.existingHomeInventory && portCheck.existingFrontendUrl);
  const portBusy = Boolean(!portInputError && portCheck && !portCheck.ok && !existingHomeInventory);
  const checkingPorts = Boolean(selectedProfileId && !portInputError && !portCheck);
  const portBlocked = Boolean(portInputError);
  const portStatusBlocked = Boolean(portInputError || (portCheck && !portCheck.ok && !existingHomeInventory));
  const portMessage = portInputError || localizedPortMessage(portCheck, t);
  const launchBackendPort = portBusy && portCheck ? portCheck.suggestedBackendPort : selectedBackendPort;
  const launchFrontendPort = isStoreBuild
    ? launchBackendPort
    : portBusy && portCheck ? portCheck.suggestedFrontendPort : selectedFrontendPort;

  const ready = useMemo(() => {
    if (!snapshot) return false;
    const s = snapshot.setup;
    return s.node && s.npm && s.projectRootValid && s.rootDependencies && s.clientDependencies && s.envFile;
  }, [snapshot]);

  const updateAvailable = Boolean(updateResult?.appUpdateAvailable || updateResult?.launcherUpdateAvailable);
  const updateBlockedByNode = Boolean(updateResult?.requiredActions.includes('nodeMajorUpgrade'));
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

    const title = bundledSyncRetryAvailable
      ? t('update.syncPaused')
      : updateProgress
      ? t('update.inProgress')
      : checkingUpdates
        ? t('update.checking')
        : updateResult
          ? updateAvailable
            ? t('update.availableBeforeLaunch')
            : t('update.checkedBeforeLaunch')
          : t('update.checkBeforeLaunch');

    const detail = bundledSyncRetryAvailable
      ? updateNotice || t('update.previousAvailable')
      : updateProgress
      ? updateProgress.message
      : checkingUpdates
        ? t('update.lookingForReleases')
        : updateResult
          ? updateBlockedByNode
            ? t('update.nodeUpgradeBeforeInstall')
            : updateAvailable
              ? t('update.installBeforeStart')
              : t('update.noneAvailable')
          : t('update.verifyBeforeStart');

    const buttonLabel = bundledSyncRetryAvailable
      ? t('update.retrySync')
      : checkingUpdates
      ? t('common.checking')
      : updateAvailable
        ? t('update.updateFirst')
        : updateResult
          ? t('common.checkAgain')
          : t('update.checkUpdates');

    const buttonIcon = bundledSyncRetryAvailable
      ? <RefreshCw size={13} />
      : checkingUpdates
      ? <Loader2 size={13} className="spin" />
      : updateAvailable
        ? <Download size={13} />
        : <RefreshCw size={13} />;

    return (
      <div className="prelaunch-update-card">
        <div className="prelaunch-update-copy">
          <span className="prelaunch-update-kicker">{t('update.kicker')}</span>
          <strong>{title}</strong>
          <p>{detail}</p>
        </div>
        <button
          type="button"
          className={bundledSyncRetryAvailable || updateAvailable ? 'btn-primary' : 'btn-secondary'}
          onClick={bundledSyncRetryAvailable ? retryBundledSync : updateAvailable ? triggerUpdate : checkForUpdates}
          disabled={bundledSyncRetryAvailable
            ? Boolean(busy)
            : checkingUpdates || Boolean(updateProgress) || (updateAvailable && (updateBlockedByNode || busy === 'update'))}
        >
          {buttonIcon}
          {buttonLabel}
        </button>
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
      const t = setInterval(() => setWarmup(p => p < 90 ? p + 10 : p), 300);
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
    invoke('open_app', { url: active.frontendUrl }).catch(e => setNotice(String(e)));
  }, [active, busy, serverReady, settings.autoOpen, openedUrl]);

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
          request: { backendPort: selectedBackendPort, frontendPort: selectedFrontendPort },
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
      setNotice(isStoreBuild
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
    if (portUi.trim()) entries['FRONTEND_PORT'] = String(frontendPort);
    if (portUi.trim()) entries['VITE_PORT'] = String(frontendPort);

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
    if (busy !== 'install') return;
    const timer = window.setInterval(() => setElapsedNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  /* ── Render ── */
  if (!snapshot) return <div className="loading-state"><Loader2 size={28} className="spin" /><span>{t('status.loadingEnvironment')}</span></div>;

  /* ─── STATE 1: Setup ─── */
  if (!ready && !(active && serverReady)) {
    const s = snapshot.setup;
    const installing = busy === 'install';
    const elapsedSeconds = installStartedAt ? Math.max(0, Math.floor((elapsedNow - installStartedAt) / 1000)) : 0;
    const elapsedLabel = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`;

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

          {installing ? (
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
                {checkingPorts ? t('setup.checkingLocalPorts') : isStoreBuild ? t('setup.launchLocal') : projectRootBlocked ? t('setup.chooseInstallFolder') : projectRootInstallable ? t('setup.installLaunch') : existingHomeInventory ? t('setup.openRunning') : portBusy ? t('setup.launchOn', { backend: launchBackendPort, frontend: launchFrontendPort }) : t('setup.initializeLaunch')}
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
              <div className="drawer-body"><LogRows logs={snapshot.logs} /></div>
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

          <div className="running-qr">
            <span className="running-qr-label">{t('running.standardLan')}</span>
            <QrCodeCard url={activeLanUrl} size={220} logoSrc={logoSymbolLight} logoSvg={logoSymbolLightSvg} />
            <div className={`lan-status ${lanStatus?.ok ? 'ok' : 'blocked'}`}>
              <Wifi size={12} />
              <span>{lanStatus ? localizedLanMessage(lanStatus, t) : t('running.lanPending')}</span>
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
                <button type="button" className="settings-action" onClick={enableMobileHttps} disabled={busy === 'mobile-https'}>
                  <RefreshCw size={13} /> {t('https.refreshLinks')}
                </button>
                <button type="button" className="settings-action danger" onClick={disableMobileHttps} disabled={busy === 'mobile-https'}>
                  <Power size={13} /> {t('https.disable')}
                </button>
                <button type="button" className="settings-action danger wide" onClick={rotateMobileCa} disabled={busy === 'mobile-https'}>
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
              <button type="button" className="btn-secondary mobile-https-enable" onClick={enableMobileHttps} disabled={busy === 'mobile-https'}>
                {busy === 'mobile-https' ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
                {t('https.enable')}
              </button>
              <small>{t('https.normalRemains')}</small>
            </section>
          )}

          <button
            className="open-app-button"
            onClick={() => run('open browser', () => invoke('open_app', { url: active.frontendUrl }))}
            title={t('running.openBrowser')}
          >
            <span className="open-app-icon"><ExternalLink size={16} /></span>
            <span>{t('running.openApp')}</span>
          </button>

          <div className="running-meta">
            <span>App v{snapshot.appVersion}</span>
            <span>{t('common.launcher')} v{snapshot.launcherVersion}</span>
            <span>{isStoreBuild ? t('running.port', { port: active.backendPort }) : t('running.ports', { backend: active.backendPort, frontend: active.frontendPort })}</span>
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
        <LanguageQuickPicker />

        <div className="action-stack" style={{ marginTop: 24 }}>
          {renderPreLaunchUpdateCheck()}

          <button
            className="btn-primary"
            disabled={Boolean(busy) || checkingUpdates || checkingPorts || Boolean(updateProgress) || !selProfile || portBlocked || (updateAvailable && updateBlockedByNode)}
            onClick={() => {
              if (projectRootBlocked) {
                chooseInstallFolder();
                return;
              }
              if (updateAvailable) {
                triggerUpdate();
                return;
              }
              if (selProfile) doLaunch(selProfile);
            }}
          >
            {busy?.startsWith('start-') || checkingUpdates || checkingPorts ? <Loader2 size={16} className="spin" /> : updateAvailable ? <Download size={16} /> : <Play size={16} />}
            {checkingPorts
              ? t('setup.checkingLocalPorts')
              : checkingUpdates
              ? t('setup.checkingUpdates')
              : updateAvailable
                ? t('setup.updateApp', { version: updateResult?.latestAppVersion || '' })
                : isStoreBuild
                  ? startButtonLabel
                  : projectRootBlocked
                    ? t('setup.chooseInstallFolder')
                    : existingHomeInventory
                      ? t('setup.openRunning')
                    : portBusy
                      ? t('setup.launchOn', { backend: launchBackendPort, frontend: launchFrontendPort })
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
          <span>{isStoreBuild ? `Local: ${launchBackendPort}` : `API: ${launchBackendPort} · UI: ${launchFrontendPort}`}</span>
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
function AdvancedConfigPanel({
  showAdvanced, setShowAdvanced, resendKey, setResendKey,
  emailFrom, setEmailFrom, supportEmail, setSupportEmail,
  bootstrapAdminEmail, setBootstrapAdminEmail,
  portApi, setPortApi, portUi, setPortUi, localIp,
  lanStatus, portCheck, portMessage, portBlocked, storeBuild, randomPortBusy,
  onChooseRandomPorts, onUseSuggestedPorts,
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
  randomPortBusy: boolean;
  onChooseRandomPorts: () => void;
  onUseSuggestedPorts: () => void;
}) {
  const { t } = useLauncherI18n();
  const uiPort = portUi.trim() || '5173';
  const lanUrl = lanStatus?.frontendUrl || (localIp ? `http://${localIp}:${uiPort}` : null);

  return (
    <>
      <div className="divider"><span>{t('advanced.title')}</span></div>

      <button className="advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
        <ChevronRight size={12} className={`chevron ${showAdvanced ? 'open' : ''}`} />
        {t('advanced.configuration')}
      </button>

      <div className={`collapse-panel ${showAdvanced ? 'open' : ''}`}>
        <div className="config-grid">
          <div className="guide-box">
            <div className="guide-title">
              <Info size={13} />
              <span>{t('advanced.whatMatters')}</span>
            </div>
            <ul>
              <li><strong>{t('advanced.emailLabel')}</strong> {t('advanced.emailHelp')}</li>
              <li><strong>{t('advanced.adminLabel')}</strong> {t('advanced.adminHelp')}</li>
              <li><strong>{t('advanced.networkLabel')}</strong> {storeBuild ? t('advanced.networkStore') : t('advanced.networkDesktop')}</li>
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
              <span>{storeBuild ? t('advanced.localPort') : t('advanced.networkPorts')}</span>
              <span className="config-badge required">{t('common.required')}</span>
            </div>
            <div className={storeBuild ? '' : 'row-2'}>
              <div className="field">
                <label className="field-label">{storeBuild ? t('advanced.localPort') : t('advanced.apiPort')}</label>
                <input className={`field-input ${portBlocked && !portCheck?.backendOk ? 'invalid' : ''}`}
                  type="number" inputMode="numeric" min={1024} max={65535} value={portApi}
                  onChange={e => setPortApi(sanitizePortInput(e.target.value))} placeholder="3001" />
              </div>
              {!storeBuild && (
                <div className="field">
                  <label className="field-label">{t('advanced.uiPort')}</label>
                  <input className={`field-input ${portBlocked && !portCheck?.frontendOk ? 'invalid' : ''}`}
                    type="number" inputMode="numeric" min={1024} max={65535} value={portUi}
                    onChange={e => setPortUi(sanitizePortInput(e.target.value))} placeholder="5173" />
                </div>
              )}
            </div>
            <span className="field-hint">{storeBuild ? t('advanced.storePortHelp') : t('advanced.desktopPortHelp')}</span>
            <button type="button" className="mini-action random-port-action" onClick={onChooseRandomPorts} disabled={randomPortBusy}>
              {randomPortBusy ? <Loader2 size={12} className="spin" /> : <Shuffle size={12} />}
              {storeBuild ? t('advanced.randomPort') : t('advanced.randomPorts')}
            </button>
            <div className={`port-status ${portBlocked ? 'blocked' : 'ok'}`}>
              <span>{portMessage}</span>
              {portBlocked && portCheck && (
                <button type="button" className="mini-action" onClick={onUseSuggestedPorts}>
                  {storeBuild ? t('advanced.usePort', { port: portCheck.suggestedBackendPort }) : t('advanced.usePorts', { backend: portCheck.suggestedBackendPort, frontend: portCheck.suggestedFrontendPort })}
                </button>
              )}
            </div>
          </div>

          {/* LAN Access Guide + QR */}
          <div className="tip-box">
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
          </div>

        </div>
      </div>
    </>
  );
}

/* ── Shared Dev Panel ── */
function DevPanelContent({
  snapshot, profiles, settings, setSettings, devTab, setDevTab, busy, notice,
  onNotice, onClose, onBackup, onStop,
  updateResult, checkingUpdates, updateProgress, updateNotice, onCheckUpdates, onTriggerUpdate,
}: {
  snapshot: LauncherSnapshot; profiles: ProfileStatus[];
  settings: LauncherSettings; setSettings: (s: LauncherSettings) => void;
  devTab: ViewKey; setDevTab: (t: ViewKey) => void;
  busy: string | null; notice: string;
  onNotice: (message: string) => void;
  onClose: () => void; onBackup: (p: ProfileStatus) => Promise<BackupResult>; onStop?: () => void;
  updateResult: UpdateCheckResult | null;
  checkingUpdates: boolean;
  updateProgress: { state: string; message: string; progress: number; error?: string | null } | null;
  updateNotice: string;
  onCheckUpdates: () => Promise<void>;
  onTriggerUpdate: () => Promise<void>;
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
      onNotice(result.message);
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
      <header className="modal-header">
        <div className="modal-header-left">
          <Archive size={15} className="accent-icon" />
          <h3>{t('dev.console')}</h3>
        </div>
        <button className="close-x" onClick={onClose} aria-label={t('common.close')}>✕</button>
      </header>

      <nav className="modal-tabs">
        <button className={devTab === 'logs' ? 'active' : ''} onClick={() => setDevTab('logs')}>{t('dev.logs')}</button>
        <button className={devTab === 'backups' ? 'active' : ''} onClick={() => setDevTab('backups')}>{t('dev.backups')}</button>
        <button className={devTab === 'settings' ? 'active' : ''} onClick={() => setDevTab('settings')}>{t('dev.settings')}</button>
        {!isStoreBuild && <button className={devTab === 'updates' ? 'active' : ''} onClick={() => setDevTab('updates')}>{t('dev.updates')}</button>}
      </nav>

      <div className="modal-body">
        {devTab === 'logs' && <div className="tab-logs"><LogRows logs={snapshot.logs} /></div>}

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
                    title={t(option.labelKey)}
                  >
                    <span>{option.code.toUpperCase()}</span>
                    <small>{t(option.labelKey)}</small>
                  </button>
                ))}
              </div>
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

      <footer className="modal-footer">
        {onStop && <button className="btn-danger" onClick={onStop}><Power size={13} /> {t('dev.stopServer')}</button>}
        <span className="notice-text">{notice}</span>
      </footer>
    </>
  );
}

/* ── Small components ── */
function LogRows({ logs }: { logs: LogEntry[] }) {
  const { t } = useLauncherI18n();
  if (!logs.length) return <div className="empty-log">{t('dev.noLogs')}</div>;
  return (
    <div className="log-rows">
      {logs.map((l, i) => (
        <div className="log-row" key={`${l.timestamp}-${i}`}>
          <span className={`log-dot ${l.level}`} />
          <span className="log-source">{l.source}</span>
          <code>{l.message}</code>
        </div>
      ))}
    </div>
  );
}

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
function mockSnapshot(settings: LauncherSettings, t: Translate): LauncherSnapshot {
  const root = settings.projectPath || '/Users/demo/HomeInventory';
  const data = '/Users/demo/Library/Application Support/net.homeinventory.launcher';
  const runningPreview = new URLSearchParams(window.location.search).get('preview') === 'running';
  return {
    launcherVersion: LAUNCHER_VERSION,
    appVersion: LAUNCHER_VERSION,
    appSource: settings.projectPath ? 'custom' : 'development',
    bundledSyncRequired: false,
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
