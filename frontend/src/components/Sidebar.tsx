import React, { useEffect, useState } from 'react';
import { useCollectionsStore } from '../store/collectionsStore';
import CollectionItem from './CollectionItem';
import NewCollectionModal from './NewCollectionModal';
import ImportCurlDialog from './ImportCurlDialog';
import HistoryList from './HistoryList';
import './Sidebar.css';

type SidebarTab = 'collections' | 'history';

interface SidebarProps {
  onSettingsClick: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onSettingsClick }) => {
  const { collections, loading, error, fetchCollections, importCollection } = useCollectionsStore();
  const [showModal, setShowModal] = useState(false);
  const [showImportCurl, setShowImportCurl] = useState(false);
  const [importCurlCollectionId, setImportCurlCollectionId] = useState('');
  const [activeTab, setActiveTab] = useState<SidebarTab>('collections');
  const [importError, setImportError] = useState<string | null>(null);

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
                title="Import from cURL"
                onClick={() => handleOpenImportCurl()}
                aria-label="Import from cURL"
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
                  <polyline points="3 4 1 6 3 8" />
                  <polyline points="9 4 11 6 9 8" />
                  <line x1="7" y1="2" x2="5" y2="10" />
                  <line x1="1" y1="13" x2="11" y2="13" />
                  <polyline points="9 11 11 13 9 15" />
                </svg>
              </button>
              <button
                className="sidebar-new-btn"
                title="Import Collection"
                onClick={handleImport}
                aria-label="Import Collection"
              >
                ↑
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

            <ul className="collection-list">
              {collections.map((col) => (
                <CollectionItem
                  key={col.id}
                  collection={col}
                  onImportCurl={handleOpenImportCurl}
                />
              ))}
            </ul>
          </div>

          {showModal && (
            <NewCollectionModal onClose={() => setShowModal(false)} />
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
          <HistoryList />
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
