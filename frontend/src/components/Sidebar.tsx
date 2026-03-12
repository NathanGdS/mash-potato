import React, { useEffect, useState } from 'react';
import { useCollectionsStore } from '../store/collectionsStore';
import NewCollectionModal from './NewCollectionModal';
import './Sidebar.css';

const Sidebar: React.FC = () => {
  const { collections, loading, error, fetchCollections } = useCollectionsStore();
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Collections</span>
        <button
          className="sidebar-new-btn"
          title="New Collection"
          onClick={() => setShowModal(true)}
          aria-label="New Collection"
        >
          +
        </button>
      </div>

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
            <li key={col.id} className="collection-item">
              <span className="collection-icon">📁</span>
              <span className="collection-name">{col.name}</span>
            </li>
          ))}
        </ul>
      </div>

      {showModal && (
        <NewCollectionModal onClose={() => setShowModal(false)} />
      )}
    </aside>
  );
};

export default Sidebar;
