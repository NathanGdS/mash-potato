import React, { useEffect, useState } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { FolderInput, Search } from 'lucide-react';
import { useCollectionsStore } from '../store/collectionsStore';
import { useFoldersStore } from '../store/foldersStore';
import { useRequestsStore } from '../store/requestsStore';
import CollectionItem from './CollectionItem';
import NewCollectionModal from './NewCollectionModal';
import ImportModal from './ImportModal';
import ImportCurlDialog from './ImportCurlDialog';
import HistoryList from './HistoryList';
import './Sidebar.css';

type SidebarTab = 'collections' | 'history';

interface SidebarProps {
  onSettingsClick: () => void;
  onCompare: () => void;
  onSearchClick: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onSettingsClick, onCompare, onSearchClick }) => {
  const { collections, loading, error, fetchCollections, importCollection } = useCollectionsStore();
  const { moveRequest, moveRequestToCollection } = useFoldersStore();
  const reorderRequests = useRequestsStore((s) => s.reorderRequests);
  const requestsByCollection = useRequestsStore((s) => s.requestsByCollection);
  const foldersByCollection = useFoldersStore((s) => s.foldersByCollection);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showImportCurl, setShowImportCurl] = useState(false);
  const [importCurlCollectionId, setImportCurlCollectionId] = useState('');
  const [activeTab, setActiveTab] = useState<SidebarTab>('collections');
  const [importError, setImportError] = useState<string | null>(null);
  const [dragOverlayRequest, setDragOverlayRequest] = useState<{ id: string; name: string; method: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleOpenImportCurl = (collectionId = '') => {
    setImportCurlCollectionId(collectionId);
    setShowImportCurl(true);
  };

  const handleImport = async () => {
    setImportError(null);
    try {
      await importCollection();
    } catch (err) {
      setImportError(String(err));
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    for (const col of collections) {
      const reqs = requestsByCollection[col.id] ?? [];
      const req = reqs.find((r) => r.id === active.id);
      if (req) {
        setDragOverlayRequest({ id: req.id, name: req.name, method: req.method });
        return;
      }
    }
  };

  const findRequest = (requestId: string) => {
    for (const col of collections) {
      const reqs = requestsByCollection[col.id] ?? [];
      const req = reqs.find((r) => r.id === requestId);
      if (req) return { request: req, collectionId: col.id };
    }
    return null;
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setDragOverlayRequest(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const found = findRequest(activeId);
    if (!found) return;

    const { request: activeRequest, collectionId: sourceCollectionId } = found;
    const sourceFolderId = activeRequest.folder_id || '';

    const overData = over.data.current as { type?: string; folderId?: string; collectionId?: string } | undefined;

    let targetCollectionId = '';
    let targetFolderId = '';

    if (overData?.type === 'folder' && overData.folderId) {
      targetFolderId = overData.folderId;
      targetCollectionId = collections.find((c) =>
        (foldersByCollection[c.id] ?? []).some((f) => f.id === targetFolderId)
      )?.id || '';
    } else if (overData?.type === 'collection-root' && overData.collectionId) {
      targetCollectionId = overData.collectionId;
      targetFolderId = '';
    } else {
      const overFound = findRequest(overId);
      if (overFound) {
        targetCollectionId = overFound.collectionId;
        targetFolderId = overFound.request.folder_id || '';
      } else {
        return;
      }
    }

    const isSameList = sourceCollectionId === targetCollectionId && sourceFolderId === targetFolderId;

    if (isSameList) {
      const requests = requestsByCollection[sourceCollectionId] ?? [];
      const listRequests = requests.filter((r) => (r.folder_id || '') === targetFolderId);
      const oldIndex = listRequests.findIndex((r) => r.id === activeId);
      const newIndex = listRequests.findIndex((r) => r.id === overId);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = [...listRequests];
        const [moved] = newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, moved);
        const ids = newOrder.map((r) => r.id);
        await reorderRequests(sourceCollectionId, targetFolderId, ids);
      }
    } else if (sourceCollectionId !== targetCollectionId) {
      try {
        await moveRequestToCollection(activeId, sourceCollectionId, targetCollectionId, targetFolderId);
        await useRequestsStore.getState().fetchRequests(sourceCollectionId);
        await useRequestsStore.getState().fetchRequests(targetCollectionId);
        await useFoldersStore.getState().fetchFolders(sourceCollectionId);
        await useFoldersStore.getState().fetchFolders(targetCollectionId);
      } catch (err) {
        console.error('Move request to collection failed:', err);
      }
    } else {
      try {
        await moveRequest(activeId, sourceCollectionId, targetFolderId);
        await useRequestsStore.getState().fetchRequests(sourceCollectionId);
        await useFoldersStore.getState().fetchFolders(sourceCollectionId);
      } catch (err) {
        console.error('Move request failed:', err);
      }
    }
  };

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  return (
    <aside className="sidebar">
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab-btn${activeTab === 'collections' ? ' sidebar-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('collections')}
        >
          Collections
        </button>
        <button
          className={`sidebar-tab-btn${activeTab === 'history' ? ' sidebar-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          History
        </button>
      </div>

      {activeTab === 'collections' && (
        <>
          <div className="sidebar-header">
            <span className="sidebar-title">Collections</span>
            <div className="sidebar-header-actions">
              <button
                className="sidebar-new-btn sidebar-new-btn--icon"
                title="Search (Ctrl+K)"
                onClick={onSearchClick}
                aria-label="Search (Ctrl+K)"
              >
                <Search size={16} aria-hidden="true" />
              </button>
              <button
                className="sidebar-new-btn sidebar-new-btn--icon"
                title="Import"
                onClick={() => setShowImportModal(true)}
                aria-label="Import"
              >
                <FolderInput size={16} aria-hidden="true" />
              </button>
              <button
                className="sidebar-new-btn"
                title="New Collection"
                onClick={() => setShowModal(true)}
                aria-label="New Collection"
              >
                +
              </button>
            </div>
          </div>

          {importError && (
            <p className="sidebar-status sidebar-status--error">{importError}</p>
          )}

          <div className="sidebar-body">
            {loading && (
              <p className="sidebar-status">Loading…</p>
            )}

            {!loading && error && (
              <p className="sidebar-status sidebar-status--error">{error}</p>
            )}

            {!loading && !error && collections.length === 0 && (
              <p className="sidebar-status sidebar-status--empty">
                No collections yet. Click <strong>+</strong> to create one.
              </p>
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <ul className="collection-list">
                {collections.map((col) => (
                  <CollectionItem
                    key={col.id}
                    collection={col}
                    onImportCurl={handleOpenImportCurl}
                  />
                ))}
              </ul>
              <DragOverlay>
                {dragOverlayRequest ? (
                  <div className="drag-overlay">
                    <span className={`request-method request-method--${dragOverlayRequest.method.toLowerCase()}`} data-method={dragOverlayRequest.method}>
                      {dragOverlayRequest.method}
                    </span>
                    <span className="request-name">{dragOverlayRequest.name}</span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>

          {showModal && (
            <NewCollectionModal onClose={() => setShowModal(false)} />
          )}

          {showImportModal && (
            <ImportModal
              onClose={() => setShowImportModal(false)}
              onImportCollection={handleImport}
              onImportCurl={() => handleOpenImportCurl()}
            />
          )}

          {showImportCurl && (
            <ImportCurlDialog
              defaultCollectionId={importCurlCollectionId}
              onClose={() => setShowImportCurl(false)}
            />
          )}
        </>
      )}

      {activeTab === 'history' && (
        <div className="sidebar-body sidebar-body--fill">
          <HistoryList onCompare={onCompare} />
        </div>
      )}

      {/* Footer with settings gear */}
      <div className="sidebar-footer">
        <button
          className="sidebar-gear-btn"
          onClick={onSettingsClick}
          aria-label="Open settings"
          title="Settings"
        >
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
            <circle cx="8" cy="8" r="2.5" />
            <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.93 2.93l1.06 1.06M12.01 12.01l1.06 1.06M13.07 2.93l-1.06 1.06M3.99 12.01l-1.06 1.06" />
          </svg>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
