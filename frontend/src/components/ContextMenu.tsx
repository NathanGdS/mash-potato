import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTabsStore } from '../store/tabsStore';
import { activateTabAfterClose } from '../utils/tabActivation';
import './ContextMenu.css';

interface ContextMenuProps {
  x: number;
  y: number;
  requestId: string;
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, requestId, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: y, left: x });
  const { closeTab, closeAll, closeOthers, closeToRight, closeToLeft, openTabs } =
    useTabsStore();

  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    let { left, top } = position;
    const minEdge = 8;
    if (left + rect.width > window.innerWidth) {
      left = window.innerWidth - rect.width - minEdge;
    }
    if (top + rect.height > window.innerHeight) {
      top = window.innerHeight - rect.height - minEdge;
    }
    if (left < minEdge) left = minEdge;
    if (top < minEdge) top = minEdge;
    if (left !== position.left || top !== position.top) {
      setPosition({ top, left });
    }
  }, [x, y]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleClose = () => {
    const wasActive = useTabsStore.getState().activeTabId === requestId;
    closeTab(requestId);
    if (wasActive) {
      activateTabAfterClose();
    }
    onClose();
  };

  const handleCloseOthers = () => {
    const prevActive = useTabsStore.getState().activeTabId;
    closeOthers(requestId);
    if (useTabsStore.getState().activeTabId !== prevActive) activateTabAfterClose();
    onClose();
  };

  const handleCloseToRight = () => {
    const prevActive = useTabsStore.getState().activeTabId;
    closeToRight(requestId);
    if (useTabsStore.getState().activeTabId !== prevActive) activateTabAfterClose();
    onClose();
  };

  const handleCloseToLeft = () => {
    const prevActive = useTabsStore.getState().activeTabId;
    closeToLeft(requestId);
    if (useTabsStore.getState().activeTabId !== prevActive) activateTabAfterClose();
    onClose();
  };

  const handleCloseAll = () => {
    closeAll();
    activateTabAfterClose();
    onClose();
  };

  const tabIndex = openTabs.findIndex((t) => t.requestId === requestId);
  const hasTabsToRight = tabIndex !== -1 && tabIndex < openTabs.length - 1;
  const hasTabsToLeft = tabIndex > 0;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ top: position.top, left: position.left }}
      role="menu"
      aria-label="Tab actions"
    >
      <button className="context-menu-item" role="menuitem" onClick={handleClose}>
        Close
      </button>
      <button
        className="context-menu-item"
        role="menuitem"
        onClick={handleCloseOthers}
        disabled={openTabs.length <= 1}
        style={openTabs.length <= 1 ? { opacity: 0.4, cursor: 'default' } : undefined}
      >
        Close Others
      </button>
      <button
        className="context-menu-item"
        role="menuitem"
        onClick={handleCloseToRight}
        disabled={!hasTabsToRight}
        style={!hasTabsToRight ? { opacity: 0.4, cursor: 'default' } : undefined}
      >
        Close to the Right
      </button>
      <button
        className="context-menu-item"
        role="menuitem"
        onClick={handleCloseToLeft}
        disabled={!hasTabsToLeft}
        style={!hasTabsToLeft ? { opacity: 0.4, cursor: 'default' } : undefined}
      >
        Close to the Left
      </button>
      <div className="context-menu-separator" role="separator" />
      <button className="context-menu-item context-menu-item--danger" role="menuitem" onClick={handleCloseAll}>
        Close All
      </button>
    </div>
  );
};

export default ContextMenu;