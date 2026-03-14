import React, { useRef, useState } from 'react';
import { Folder } from '../types/folder';
import { Request } from '../types/request';
import { useRequestsStore } from '../store/requestsStore';
import { useTabsStore } from '../store/tabsStore';
import { useFoldersStore } from '../store/foldersStore';
import { ExportRequestAsCurl } from '../wailsjs/go/main/App';

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

interface FolderItemProps {
  folder: Folder;
  /** All requests for the collection (we filter by folder_id here). */
  allRequests: Request[];
  /** All folders for the collection (needed for recursive render). */
  allFolders: Folder[];
  depth?: number;
}

const FolderItem: React.FC<FolderItemProps> = ({ folder, allRequests, allFolders, depth = 0 }) => {
  const openRequest = useRequestsStore((s) => s.openRequest);
  const activeRequest = useRequestsStore((s) => s.activeRequest);
  const openTab = useTabsStore((s) => s.openTab);
  const duplicateRequest = useRequestsStore((s) => s.duplicateRequest);
  const deleteRequestStore = useRequestsStore((s) => s.deleteRequest);
  const closeTab = useTabsStore((s) => s.closeTab);

  const { renameFolder, deleteFolder, createRequestInFolder, moveRequest } = useFoldersStore();

  const [expanded, setExpanded] = useState(false);

  // Rename state
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(folder.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Add request inline
  const [addingRequest, setAddingRequest] = useState(false);
  const [newRequestName, setNewRequestName] = useState('');
  const [newRequestError, setNewRequestError] = useState<string | null>(null);
  const newRequestInputRef = useRef<HTMLInputElement>(null);

  // Context menus
  const [folderMenu, setFolderMenu] = useState<{ x: number; y: number } | null>(null);
  const folderMenuRef = useRef<HTMLDivElement>(null);
  const [requestMenu, setRequestMenu] = useState<{ x: number; y: number; request: Request } | null>(null);
  const requestMenuRef = useRef<HTMLDivElement>(null);

  // Move-to submenu for requests
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);

  // Toast
  const [curlToast, setCurlToast] = useState(false);

  // Requests directly inside this folder
  const folderRequests = allRequests.filter((r) => r.folder_id === folder.id);
  // Direct child folders
  const childFolders = allFolders.filter((f) => f.parent_folder_id === folder.id);

  const indentPx = depth * 12;

  // --- Folder rename ---
  const startEditing = () => {
    setDraftName(folder.name);
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
    if (trimmed === folder.name) {
      setEditing(false);
      return;
    }
    try {
      await renameFolder(folder.id, trimmed);
      setEditing(false);
      setRenameError(null);
    } catch (err) {
      setRenameError(String(err));
      inputRef.current?.focus();
    }
  };

  const cancelEditing = () => {
    setEditing(false);
    setDraftName(folder.name);
    setRenameError(null);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelEditing(); }
  };

  // --- Folder delete ---
  const handleDeleteFolder = async () => {
    setFolderMenu(null);
    const confirmed = window.confirm(
      `Delete folder "${folder.name}"?\nRequests inside will be moved to root level.`
    );
    if (!confirmed) return;
    await deleteFolder(folder.id, folder.collection_id);
  };

  // --- Add request ---
  const startAddingRequest = () => {
    setFolderMenu(null);
    setExpanded(true);
    setNewRequestName('New Request');
    setNewRequestError(null);
    setAddingRequest(true);
    setTimeout(() => newRequestInputRef.current?.select(), 0);
  };

  const commitAddRequest = async () => {
    const trimmed = newRequestName.trim();
    if (!trimmed) {
      setNewRequestError('Request name cannot be empty.');
      newRequestInputRef.current?.focus();
      return;
    }
    try {
      await createRequestInFolder(folder.collection_id, folder.id, trimmed);
      setAddingRequest(false);
      setNewRequestName('');
      setNewRequestError(null);
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

  // --- Request context menu ---
  const handleRequestContextMenu = (e: React.MouseEvent, req: Request) => {
    e.preventDefault();
    e.stopPropagation();
    setRequestMenu({ x: e.clientX, y: e.clientY, request: req });
    setMoveMenuOpen(false);
  };

  const handleDuplicate = async () => {
    if (!requestMenu) return;
    const req = requestMenu.request;
    setRequestMenu(null);
    try {
      const copy = await duplicateRequest(req.id);
      openRequest(copy.id);
      openTab({ requestId: copy.id, requestName: copy.name, method: copy.method });
    } catch (err) {
      console.error('Duplicate request failed:', err);
    }
  };

  const handleDeleteRequest = async () => {
    if (!requestMenu) return;
    const req = requestMenu.request;
    setRequestMenu(null);
    const confirmed = window.confirm(`Delete request "${req.name}"?`);
    if (!confirmed) return;
    try {
      await deleteRequestStore(req.id, req.collection_id);
      closeTab(req.id);
    } catch (err) {
      console.error('Delete request failed:', err);
    }
  };

  const handleMoveToRoot = async () => {
    if (!requestMenu) return;
    const req = requestMenu.request;
    setRequestMenu(null);
    try {
      await moveRequest(req.id, req.collection_id, '');
    } catch (err) {
      console.error('Move request failed:', err);
    }
  };

  const handleMoveToFolder = async (targetFolderId: string) => {
    if (!requestMenu) return;
    const req = requestMenu.request;
    setRequestMenu(null);
    try {
      await moveRequest(req.id, req.collection_id, targetFolderId);
    } catch (err) {
      console.error('Move request failed:', err);
    }
  };

  const handleCopyAsCurl = async () => {
    if (!requestMenu) return;
    const req = requestMenu.request;
    setRequestMenu(null);
    try {
      const curl = await ExportRequestAsCurl(req.id);
      await navigator.clipboard.writeText(curl);
      setCurlToast(true);
      setTimeout(() => setCurlToast(false), 2000);
    } catch (err) {
      console.error('Copy as cURL failed:', err);
    }
  };

  // Close menus on outside click
  React.useEffect(() => {
    if (!folderMenu) return;
    const handler = (e: MouseEvent) => {
      if (folderMenuRef.current && !folderMenuRef.current.contains(e.target as Node)) {
        setFolderMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [folderMenu]);

  React.useEffect(() => {
    if (!requestMenu) return;
    const handler = (e: MouseEvent) => {
      if (requestMenuRef.current && !requestMenuRef.current.contains(e.target as Node)) {
        setRequestMenu(null);
        setMoveMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [requestMenu]);

  // Other folders in the same collection (for Move To menu)
  const otherFolders = allFolders.filter((f) => f.id !== folder.id);

  return (
    <li className="folder-item" style={{ paddingLeft: indentPx }}>
      {/* Folder header */}
      <div
        className="folder-item-header"
        onDoubleClick={!editing ? startEditing : undefined}
        onContextMenu={!editing ? (e) => { e.preventDefault(); e.stopPropagation(); setFolderMenu({ x: e.clientX, y: e.clientY }); } : undefined}
      >
        <button
          className="collection-expand-btn"
          aria-label={expanded ? 'Collapse folder' : 'Expand folder'}
          onClick={() => setExpanded((p) => !p)}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <span className="folder-icon">📂</span>

        {editing ? (
          <span className="collection-rename-wrapper">
            <input
              ref={inputRef}
              className="collection-rename-input"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={commitRename}
              autoFocus
              aria-label="Rename folder"
            />
            {renameError && <span className="collection-rename-error">{renameError}</span>}
          </span>
        ) : (
          <span className="folder-name" title={folder.name}>{folder.name}</span>
        )}

        {!editing && (
          <>
            <button
              className="collection-add-request-btn"
              title="Add Request to folder"
              aria-label={`Add request to folder ${folder.name}`}
              onClick={(e) => { e.stopPropagation(); startAddingRequest(); }}
            >
              +
            </button>
            <button
              className="collection-delete-btn"
              title="Delete folder"
              aria-label={`Delete folder ${folder.name}`}
              onClick={(e) => { e.stopPropagation(); handleDeleteFolder(); }}
            >
              ×
            </button>
          </>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <ul className="request-list" style={{ paddingLeft: 16 }}>
          {/* Child folders (recursive) */}
          {childFolders.map((cf) => (
            <FolderItem
              key={cf.id}
              folder={cf}
              allRequests={allRequests}
              allFolders={allFolders}
              depth={depth + 1}
            />
          ))}

          {/* Requests in this folder */}
          {folderRequests.map((req) => (
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

          {folderRequests.length === 0 && childFolders.length === 0 && !addingRequest && (
            <li className="request-item request-item--empty">Empty folder.</li>
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

      {/* Folder context menu */}
      {folderMenu && (
        <div
          ref={folderMenuRef}
          className="request-context-menu"
          style={{ top: folderMenu.y, left: folderMenu.x }}
        >
          <button className="request-context-menu-item" onClick={startEditing}>
            Rename
          </button>
          <button className="request-context-menu-item" onClick={startAddingRequest}>
            Add Request
          </button>
          <button
            className="request-context-menu-item request-context-menu-item--danger"
            onClick={handleDeleteFolder}
          >
            Delete
          </button>
        </div>
      )}

      {/* Request context menu */}
      {requestMenu && (
        <div
          ref={requestMenuRef}
          className="request-context-menu"
          style={{ top: requestMenu.y, left: requestMenu.x }}
        >
          <button className="request-context-menu-item" onClick={handleDuplicate}>
            Duplicate
          </button>
          <div
            className="request-context-menu-item request-context-menu-item--submenu"
            onMouseEnter={() => setMoveMenuOpen(true)}
            onMouseLeave={() => setMoveMenuOpen(false)}
          >
            Move to ▸
            {moveMenuOpen && (
              <div className="request-context-submenu">
                <button className="request-context-menu-item" onClick={handleMoveToRoot}>
                  (Root level)
                </button>
                {otherFolders.map((f) => (
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
          <button className="request-context-menu-item" onClick={handleCopyAsCurl}>
            Copy as cURL
          </button>
          <button
            className="request-context-menu-item request-context-menu-item--danger"
            onClick={handleDeleteRequest}
          >
            Delete
          </button>
        </div>
      )}

      {/* cURL copy toast */}
      {curlToast && (
        <div className="rb-save-toast">Copied to clipboard</div>
      )}
    </li>
  );
};

export default FolderItem;
