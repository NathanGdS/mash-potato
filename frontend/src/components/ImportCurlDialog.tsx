import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useCollectionsStore } from '../store/collectionsStore';
import { useRequestsStore } from '../store/requestsStore';
import { useTabsStore } from '../store/tabsStore';
import { ImportFromCurl } from '../wailsjs/go/main/App';
import './NewCollectionModal.css';

interface Props {
  /** Pre-selected collection id (e.g. from a collection context menu). Empty string means "let the user choose". */
  defaultCollectionId?: string;
  onClose: () => void;
}

const ImportCurlDialog: React.FC<Props> = ({ defaultCollectionId = '', onClose }) => {
  const collections = useCollectionsStore((s) => s.collections);
  const fetchCollections = useCollectionsStore((s) => s.fetchCollections);

  const fetchRequests = useRequestsStore((s) => s.fetchRequests);
  const openRequest = useRequestsStore((s) => s.openRequest);
  const openTab = useTabsStore((s) => s.openTab);

  const [curlCommand, setCurlCommand] = useState('');
  const [collectionId, setCollectionId] = useState(defaultCollectionId);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Ensure collections are loaded and pick a default if none was supplied.
  useEffect(() => {
    if (collections.length === 0) {
      fetchCollections();
    }
  }, [collections.length, fetchCollections]);

  // When collections load and no default was supplied, pick the first one.
  useEffect(() => {
    if (!collectionId && collections.length > 0) {
      setCollectionId(collections[0].id);
    }
  }, [collections, collectionId]);

  // Auto-focus the textarea on open.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = curlCommand.trim();
    if (!trimmed) {
      setError('Please paste a curl command.');
      return;
    }
    if (!collectionId) {
      setError('Please select a target collection.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const req = await ImportFromCurl(collectionId, trimmed);
      // Refresh the target collection's request list in the sidebar.
      await fetchRequests(collectionId);
      // Select the new request in the editor.
      await openRequest(req.id);
      openTab({ requestId: req.id, requestName: req.name, method: req.method });
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return ReactDOM.createPortal(
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-curl-title"
    >
      <div className="modal-box" style={{ width: 520 }}>
        <h2 id="import-curl-title" className="modal-title">
          Import from cURL
        </h2>

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-field">
            <label htmlFor="curl-command" className="modal-label">
              Paste curl command
            </label>
            <textarea
              id="curl-command"
              ref={textareaRef}
              className={`modal-input${error && !curlCommand.trim() ? ' modal-input--error' : ''}`}
              placeholder={'curl -X POST https://api.example.com/v1/data \\\n  -H "Content-Type: application/json" \\\n  -d \'{"key": "value"}\''}
              value={curlCommand}
              onChange={(e) => {
                setCurlCommand(e.target.value);
                if (error) setError(null);
              }}
              disabled={submitting}
              rows={6}
              style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
            />
          </div>

          <div className="modal-field">
            <label htmlFor="target-collection" className="modal-label">
              Add to collection
            </label>
            <select
              id="target-collection"
              className="modal-input"
              value={collectionId}
              onChange={(e) => {
                setCollectionId(e.target.value);
                if (error) setError(null);
              }}
              disabled={submitting || collections.length === 0}
            >
              {collections.length === 0 && (
                <option value="">No collections available</option>
              )}
              {collections.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="modal-error" role="alert" style={{ marginBottom: 16 }}>
              {error}
            </p>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={submitting || collections.length === 0}
            >
              {submitting ? 'Importing…' : 'Import'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default ImportCurlDialog;
