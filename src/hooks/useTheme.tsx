import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

/**
 * 2a design audit: the app is dark-only. brand.md defines one (dark) palette
 * and src/index.css carries no light rules, so 'light' was never a real
 * option — resolving to it applied a class no stylesheet answered. The type
 * is narrowed to what exists; a legacy stored 'light' value reads as 'dark'.
 */
type Theme = 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'dark';
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/** Storage is absent in some sandboxed webviews and in jsdom; never assume it. */
function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage?.getItem('theme');
    return stored === 'dark' ? 'dark' : 'system';
  } catch {
    return 'system';
  }
}

function writeStoredTheme(theme: Theme) {
  try {
    window.localStorage?.setItem('theme', theme);
  } catch {
    // Storage unavailable — the in-memory state still applies for this session.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof window !== 'undefined' ? readStoredTheme() : 'system'
  );

  useEffect(() => {
    const root = document.documentElement;
    // Both 'system' and 'dark' resolve dark: there is no light palette yet.
    // When one is designed, this is the single place the resolution changes.
    root.classList.remove('light');
    root.classList.add('dark');
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    writeStoredTheme(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme: 'dark', setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
