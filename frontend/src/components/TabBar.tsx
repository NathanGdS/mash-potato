import React from 'react';
import { useTabsStore } from '../store/tabsStore';
import { useRequestsStore } from '../store/requestsStore';
import './TabBar.css';

function methodClass(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':    return 'tab-method tab-method--get';
    case 'POST':   return 'tab-method tab-method--post';
    case 'PUT':    return 'tab-method tab-method--put';
    case 'PATCH':  return 'tab-method tab-method--patch';
    case 'DELETE': return 'tab-method tab-method--delete';
    default:       return 'tab-method tab-method--other';
  }
}

const TabBar: React.FC = () => {
  const { openTabs, activeTabId, dirtyTabs, closeTab, setActiveTab } = useTabsStore();
  const openRequest = useRequestsStore((s) => s.openRequest);

  if (openTabs.length === 0) return null;

  const handleTabClick = (requestId: string) => {
    setActiveTab(requestId);
    openRequest(requestId).catch((err) => console.error('Failed to load request:', err));
  };

  const handleClose = (e: React.MouseEvent, requestId: string) => {
    e.stopPropagation();
    const { openTabs: tabs, activeTabId: currentActive } = useTabsStore.getState();
    closeTab(requestId);

    // If we closed the active tab, load the new active tab's request
    if (currentActive === requestId) {
      const idx = tabs.findIndex((t) => t.requestId === requestId);
      const remaining = tabs.filter((t) => t.requestId !== requestId);
      if (remaining.length === 0) {
        // No tabs left — clear active request
        useRequestsStore.setState({ activeRequest: null });
      } else {
        const nextTab = idx > 0 ? remaining[idx - 1] : remaining[0];
        openRequest(nextTab.requestId).catch((err) =>
          console.error('Failed to load request after close:', err)
        );
      }
    }
  };

  return (
    <div className="tab-bar" role="tablist" aria-label="Open requests">
      {openTabs.map((tab) => {
        const isActive = tab.requestId === activeTabId;
        const isDirty = dirtyTabs.has(tab.requestId);
        return (
          <button
            key={tab.requestId}
            role="tab"
            aria-selected={isActive}
            className={`tab-bar-item${isActive ? ' tab-bar-item--active' : ''}`}
            onClick={() => handleTabClick(tab.requestId)}
            title={tab.requestName}
          >
            <span className={methodClass(tab.method)}>{tab.method}</span>
            <span className="tab-bar-name">{tab.requestName}</span>
            {isDirty && (
              <span className="tab-bar-dirty" aria-label="Unsaved changes" title="Unsaved changes" />
            )}
            <span
              className="tab-bar-close"
              role="button"
              aria-label={`Close tab ${tab.requestName}`}
              onClick={(e) => handleClose(e, tab.requestId)}
            >
              ×
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default TabBar;
