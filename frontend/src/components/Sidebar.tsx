import React, { useEffect, useState } from 'react';
import { useCollectionsStore } from '../store/collectionsStore';
import CollectionItem from './CollectionItem';
import NewCollectionModal from './NewCollectionModal';
import ImportCurlDialog from './ImportCurlDialog';
import HistoryList from './HistoryList';
import './Sidebar.css';

type SidebarTab = 'collections' | 'history';

const Sidebar: React.FC = () => {
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
                className="sidebar-new-btn"
                title="Import from cURL"
                onClick={() => handleOpenImportCurl()}
                aria-label="Import from cURL"
              >
                ⌨
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
    </aside>
  );
};

export default Sidebar;
