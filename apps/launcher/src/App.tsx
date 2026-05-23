import { invoke } from '@tauri-apps/api/core';
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
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import logoFull from './logo-full.svg';
import logoSymbolLight from './logo-symbol-light.svg';
import logoSymbolLightSvg from './logo-symbol-light.svg?raw';
import { QrCodeCard } from './QrCode';

/* ── Types ── */
type ViewKey = 'logs' | 'backups' | 'settings';

type ToolStatus = { name: string; path?: string | null; ok: boolean; detail: string };

type SetupStatus = {
  node: boolean; npm: boolean;
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
};

type CommandResult = { ok: boolean; message: string };

type PortCheckResult = {
  ok: boolean;
  backendPort: number;
  frontendPort: number;
  backendOk: boolean;
  frontendOk: boolean;
  suggestedBackendPort: number;
  suggestedFrontendPort: number;
  message: string;
};

type LauncherSettings = {
  projectPath: string; nodePath: string; npmPath: string; autoOpen: boolean;
};

type PathKind = 'project' | 'node' | 'npm';

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

  // User must click to start — no auto-boot
  const [userStarted, setUserStarted] = useState(false);

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

  const profiles = snapshot?.profiles ?? [];
  const active = profiles.find(p => p.id === snapshot?.activeProfileId) ?? null;
  const [selId, setSelId] = useState('homeinventory');
  useEffect(() => { if (snapshot?.activeProfileId) setSelId(snapshot.activeProfileId); }, [snapshot?.activeProfileId]);
  const selProfile = profiles.find(p => p.id === selId) || profiles[0] || null;
  const selectedBackendPort = selProfile ? parsePort(portApi, selProfile.backendPort) : 3001;
  const selectedFrontendPort = selProfile ? parsePort(portUi, selProfile.frontendPort) : 5173;
  const portInputError = useMemo(
    () => validatePortInputs(portApi, portUi, selProfile),
    [portApi, portUi, selProfile],
  );
  const portBusy = Boolean(!portInputError && portCheck && !portCheck.ok);
  const portBlocked = Boolean(portInputError);
  const portStatusBlocked = Boolean(portInputError || (portCheck && !portCheck.ok));
  const portMessage = portInputError || portCheck?.message || 'Ports are available.';
  const launchBackendPort = portBusy && portCheck ? portCheck.suggestedBackendPort : selectedBackendPort;
  const launchFrontendPort = portBusy && portCheck ? portCheck.suggestedFrontendPort : selectedFrontendPort;

  const ready = useMemo(() => {
    if (!snapshot) return false;
    const s = snapshot.setup;
    return s.node && s.npm && s.rootDependencies && s.clientDependencies && s.envFile;
  }, [snapshot]);

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
        await fetch(active.frontendUrl, { method: 'HEAD', mode: 'no-cors' });
        if (on) setServerReady(true);
      } catch { if (on) setTimeout(poll, 500); }
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
    if (!active || !serverReady || !settings.autoOpen || openedUrl === active.frontendUrl || !hasTauriRuntime()) return;
    setOpenedUrl(active.frontendUrl);
    invoke('open_app', { url: active.frontendUrl }).catch(e => setNotice(String(e)));
  }, [active, serverReady, settings.autoOpen, openedUrl]);

  useEffect(() => {
    if (!selProfile || portInputError) {
      setPortCheck(null);
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
            message: String(e),
          });
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selProfile, selectedBackendPort, selectedFrontendPort, portInputError]);

  /* ── Actions ── */
  async function run(label: string, action: () => Promise<CommandResult | unknown>) {
    setBusy(label);
    try {
      if (!hasTauriRuntime()) { setNotice(`${label}: simulated in browser mode.`); await new Promise(r => setTimeout(r, 1500)); return; }
      const r = await action();
      setNotice(isCmd(r) ? r.message : `${label} done.`);
      await refresh();
    } catch (e) { setNotice(String(e)); }
    finally { setBusy(null); }
  }

  const doStart = async (
    p: ProfileStatus,
    requestedBackendPort = launchBackendPort,
    requestedFrontendPort = launchFrontendPort,
  ) => {
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
          frontendUrl: `http://localhost:${frontendPort}`,
          backendUrl: `http://localhost:${backendPort}`,
        } : profile),
      } : prev);
      setServerReady(true);
      setNotice(`Starting ${p.name}: simulated in browser mode.`);
      return;
    }
    await run(`start-${p.id}`, () => invoke('start_profile', {
      request: { profileId: p.id, backendPort, frontendPort, overrides: overrides(settings) },
    }));
  };

  const doStop = async () => {
    setStopped(true); setServerReady(false); setShowDevPanel(false);
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

  const doInstall = () => run('install', () => invoke('install_dependencies', { overrides: overrides(settings) }));

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

  /* ── Auto-boot (only after user clicks Start) ── */
  useEffect(() => {
    if (userStarted && hasTauriRuntime() && snapshot && !ready && !busy && snapshot.setup.node && snapshot.setup.npm) doInstall();
  }, [snapshot, ready, busy, userStarted]);

  useEffect(() => {
    if (userStarted && hasTauriRuntime() && snapshot && ready && !snapshot.activeProfileId && !busy && !stopped) {
      const dp = snapshot.profiles.find(p => p.id === 'homeinventory');
      if (dp) doStart(dp);
    }
  }, [snapshot, ready, busy, stopped, userStarted]);

  /* ── Render ── */
  if (!snapshot) return <div className="loading-state"><Loader2 size={28} className="spin" /><span>Loading environment…</span></div>;

  /* ─── STATE 1: Setup ─── */
  if (!ready && !(active && serverReady)) {
    const s = snapshot.setup;
    const installing = busy === 'install';
    let pct = 0;
    if (s.node) pct += 20; if (s.npm) pct += 20; if (s.envFile) pct += 20;
    if (s.rootDependencies) pct += 20; if (s.clientDependencies) pct += 20;

    let msg = 'Waiting to initialize…';
    if (!s.node || !s.npm) msg = 'Node.js is required.';
    else if (installing) {
      if (pct < 60) msg = 'Installing core packages…';
      else if (pct < 80) msg = 'Configuring database…';
      else if (pct < 100) msg = 'Building interface (30-40s)…';
      else msg = 'Finalizing…';
    }

    return (
      <div className="splash-layout">
        <div className="splash-card">
          <div className="splash-logo-wrap">
            <img src={logoFull} alt="HomeInventory" className="splash-logo-full pulsing" />
            <div className="logo-aura" />
          </div>
          <p className="splash-subtitle">Your private household registry</p>
          <span className="version-badge">v2.0 · Local-first</span>

          {installing ? (
            <div className="progress-wrap" style={{ marginTop: 28 }}>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
              <div className="progress-meta"><span>{msg}</span><span>{pct}%</span></div>
            </div>
          ) : (!s.node || !s.npm) ? (
            <div className="error-box">
              <AlertCircle size={16} />
              <div>
                <strong>Node.js not found</strong>
                <p>Download and install from <a href="https://nodejs.org" target="_blank" rel="noreferrer">nodejs.org</a> to continue.</p>
              </div>
            </div>
          ) : (
            <div style={{ width: '100%', marginTop: 28 }}>
              <button className="btn-primary" onClick={() => { setUserStarted(true); if (selProfile) doLaunch(selProfile); else doInstall(); }} disabled={Boolean(busy) || portBlocked}>
                {busy ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
                {portBusy ? `Launch on ${launchBackendPort}/${launchFrontendPort}` : 'Initialize & Launch'}
              </button>

              <AdvancedConfigPanel
                showAdvanced={showAdvanced} setShowAdvanced={setShowAdvanced}
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
                portBlocked={portStatusBlocked}
                onUseSuggestedPorts={() => {
                  if (!portCheck) return;
                  setPortApi(String(portCheck.suggestedBackendPort));
                  setPortUi(String(portCheck.suggestedFrontendPort));
                }}
              />
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
            <span>{active?.frontendUrl ?? `http://localhost:${launchFrontendPort}`}</span>
          </footer>
        </div>
      </div>
    );
  }

  /* ─── STATE 3: Running ─── */
  if (active && serverReady) {
    const lanStatus = snapshot.lanStatus;
    const activeLanUrl = lanStatus?.frontendUrl || (snapshot.localIp ? `http://${snapshot.localIp}:${active.frontendPort}` : active.frontendUrl);

    return (
      <div className="running-layout">
        <section className="running-card">
          <img src={logoFull} alt="HomeInventory" className="running-logo" />
          <div className="running-status">
            <span className="status-pulse" />
            <span>Running locally</span>
          </div>
          <a className="running-url" href={active.frontendUrl} target="_blank" rel="noreferrer">
            {active.frontendUrl}
          </a>

          <div className="running-qr">
            <QrCodeCard url={activeLanUrl} size={188} logoSrc={logoSymbolLight} logoSvg={logoSymbolLightSvg} />
            <div className={`lan-status ${lanStatus?.ok ? 'ok' : 'blocked'}`}>
              <Wifi size={12} />
              <span>{lanStatus?.message || 'LAN status is checked after the services bind to the network.'}</span>
            </div>
          </div>

          <button
            className="btn-primary"
            onClick={() => run('open browser', () => invoke('open_app', { url: active.frontendUrl }))}
            title="Open in browser"
          >
            <ExternalLink size={15} />
            Open app
          </button>

          <div className="running-meta">
            <span>API {active.backendPort}</span>
            <span>UI {active.frontendPort}</span>
          </div>

          <div className="running-actions" aria-label="Launcher controls">
            <button className="icon-action" onClick={() => { setDevTab('settings'); setShowDevPanel(true); }} title="Manage app">
              <SlidersHorizontal size={15} />
            </button>
            <button className="icon-action" onClick={() => { setDevTab('logs'); setShowDevPanel(true); }} title="Show logs">
              <Terminal size={15} />
            </button>
            <button className="icon-action danger" onClick={doStop} title="Stop services">
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
                onBackup={p => run('backup', () => invoke('backup_now', { request: { profileId: p.id } }))}
                onStop={doStop}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ─── STATE 4: Stopped ─── */
  const startButtonLabel = stopped ? 'Restart HomeInventory' : 'Launch HomeInventory';

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
          <button className="btn-primary" disabled={Boolean(busy) || !selProfile || portBlocked}
            onClick={() => selProfile && doLaunch(selProfile)}>
            {busy?.startsWith('start-') ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
            {portBusy ? `Launch on ${launchBackendPort}/${launchFrontendPort}` : startButtonLabel}
          </button>

          <AdvancedConfigPanel
            showAdvanced={showAdvanced} setShowAdvanced={setShowAdvanced}
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
            portBlocked={portStatusBlocked}
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
          <span>API: {launchBackendPort} · UI: {launchFrontendPort}</span>
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
              onBackup={p => run('backup', () => invoke('backup_now', { request: { profileId: p.id } }))}
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
  lanStatus, portCheck, portMessage, portBlocked, onUseSuggestedPorts,
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
              <li><strong>Network:</strong> Ports must be free locally; LAN access also depends on firewall and same Wi-Fi.</li>
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
              <span>Network Ports</span>
              <span className="config-badge required">Required</span>
            </div>
            <div className="row-2">
              <div className="field">
                <label className="field-label">API Port</label>
                <input className={`field-input ${portBlocked && !portCheck?.backendOk ? 'invalid' : ''}`}
                  type="number" inputMode="numeric" min={1024} max={65535} value={portApi}
                  onChange={e => setPortApi(sanitizePortInput(e.target.value))} placeholder="3001" />
              </div>
              <div className="field">
                <label className="field-label">UI Port</label>
                <input className={`field-input ${portBlocked && !portCheck?.frontendOk ? 'invalid' : ''}`}
                  type="number" inputMode="numeric" min={1024} max={65535} value={portUi}
                  onChange={e => setPortUi(sanitizePortInput(e.target.value))} placeholder="5173" />
              </div>
            </div>
            <span className="field-hint">Valid range: 1024–65535. Defaults: API 3001, UI 5173. Only change if another app is using the same port.</span>
            <div className={`port-status ${portBlocked ? 'blocked' : 'ok'}`}>
              <span>{portMessage}</span>
              {portBlocked && portCheck && (
                <button type="button" className="mini-action" onClick={onUseSuggestedPorts}>
                  Use {portCheck.suggestedBackendPort}/{portCheck.suggestedFrontendPort}
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
              <li>Allow Node/HomeInventory through the firewall if prompted.</li>
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
}: {
  snapshot: LauncherSnapshot; profiles: ProfileStatus[];
  settings: LauncherSettings; setSettings: (s: LauncherSettings) => void;
  devTab: ViewKey; setDevTab: (t: ViewKey) => void;
  busy: string | null; notice: string;
  onNotice: (message: string) => void;
  onClose: () => void; onBackup: (p: ProfileStatus) => void; onStop?: () => void;
}) {
  const nodeTool = snapshot.tools.find(tool => tool.name === 'Node.js');
  const npmTool = snapshot.tools.find(tool => tool.name === 'npm');

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
        <button className={devTab === 'settings' ? 'active' : ''} onClick={() => setDevTab('settings')}>Settings</button>
      </nav>

      <div className="modal-body">
        {devTab === 'logs' && <div className="tab-logs"><LogRows logs={snapshot.logs} /></div>}

        {devTab === 'backups' && (
          <div>
            <p className="tab-description">One-click backups of your local data and media.</p>
            <div className="backup-actions">
              {profiles.map(p => (
                <div className="backup-card" key={p.id}>
                  <strong>{p.name}</strong>
                  <span className="path-text">{p.dbPath}</span>
                  <button className="btn-secondary" onClick={() => onBackup(p)} disabled={busy === 'backup' || !p.available}>
                    {busy === 'backup' ? <Loader2 size={13} className="spin" /> : <FolderArchive size={13} />}
                    Backup
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {devTab === 'settings' && (
          <div className="tab-settings">
            <PathSettingField
              label="Project Root"
              value={settings.projectPath}
              placeholder={snapshot.projectRoot}
              onChange={v => setSettings({ ...settings, projectPath: v })}
              onChoose={() => chooseSettingPath('project')}
              onOpen={() => revealSettingPath(settings.projectPath || snapshot.projectRoot, 'Project root')}
              onReset={() => setSettings({ ...settings, projectPath: '' })}
              hint="Select the HomeInventory repository folder when the launcher is moved away from the project."
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
              <button className="settings-action" onClick={() => revealSettingPath(snapshot.projectRoot, 'Project root')}>
                <FolderOpen size={13} /> Open Project
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
    projectRoot: root, appDataDir: data, activeProfileId: runningPreview ? 'homeinventory' : null,
    lanStatus: runningPreview ? {
      ok: true,
      frontendOk: true,
      backendOk: true,
      frontendUrl: 'http://192.168.1.42:5173',
      backendUrl: 'http://192.168.1.42:3001',
      message: 'LAN probe passed. Other devices should be able to connect on the same network.',
    } : null,
    tools: [
      { name: 'Node.js', path: '/usr/local/bin/node', ok: true, detail: 'Ready' },
      { name: 'npm', path: '/usr/local/bin/npm', ok: true, detail: 'Ready' },
    ],
    setup: {
      node: true,
      npm: true,
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
