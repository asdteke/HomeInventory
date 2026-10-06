import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { publishLauncherState } from '../utils/launcherShell';

export type Theme = 'light' | 'dark';

export interface ThemeContextValue {
    theme: Theme;
    setTheme: React.Dispatch<React.SetStateAction<Theme>>;
    toggleTheme: () => void;
    isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const useTheme = (): ThemeContextValue => {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used within ThemeProvider');
    return context;
};

interface ThemeProviderProps {
    children: React.ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
    const [theme, setThemeState] = useState<Theme>(() => {
        // Check localStorage first
        const saved = localStorage.getItem('theme') as Theme | null;
        if (saved === 'light' || saved === 'dark') return saved;
        // Then check system preference
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
        return 'light';
    });

    // Layout effect: the class must be in place when a view transition
    // captures the new state.
    useLayoutEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        localStorage.setItem('theme', theme);
        publishLauncherState({ theme });
    }, [theme]);

    // Cross-fade between light and dark where the browser supports it.
    const setTheme = useCallback<React.Dispatch<React.SetStateAction<Theme>>>((value) => {
        const doc = document as Document & { startViewTransition?: (update: () => void) => unknown };
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!doc.startViewTransition || reduceMotion) {
            setThemeState(value);
            return;
        }
        doc.startViewTransition(() => {
            flushSync(() => setThemeState(value));
        });
    }, []);

    // Listen for system theme changes
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (e: MediaQueryListEvent) => {
            if (!localStorage.getItem('theme')) {
                setThemeState(e.matches ? 'dark' : 'light');
            }
        };
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    const isDark = theme === 'dark';

    return (
        <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isDark }}>
            {children}
        </ThemeContext.Provider>
    );
};
