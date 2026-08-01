import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Archive,
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
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import launcherPackage from '../package.json';
import logoFull from './logo-full.svg';
import logoSymbolLight from './logo-symbol-light.svg';
import logoSymbolLightSvg from './logo-symbol-light.svg?raw';
import { QrCodeCard } from './QrCode';

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

type LauncherSettings = {
  projectPath: string; nodePath: string; npmPath: string; autoOpen: boolean;
};

type PathKind = 'project' | 'node' | 'npm';

const LAUNCHER_VERSION = launcherPackage.version;

const defaultSettings: LauncherSettings = {
  projectPath: '', nodePath: '', npmPath: '', autoOpen: true,
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

function validatePortInputs(apiPort: string, uiPort: string, profile: ProfileStatus | null) {
  if (!profile) return 'No profile is available.';
  const backendPort = parsePort(apiPort, profile.backendPort);
  const frontendPort = parsePort(uiPort, profile.frontendPort);
  if (backendPort < 1024 || backendPort > 65535) return 'API port must be between 1024 and 65535.';
  if (frontendPort < 1024 || frontendPort > 65535) return 'UI port must be between 1024 and 65535.';
  if (backendPort === frontendPort) return 'API and UI ports must be different.';
  return '';
}

/* ── Root Component ── */
export function App() {
  const [snapshot, setSnapshot] = useState<LauncherSnapshot | null>(null);
  const [settings, setSettings] = useState<LauncherSettings>(() => loadSettings());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('Launcher ready.');

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
  const [bundledSyncStarted, setBundledSyncStarted] = useState(false);
  const [bundledSyncRetryAvailable, setBundledSyncRetryAvailable] = useState(false);
  const bundledSyncStartedRef = useRef(false);
  const bundledSyncInFlightRef = useRef(false);

  /* ── Refresh ── */
  const refresh = useCallback(async () => {
    if (!hasTauriRuntime()) {
      setSnapshot(prev => {
        const next = mockSnapshot(settings);
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
      setNotice('Browser preview — Tauri commands are simulated.');
      return;
    }
    try {
      setSnapshot(await invoke<LauncherSnapshot>('detect_tools', { overrides: overrides(settings) }));
    } catch (e) { setNotice(String(e)); }
  }, [settings]);

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
        setUpdateNotice('Your software is up to date.');
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
    if (!managedProfile || validatePortInputs(portApi, portUi, managedProfile)) {
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
        portCheck.message || 'Local ports could not be verified. Choose Retry Sync to check again.',
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
      message: 'Preparing the included managed app. Dependency installation may require internet access...',
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
      setUpdateNotice('Please check for updates before starting the update.');
      setUpdateProgress(null);
      return;
    }

    if (!updateResult.appUpdateAvailable && !updateResult.launcherUpdateAvailable) {
      setUpdateNotice('Your software is up to date. No update is available to install.');
      setUpdateProgress(null);
      return;
    }

    setUpdateNotice('');
    setBusy('update');
    setUpdateProgress({ state: 'Starting', message: 'Initializing update orchestration...', progress: 0.01 });
    try {
      if (!hasTauriRuntime()) {
        setUpdateProgress({ state: 'Backing Up', message: 'Creating database and uploads backup...', progress: 0.2 });
        await new Promise((r) => setTimeout(r, 1000));
        setUpdateProgress({ state: 'Downloading', message: 'Downloading release archive...', progress: 0.4 });
        await new Promise((r) => setTimeout(r, 1000));
        setUpdateProgress({ state: 'Installing', message: 'Running npm ci dependency install...', progress: 0.7 });
        await new Promise((r) => setTimeout(r, 1500));
        setUpdateProgress({ state: 'Completed', message: 'Update complete!', progress: 1.0 });
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
    if (!isStoreBuild) return validatePortInputs(portApi, portUi, selProfile);
    if (!selProfile) return 'No profile is available.';
    const backendPort = parsePort(portApi, selProfile.backendPort);
    if (backendPort < 1024 || backendPort > 65535) return 'Local port must be between 1024 and 65535.';
    return '';
  }, [isStoreBuild, portApi, portUi, selProfile]);
  const existingHomeInventory = Boolean(portCheck?.existingHomeInventory && portCheck.existingFrontendUrl);
  const portBusy = Boolean(!portInputError && portCheck && !portCheck.ok && !existingHomeInventory);
  const checkingPorts = Boolean(selectedProfileId && !portInputError && !portCheck);
  const portBlocked = Boolean(portInputError);
  const portStatusBlocked = Boolean(portInputError || (portCheck && !portCheck.ok && !existingHomeInventory));
  const portMessage = portInputError || portCheck?.message || 'Ports are available.';
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
    ? 'HomeInventory Local will prepare its bundled app files and local runtime from the Microsoft Store package.'
    : projectRootMissing
    ? 'Choose an empty install folder or an existing HomeInventory folder.'
    : projectRootInstallable
      ? 'Empty install folder selected. HomeInventory will be downloaded and installed here.'
      : projectRootInvalid
        ? 'This folder is not empty and is not a HomeInventory install folder.'
    : notice && !['Launcher ready.', 'Browser preview — Tauri commands are simulated.'].includes(notice)
      ? notice
      : '';

  const chooseInstallFolder = async () => {
    if (!hasTauriRuntime()) {
      setNotice('Folder picker is available in the desktop launcher.');
      return;
    }
    try {
      const selected = await invoke<string | null>('choose_path', { request: { kind: 'project' } });
      if (!selected) return;
      setSettings(current => ({ ...current, projectPath: selected }));
      setSetupAutoBlocked(false);
      setNotice('Install folder selected.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  };

  const clearInstallFolder = () => {
    setSettings(current => ({ ...current, projectPath: '' }));
    setSetupAutoBlocked(false);
    setNotice('Install folder cleared.');
  };

  const renderPreLaunchUpdateCheck = () => {
    if (isStoreBuild) {
      return null;
    }

    const title = bundledSyncRetryAvailable
      ? 'Managed app sync paused'
      : updateProgress
      ? 'Update in progress'
      : checkingUpdates
        ? 'Checking updates...'
        : updateResult
          ? updateAvailable
            ? 'Update available before launch'
            : 'Checked before launch'
          : 'Check updates before launch';

    const detail = bundledSyncRetryAvailable
      ? updateNotice || 'The previous version remains available. Retry when you are ready.'
      : updateProgress
      ? updateProgress.message
      : checkingUpdates
        ? 'Looking for signed launcher and app releases.'
        : updateResult
          ? updateBlockedByNode
            ? 'Node.js must be upgraded before this update can be installed.'
            : updateAvailable
              ? 'Install the verified update before starting HomeInventory.'
              : 'No update is available right now.'
          : 'Verify releases, signatures, and requirements before starting services.';

    const buttonLabel = bundledSyncRetryAvailable
      ? 'Retry Sync'
      : checkingUpdates
      ? 'Checking...'
      : updateAvailable
        ? 'Update First'
        : updateResult
          ? 'Check Again'
          : 'Check Updates';

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
          <span className="prelaunch-update-kicker">Updates</span>
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
      : 'HomeInventory stopped before it finished starting. Open Developer Tools for logs.';
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
        message: 'Local port is valid.',
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
          message: 'Ports look valid in browser preview.',
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

  const doStart = async (
    p: ProfileStatus,
    requestedBackendPort = launchBackendPort,
    requestedFrontendPort = launchFrontendPort,
  ) => {
    if (checkingPorts) {
      setNotice('Checking local ports before launch…');
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
      setNotice(`Default ports were busy. Launching on ${backendPort}/${frontendPort}.`);
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
      setNotice(`Starting ${p.name}: simulated in browser mode.`);
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
      setNotice('Stopped active profile: simulated in browser mode.');
      return;
    }
    await run('stop', () => invoke('stop_profile'));
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
          message: `Backup created for ${p.name}: simulated in browser mode.`,
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
  if (!snapshot) return <div className="loading-state"><Loader2 size={28} className="spin" /><span>Loading environment…</span></div>;

  /* ─── STATE 1: Setup ─── */
  if (!ready && !(active && serverReady)) {
    const s = snapshot.setup;
    const installing = busy === 'install';
    const elapsedSeconds = installStartedAt ? Math.max(0, Math.floor((elapsedNow - installStartedAt) / 1000)) : 0;
    const elapsedLabel = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`;

    let msg = 'Waiting to initialize…';
    if (!isStoreBuild && (!s.node || !s.npm)) msg = 'Node.js is required.';
    else if (installing) {
      msg = isStoreBuild
        ? 'Preparing application files…'
        : 'Installing dependencies and preparing the app…';
    } else if (setupAutoBlocked) {
      msg = 'Setup stopped after an error. Choose another install folder, then try again.';
    }

    return (
      <div className="splash-layout">
        <div className="splash-card">
          <div className="splash-logo-wrap">
            <img src={logoFull} alt="HomeInventory" className="splash-logo-full pulsing" />
            <div className="logo-aura" />
          </div>
          <p className="splash-subtitle">Your private household registry</p>
          <span className="version-badge">
            {snapshot ? `App v${snapshot.appVersion} · Launcher v${snapshot.launcherVersion} · Local-first` : `v${LAUNCHER_VERSION} · Local-first`}
          </span>

          {installing ? (
            <div className="install-status" style={{ marginTop: 28 }}>
              <Loader2 size={18} className="spin" />
              <div>
                <strong>{msg}</strong>
                <p>{isStoreBuild ? `Elapsed ${elapsedLabel}. Preparing bundled app files and runtime.` : `Elapsed ${elapsedLabel}. First install can take a few minutes depending on npm and network speed.`}</p>
              </div>
            </div>
          ) : (!isStoreBuild && (!s.node || !s.npm)) ? (
            <div className="error-box">
              <AlertCircle size={16} />
              <div>
                <strong>{isStoreBuild ? 'Bundled runtime not ready' : 'Node.js not found'}</strong>
                <p>{isStoreBuild ? 'Launch HomeInventory Local to prepare the runtime included with the Microsoft Store package.' : <>Download and install from <a href="https://nodejs.org" target="_blank" rel="noreferrer">nodejs.org</a> to continue.</>}</p>
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
                {checkingPorts ? 'Checking local ports…' : isStoreBuild ? 'Launch HomeInventory Local' : projectRootBlocked ? 'Choose Install Folder' : projectRootInstallable ? 'Install & Launch' : existingHomeInventory ? 'Open Running HomeInventory' : portBusy ? `Launch on ${launchBackendPort}/${launchFrontendPort}` : 'Initialize & Launch'}
              </button>

              {visibleLaunchNotice && (
                <div className="launch-notice">
                  <AlertCircle size={14} />
                  <div className="launch-notice-body">
                    <span>{visibleLaunchNotice}</span>
                    {projectRootBlocked && (
                      <div className="launch-notice-actions">
                        <button type="button" className="mini-action" onClick={chooseInstallFolder}>
                          Choose Install Folder
                        </button>
                        {settings.projectPath && (
                          <button type="button" className="mini-action" onClick={clearInstallFolder}>
                            Clear
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
                onUseSuggestedPorts={() => {
                  if (!portCheck) return;
                  setPortApi(String(portCheck.suggestedBackendPort));
                  setPortUi(String(portCheck.suggestedFrontendPort));
                }}
              />

              <button className="btn-outline" onClick={() => { setDevTab(isStoreBuild ? 'logs' : 'settings'); setShowDevPanel(true); }}>
                <SlidersHorizontal size={13} /> Developer Tools
              </button>
            </div>
          )}

          <footer className="splash-footer">
            <button className="link-btn" onClick={() => setShowLogs(!showLogs)}>
              <Terminal size={11} />{showLogs ? 'Hide console' : 'System console'}
            </button>
            {snapshot.appDataDir && <span className="data-path">{snapshot.appDataDir}</span>}
          </footer>
        </div>

        {showLogs && (
          <div className="drawer-overlay">
            <div className="drawer">
              <div className="drawer-header">
                <h3>System Console</h3>
                <button className="btn-secondary compact" onClick={() => setShowLogs(false)}>Close</button>
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
    const msg2 = !active ? (starting ? 'Starting services…' : 'Launching…') : 'Connecting to database…';
    return (
      <div className="splash-layout">
        <div className="splash-card">
          <div className="splash-logo-wrap">
            <img src={logoFull} alt="HomeInventory" className="splash-logo-full pulsing" />
            <div className="logo-aura" />
          </div>
          <p className="splash-subtitle">Connecting to your registry</p>
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
              <span>Running</span>
            </div>
          </header>

          <div className="running-intro">
            <span className="running-eyebrow">Local access</span>
            <h1>Your inventory is ready.</h1>
            <p>Open it on this device, or scan the code from another device on the same network.</p>
          </div>

          <div className="running-qr">
            <QrCodeCard url={activeLanUrl} size={220} logoSrc={logoSymbolLight} logoSvg={logoSymbolLightSvg} />
            <div className={`lan-status ${lanStatus?.ok ? 'ok' : 'blocked'}`}>
              <Wifi size={12} />
              <span>{lanStatus?.message || 'LAN status is checked after the services bind to the network.'}</span>
            </div>
          </div>

          <button
            className="open-app-button"
            onClick={() => run('open browser', () => invoke('open_app', { url: active.frontendUrl }))}
            title="Open in browser"
          >
            <span className="open-app-icon"><ExternalLink size={16} /></span>
            <span>Open app</span>
          </button>

          <div className="running-meta">
            <span>App v{snapshot.appVersion}</span>
            <span>Launcher v{snapshot.launcherVersion}</span>
            <span>{isStoreBuild ? `Port ${active.backendPort}` : `Ports ${active.backendPort}/${active.frontendPort}`}</span>
          </div>

          <div className="running-actions" aria-label="App controls">
            <button className="icon-action" onClick={() => { setDevTab(isStoreBuild ? 'logs' : 'settings'); setShowDevPanel(true); }} title="Launcher settings" aria-label="Launcher settings">
              <SlidersHorizontal size={15} />
            </button>
            <button className="icon-action danger" onClick={doStop} title="Stop local services" aria-label="Stop local services">
              <Power size={15} />
            </button>
          </div>
        </section>

        {showDevPanel && (
          <div className="modal-overlay" onClick={() => setShowDevPanel(false)}>
            <div className="modal-panel" onClick={e => e.stopPropagation()}>
              <DevPanelContent
                snapshot={snapshot} profiles={profiles} settings={settings} setSettings={setSettings}
                devTab={devTab} setDevTab={setDevTab} busy={busy} notice={`${active.name} is running.`}
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
    ? isStoreBuild ? 'Restart HomeInventory Local' : 'Restart HomeInventory'
    : isStoreBuild ? 'Launch HomeInventory Local' : 'Launch HomeInventory';

  return (
    <div className="splash-layout">
      <div className="splash-card">
        <div className="splash-logo-wrap">
          <img src={logoFull} alt="HomeInventory" className="splash-logo-full stopped" />
          <div className="logo-aura off" />
        </div>
        <p className="splash-subtitle dimmed">{stopped ? 'Services are stopped' : 'Ready to launch'}</p>
        <span className="version-badge">{stopped ? 'Offline' : 'Ready'}</span>

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
              ? 'Checking local ports…'
              : checkingUpdates
              ? 'Checking for updates…'
              : updateAvailable
                ? `Update App to v${updateResult?.latestAppVersion}`
                : isStoreBuild
                  ? startButtonLabel
                  : projectRootBlocked
                    ? 'Choose Install Folder'
                    : existingHomeInventory
                      ? 'Open Running HomeInventory'
                    : portBusy
                      ? `Launch on ${launchBackendPort}/${launchFrontendPort}`
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
                      Choose Install Folder
                    </button>
                    {settings.projectPath && (
                      <button type="button" className="mini-action" onClick={clearInstallFolder}>
                        Clear
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
            onUseSuggestedPorts={() => {
              if (!portCheck) return;
              setPortApi(String(portCheck.suggestedBackendPort));
              setPortUi(String(portCheck.suggestedFrontendPort));
            }}
          />

          <button className="btn-outline" onClick={() => { setDevTab('logs'); setShowDevPanel(true); }}>
            <SlidersHorizontal size={13} /> Developer Tools
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
  lanStatus, portCheck, portMessage, portBlocked, storeBuild, onUseSuggestedPorts,
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
  onUseSuggestedPorts: () => void;
}) {
  const uiPort = portUi.trim() || '5173';
  const lanUrl = lanStatus?.frontendUrl || (localIp ? `http://${localIp}:${uiPort}` : null);

  return (
    <>
      <div className="divider"><span>Advanced</span></div>

      <button className="advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
        <ChevronRight size={12} className={`chevron ${showAdvanced ? 'open' : ''}`} />
        Advanced Configuration
      </button>

      <div className={`collapse-panel ${showAdvanced ? 'open' : ''}`}>
        <div className="config-grid">
          <div className="guide-box">
            <div className="guide-title">
              <Info size={13} />
              <span>What matters here</span>
            </div>
            <ul>
              <li><strong>Email:</strong> Resend needs both an API key and a verified sender address. A key alone can look configured but still fail delivery.</li>
              <li><strong>Admin:</strong> Bootstrap Admin Email makes the first trusted admin predictable.</li>
              <li><strong>Network:</strong> {storeBuild ? 'HomeInventory Local uses one local port for the app and API.' : 'Ports must be free locally; LAN access also depends on firewall and same Wi-Fi.'}</li>
            </ul>
          </div>

          {/* Email */}
          <div className="config-section">
            <div className="config-section-header">
              <Mail size={13} />
              <span>Email Delivery</span>
              <span className="config-badge recommended">Recommended</span>
            </div>
            <div className="field">
              <label className="field-label">Resend API Key · RESEND_API_KEY</label>
              <input className="field-input" type="password" value={resendKey}
                onChange={e => setResendKey(e.target.value)} placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxx" />
              <span className="field-hint">
                Enables invitations, verification, admin mail, and password reset emails.
              </span>
            </div>
            <div className="field">
              <label className="field-label">Verified Sender · EMAIL_FROM</label>
              <input className="field-input" value={emailFrom}
                onChange={e => setEmailFrom(e.target.value)} placeholder="HomeInventory <hello@your-domain.com>" />
              <span className="field-hint">
                Use a sender from a verified Resend domain. For quick testing, Resend allows onboarding@resend.dev.
              </span>
            </div>
            <div className="field">
              <label className="field-label">Support Email · SUPPORT_EMAIL</label>
              <input className="field-input" type="email" value={supportEmail}
                onChange={e => setSupportEmail(e.target.value)} placeholder="support@example.com" />
              <span className="field-hint">Shown in help links and outgoing email footers.</span>
            </div>
          </div>

          {/* Instance env */}
          <div className="config-section">
            <div className="config-section-header">
              <Settings size={13} />
              <span>Instance & Admin</span>
              <span className="config-badge recommended">Recommended</span>
            </div>
            <div className="field">
              <label className="field-label">Bootstrap Admin Email · BOOTSTRAP_ADMIN_EMAIL</label>
              <input className="field-input" type="email" value={bootstrapAdminEmail}
                onChange={e => setBootstrapAdminEmail(e.target.value)} placeholder="admin@example.com" />
              <span className="field-hint">Maps to BOOTSTRAP_ADMIN_EMAIL. The matching account receives admin privileges during first setup/login.</span>
            </div>
            <span className="field-hint">Launcher writes only filled values to .env, so existing configuration is preserved.</span>
          </div>

          {/* Ports */}
          <div className="config-section">
            <div className="config-section-header">
              <Globe size={13} />
              <span>{storeBuild ? 'Local Port' : 'Network Ports'}</span>
              <span className="config-badge required">Required</span>
            </div>
            <div className={storeBuild ? '' : 'row-2'}>
              <div className="field">
                <label className="field-label">{storeBuild ? 'Local Port' : 'API Port'}</label>
                <input className={`field-input ${portBlocked && !portCheck?.backendOk ? 'invalid' : ''}`}
                  type="number" inputMode="numeric" min={1024} max={65535} value={portApi}
                  onChange={e => setPortApi(sanitizePortInput(e.target.value))} placeholder="3001" />
              </div>
              {!storeBuild && (
                <div className="field">
                  <label className="field-label">UI Port</label>
                  <input className={`field-input ${portBlocked && !portCheck?.frontendOk ? 'invalid' : ''}`}
                    type="number" inputMode="numeric" min={1024} max={65535} value={portUi}
                    onChange={e => setPortUi(sanitizePortInput(e.target.value))} placeholder="5173" />
                </div>
              )}
            </div>
            <span className="field-hint">{storeBuild ? 'Valid range: 1024-65535. Default: 3001. Only change if another app is using the same port.' : 'Valid range: 1024-65535. Defaults: API 3001, UI 5173. Only change if another app is using the same port.'}</span>
            <div className={`port-status ${portBlocked ? 'blocked' : 'ok'}`}>
              <span>{portMessage}</span>
              {portBlocked && portCheck && (
                <button type="button" className="mini-action" onClick={onUseSuggestedPorts}>
                  {storeBuild ? `Use ${portCheck.suggestedBackendPort}` : `Use ${portCheck.suggestedBackendPort}/${portCheck.suggestedFrontendPort}`}
                </button>
              )}
            </div>
          </div>

          {/* LAN Access Guide + QR */}
          <div className="tip-box">
            <div className="tip-header">
              <Wifi size={13} />
              <span>Access from other devices</span>
            </div>
            <ol className="tip-steps">
              <li>Keep devices on the <strong>same Wi-Fi network</strong>.</li>
              <li>Allow HomeInventory or Node.js through Windows Firewall for private networks if prompted.</li>
            </ol>
            {lanStatus && (
              <div className={`lan-status ${lanStatus.ok ? 'ok' : 'blocked'}`}>
                <Wifi size={12} />
                <span>{lanStatus.message}</span>
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
                  <span>Find your IP: System Settings → Wi-Fi → Details → IP Address</span>
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
      onNotice('Path picker is available in the desktop launcher.');
      return;
    }
    try {
      const selected = await invoke<string | null>('choose_path', { request: { kind } });
      if (!selected) return;
      if (kind === 'project') setSettings({ ...settings, projectPath: selected });
      if (kind === 'node') setSettings({ ...settings, nodePath: selected });
      if (kind === 'npm') setSettings({ ...settings, npmPath: selected });
      onNotice('Path updated. Tool detection will refresh automatically.');
    } catch (err) {
      onNotice(err instanceof Error ? err.message : String(err));
    }
  };

  const revealSettingPath = async (path: string, label: string) => {
    if (!path.trim()) {
      onNotice(`${label} path is empty.`);
      return;
    }
    if (!hasTauriRuntime()) {
      onNotice('Folder reveal is available in the desktop launcher.');
      return;
    }
    try {
      const result = await invoke<CommandResult>('reveal_path', { path });
      onNotice(isCmd(result) ? result.message : `${label} opened.`);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <header className="modal-header">
        <div className="modal-header-left">
          <Archive size={15} className="accent-icon" />
          <h3>Developer Console</h3>
        </div>
        <button className="close-x" onClick={onClose}>✕</button>
      </header>

      <nav className="modal-tabs">
        <button className={devTab === 'logs' ? 'active' : ''} onClick={() => setDevTab('logs')}>Logs</button>
        <button className={devTab === 'backups' ? 'active' : ''} onClick={() => setDevTab('backups')}>Backups</button>
        {!isStoreBuild && <button className={devTab === 'settings' ? 'active' : ''} onClick={() => setDevTab('settings')}>Settings</button>}
        {!isStoreBuild && <button className={devTab === 'updates' ? 'active' : ''} onClick={() => setDevTab('updates')}>Updates</button>}
      </nav>

      <div className="modal-body">
        {devTab === 'logs' && <div className="tab-logs"><LogRows logs={snapshot.logs} /></div>}

        {!isStoreBuild && devTab === 'updates' && (
          <div className="tab-updates">
            <p className="tab-description">Manage and check for software updates.</p>

            {checkingUpdates && (
              <div className="backup-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <Loader2 size={20} className="spin" style={{ marginRight: 8 }} />
                <span>Checking for updates...</span>
              </div>
            )}

            {!checkingUpdates && updateProgress && (
              <div className="update-status-card">
                <div className="update-progress-section">
                  <div className="update-progress-header">
                    <span className="progress-state-badge">{updateProgress.state}</span>
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
                    <span className="version-info-label">Managed App</span>
                    <span className="version-info-value">
                      v{updateResult.currentAppVersion}
                      {updateResult.appUpdateAvailable && (
                        <span style={{ fontSize: 11, color: '#e74c3c', marginLeft: 6 }}>(Update to v{updateResult.latestAppVersion})</span>
                      )}
                    </span>
                  </div>
                  <div className="version-info-item">
                    <span className="version-info-label">Launcher</span>
                    <span className="version-info-value">
                      v{updateResult.currentLauncherVersion}
                      {updateResult.launcherUpdateAvailable && (
                        <span style={{ fontSize: 11, color: '#e74c3c', marginLeft: 6 }}>(Update to v{updateResult.latestLauncherVersion})</span>
                      )}
                    </span>
                  </div>
                </div>

                {updateResult.requiredActions.includes('nodeMajorUpgrade') && (
                  <div className="error-box" style={{ margin: 0 }}>
                    <AlertCircle size={16} />
                    <div>
                      <strong>Node.js Upgrade Required</strong>
                      <p>
                        The latest app version requires Node.js v{updateResult.appReleaseNotes?.match(/Node\.js >= v(\d+)/)?.[1] || '20'} or higher.
                        Please upgrade your Node.js runtime to proceed with the update.
                      </p>
                    </div>
                  </div>
                )}

                {updateResult.appReleaseNotes && (
                  <div className="release-notes-box">
                    <h4>App Release Notes</h4>
                    <div className="release-notes-content">{updateResult.appReleaseNotes}</div>
                  </div>
                )}

                {updateResult.launcherReleaseNotes && (
                  <div className="release-notes-box">
                    <h4>Launcher Release Notes</h4>
                    <div className="release-notes-content">{updateResult.launcherReleaseNotes}</div>
                  </div>
                )}

                {!updatesAvailable && (
                  <div className="success-box">
                    <CheckCircle2 size={16} className="text-success" />
                    <div>
                      <strong>Your software is up to date</strong>
                      <p>You are running the latest version of HomeInventory and the desktop launcher.</p>
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
                      Update HomeInventory
                    </button>
                  )}
                  <button className="btn-secondary" onClick={onCheckUpdates} disabled={checkingUpdates || busy === 'update'}>
                    <RefreshCw size={12} className={checkingUpdates ? 'spin' : ''} />
                    Check Again
                  </button>
                </div>
              </div>
            )}

            {!checkingUpdates && !updateProgress && !updateResult && !updateNotice && (
              <div className="update-status-card">
                <div className="update-guidance-box">
                  <Info size={16} />
                  <div>
                    <strong>Check updates before installing</strong>
                    <p>
                      Before running the updater, the launcher should verify the latest release,
                      signatures, required Node.js version, and available app or launcher updates.
                    </p>
                  </div>
                </div>
                <div className="update-actions-section">
                  <button className="btn-primary" onClick={onCheckUpdates} disabled={checkingUpdates}>
                    <RefreshCw size={13} className={checkingUpdates ? 'spin' : ''} />
                    Check for updates
                  </button>
                </div>
              </div>
            )}

            {!checkingUpdates && !updateProgress && updateNotice && !updateResult && (
              <div className="update-status-card">
                <div className="version-info-grid">
                  <div className="version-info-item">
                    <span className="version-info-label">Managed App</span>
                    <span className="version-info-value">v{snapshot.appVersion}</span>
                  </div>
                  <div className="version-info-item">
                    <span className="version-info-label">Launcher</span>
                    <span className="version-info-value">v{snapshot.launcherVersion}</span>
                  </div>
                </div>
                <div className="update-guidance-box unavailable">
                  <Info size={16} />
                  <div>
                    <strong>Update information is temporarily unavailable</strong>
                    <p>{updateNotice}</p>
                  </div>
                </div>
                <button className="btn-secondary update-check-inline" onClick={onCheckUpdates} disabled={checkingUpdates}>
                  <RefreshCw size={12} className={checkingUpdates ? 'spin' : ''} />
                  Check Again
                </button>
              </div>
            )}
          </div>
        )}

        {devTab === 'backups' && (
          <div>
            <p className="tab-description">One-click backups of your local data and media.</p>
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
                    {busy === 'backup' ? 'Backing up...' : 'Backup Now'}
                  </button>
                  {backupResults[p.id] && (
                    <button className="btn-secondary" onClick={() => revealSettingPath(backupResults[p.id].path, 'Backup')}>
                      <FolderOpen size={13} />
                      Open Backup
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {devTab === 'settings' && !isStoreBuild && (
          <div className="tab-settings">
            <PathSettingField
              label="Install Folder"
              value={settings.projectPath}
              placeholder={snapshot.projectRoot}
              onChange={v => setSettings({ ...settings, projectPath: v })}
              onChoose={() => chooseSettingPath('project')}
              onOpen={() => revealSettingPath(settings.projectPath || snapshot.projectRoot, 'Install folder')}
              onReset={() => setSettings({ ...settings, projectPath: '' })}
              hint="Choose an empty folder for a new install, or an existing HomeInventory folder."
            />
            <PathSettingField
              label="Node Path"
              value={settings.nodePath}
              placeholder={nodeTool?.path || 'Auto-detected'}
              onChange={v => setSettings({ ...settings, nodePath: v })}
              onChoose={() => chooseSettingPath('node')}
              onOpen={() => revealSettingPath(settings.nodePath || nodeTool?.path || '', 'Node')}
              onReset={() => setSettings({ ...settings, nodePath: '' })}
              hint={nodeTool?.path ? `Detected: ${nodeTool.path}` : 'Set this only if the launcher cannot find your Node installation.'}
            />
            <PathSettingField
              label="npm Path"
              value={settings.npmPath}
              placeholder={npmTool?.path || 'Auto-detected'}
              onChange={v => setSettings({ ...settings, npmPath: v })}
              onChoose={() => chooseSettingPath('npm')}
              onOpen={() => revealSettingPath(settings.npmPath || npmTool?.path || '', 'npm')}
              onReset={() => setSettings({ ...settings, npmPath: '' })}
              hint={npmTool?.path ? `Detected: ${npmTool.path}` : 'Set this only if npm detection fails from the desktop app.'}
            />
            <div className="settings-actions">
              <button className="settings-action" onClick={() => revealSettingPath(snapshot.projectRoot, 'Install folder')}>
                <FolderOpen size={13} /> Open Folder
              </button>
              <button className="settings-action" onClick={() => revealSettingPath(snapshot.appDataDir, 'Launcher data')}>
                <FolderOpen size={13} /> Open Data
              </button>
              <button className="settings-action wide" onClick={() => {
                setSettings({ ...settings, nodePath: '', npmPath: '' });
                onNotice('Node/npm overrides cleared. Auto-detect is active.');
              }}>
                <RotateCcw size={13} /> Reset Node/npm Detection
              </button>
            </div>
            <div className="settings-info"><CircleDot size={11} /><span>{snapshot.appDataDir}</span></div>
          </div>
        )}
      </div>

      <footer className="modal-footer">
        {onStop && <button className="btn-danger" onClick={onStop}><Power size={13} /> Stop Server</button>}
        <span className="notice-text">{notice}</span>
      </footer>
    </>
  );
}

/* ── Small components ── */
function LogRows({ logs }: { logs: LogEntry[] }) {
  if (!logs.length) return <div className="empty-log">No log entries yet.</div>;
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
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="path-control">
        <input className="field-input" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
        <span className="path-buttons">
          <button type="button" className="icon-mini" onClick={onChoose} title="Choose path">
            <FolderOpen size={14} />
          </button>
          <button type="button" className="icon-mini" onClick={onOpen} title="Open location">
            <ExternalLink size={14} />
          </button>
          <button type="button" className="icon-mini" onClick={onReset} title="Use auto-detected path">
            <RotateCcw size={14} />
          </button>
        </span>
      </span>
      <span className="field-hint">{hint}</span>
    </label>
  );
}

/* ── Mock data for browser preview ── */
function mockSnapshot(settings: LauncherSettings): LauncherSnapshot {
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
    lanStatus: runningPreview ? {
      ok: true,
      frontendOk: true,
      backendOk: true,
      frontendUrl: 'http://192.168.1.42:5173',
      backendUrl: 'http://192.168.1.42:3001',
      message: 'Network address is ready. If another device cannot connect, allow HomeInventory or Node.js through Windows Firewall for private networks.',
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
