import React, { useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { AccentColor, ThemeValue } from '../store/settingsStore';
import './SettingsPanel.css';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const ACCENT_COLORS: { value: AccentColor; hex: string; label: string }[] = [
  { value: 'blue',   hex: '#3b82f6', label: 'Blue' },
  { value: 'purple', hex: '#a855f7', label: 'Purple' },
  { value: 'green',  hex: '#22c55e', label: 'Green' },
  { value: 'orange', hex: '#f97316', label: 'Orange' },
  { value: 'red',    hex: '#ef4444', label: 'Red' },
  { value: 'teal',   hex: '#14b8a6', label: 'Teal' },
  { value: 'pink',   hex: '#ec4899', label: 'Pink' },
  { value: 'yellow', hex: '#eab308', label: 'Yellow' },
];

const THEME_OPTIONS: { value: ThemeValue; label: string }[] = [
  { value: 'dark',   label: 'Dark' },
  { value: 'light',  label: 'Light' },
  { value: 'system', label: 'System' },
];

// Moon icon for Dark
function MoonIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13 10A6 6 0 0 1 6 3a6 6 0 1 0 7 7z" />
    </svg>
  );
}

// Sun icon for Light
function SunIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="3" />
      <line x1="8" y1="1" x2="8" y2="3" />
      <line x1="8" y1="13" x2="8" y2="15" />
      <line x1="1" y1="8" x2="3" y2="8" />
      <line x1="13" y1="8" x2="15" y2="8" />
      <line x1="3.05" y1="3.05" x2="4.46" y2="4.46" />
      <line x1="11.54" y1="11.54" x2="12.95" y2="12.95" />
      <line x1="12.95" y1="3.05" x2="11.54" y2="4.46" />
      <line x1="4.46" y1="11.54" x2="3.05" y2="12.95" />
    </svg>
  );
}

// Monitor icon for System
function MonitorIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="1" y="2" width="14" height="10" rx="1.5" />
      <line x1="5" y1="15" x2="11" y2="15" />
      <line x1="8" y1="12" x2="8" y2="15" />
    </svg>
  );
}

// Checkmark icon for selected accent
function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="2 8 6 12 14 4" />
    </svg>
  );
}

function getThemeIcon(value: ThemeValue) {
  switch (value) {
    case 'dark':   return <MoonIcon />;
    case 'light':  return <SunIcon />;
    case 'system': return <MonitorIcon />;
  }
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
  const { theme, accentColor, setTheme, setAccentColor } = useTheme();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Overlay backdrop */}
      <div
        className={`settings-overlay${isOpen ? ' settings-overlay--visible' : ''}`}
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Slide-in drawer */}
      <div
        className={`settings-panel${isOpen ? ' settings-panel--open' : ''}`}
        role="dialog"
        aria-label="Settings"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-panel-header">
          <span className="settings-panel-title">Settings</span>
          <button
            className="settings-panel-close"
            onClick={onClose}
            aria-label="Close settings"
            title="Close"
          >
            ×
          </button>
        </div>

        <div className="settings-panel-body">
          {/* Theme section */}
          <section className="settings-section">
            <h3 className="settings-section-label">Theme</h3>
            <div className="settings-theme-row">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`settings-theme-btn${theme === opt.value ? ' settings-theme-btn--active' : ''}`}
                  onClick={() => setTheme(opt.value)}
                  aria-label={opt.label}
                  title={opt.label}
                  aria-pressed={theme === opt.value}
                >
                  {getThemeIcon(opt.value)}
                  <span className="settings-theme-btn-label">{opt.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Accent color section */}
          <section className="settings-section">
            <h3 className="settings-section-label">Accent Color</h3>
            <div className="settings-accent-grid">
              {ACCENT_COLORS.map((color) => (
                <button
                  key={color.value}
                  className={`settings-accent-swatch${accentColor === color.value ? ' settings-accent-swatch--active' : ''}`}
                  style={{ '--swatch-color': color.hex } as React.CSSProperties}
                  onClick={() => setAccentColor(color.value)}
                  aria-label={color.label}
                  title={color.label}
                  aria-pressed={accentColor === color.value}
                >
                  {accentColor === color.value && <CheckIcon />}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
};

export default SettingsPanel;
