import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useCollectionsStore } from '../store/collectionsStore';
import { useFoldersStore } from '../store/foldersStore';
import { useRequestsStore } from '../store/requestsStore';
import './DoRequestPopover.css';

interface DoRequestPopoverProps {
  open: boolean;
  partialPath: string;
  cursorCoords: { top: number; left: number } | null;
  onSelect: (fullPath: string, isRequest: boolean) => void;
  onClose: () => void;
}

interface PopoverPos {
  top: number;
  left: number;
  minWidth: number;
}

type Entry = { type: 'collection'; name: string; id: string }
  | { type: 'folder'; name: string; id: string }
  | { type: 'request'; name: string; method: string };

const DoRequestPopover: React.FC<DoRequestPopoverProps> = ({
  open,
  partialPath,
  cursorCoords,
  onSelect,
  onClose,
}) => {
  const listRef = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<PopoverPos>({ top: 0, left: 0, minWidth: 200 });
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [dataReady, setDataReady] = useState(false);

  const collections = useCollectionsStore((s) => s.collections);
  const fetchCollections = useCollectionsStore((s) => s.fetchCollections);
  const foldersByCollection = useFoldersStore((s) => s.foldersByCollection);
  const fetchFolders = useFoldersStore((s) => s.fetchFolders);
  const requestsByCollection = useRequestsStore((s) => s.requestsByCollection);
  const fetchRequests = useRequestsStore((s) => s.fetchRequests);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const loadAll = async () => {
      await fetchCollections();
      if (cancelled) return;
      const cols = useCollectionsStore.getState().collections;
      const promises = cols.map((c) =>
        Promise.all([fetchFolders(c.id), fetchRequests(c.id)])
      );
      await Promise.all(promises);
      if (!cancelled) setDataReady(true);
    };

    loadAll();
    return () => { cancelled = true; };
  }, [open]);

  // Parse partial path — split handles trailing slash correctly:
  // 'MyCol/' → parts=['MyCol',''], lastSegment='', resolvedSegments=['MyCol']
  // 'MyCol/fol' → parts=['MyCol','fol'], lastSegment='fol', resolvedSegments=['MyCol']
  // '' → parts=[''], lastSegment='', resolvedSegments=[]
  const parts = partialPath.split('/');
  const lastSegment = parts[parts.length - 1];
  const resolvedSegments = parts.slice(0, -1).filter(Boolean);

  const entries = buildEntries(resolvedSegments, collections, foldersByCollection, requestsByCollection);

  const filtered = lastSegment
    ? entries.filter((e) => e.name.toLowerCase().startsWith(lastSegment.toLowerCase()))
    : entries;

  useEffect(() => {
    setSelectedIdx(0);
  }, [partialPath]);

  // Position popover below the current line
  useEffect(() => {
    if (!open || !cursorCoords) return;
    const popoverHeight = Math.min(filtered.length * 32 + 8, 220);
    const spaceBelow = window.innerHeight - cursorCoords.top - 8;
    const top =
      spaceBelow >= popoverHeight
        ? cursorCoords.top
        : cursorCoords.top - popoverHeight - 4;
    setPos({ top, left: cursorCoords.left, minWidth: 280 });
  }, [open, cursorCoords, filtered.length]);

  useEffect(() => {
    if (!listRef.current || !open) return;
    const item = listRef.current.children[selectedIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx, open]);

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (!listRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[selectedIdx]) {
        e.preventDefault();
        handleSelect(filtered[selectedIdx]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, filtered, selectedIdx, onClose]);

  if (!open || !dataReady) return null;
  if (filtered.length === 0) return null;

  function handleSelect(entry: Entry) {
    const parentPath = resolvedSegments.join('/');
    const parentPrefix = parentPath ? parentPath + '/' : '';

    if (entry.type === 'collection' || entry.type === 'folder') {
      onSelect(parentPrefix + entry.name + '/', false);
    } else {
      onSelect(parentPrefix + entry.name, true);
    }
  }

  return ReactDOM.createPortal(
    <ul
      className="do-request-popover"
      ref={listRef}
      role="listbox"
      aria-label="doRequest path autocomplete"
      style={{ top: pos.top, left: pos.left, minWidth: pos.minWidth }}
    >
      {filtered.map((entry, i) => (
        <li
          key={entry.type + '-' + entry.name + '-' + (entry as { id?: string }).id}
          className={`do-request-popover-item${i === selectedIdx ? ' do-request-popover-item--active' : ''}`}
          role="option"
          aria-selected={i === selectedIdx}
          onMouseDown={(e) => {
            e.preventDefault();
            handleSelect(entry);
          }}
        >
          {entry.type === 'request' ? (
            <span className={`drp-method-badge drp-method-badge--${entry.method.toLowerCase()}`} data-method={entry.method}>
              {entry.method}
            </span>
          ) : entry.type === 'folder' ? (
            <span className="drp-folder-icon">📂</span>
          ) : (
            <span className="drp-collection-icon">📁</span>
          )}
          <span className="do-request-popover-name">{entry.name}</span>
          {(entry.type === 'collection' || entry.type === 'folder') && (
            <span className="do-request-popover-slash">/</span>
          )}
        </li>
      ))}
    </ul>,
    document.body
  );
};

function buildEntries(
  resolvedSegments: string[],
  collections: { id: string; name: string }[],
  foldersByCollection: Record<string, { id: string; collection_id: string; parent_folder_id: string | null; name: string }[]>,
  requestsByCollection: Record<string, { id: string; collection_id: string; folder_id: string | null; name: string; method: string }[]>,
): Entry[] {
  if (resolvedSegments.length === 0) {
    return collections.map((c) => ({ type: 'collection' as const, name: c.name, id: c.id }));
  }

  const colName = resolvedSegments[0];
  const collection = collections.find((c) => c.name === colName);
  if (!collection) return [];

  let currentFolderId: string | null = null;
  for (let i = 1; i < resolvedSegments.length; i++) {
    const folderName = resolvedSegments[i];
    const folders = foldersByCollection[collection.id] ?? [];
    const folder = folders.find(
      (f) => f.name === folderName && f.parent_folder_id === currentFolderId
    );
    if (!folder) return [];
    currentFolderId = folder.id;
  }

  const entries: Entry[] = [];

  const folders = foldersByCollection[collection.id] ?? [];
  const childFolders = folders.filter((f) => f.parent_folder_id === currentFolderId);
  for (const f of childFolders) {
    entries.push({ type: 'folder', name: f.name, id: f.id });
  }

  const requests = requestsByCollection[collection.id] ?? [];
  const childRequests = requests.filter((r) => r.folder_id === currentFolderId);
  for (const r of childRequests) {
    entries.push({ type: 'request', name: r.name, method: r.method });
  }

  return entries;
}

export default DoRequestPopover;
