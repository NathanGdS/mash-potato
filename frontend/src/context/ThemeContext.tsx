import {
  createContext,
  useContext,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import { useSettingsStore, ThemeValue, AccentColor } from '../store/settingsStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveTheme(theme: ThemeValue): 'dark' | 'light' {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: ThemeValue, accentColor: AccentColor): void {
  document.body.setAttribute('data-theme', resolveTheme(theme));
  document.body.setAttribute('data-accent', accentColor);
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ThemeContextValue {
  theme: ThemeValue;
  accentColor: AccentColor;
  setTheme: (theme: ThemeValue) => Promise<void>;
  setAccentColor: (color: AccentColor) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const { theme, accentColor, loaded, loadSettings, setTheme, setAccentColor } =
    useSettingsStore();

  // Track whether we have an active matchMedia listener so we can clean it up.
  const mediaQueryRef = useRef<MediaQueryList | null>(null);
  const mediaListenerRef = useRef<((e: MediaQueryListEvent) => void) | null>(null);

  // Load settings once on mount.
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Whenever theme or accentColor change (including after loadSettings resolves),
  // apply attributes to document.body and manage the matchMedia listener.
  useEffect(() => {
    if (!loaded) return;

    applyTheme(theme, accentColor);

    // Remove any existing listener before potentially adding a new one.
    if (mediaQueryRef.current && mediaListenerRef.current) {
      mediaQueryRef.current.removeEventListener('change', mediaListenerRef.current);
      mediaQueryRef.current = null;
      mediaListenerRef.current = null;
    }

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (e: MediaQueryListEvent) => {
        document.body.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      };
      mq.addEventListener('change', listener);
      mediaQueryRef.current = mq;
      mediaListenerRef.current = listener;
    }

    // Cleanup on unmount or before next effect run.
    return () => {
      if (mediaQueryRef.current && mediaListenerRef.current) {
        mediaQueryRef.current.removeEventListener('change', mediaListenerRef.current);
        mediaQueryRef.current = null;
        mediaListenerRef.current = null;
      }
    };
  }, [theme, accentColor, loaded]);

  const contextValue: ThemeContextValue = {
    theme,
    accentColor,
    setTheme,
    setAccentColor,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
