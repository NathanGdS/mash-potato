import React, { useState, useRef, useCallback, useEffect } from 'react';

import Sidebar from './components/Sidebar';
import TabBar from './components/TabBar';
import RequestEditor from './components/RequestEditor';
import ResponseViewer from './components/ResponseViewer';
import EnvironmentPanel from './components/EnvironmentPanel';
import EnvironmentSelector from './components/EnvironmentSelector';
import CollectionRunner from './components/CollectionRunner';
import SettingsPanel from './components/SettingsPanel';
import SearchPalette from './components/SearchPalette';
import DiffViewer from './components/DiffViewer';
import { useRequestsStore } from './store/requestsStore';
import { useTabsStore } from './store/tabsStore';
import { useHistoryStore } from './store/historyStore';
import './styles/themes/dark.css';
import './styles/themes/light.css';
import './styles/accents.css';
import './App.css';

const MIN_PANE_HEIGHT = 120;
const STORAGE_KEY = 'mash-potato:split-ratio';
const SIDEBAR_STORAGE_KEY = 'mash-potato:sidebar-width';
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 240;

function loadSplitRatio(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const ratio = parseFloat(stored);
      if (!isNaN(ratio) && ratio > 0 && ratio < 1) return ratio;
    }
  } catch {
    // ignore
  }
  return 0.5;
}

function loadSidebarWidth(): number {
  try {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored !== null) {
      const width = parseInt(stored, 10);
      if (!isNaN(width) && width >= SIDEBAR_MIN && width <= SIDEBAR_MAX) return width;
    }
  } catch {
    // ignore
  }
  return SIDEBAR_DEFAULT;
}

const App: React.FC = () => {
  const activeRequest = useRequestsStore((s) => s.activeRequest);
  const updateTab = useTabsStore((s) => s.updateTab);
  const restoreTabs = useTabsStore((s) => s.restoreTabs);
  const diffSelection = useHistoryStore((s) => s.diffSelection);
  const clearDiffSelection = useHistoryStore((s) => s.clearDiffSelection);
  const [showEnvPanel, setShowEnvPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDiffViewer, setShowDiffViewer] = useState(false);

  const handleCompare = useCallback(() => {
    setShowDiffViewer(true);
  }, []);

  // Restore open tabs on app load.
  useEffect(() => {
    restoreTabs();
  }, [restoreTabs]);

  // Keep the open tab's method/name in sync when the active request is saved
  useEffect(() => {
    if (!activeRequest) return;
    updateTab(activeRequest.id, {
      requestName: activeRequest.name,
      method: activeRequest.method,
    });
  }, [activeRequest?.id, activeRequest?.name, activeRequest?.method, updateTab]); // eslint-disable-line react-hooks/exhaustive-deps
  // Open search palette on Ctrl+K / Cmd+K
  useEffect(() => {
    const handleSearchKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch((prev) => {
          if (!prev) setSearchQuery('');
          return !prev;
        });
      }
    };
    window.addEventListener('keydown', handleSearchKey);
    return () => window.removeEventListener('keydown', handleSearchKey);
  }, []);

  const [splitRatio, setSplitRatio] = useState<number>(loadSplitRatio);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !workspaceRef.current) return;
    const rect = workspaceRef.current.getBoundingClientRect();
    const totalHeight = rect.height;
    const offsetY = e.clientY - rect.top;
    const minRatio = MIN_PANE_HEIGHT / totalHeight;
    const maxRatio = 1 - MIN_PANE_HEIGHT / totalHeight;
    const newRatio = Math.min(Math.max(offsetY / totalHeight, minRatio), maxRatio);
    setSplitRatio(newRatio);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    setSplitRatio((ratio) => {
      try {
        localStorage.setItem(STORAGE_KEY, String(ratio));
      } catch {
        // ignore
      }
      return ratio;
    });
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // ── Sidebar resize ───────────────────────────────────────
  const [sidebarWidth, setSidebarWidth] = useState<number>(loadSidebarWidth);
  const isDraggingSidebar = useRef(false);

  const handleSidebarDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSidebar.current = true;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleSidebarMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingSidebar.current) return;
    const clamped = Math.min(Math.max(e.clientX, SIDEBAR_MIN), SIDEBAR_MAX);
    setSidebarWidth(clamped);
  }, []);

  const handleSidebarMouseUp = useCallback(() => {
    if (!isDraggingSidebar.current) return;
    isDraggingSidebar.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    setSidebarWidth((w) => {
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(w));
      } catch {
        // ignore
      }
      return w;
    });
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleSidebarMouseMove);
    window.addEventListener('mouseup', handleSidebarMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleSidebarMouseMove);
      window.removeEventListener('mouseup', handleSidebarMouseUp);
    };
  }, [handleSidebarMouseMove, handleSidebarMouseUp]);

  return (
    <div className="app-layout">
      <div className="app-sidebar-wrapper" style={{ width: sidebarWidth, flexShrink: 0 }}>
        <Sidebar onSettingsClick={() => setShowSettings(true)} onCompare={handleCompare} onSearchClick={() => { setShowSearch(true); setSearchQuery(''); }} />
      </div>
      <div
        className="app-divider app-divider--vertical"
        onMouseDown={handleSidebarDividerMouseDown}
        aria-label="Resize sidebar"
        role="separator"
        aria-orientation="vertical"
      />
      <main className="app-main">
        <div className="app-topbar">
          <span className="app-brand">
            🥔 <strong>Mash</strong> Potato
          </span>
          <div className="app-topbar-controls">
            <button
              className="app-env-btn"
              title="Manage Environments"
              onClick={() => setShowEnvPanel(true)}
              aria-label="Manage Environments"
            >
              Environments
            </button>
            <EnvironmentSelector />
          </div>
        </div>
        <TabBar />
        {activeRequest ? (
          <div className="app-workspace" ref={workspaceRef}>
            <div
              className="app-request-pane"
              style={{ height: `calc(${splitRatio * 100}% - 5px)` }}
            >
              <RequestEditor request={activeRequest} />
            </div>
            <div
              className="app-divider"
              onMouseDown={handleDividerMouseDown}
              aria-label="Resize panels"
              role="separator"
              aria-orientation="horizontal"
            >
              <span className="app-divider-dots" aria-hidden="true" />
            </div>
            <div className="app-response-pane">
              <ResponseViewer />
            </div>
          </div>
        ) : (
          <div className="app-placeholder">
            <p>Select a request to start editing.</p>
          </div>
        )}
      </main>
      {showEnvPanel && <EnvironmentPanel onClose={() => setShowEnvPanel(false)} />}
      <CollectionRunner />
      <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />
      {showSearch && (
        <SearchPalette
          query={searchQuery}
          setQuery={setSearchQuery}
          onClose={() => setShowSearch(false)}
        />
      )}
      {showDiffViewer && diffSelection.length === 2 && (() => {
        const [older, newer] = [...diffSelection].sort(
          (a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime()
        );
        return (
          <DiffViewer
            older={older}
            newer={newer}
            onClose={() => {
              setShowDiffViewer(false);
              clearDiffSelection();
            }}
          />
        );
      })()}
    </div>
  );
};

export default App;
