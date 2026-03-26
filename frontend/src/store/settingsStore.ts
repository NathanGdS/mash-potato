import { create } from 'zustand';
import { GetSetting, SetSetting } from '../wailsjs/go/main/App';

export type ThemeValue = 'dark' | 'light' | 'system';
export type AccentColor =
  | 'blue'
  | 'purple'
  | 'green'
  | 'orange'
  | 'red'
  | 'teal'
  | 'pink'
  | 'yellow';

const THEME_KEY = 'theme';
const ACCENT_KEY = 'accent_color';
const LS_THEME_KEY = 'mp_theme';
const LS_ACCENT_KEY = 'mp_accent';

const DEFAULT_THEME: ThemeValue = 'dark';
const DEFAULT_ACCENT: AccentColor = 'blue';

function isThemeValue(v: string): v is ThemeValue {
  return v === 'dark' || v === 'light' || v === 'system';
}

function isAccentColor(v: string): v is AccentColor {
  return ['blue', 'purple', 'green', 'orange', 'red', 'teal', 'pink', 'yellow'].includes(v);
}

interface SettingsState {
  theme: ThemeValue;
  accentColor: AccentColor;
  loaded: boolean;

  /** Load persisted settings from the Go backend. Sets loaded = true on completion. */
  loadSettings: () => Promise<void>;

  /** Persist theme to the Go backend and mirror to localStorage. */
  setTheme: (theme: ThemeValue) => Promise<void>;

  /** Persist accent color to the Go backend and mirror to localStorage. */
  setAccentColor: (color: AccentColor) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: DEFAULT_THEME,
  accentColor: DEFAULT_ACCENT,
  loaded: false,

  loadSettings: async () => {
    try {
      const [rawTheme, rawAccent] = await Promise.all([
        GetSetting(THEME_KEY),
        GetSetting(ACCENT_KEY),
      ]);

      const theme: ThemeValue = isThemeValue(rawTheme) ? rawTheme : DEFAULT_THEME;
      const accentColor: AccentColor = isAccentColor(rawAccent) ? rawAccent : DEFAULT_ACCENT;

      localStorage.setItem(LS_THEME_KEY, theme);
      localStorage.setItem(LS_ACCENT_KEY, accentColor);

      set({ theme, accentColor, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  setTheme: async (theme: ThemeValue) => {
    await SetSetting(THEME_KEY, theme);
    localStorage.setItem(LS_THEME_KEY, theme);
    set({ theme });
  },

  setAccentColor: async (color: AccentColor) => {
    await SetSetting(ACCENT_KEY, color);
    localStorage.setItem(LS_ACCENT_KEY, color);
    set({ accentColor: color });
  },
}));
