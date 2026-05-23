import React, { createContext, useContext, useState, useEffect } from 'react';

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
    const [theme, setTheme] = useState<Theme>(() => {
        // Check localStorage first
        const saved = localStorage.getItem('theme') as Theme | null;
        if (saved === 'light' || saved === 'dark') return saved;
        // Then check system preference
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
        return 'light';
    });

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    // Listen for system theme changes
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (e: MediaQueryListEvent) => {
            if (!localStorage.getItem('theme')) {
                setTheme(e.matches ? 'dark' : 'light');
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
