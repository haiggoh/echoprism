import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

/**
 * 2a design audit → Phase B: the app was dark-only and the audit narrowed
 * the theme type to what existed. The light palette now exists
 * (contrast-measured — light-theme-contrast.test.ts), so 'light' is a real
 * option again: it applies the html.light class the stylesheet answers, and
 * 'system' resolves through the OS preference. A legacy stored 'light'
 * from before the 2a narrowing now resolves honestly instead of reading
 * as dark.
 */
type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/** Storage is absent in some sandboxed webviews and in jsdom; never assume it. */
function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage?.getItem('theme');
    return stored === 'dark' || stored === 'light' ? stored : 'system';
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

/** jsdom and some webviews lack matchMedia; absence means dark (dark-first). */
function systemPrefersLight(): boolean {
  try {
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ?? false;
  } catch {
    return false;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof window !== 'undefined' ? readStoredTheme() : 'system'
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    // Phase B: 'system' resolves through the OS; light applies the palette
    // the stylesheet now answers.
    const resolved = theme === 'light' || (theme === 'system' && systemPrefersLight())
      ? 'light'
      : 'dark';
    root.classList.add(resolved);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    writeStoredTheme(newTheme);
  };

  const resolvedTheme = theme === 'light' || (theme === 'system' && systemPrefersLight())
    ? 'light'
    : 'dark';

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
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
