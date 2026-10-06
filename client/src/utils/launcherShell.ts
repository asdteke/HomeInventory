// HomeInventory inside the desktop launcher's app window. The launcher marks
// the page before it loads and drives it with DOM events only; the page has
// no launcher IPC. The launcher sidebar then replaces the app's own sidebar.

declare global {
    interface Window {
        __HOMEINVENTORY_LAUNCHER_SHELL__?: { version: number };
    }
}

export const LAUNCHER_NAVIGATE_EVENT = 'homeinventory:launcher-navigate';
export const LAUNCHER_ACCOUNT_EVENT = 'homeinventory:launcher-account';
export const LAUNCHER_LANGUAGE_EVENT = 'homeinventory:launcher-language';

/** Pages the launcher sidebar may open; mirrors the app sidebar. */
export const LAUNCHER_SHELL_ROUTES: readonly string[] = [
    '/',
    '/items',
    '/maintenance',
    '/shopping',
    '/borrow-requests',
    '/vault',
    '/settings',
    '/admin'
];

export function isLauncherShell(): boolean {
    return typeof window !== 'undefined' && Boolean(window.__HOMEINVENTORY_LAUNCHER_SHELL__);
}

export interface LauncherShellState {
    language?: string;
    theme?: 'light' | 'dark';
    signedIn: boolean;
    isAdmin: boolean;
    userName?: string;
}

declare global {
    interface Window {
        __HOMEINVENTORY_LAUNCHER_STATE__?: LauncherShellState;
    }
}

const shellState: LauncherShellState = { signedIn: false, isAdmin: false };

/**
 * Publishes what the launcher sidebar mirrors (language, theme, account).
 * The launcher reads this object; the page never calls the launcher.
 */
export function publishLauncherState(patch: Partial<LauncherShellState>): void {
    if (!isLauncherShell()) return;
    Object.assign(shellState, patch);
    window.__HOMEINVENTORY_LAUNCHER_STATE__ = { ...shellState };
}
