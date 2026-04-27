import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all Wails bindings
vi.mock('./wailsjs/go/main/App', () => ({
  RestoreTabs: vi.fn(() => Promise.resolve([])),
  ListEnvironments: vi.fn(() => Promise.resolve([])),
  GetGlobalEnvironmentID: vi.fn(() => Promise.resolve('__global__')),
  GetActiveEnvironment: vi.fn(() => Promise.resolve('')),
  GetRunnerLoopLimit: vi.fn(() => Promise.resolve(10)),
}));
vi.mock('../wailsjs/go/main/App', () => ({
  RestoreTabs: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../wailsjs/runtime/runtime', () => ({}));
vi.mock('./wailsjs/runtime/runtime', () => ({}));

const mockFetchEnvironments = vi.fn(() => Promise.resolve());

vi.mock('./store/environmentsStore', () => ({
  useEnvironmentsStore: (sel?: (s: any) => any) => {
    const store = { fetchEnvironments: mockFetchEnvironments };
    return sel ? sel(store) : store;
  },
}));

vi.mock('./store/requestsStore', () => ({
  useRequestsStore: (sel?: (s: any) => any) => {
    const store = { activeRequest: null };
    return sel ? sel(store) : store;
  },
}));

vi.mock('./store/tabsStore', () => ({
  useTabsStore: (sel?: (s: any) => any) => {
    const store = { updateTab: vi.fn(), restoreTabs: vi.fn(() => Promise.resolve()) };
    return sel ? sel(store) : store;
  },
}));

vi.mock('./store/historyStore', () => ({
  useHistoryStore: (sel?: (s: any) => any) => {
    const store = { diffSelection: [], clearDiffSelection: vi.fn() };
    return sel ? sel(store) : store;
  },
}));

// Mock all sidebar/heavy child components
vi.mock('./components/Sidebar', () => ({ default: () => <div data-testid="sidebar" /> }));
vi.mock('./components/TabBar', () => ({ default: () => null }));
vi.mock('./components/RequestEditor', () => ({ default: () => null }));
vi.mock('./components/ResponseViewer', () => ({ default: () => null }));
vi.mock('./components/EnvironmentPanel', () => ({ default: () => null }));
vi.mock('./components/EnvironmentSelector', () => ({ default: () => null }));
vi.mock('./components/CollectionRunner', () => ({ default: () => null }));
vi.mock('./components/SettingsPanel', () => ({ default: () => null }));
vi.mock('./components/SearchPalette', () => ({ default: () => null }));
vi.mock('./components/DiffViewer', () => ({ default: () => null }));
vi.mock('./context/ThemeContext', () => ({
  ThemeProvider: ({ children }: any) => children,
  useTheme: () => ({ theme: 'dark', accentColor: 'violet', setTheme: vi.fn(), setAccentColor: vi.fn() }),
}));

import App from './App';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('App mount — environments eager init', () => {
  it('calls fetchEnvironments on mount before user opens any panel', () => {
    render(<App />);
    expect(mockFetchEnvironments).toHaveBeenCalledTimes(1);
  });
});
