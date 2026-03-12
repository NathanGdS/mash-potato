import React, { useRef, useState } from 'react';
import { useCollectionsStore } from '../store/collectionsStore';
import { useRequestsStore } from '../store/requestsStore';
import { Collection } from '../types/collection';

interface CollectionItemProps {
  collection: Collection;
}

const CollectionItem: React.FC<CollectionItemProps> = ({ collection }) => {
  const renameCollection = useCollectionsStore((s) => s.renameCollection);
  const deleteCollection = useCollectionsStore((s) => s.deleteCollection);

  const fetchRequests = useRequestsStore((s) => s.fetchRequests);
  const createRequest = useRequestsStore((s) => s.createRequest);
  const openRequest = useRequestsStore((s) => s.openRequest);
  const activeRequest = useRequestsStore((s) => s.activeRequest);
  const requests = useRequestsStore((s) => s.requestsByCollection[collection.id] ?? []);
  const requestsLoading = useRequestsStore((s) => s.loadingFor[collection.id] ?? false);
  const requestsError = useRequestsStore((s) => s.errorFor[collection.id] ?? null);

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(collection.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [expanded, setExpanded] = useState(false);
  const [addingRequest, setAddingRequest] = useState(false);
  const [newRequestName, setNewRequestName] = useState('');
  const [newRequestError, setNewRequestError] = useState<string | null>(null);
  const newRequestInputRef = useRef<HTMLInputElement>(null);

  const toggleExpand = async () => {
    if (!expanded) {
      await fetchRequests(collection.id);
    }
    setExpanded((prev) => !prev);
  };

  const startEditing = () => {
    setDraftName(collection.name);
    setRenameError(null);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitRename = async () => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      setRenameError('Name cannot be empty.');
      inputRef.current?.focus();
      return;
    }
    if (trimmed === collection.name) {
      setEditing(false);
      return;
    }
    try {
      await renameCollection(collection.id, trimmed);
      setEditing(false);
      setRenameError(null);
    } catch (err) {
      setRenameError(String(err));
      inputRef.current?.focus();
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Delete collection "${collection.name}"?\nThis will also remove all requests inside it.`
    );
    if (!confirmed) return;
    try {
      await deleteCollection(collection.id);
    } catch (err) {
      setDeleteError(String(err));
    }
  };

  const cancelEditing = () => {
    setEditing(false);
    setDraftName(collection.name);
    setRenameError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditing();
    }
  };

  const startAddingRequest = () => {
    setNewRequestName('New Request');
    setNewRequestError(null);
    setAddingRequest(true);
    setTimeout(() => {
      newRequestInputRef.current?.select();
    }, 0);
  };

  const commitAddRequest = async () => {
    const trimmed = newRequestName.trim();
    if (!trimmed) {
      setNewRequestError('Request name cannot be empty.');
      newRequestInputRef.current?.focus();
      return;
    }
    try {
      await createRequest(collection.id, trimmed);
      setAddingRequest(false);
      setNewRequestName('');
      setNewRequestError(null);
      if (!expanded) setExpanded(true);
    } catch (err) {
      setNewRequestError(String(err));
      newRequestInputRef.current?.focus();
    }
  };

  const cancelAddRequest = () => {
    setAddingRequest(false);
    setNewRequestName('');
    setNewRequestError(null);
  };

  const handleNewRequestKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitAddRequest();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelAddRequest();
    }
  };

  return (
    <li className="collection-item">
      <div
        className="collection-item-header"
        onDoubleClick={!editing ? startEditing : undefined}
      >
        <button
          className="collection-expand-btn"
          aria-label={expanded ? 'Collapse collection' : 'Expand collection'}
          onClick={toggleExpand}
        >
          {expanded ? '▾' : '▸'}
        </button>

        <span className="collection-icon">📁</span>

        {editing ? (
          <span className="collection-rename-wrapper">
            <input
              ref={inputRef}
              className="collection-rename-input"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={commitRename}
              autoFocus
              aria-label="Rename collection"
            />
            {renameError && (
              <span className="collection-rename-error">{renameError}</span>
            )}
          </span>
        ) : (
          <span className="collection-name" title={collection.name}>
            {collection.name}
          </span>
        )}

        {!editing && (
          <>
            <button
              className="collection-add-request-btn"
              title="Add Request"
              aria-label={`Add request to ${collection.name}`}
              onClick={(e) => { e.stopPropagation(); startAddingRequest(); }}
            >
              +
            </button>
            <button
              className="collection-delete-btn"
              title="Delete collection"
              aria-label={`Delete collection ${collection.name}`}
              onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            >
              ×
            </button>
          </>
        )}
      </div>

      {deleteError && (
        <span className="collection-rename-error">{deleteError}</span>
      )}

      {expanded && (
        <ul className="request-list">
          {requestsLoading && (
            <li className="request-item request-item--status">Loading…</li>
          )}
          {!requestsLoading && requestsError && (
            <li className="request-item request-item--error">{requestsError}</li>
          )}
          {!requestsLoading && !requestsError && requests.length === 0 && !addingRequest && (
            <li className="request-item request-item--empty">No requests yet.</li>
          )}
          {requests.map((req) => (
            <li
              key={req.id}
              className={`request-item${activeRequest?.id === req.id ? ' request-item--active' : ''}`}
              onClick={() => openRequest(req.id)}
              style={{ cursor: 'pointer' }}
            >
              <span className="request-method">{req.method}</span>
              <span className="request-name">{req.name}</span>
            </li>
          ))}
          {addingRequest && (
            <li className="request-item request-item--new">
              <input
                ref={newRequestInputRef}
                className="request-name-input"
                value={newRequestName}
                onChange={(e) => setNewRequestName(e.target.value)}
                onKeyDown={handleNewRequestKeyDown}
                onBlur={commitAddRequest}
                autoFocus
                aria-label="New request name"
              />
              {newRequestError && (
                <span className="collection-rename-error">{newRequestError}</span>
              )}
            </li>
          )}
        </ul>
      )}
    </li>
  );
};

export default CollectionItem;
