import React, { useState, useCallback } from 'react';
import { useTabsStore } from '../store/tabsStore';
import { useRequestsStore } from '../store/requestsStore';
import { activateTabAfterClose } from '../utils/tabActivation';
import ContextMenu from './ContextMenu';
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

interface ContextMenuState {
  x: number;
  y: number;
  requestId: string;
}

const TabBar: React.FC = () => {
  const { openTabs, activeTabId, dirtyTabs, closeTab, setActiveTab } = useTabsStore();
  const openRequest = useRequestsStore((s) => s.openRequest);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleDismissContextMenu = useCallback(() => setContextMenu(null), []);

  if (openTabs.length === 0) return null;

  const handleTabClick = (requestId: string) => {
    setActiveTab(requestId);
    openRequest(requestId).catch((err) => console.error('Failed to load request:', err));
  };

  const handleContextMenu = (e: React.MouseEvent, requestId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, requestId });
  };

  const handleClose = (e: React.MouseEvent, requestId: string) => {
    e.stopPropagation();
    const wasActive = useTabsStore.getState().activeTabId === requestId;
    closeTab(requestId);
    if (wasActive) {
      activateTabAfterClose();
    }
  };

  return (
    <>
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
              onContextMenu={(e) => handleContextMenu(e, tab.requestId)}
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
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          requestId={contextMenu.requestId}
          onClose={handleDismissContextMenu}
        />
      )}
    </>
  );
};

export default TabBar;
