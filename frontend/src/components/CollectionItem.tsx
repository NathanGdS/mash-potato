import React, { useRef, useState } from 'react';
import { useCollectionsStore } from '../store/collectionsStore';
import { Collection } from '../types/collection';

interface CollectionItemProps {
  collection: Collection;
}

const CollectionItem: React.FC<CollectionItemProps> = ({ collection }) => {
  const renameCollection = useCollectionsStore((s) => s.renameCollection);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(collection.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    setDraftName(collection.name);
    setRenameError(null);
    setEditing(true);
    // Focus the input after React renders it
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

  return (
    <li className="collection-item" onDoubleClick={!editing ? startEditing : undefined}>
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
    </li>
  );
};

export default CollectionItem;
