import React, { useEffect, useRef, useState } from 'react';
import { useCollectionsStore } from '../store/collectionsStore';
import { useRequestsStore } from '../store/requestsStore';
import { useTabsStore } from '../store/tabsStore';
import { useFoldersStore } from '../store/foldersStore';
import { useRunnerStore } from '../store/runnerStore';
import { Collection } from '../types/collection';
import { Request } from '../types/request';
import { ExportCollection, ExportRequestAsCurl, ListRequests, ListFolders } from '../wailsjs/go/main/App';
import FolderItem from './FolderItem';

function methodBadgeClass(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':    return 'request-method request-method--get';
    case 'POST':   return 'request-method request-method--post';
    case 'PUT':    return 'request-method request-method--put';
    case 'PATCH':  return 'request-method request-method--patch';
    case 'DELETE': return 'request-method request-method--delete';
    default:       return 'request-method request-method--other';
  }
}

interface CollectionItemProps {
  collection: Collection;
  /** Called when the user picks "Import from cURL…" from the collection context menu. */
  onImportCurl?: (collectionId: string) => void;
}

const CollectionItem: React.FC<CollectionItemProps> = ({ collection, onImportCurl }) => {
  const renameCollection = useCollectionsStore((s) => s.renameCollection);
  const deleteCollection = useCollectionsStore((s) => s.deleteCollection);

  const fetchRequests = useRequestsStore((s) => s.fetchRequests);
  const createRequest = useRequestsStore((s) => s.createRequest);
  const openRequest = useRequestsStore((s) => s.openRequest);
  const duplicateRequest = useRequestsStore((s) => s.duplicateRequest);
  const deleteRequest = useRequestsStore((s) => s.deleteRequest);
  const activeRequest = useRequestsStore((s) => s.activeRequest);
  const openTab = useTabsStore((s) => s.openTab);
  const requests = useRequestsStore((s) => s.requestsByCollection[collection.id] ?? []);
  const requestsLoading = useRequestsStore((s) => s.loadingFor[collection.id] ?? false);
  const requestsError = useRequestsStore((s) => s.errorFor[collection.id] ?? null);

  const { fetchFolders, createFolder, moveRequest } = useFoldersStore();
  const folders = useFoldersStore((s) => s.foldersByCollection[collection.id] ?? []);

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

  // Add folder inline
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderError, setNewFolderError] = useState<string | null>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  // Request context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; request: Request } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);

  // Toast
  const [curlToast, setCurlToast] = useState(false);

  // Collection context menu state
  const [collectionMenu, setCollectionMenu] = useState<{ x: number; y: number } | null>(null);
  const collectionMenuRef = useRef<HTMLDivElement>(null);

  const closeTab = useTabsStore((s) => s.closeTab);
  const openRunner = useRunnerStore((s) => s.openRunner);

  // Close request context menu when clicking outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
        setMoveMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  // Close collection context menu when clicking outside
  useEffect(() => {
    if (!collectionMenu) return;
    const handler = (e: MouseEvent) => {
      if (collectionMenuRef.current && !collectionMenuRef.current.contains(e.target as Node)) {
        setCollectionMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [collectionMenu]);

  const handleCollectionContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCollectionMenu({ x: e.clientX, y: e.clientY });
  };

  const handleExport = async () => {
    setCollectionMenu(null);
    try {
      await ExportCollection(collection.id);
    } catch (err) {
      console.error('Export collection failed:', err);
    }
  };

  const handleImportCurl = () => {
    setCollectionMenu(null);
    onImportCurl?.(collection.id);
  };

  const handleRunCollection = async () => {
    setCollectionMenu(null);
    // Fetch fresh from DB — the store only has data when the collection is expanded.
    const [allRequests, allFolders] = await Promise.all([
      ListRequests(collection.id),
      ListFolders(collection.id),
    ]);
    const rootFolderList = allFolders.filter((f) => f.parent_folder_id == null);
    const orderedRequests: { id: string; name: string; method: string }[] = [];
    for (const folder of rootFolderList) {
      for (const r of allRequests.filter((r) => r.folder_id === folder.id)) {
        orderedRequests.push({ id: r.id, name: r.name, method: r.method });
      }
    }
    for (const r of allRequests.filter((r) => r.folder_id == null)) {
      orderedRequests.push({ id: r.id, name: r.name, method: r.method });
    }
    openRunner({
      scopeName: collection.name,
      collectionId: collection.id,
      folderId: null,
      requests: orderedRequests,
    });
  };

  const handleRequestContextMenu = (e: React.MouseEvent, req: Request) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, request: req });
    setMoveMenuOpen(false);
  };

  const handleDuplicate = async () => {
    if (!contextMenu) return;
    const req = contextMenu.request;
    setContextMenu(null);
    try {
      const copy = await duplicateRequest(req.id);
      if (!expanded) setExpanded(true);
      openRequest(copy.id);
      openTab({ requestId: copy.id, requestName: copy.name, method: copy.method });
    } catch (err) {
      console.error('Duplicate request failed:', err);
    }
  };

  const handleDeleteRequest = async () => {
    if (!contextMenu) return;
    const req = contextMenu.request;
    setContextMenu(null);
    const confirmed = window.confirm(`Delete request "${req.name}"?`);
    if (!confirmed) return;
    try {
      await deleteRequest(req.id, req.collection_id);
      closeTab(req.id);
    } catch (err) {
      console.error('Delete request failed:', err);
    }
  };

  const handleMoveToFolder = async (targetFolderId: string) => {
    if (!contextMenu) return;
    const req = contextMenu.request;
    setContextMenu(null);
    try {
      await moveRequest(req.id, req.collection_id, targetFolderId);
    } catch (err) {
      console.error('Move request failed:', err);
    }
  };

  const handleCopyAsCurl = async () => {
    if (!contextMenu) return;
    const req = contextMenu.request;
    setContextMenu(null);
    try {
      const curl = await ExportRequestAsCurl(req.id);
      await navigator.clipboard.writeText(curl);
      setCurlToast(true);
      setTimeout(() => setCurlToast(false), 2000);
    } catch (err) {
      console.error('Copy as cURL failed:', err);
    }
  };

  const toggleExpand = async () => {
    if (!expanded) {
      await Promise.all([fetchRequests(collection.id), fetchFolders(collection.id)]);
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
    if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelEditing(); }
  };

  const startAddingRequest = () => {
    setNewRequestName('New Request');
    setNewRequestError(null);
    setAddingRequest(true);
    setTimeout(() => { newRequestInputRef.current?.select(); }, 0);
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
    if (e.key === 'Enter') { e.preventDefault(); commitAddRequest(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelAddRequest(); }
  };

  // --- Add folder ---
  const startAddingFolder = () => {
    setCollectionMenu(null);
    setExpanded(true);
    setNewFolderName('New Folder');
    setNewFolderError(null);
    setAddingFolder(true);
    setTimeout(() => { newFolderInputRef.current?.select(); }, 0);
  };

  const commitAddFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      setNewFolderError('Folder name cannot be empty.');
      newFolderInputRef.current?.focus();
      return;
    }
    try {
      await createFolder(collection.id, '', trimmed);
      setAddingFolder(false);
      setNewFolderName('');
      setNewFolderError(null);
    } catch (err) {
      setNewFolderError(String(err));
      newFolderInputRef.current?.focus();
    }
  };

  const cancelAddFolder = () => {
    setAddingFolder(false);
    setNewFolderName('');
    setNewFolderError(null);
  };

  const handleNewFolderKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commitAddFolder(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelAddFolder(); }
  };

  // Root-level requests: those with no folder_id
  const rootRequests = requests.filter((r) => r.folder_id == null);
  // Root-level folders: those with no parent_folder_id
  const rootFolders = folders.filter((f) => f.parent_folder_id == null);

  return (
    <li className="collection-item">
      <div
        className="collection-item-header"
        onDoubleClick={!editing ? startEditing : undefined}
        onContextMenu={!editing ? handleCollectionContextMenu : undefined}
      >
        <button
          className={`collection-expand-btn${expanded ? ' collection-expand-btn--open' : ''}`}
          aria-label={expanded ? 'Collapse collection' : 'Expand collection'}
          onClick={toggleExpand}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 2l4 3-4 3"/>
          </svg>
        </button>

        <svg className="collection-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M1.5 4.5A1.5 1.5 0 013 3h3.379a1.5 1.5 0 011.06.44L8.56 4.56A1.5 1.5 0 009.62 5H13a1.5 1.5 0 011.5 1.5v6A1.5 1.5 0 0113 14H3a1.5 1.5 0 01-1.5-1.5v-8z"/>
        </svg>

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

          {/* Root-level folders */}
          {!requestsLoading && !requestsError && rootFolders.map((folder) => (
            <FolderItem
              key={folder.id}
              folder={folder}
              allRequests={requests}
              allFolders={folders}
              depth={0}
            />
          ))}

          {/* Root-level requests (no folder) */}
          {!requestsLoading && !requestsError && rootRequests.map((req) => (
            <li
              key={req.id}
              className={`request-item${activeRequest?.id === req.id ? ' request-item--active' : ''}`}
              onClick={() => {
                openRequest(req.id);
                openTab({ requestId: req.id, requestName: req.name, method: req.method });
              }}
              onContextMenu={(e) => handleRequestContextMenu(e, req)}
              style={{ cursor: 'pointer' }}
            >
              <span className={methodBadgeClass(req.method)} data-method={req.method}>{req.method}</span>
              <span className="request-name">{req.name}</span>
            </li>
          ))}

          {!requestsLoading && !requestsError && rootRequests.length === 0 && rootFolders.length === 0 && !addingRequest && !addingFolder && (
            <li className="request-item request-item--empty">No requests yet.</li>
          )}

          {addingFolder && (
            <li className="request-item request-item--new">
              <input
                ref={newFolderInputRef}
                className="request-name-input"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={handleNewFolderKeyDown}
                onBlur={commitAddFolder}
                autoFocus
                aria-label="New folder name"
              />
              {newFolderError && (
                <span className="collection-rename-error">{newFolderError}</span>
              )}
            </li>
          )}

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

      {/* Request context menu (root-level requests) */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="request-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button className="request-context-menu-item" onClick={handleDuplicate}>
            Duplicate
          </button>
          {folders.length > 0 && (
            <div
              className="request-context-menu-item request-context-menu-item--submenu"
              onMouseEnter={() => setMoveMenuOpen(true)}
              onMouseLeave={() => setMoveMenuOpen(false)}
            >
              Move to ▸
              {moveMenuOpen && (
                <div className="request-context-submenu">
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      className="request-context-menu-item"
                      onClick={() => handleMoveToFolder(f.id)}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button className="request-context-menu-item request-context-menu-item--curl" onClick={handleCopyAsCurl}>
            <svg className="context-menu-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.25"/>
              <path d="M4 6l3 2-3 2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9 10h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
            </svg>
            Copy as cURL
          </button>
          <button className="request-context-menu-item request-context-menu-item--danger" onClick={handleDeleteRequest}>
            Delete
          </button>
        </div>
      )}

      {/* Collection context menu */}
      {collectionMenu && (
        <div
          ref={collectionMenuRef}
          className="request-context-menu"
          style={{ top: collectionMenu.y, left: collectionMenu.x }}
        >
          <button className="request-context-menu-item" onClick={handleRunCollection}>
            Run Collection
          </button>
          <button className="request-context-menu-item" onClick={startAddingFolder}>
            New Folder
          </button>
          <button className="request-context-menu-item request-context-menu-item--export" onClick={handleExport}>
            <svg className="context-menu-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
            </svg>
            Export
          </button>
          <button className="request-context-menu-item" onClick={handleImportCurl}>
            Import from cURL…
          </button>
        </div>
      )}

      {/* cURL copy toast */}
      {curlToast && (
        <div className="collection-curl-toast">Copied to clipboard</div>
      )}
    </li>
  );
};

export default CollectionItem;
