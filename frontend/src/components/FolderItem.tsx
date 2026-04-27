import React, { useRef, useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
  useDroppable,
} from '@dnd-kit/core';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Folder } from '../types/folder';
import { Request } from '../types/request';
import { useRequestsStore } from '../store/requestsStore';
import { useTabsStore } from '../store/tabsStore';
import { useFoldersStore } from '../store/foldersStore';
import { useRunnerStore } from '../store/runnerStore';
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

interface SortableRequestItemProps {
  request: Request;
  isActive?: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function SortableRequestItem({ request, isActive, onClick, onContextMenu }: SortableRequestItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: request.id,
    data: { type: 'request', request: { id: request.id, collection_id: request.collection_id, folder_id: request.folder_id } },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`request-item${isActive ? ' request-item--active' : ''}${isDragging ? ' request-item--dragging' : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
    >
      <span className={methodBadgeClass(request.method)} data-method={request.method}>
        {request.method}
      </span>
      <span className="request-name">{request.name}</span>
    </li>
  );
}

interface FolderItemProps {
  folder: Folder;
  allRequests: Request[];
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
  const openRunner = useRunnerStore((s) => s.openRunner);

  const { setNodeRef: setFolderDropRef, isOver: isFolderOver } = useDroppable({
    id: `folder-${folder.id}`,
    data: { type: 'folder', folderId: folder.id },
  });

  const [expanded, setExpanded] = useState(false);

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(folder.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [addingRequest, setAddingRequest] = useState(false);
  const [newRequestName, setNewRequestName] = useState('');
  const [newRequestError, setNewRequestError] = useState<string | null>(null);
  const newRequestInputRef = useRef<HTMLInputElement>(null);

  const [folderMenu, setFolderMenu] = useState<{ x: number; y: number } | null>(null);
  const folderMenuRef = useRef<HTMLDivElement>(null);
  const [requestMenu, setRequestMenu] = useState<{ x: number; y: number; request: Request } | null>(null);
  const requestMenuRef = useRef<HTMLDivElement>(null);

  const [moveMenuOpen, setMoveMenuOpen] = useState(false);

  const [curlToast, setCurlToast] = useState(false);

  const folderRequests = allRequests.filter((r) => r.folder_id === folder.id);
  const childFolders = allFolders.filter((f) => f.parent_folder_id === folder.id);

  const indentPx = depth * 12;

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

  const handleDeleteFolder = async () => {
    setFolderMenu(null);
    const confirmed = window.confirm(
      `Delete folder "${folder.name}"?\nRequests inside will be moved to root level.`
    );
    if (!confirmed) return;
    await deleteFolder(folder.id, folder.collection_id);
  };

  const handleRunFolder = () => {
    setFolderMenu(null);
    const orderedRequests = folderRequests.map((r) => ({
      id: r.id,
      name: r.name,
      method: r.method,
    }));
    openRunner({
      scopeName: folder.name,
      collectionId: folder.collection_id,
      folderId: folder.id,
      requests: orderedRequests,
    });
  };

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

  useEffect(() => {
    if (!folderMenu) return;
    const handler = (e: MouseEvent) => {
      if (folderMenuRef.current && !folderMenuRef.current.contains(e.target as Node)) {
        setFolderMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [folderMenu]);

  useEffect(() => {
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

  const otherFolders = allFolders.filter((f) => f.id !== folder.id);

  return (
    <li className="folder-item" style={{ paddingLeft: indentPx }}>
      <div
        className="folder-item-header"
        onDoubleClick={!editing ? startEditing : undefined}
        onContextMenu={!editing ? (e) => { e.preventDefault(); e.stopPropagation(); setFolderMenu({ x: e.clientX, y: e.clientY }); } : undefined}
      >
        <button
          className={`collection-expand-btn${expanded ? ' collection-expand-btn--open' : ''}`}
          aria-label={expanded ? 'Collapse folder' : 'Expand folder'}
          onClick={() => setExpanded((p) => !p)}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 2l4 3-4 3"/>
          </svg>
        </button>
        <svg className="folder-icon" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M1.5 4.5A1.5 1.5 0 013 3h3.379a1.5 1.5 0 011.06.44L8.56 4.56A1.5 1.5 0 009.62 5H13a1.5 1.5 0 011.5 1.5v6A1.5 1.5 0 0113 14H3a1.5 1.5 0 01-1.5-1.5v-8z"/>
        </svg>

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

      {expanded && folderRequests.length > 0 && (
        <SortableContext items={folderRequests.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <ul ref={setFolderDropRef} className={`request-list${isFolderOver ? ' drag-over' : ''}`} style={{ paddingLeft: 16 }}>
            {childFolders.map((cf) => (
              <FolderItem
                key={cf.id}
                folder={cf}
                allRequests={allRequests}
                allFolders={allFolders}
                depth={depth + 1}
              />
            ))}

            {folderRequests.map((req) => (
              <SortableRequestItem
                key={req.id}
                request={req}
                isActive={activeRequest?.id === req.id}
                onClick={() => {
                  openRequest(req.id);
                  openTab({ requestId: req.id, requestName: req.name, method: req.method });
                }}
                onContextMenu={(e) => handleRequestContextMenu(e, req)}
              />
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
        </SortableContext>
      )}

      {expanded && folderRequests.length === 0 && (
        <ul className="request-list" style={{ paddingLeft: 16 }}>
          {childFolders.map((cf) => (
            <FolderItem
              key={cf.id}
              folder={cf}
              allRequests={allRequests}
              allFolders={allFolders}
              depth={depth + 1}
            />
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

      {folderMenu && ReactDOM.createPortal(
        <div
          ref={folderMenuRef}
          className="request-context-menu"
          style={{ top: folderMenu.y, left: folderMenu.x }}
        >
          <button className="request-context-menu-item" onClick={handleRunFolder}>
            Run Folder
          </button>
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
        </div>,
        document.body
      )}

      {requestMenu && ReactDOM.createPortal(
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
          <button className="request-context-menu-item request-context-menu-item--curl" onClick={handleCopyAsCurl}>
            <svg
              className="context-menu-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="4 5 1 8 4 11" />
              <polyline points="12 5 15 8 12 11" />
              <line x1="9" y1="3" x2="7" y2="13" />
            </svg>
            Copy as cURL
          </button>
          <button
            className="request-context-menu-item request-context-menu-item--danger"
            onClick={handleDeleteRequest}
          >
            Delete
          </button>
        </div>,
        document.body
      )}

      {curlToast && (
        <div className="context-menu-toast">Copied to clipboard</div>
      )}
    </li>
  );
};

export default FolderItem;