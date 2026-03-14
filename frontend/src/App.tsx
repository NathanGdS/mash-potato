import React, { useState, useRef, useCallback, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import TabBar from './components/TabBar';
import RequestEditor from './components/RequestEditor';
import ResponseViewer from './components/ResponseViewer';
import EnvironmentPanel from './components/EnvironmentPanel';
import EnvironmentSelector from './components/EnvironmentSelector';
import { useRequestsStore } from './store/requestsStore';
import { useTabsStore } from './store/tabsStore';
import './App.css';

const MIN_PANE_HEIGHT = 120;
const STORAGE_KEY = 'mash-potato:split-ratio';

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

const App: React.FC = () => {
  const activeRequest = useRequestsStore((s) => s.activeRequest);
  const updateTab = useTabsStore((s) => s.updateTab);
  const restoreTabs = useTabsStore((s) => s.restoreTabs);
  const [showEnvPanel, setShowEnvPanel] = useState(false);

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

  return (
    <div className="app-layout">
      <Sidebar />
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
    </div>
  );
};

export default App;
